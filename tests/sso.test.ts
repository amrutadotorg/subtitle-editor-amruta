import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { verifySso, verifySsoApi } from "../lib/sso";

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

test.afterEach(() => {
  if (origSalt === undefined) {
    delete process.env.SSO_SALT;
  } else {
    process.env.SSO_SALT = origSalt;
  }
});

// ---------------------------------------------------------------------------
// verifySsoApi — API variant (returns JSON 401/500 errors)
// ---------------------------------------------------------------------------

test("verifySsoApi: returns 401 when no cookie is present", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const req = makeRequest("http://localhost:3000/api/test");
  const res = await verifySsoApi(req);
  assert.ok(res !== null, "should return a response");
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, "Authentication required");
});

test("verifySsoApi: returns 401 for malformed cookie (2 parts)", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const req = makeRequest("http://localhost:3000/api/test", "user|12345");
  const res = await verifySsoApi(req);
  assert.ok(res !== null);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, "Invalid SSO cookie format");
});

test("verifySsoApi: returns 401 for cookie with empty parts", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const req = makeRequest("http://localhost:3000/api/test", "|12345|sig");
  const res = await verifySsoApi(req);
  assert.ok(res !== null);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, "Invalid SSO cookie data");
});

test("verifySsoApi: returns 401 for expired cookie", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const pastExpiry = Math.floor(Date.now() / 1000) - 1000;
  const cookie = await makeValidCookie("user", TEST_SECRET, pastExpiry);
  const req = makeRequest("http://localhost:3000/api/test", cookie);
  const res = await verifySsoApi(req);
  assert.ok(res !== null);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, "SSO session expired");
});

test("verifySsoApi: returns 401 for invalid HMAC signature", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
  const badSig = "deadbeef".repeat(8);
  const cookie = `testuser|${futureExpiry}|${badSig}`;
  const req = makeRequest("http://localhost:3000/api/test", cookie);
  const res = await verifySsoApi(req);
  assert.ok(res !== null);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, "Invalid SSO signature");
});

test("verifySsoApi: returns 500 when SSO_SALT is not set", async () => {
  delete process.env.SSO_SALT;
  const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
  const cookie = await makeValidCookie("user", "any-secret", futureExpiry);
  const req = makeRequest("http://localhost:3000/api/test", cookie);
  const res = await verifySsoApi(req);
  assert.ok(res !== null);
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.error, "SSO configuration error");
});

test("verifySsoApi: returns null for valid cookie", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
  const cookie = await makeValidCookie("testuser", TEST_SECRET, futureExpiry);
  const req = makeRequest("http://localhost:3000/api/test", cookie);
  const res = await verifySsoApi(req);
  assert.equal(res, null);
});

// ---------------------------------------------------------------------------
// verifySso — middleware variant (redirects on failure)
// ---------------------------------------------------------------------------

test("verifySso: redirects when no cookie is present", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const req = makeRequest("http://localhost:3000/en");
  const res = await verifySso(req);
  assert.ok(res !== null, "should return a redirect");
  assert.equal(res.status, 307);
  assert.ok(
    res.headers.get("location")?.includes("amruta.org"),
    "should redirect to login",
  );
});

test("verifySso: redirects for malformed cookie", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const req = makeRequest("http://localhost:3000/en", "bad");
  const res = await verifySso(req);
  assert.ok(res !== null);
  assert.equal(res.status, 307);
});

test("verifySso: redirects for expired cookie", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const pastExpiry = Math.floor(Date.now() / 1000) - 500;
  const cookie = await makeValidCookie("user", TEST_SECRET, pastExpiry);
  const req = makeRequest("http://localhost:3000/en", cookie);
  const res = await verifySso(req);
  assert.ok(res !== null);
  assert.equal(res.status, 307);
});

test("verifySso: redirects for invalid HMAC signature", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
  const cookie = `testuser|${futureExpiry}|${"00".repeat(32)}`;
  const req = makeRequest("http://localhost:3000/en", cookie);
  const res = await verifySso(req);
  assert.ok(res !== null);
  assert.equal(res.status, 307);
});

test("verifySso: redirects when SSO_SALT is not set", async () => {
  delete process.env.SSO_SALT;
  const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
  const cookie = await makeValidCookie("user", "any", futureExpiry);
  const req = makeRequest("http://localhost:3000/en", cookie);
  const res = await verifySso(req);
  assert.ok(res !== null);
  assert.equal(res.status, 307);
});

test("verifySso: returns null for valid cookie", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
  const cookie = await makeValidCookie("testuser", TEST_SECRET, futureExpiry);
  const req = makeRequest("http://localhost:3000/en", cookie);
  const res = await verifySso(req);
  assert.equal(res, null);
});
