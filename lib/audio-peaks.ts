import * as MP4Box from "mp4box";

function getAACDescription(sampleRate: number, channels: number): ArrayBuffer {
  const sampleRates = [
    96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025,
    8000, 7350,
  ];
  const srIndex =
    sampleRates.indexOf(sampleRate) !== -1
      ? sampleRates.indexOf(sampleRate)
      : 3;
  const config = new Uint8Array(2);
  config[0] = (2 << 3) | (srIndex >> 1);
  config[1] = ((srIndex & 1) << 7) | (channels << 3);
  return config.buffer;
}

export async function extractPeaks(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ peaks: Float32Array; duration: number }> {
  return new Promise(async (resolve, reject) => {
    let mp4box: any = MP4Box.createFile();
    let audioTrack: any = null;
    let decoder: AudioDecoder | null = null;
    let durationSeconds = 0;

    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

    // Peak generation parameters
    const pointsPerSecond = 10;
    let sampleRate = 48000;
    let samplesPerPoint = 4800; // Updated when sample rate is known
    let peaks: number[] = [];

    let currentPointMax = 0;
    let currentPointSamples = 0;
    let decodedFramesCount = 0;
    let totalSamples = 0;

    let mdatOffset = -1;
    let mdatSize = -1;
    let mdatCursor = 0;

    const processAudioData = (audioData: AudioData) => {
      const options = { planeIndex: 0 };
      const size = audioData.allocationSize(options);
      const buffer = new ArrayBuffer(size);
      const f32 = new Float32Array(buffer);
      audioData.copyTo(buffer, options);

      for (let i = 0; i < f32.length; i++) {
        const val = Math.abs(f32[i]);
        if (val > currentPointMax) {
          currentPointMax = val;
        }
        currentPointSamples++;

        if (currentPointSamples >= samplesPerPoint) {
          peaks.push(currentPointMax);
          currentPointMax = 0;
          currentPointSamples = 0;
        }
      }
      decodedFramesCount++;
      if (decodedFramesCount % 50 === 0 && totalSamples > 0 && onProgress) {
        const progress = Math.min(
          99,
          Math.round((peaks.length / (totalSamples / samplesPerPoint)) * 100),
        );
        onProgress(progress);
      }
      audioData.close();
    };

    mp4box.onReady = (info: any) => {
      durationSeconds = info.duration / info.timescale;
      audioTrack = info.audioTracks[0];
      if (!audioTrack) {
        reject(new Error("No audio track found in the file."));
        return;
      }

      sampleRate = audioTrack.audio.sample_rate;
      const channels = audioTrack.audio.channel_count;
      samplesPerPoint = Math.floor(sampleRate / pointsPerSecond);
      totalSamples = audioTrack.nb_samples * 1024; // approx

      const codec = audioTrack.codec;
      const description = getAACDescription(sampleRate, channels);

      decoder = new AudioDecoder({
        output: processAudioData,
        error: (e) => {
          console.error("AudioDecoder Error:", e);
          reject(e);
        },
      });

      try {
        decoder.configure({
          codec: codec,
          sampleRate: sampleRate,
          numberOfChannels: channels,
          description: description,
        });
      } catch (e) {
        console.error("AudioDecoder config error", e);
        reject(e);
        return;
      }

      mp4box.setExtractionOptions(audioTrack.id, null, { nbSamples: 1000 });
      mp4box.start();
    };

    mp4box.onSamples = (id: number, user: any, samples: any[]) => {
      if (!decoder) return;
      for (const sample of samples) {
        const chunk = new EncodedAudioChunk({
          type: sample.is_sync ? "key" : "delta",
          timestamp: (sample.cts * 1000000) / audioTrack.timescale,
          duration: (sample.duration * 1000000) / audioTrack.timescale,
          data: sample.data,
        });
        decoder.decode(chunk);
      }

      if (samples.length > 0) {
        mp4box.releaseUsedSamples(id, samples[samples.length - 1].number);
      }
    };

    mp4box.onError = (e: any) => {
      reject(e);
    };

    const readNextMdatChunk = () => {
      if (decoder && decoder.decodeQueueSize > 2000) {
        setTimeout(readNextMdatChunk, 100);
        return;
      }

      if (mdatCursor >= mdatOffset + mdatSize || mdatCursor >= file.size) {
        // Finished
        mp4box.flush();
        const finish = async () => {
          if (decoder) {
            await decoder.flush();
          }
          if (peaks.length === 0) peaks.push(0);
          if (onProgress) onProgress(100);
          resolve({
            peaks: new Float32Array(peaks),
            duration: durationSeconds,
          });
        };
        finish();
        return;
      }

      const end = Math.min(
        mdatCursor + CHUNK_SIZE,
        mdatOffset + mdatSize,
        file.size,
      );
      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        if (buffer.byteLength > 0) {
          const buf = buffer as any;
          buf.fileStart = mdatCursor;
          mp4box.appendBuffer(buf);
          mdatCursor += buffer.byteLength;
          setTimeout(readNextMdatChunk, 1);
        } else {
          // EOF unexpectedly
          mp4box.flush();
          const finish = async () => {
            if (decoder) await decoder.flush();
            if (peaks.length === 0) peaks.push(0);
            if (onProgress) onProgress(100);
            resolve({
              peaks: new Float32Array(peaks),
              duration: durationSeconds,
            });
          };
          finish();
        }
      };
      reader.onerror = (e) => reject(reader.error);
      reader.readAsArrayBuffer(file.slice(mdatCursor, end));
    };

    // Stage 1: Parse top-level boxes and read everything EXCEPT mdat
    let offset = 0;
    while (offset < file.size) {
      const headerBlob = file.slice(offset, offset + 16);
      const headerBuffer = await headerBlob.arrayBuffer();
      if (headerBuffer.byteLength < 8) break;

      const view = new DataView(headerBuffer);
      let size = view.getUint32(0);
      const type = String.fromCharCode(
        view.getUint8(4),
        view.getUint8(5),
        view.getUint8(6),
        view.getUint8(7),
      );

      if (size === 1) {
        const high = view.getUint32(8);
        const low = view.getUint32(12);
        size = high * Math.pow(2, 32) + low;
      } else if (size === 0) {
        size = file.size - offset;
      }

      if (type === "mdat") {
        mdatOffset = offset;
        mdatSize = size;
        // Don't append mdat to mp4box yet. Just record it and skip its size.
        // But mp4box needs to know mdat exists. Actually, we just don't feed it yet.
      } else {
        // Read this non-mdat box entirely and append to mp4box
        const boxBlob = file.slice(offset, offset + size);
        const boxBuffer = await boxBlob.arrayBuffer();
        const buf = boxBuffer as any;
        buf.fileStart = offset;
        mp4box.appendBuffer(buf);
      }

      offset += size;
    }

    // Stage 2: We have fed all metadata (ftyp, moov, etc). mp4box should be ready.
    if (mdatOffset === -1) {
      reject(new Error("No mdat box found."));
      return;
    }

    mdatCursor = mdatOffset;
    readNextMdatChunk();
  });
}
