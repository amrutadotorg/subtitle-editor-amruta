import test from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Filename validation — mirrors app/api/load-captions/route.ts regex
// ---------------------------------------------------------------------------

const CAPTION_FILE_RE =
  /^[a-zA-Z0-9_\-]+\.[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]+)*\.vtt$/;

function isValidCaptionFile(name: string): boolean {
  return CAPTION_FILE_RE.test(name) && !name.includes("..");
}

// --- valid formats ---

test("accepts standard two-letter lang code", () => {
  assert.ok(isValidCaptionFile("--G8-bF4RHw.en.vtt"));
});

test("accepts three-letter lang code (yue)", () => {
  assert.ok(isValidCaptionFile("--G8-bF4RHw.yue.vtt"));
});

test("accepts language with subtag (zh-TW)", () => {
  assert.ok(isValidCaptionFile("abc123.zh-TW.vtt"));
});

test("accepts language with subtag (pt-BR)", () => {
  assert.ok(isValidCaptionFile("abc123.pt-BR.vtt"));
});

test("accepts alphanumeric video id", () => {
  assert.ok(isValidCaptionFile("dQw4w9WgXcQ.en.vtt"));
});

test("accepts id with underscores", () => {
  assert.ok(isValidCaptionFile("some_video_id.pl.vtt"));
});

test("accepts short id", () => {
  assert.ok(isValidCaptionFile("abc.en.vtt"));
});

// --- invalid formats ---

test("rejects missing extension", () => {
  assert.ok(!isValidCaptionFile("--G8-bF4RHw.en"));
});

test("rejects .srt extension", () => {
  assert.ok(!isValidCaptionFile("--G8-bF4RHw.en.srt"));
});

test("rejects uppercase extension", () => {
  assert.ok(!isValidCaptionFile("--G8-bF4RHw.en.VTT"));
});

test("rejects path traversal with ..", () => {
  assert.ok(!isValidCaptionFile("../../etc/passwd.vtt"));
});

test("rejects path traversal embedded in name", () => {
  assert.ok(!isValidCaptionFile("foo/../bar.en.vtt"));
});

test("rejects empty string", () => {
  assert.ok(!isValidCaptionFile(""));
});

test("rejects filename with spaces", () => {
  assert.ok(!isValidCaptionFile("my file.en.vtt"));
});

test("rejects filename with special characters", () => {
  assert.ok(!isValidCaptionFile("file@name.en.vtt"));
});

test("rejects lang code shorter than 2 chars", () => {
  assert.ok(!isValidCaptionFile("abc123.a.vtt"));
});

test("rejects lang code longer than 3 chars", () => {
  assert.ok(!isValidCaptionFile("abc123.abcd.vtt"));
});

test("rejects lang subtag without base", () => {
  assert.ok(!isValidCaptionFile("abc123.-TW.vtt"));
});

// --- path traversal safety ---

test("path.resolve stays within baseDir with trailing slash", () => {
  const baseDir = "/app/captions/";
  const filePath = "/app/captions/../../etc/passwd";
  const resolved = require("node:path").resolve(baseDir, "../../etc/passwd");
  assert.ok(!resolved.startsWith(baseDir));
});

test("path.resolve stays within baseDir without trailing slash", () => {
  const baseDir = "/app/captions";
  const safeDirPrefix = baseDir.endsWith("/") ? baseDir : `${baseDir}/`;
  const resolved = require("node:path").resolve(baseDir, "test.en.vtt");
  assert.ok(resolved.startsWith(safeDirPrefix));
});

test("path.resolve catches traversal without trailing slash", () => {
  const baseDir = "/app/captions";
  const safeDirPrefix = baseDir.endsWith("/") ? baseDir : `${baseDir}/`;
  const resolved = require("node:path").resolve(
    baseDir,
    "../captions-evil/file.vtt",
  );
  assert.ok(!resolved.startsWith(safeDirPrefix));
});
