import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import proxyModule from "../proxy";

// ---------------------------------------------------------------------------
// Proxy default export is wrapped by tsx ESM interop as { default: fn, config }
// ---------------------------------------------------------------------------

const proxy: (request: NextRequest) => Promise<Response> =
  typeof proxyModule === "function"
    ? proxyModule
    : ((proxyModule as Record<string, unknown>).default as (
        request: NextRequest,
      ) => Promise<Response>);

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
// Locale routes — require SSO
// ---------------------------------------------------------------------------

test("proxy: locale route /en without SSO cookie redirects to login", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const res = await proxy(makeRequest("http://localhost:3000/en"));
  assert.equal(res.status, 307);
  assert.ok(
    res.headers.get("location")?.includes("amruta.org"),
    "should redirect to amruta.org login",
  );
});

test("proxy: locale route /de without SSO cookie redirects to login", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const res = await proxy(makeRequest("http://localhost:3000/de"));
  assert.equal(res.status, 307);
});

test("proxy: locale route /pl without SSO cookie redirects to login", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const res = await proxy(makeRequest("http://localhost:3000/pl"));
  assert.equal(res.status, 307);
});

test("proxy: locale route /yue without SSO cookie redirects to login", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const res = await proxy(makeRequest("http://localhost:3000/yue"));
  assert.equal(res.status, 307);
});

test("proxy: root path / without SSO cookie redirects to login", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const res = await proxy(makeRequest("http://localhost:3000/"));
  assert.equal(res.status, 307);
});

test("proxy: locale route with valid SSO cookie passes SSO and runs intl middleware", async () => {
  process.env.SSO_SALT = TEST_SECRET;
  const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
  const cookie = await makeValidCookie("testuser", TEST_SECRET, futureExpiry);
  const res = await proxy(makeRequest("http://localhost:3000/en", cookie));
  // SSO passed — redirect should NOT point to amruta.org login
  const location = res.headers.get("location") ?? "";
  assert.ok(
    !location.includes("amruta.org"),
    "should not redirect to login when SSO is valid",
  );
});

// ---------------------------------------------------------------------------
// Public routes — bypass SSO entirely
// ---------------------------------------------------------------------------

test("proxy: /best-practices bypasses SSO and returns 200", async () => {
  const res = await proxy(makeRequest("http://localhost:3000/best-practices"));
  assert.equal(res.status, 200);
});

test("proxy: /offline bypasses SSO and returns 200", async () => {
  const res = await proxy(makeRequest("http://localhost:3000/offline"));
  assert.equal(res.status, 200);
});

test("proxy: static file path bypasses SSO", async () => {
  const res = await proxy(makeRequest("http://localhost:3000/image.png"));
  assert.equal(res.status, 200);
});
