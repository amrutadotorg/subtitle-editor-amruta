import test from "node:test";
import assert from "node:assert/strict";
import { extractPeaks } from "../lib/audio-peaks";

// Only the "already aborted" path is testable here: the in-flight paths
// (mp4box.onSamples / readNextMdatChunk) need WebCodecs + a real MP4, which
// jsdom/Node do not provide. They share the same isAborted() guard.
test("extractPeaks rejects with AbortError when the signal is already aborted", async () => {
  const file = new File(["dummy"], "dummy.mp4", { type: "video/mp4" });
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(() => extractPeaks(file, () => {}, controller.signal), {
    name: "AbortError",
  });
});

test("extractPeaks does not report progress after aborting", async () => {
  const file = new File(["dummy"], "dummy.mp4", { type: "video/mp4" });
  const controller = new AbortController();
  controller.abort();
  let progressCalls = 0;

  await assert.rejects(
    () =>
      extractPeaks(
        file,
        () => {
          progressCalls += 1;
        },
        controller.signal,
      ),
    { name: "AbortError" },
  );

  assert.equal(progressCalls, 0);
});
