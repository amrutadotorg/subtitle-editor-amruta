import { describe, it } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { resolveSafePath } from "../lib/safe-path";

describe("resolveSafePath", () => {
  it("resolves a safe path inside baseDir", () => {
    const baseDir = "/app/shared_uploads";
    const fileName = "test.vtt";
    const expected = path.resolve(baseDir, fileName);
    assert.strictEqual(resolveSafePath(baseDir, fileName), expected);
  });

  it("resolves a safe path inside baseDir with trailing slash", () => {
    const baseDir = "/app/shared_uploads/";
    const fileName = "test.vtt";
    const expected = path.resolve(baseDir, fileName);
    assert.strictEqual(resolveSafePath(baseDir, fileName), expected);
  });

  it("prevents path traversal outside baseDir", () => {
    const baseDir = "/app/shared_uploads";
    const fileName = "../secret.txt";
    assert.strictEqual(resolveSafePath(baseDir, fileName), null);
  });

  it("prevents partial matches that are not actual subdirectories", () => {
    const baseDir = "/app/shared";
    // path.resolve("/app/shared", "../shared_uploads/test.vtt") -> "/app/shared_uploads/test.vtt"
    // which starts with "/app/shared" but is NOT inside it.
    const fileName = "../shared_uploads/test.vtt";
    assert.strictEqual(resolveSafePath(baseDir, fileName), null);
  });
});
