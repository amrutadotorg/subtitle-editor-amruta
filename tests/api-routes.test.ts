import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as vimeoGet } from "../app/api/vimeo/download/route";
import { GET as loadCaptionsGet } from "../app/api/load-captions/route";
import { GET as loadSharedGet } from "../app/api/load-shared/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = "test-sso-secret";

async function makeHmac(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function makeValidCookie(
  username: string,
  secret: string,
  expiresAt: number,
): Promise<string> {
  const payload = `${username}|${expiresAt}`;
  const sig = await makeHmac(payload, secret);
  return `${username}|${expiresAt}|${sig}`;
}

function futureExpiry(): number {
  return Math.floor(Date.now() / 1000) + 3600;
}

function makeRequest(url: string, cookie?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) {
    headers.Cookie = `amruta_sso=${cookie}`;
  }
  return new NextRequest(url, { headers });
}

// ---------------------------------------------------------------------------
// Environment save/restore
// ---------------------------------------------------------------------------

const origSalt = process.env.SSO_SALT;
const origToken = process.env.VIMEO_ACCESS_TOKEN;
const origNodeEnv = process.env.NODE_ENV;

test.afterEach(() => {
  if (origSalt === undefined) {
    delete process.env.SSO_SALT;
  } else {
    process.env.SSO_SALT = origSalt;
  }
  if (origToken === undefined) {
    delete process.env.VIMEO_ACCESS_TOKEN;
  } else {
    process.env.VIMEO_ACCESS_TOKEN = origToken;
  }
  if (origNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = origNodeEnv;
  }
});

// ===========================================================================
// /api/vimeo/download
// ===========================================================================

test("vimeo/download: returns 401 without SSO cookie", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const res = await vimeoGet(
    makeRequest(
      "http://localhost:3000/api/vimeo/download?url=https://vimeo.com/123",
    ),
  );
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, "Authentication required");
});

test("vimeo/download: returns 500 when VIMEO_ACCESS_TOKEN is not set", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  delete process.env.VIMEO_ACCESS_TOKEN;
  const cookie = await makeValidCookie("user", TEST_SECRET, futureExpiry());
  const res = await vimeoGet(
    makeRequest(
      "http://localhost:3000/api/vimeo/download?url=https://vimeo.com/123",
      cookie,
    ),
  );
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.error, "Vimeo token not configured");
});

test("vimeo/download: returns 400 when url param is missing", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  process.env.VIMEO_ACCESS_TOKEN = "fake-token";
  const cookie = await makeValidCookie("user", TEST_SECRET, futureExpiry());
  const res = await vimeoGet(
    makeRequest("http://localhost:3000/api/vimeo/download", cookie),
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "Missing 'url' query parameter");
});

test("vimeo/download: returns 400 for invalid Vimeo URL", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  process.env.VIMEO_ACCESS_TOKEN = "fake-token";
  const cookie = await makeValidCookie("user", TEST_SECRET, futureExpiry());
  const res = await vimeoGet(
    makeRequest(
      "http://localhost:3000/api/vimeo/download?url=https://youtube.com/watch?v=abc",
      cookie,
    ),
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "Could not extract video ID from URL");
});

test("vimeo/download: returns 400 for empty string url param", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  process.env.VIMEO_ACCESS_TOKEN = "fake-token";
  const cookie = await makeValidCookie("user", TEST_SECRET, futureExpiry());
  const res = await vimeoGet(
    makeRequest("http://localhost:3000/api/vimeo/download?url=", cookie),
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "Missing 'url' query parameter");
});

// ===========================================================================
// /api/load-captions
// ===========================================================================

test("load-captions: returns 401 without SSO cookie", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const res = await loadCaptionsGet(
    makeRequest("http://localhost:3000/api/load-captions?file=test.en.vtt"),
  );
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, "Authentication required");
});

test("load-captions: returns 400 when file param is missing", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const cookie = await makeValidCookie("user", TEST_SECRET, futureExpiry());
  const res = await loadCaptionsGet(
    makeRequest("http://localhost:3000/api/load-captions", cookie),
  );
  assert.equal(res.status, 400);
  const text = await res.text();
  assert.equal(text, "Missing file parameter");
});

test("load-captions: returns 400 for .srt extension", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const cookie = await makeValidCookie("user", TEST_SECRET, futureExpiry());
  const res = await loadCaptionsGet(
    makeRequest(
      "http://localhost:3000/api/load-captions?file=test.en.srt",
      cookie,
    ),
  );
  assert.equal(res.status, 400);
  const text = await res.text();
  assert.equal(text, "Invalid file name format");
});

test("load-captions: returns 400 for path traversal with ..", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const cookie = await makeValidCookie("user", TEST_SECRET, futureExpiry());
  const res = await loadCaptionsGet(
    makeRequest(
      "http://localhost:3000/api/load-captions?file=../../etc/passwd.vtt",
      cookie,
    ),
  );
  assert.equal(res.status, 400);
  const text = await res.text();
  assert.equal(text, "Invalid file name format");
});

test("load-captions: returns 400 for embedded path traversal", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const cookie = await makeValidCookie("user", TEST_SECRET, futureExpiry());
  const res = await loadCaptionsGet(
    makeRequest(
      "http://localhost:3000/api/load-captions?file=foo/../bar.en.vtt",
      cookie,
    ),
  );
  assert.equal(res.status, 400);
  const text = await res.text();
  assert.equal(text, "Invalid file name format");
});

test("load-captions: returns 400 for filename with spaces", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const cookie = await makeValidCookie("user", TEST_SECRET, futureExpiry());
  const res = await loadCaptionsGet(
    makeRequest(
      "http://localhost:3000/api/load-captions?file=my file.en.vtt",
      cookie,
    ),
  );
  assert.equal(res.status, 400);
  const text = await res.text();
  assert.equal(text, "Invalid file name format");
});

test("load-captions: returns 404 for valid filename that does not exist", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  process.env.NODE_ENV = "test";
  const cookie = await makeValidCookie("user", TEST_SECRET, futureExpiry());
  const res = await loadCaptionsGet(
    makeRequest(
      "http://localhost:3000/api/load-captions?file=nonexistent.en.vtt",
      cookie,
    ),
  );
  assert.equal(res.status, 404);
  const text = await res.text();
  assert.equal(text, "File not found");
});

// ===========================================================================
// /api/load-shared
// ===========================================================================

test("load-shared: returns 401 without SSO cookie", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const res = await loadSharedGet(
    makeRequest("http://localhost:3000/api/load-shared?file=test.vtt"),
  );
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, "Authentication required");
});

test("load-shared: returns 400 when file param is missing", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const cookie = await makeValidCookie("user", TEST_SECRET, futureExpiry());
  const res = await loadSharedGet(
    makeRequest("http://localhost:3000/api/load-shared", cookie),
  );
  assert.equal(res.status, 400);
  const text = await res.text();
  assert.equal(text, "Missing file parameter");
});

test("load-shared: returns 400 for path traversal with ..", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const cookie = await makeValidCookie("user", TEST_SECRET, futureExpiry());
  const res = await loadSharedGet(
    makeRequest(
      "http://localhost:3000/api/load-shared?file=../../etc/passwd.vtt",
      cookie,
    ),
  );
  assert.equal(res.status, 400);
  const text = await res.text();
  assert.equal(text, "Invalid file name format");
});

test("load-shared: returns 400 for invalid characters in filename", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const cookie = await makeValidCookie("user", TEST_SECRET, futureExpiry());
  const res = await loadSharedGet(
    makeRequest(
      "http://localhost:3000/api/load-shared?file=my file.vtt",
      cookie,
    ),
  );
  assert.equal(res.status, 400);
  const text = await res.text();
  assert.equal(text, "Invalid file name format");
});

test("load-shared: accepts .srt extension (allowed)", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  process.env.NODE_ENV = "test";
  const cookie = await makeValidCookie("user", TEST_SECRET, futureExpiry());
  const res = await loadSharedGet(
    makeRequest(
      "http://localhost:3000/api/load-shared?file=nonexistent.srt",
      cookie,
    ),
  );
  // .srt is allowed by the regex, but file won't exist
  assert.equal(res.status, 404);
  const text = await res.text();
  assert.equal(text, "File not found");
});

test("load-shared: accepts subdirectory/filename.vtt format", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  process.env.NODE_ENV = "test";
  const cookie = await makeValidCookie("user", TEST_SECRET, futureExpiry());
  const res = await loadSharedGet(
    makeRequest(
      "http://localhost:3000/api/load-shared?file=subdir/test.vtt",
      cookie,
    ),
  );
  // Valid format, but file won't exist
  assert.equal(res.status, 404);
  const text = await res.text();
  assert.equal(text, "File not found");
});

test("load-shared: returns 404 for valid filename that does not exist", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  process.env.NODE_ENV = "test";
  const cookie = await makeValidCookie("user", TEST_SECRET, futureExpiry());
  const res = await loadSharedGet(
    makeRequest(
      "http://localhost:3000/api/load-shared?file=nonexistent.vtt",
      cookie,
    ),
  );
  assert.equal(res.status, 404);
  const text = await res.text();
  assert.equal(text, "File not found");
});
