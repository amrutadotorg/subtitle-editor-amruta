import { type NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "amruta_sso";
const LOGIN_URL =
  "https://www.amruta.org/wp-login.php?redirect_to=https://subtitle-editor.amruta.org/";

const encoder = new TextEncoder();

function hexToBytes(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

async function verifySignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    hexToBytes(signature),
    encoder.encode(payload),
  );
  return valid;
}

async function parseSsoCookie(
  request: NextRequest,
): Promise<{ username: string } | { redirect: NextResponse } | null> {
  const ssoCookie = request.cookies.get(COOKIE_NAME)?.value;

  if (!ssoCookie) {
    return { redirect: NextResponse.redirect(LOGIN_URL) };
  }

  const parts = ssoCookie.split("|");
  if (parts.length !== 3) {
    return { redirect: NextResponse.redirect(LOGIN_URL) };
  }

  const [username, expiresStr, signature] = parts;

  if (!username || !expiresStr || !signature) {
    return { redirect: NextResponse.redirect(LOGIN_URL) };
  }

  const expires = Number.parseInt(expiresStr, 10);
  if (Number.isNaN(expires) || expires <= Math.floor(Date.now() / 1000)) {
    return { redirect: NextResponse.redirect(LOGIN_URL) };
  }

  const secret = process.env.SSO_SALT;
  if (!secret) {
    console.error("SSO_SALT environment variable is not set");
    return { redirect: NextResponse.redirect(LOGIN_URL) };
  }

  const payload = `${username}|${expires}`;
  const valid = await verifySignature(payload, signature, secret);

  if (!valid) {
    return { redirect: NextResponse.redirect(LOGIN_URL) };
  }

  return { username };
}

async function parseSsoCookieApi(
  request: NextRequest,
): Promise<{ username: string } | { error: NextResponse } | null> {
  const ssoCookie = request.cookies.get(COOKIE_NAME)?.value;

  if (!ssoCookie) {
    return {
      error: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      ),
    };
  }

  const parts = ssoCookie.split("|");
  if (parts.length !== 3) {
    return {
      error: NextResponse.json(
        { error: "Invalid SSO cookie format" },
        { status: 401 },
      ),
    };
  }

  const [username, expiresStr, signature] = parts;

  if (!username || !expiresStr || !signature) {
    return {
      error: NextResponse.json(
        { error: "Invalid SSO cookie data" },
        { status: 401 },
      ),
    };
  }

  const expires = Number.parseInt(expiresStr, 10);
  if (Number.isNaN(expires) || expires <= Math.floor(Date.now() / 1000)) {
    return {
      error: NextResponse.json(
        { error: "SSO session expired" },
        { status: 401 },
      ),
    };
  }

  const secret = process.env.SSO_SALT;
  if (!secret) {
    console.error("SSO_SALT environment variable is not set");
    return {
      error: NextResponse.json(
        { error: "SSO configuration error" },
        { status: 500 },
      ),
    };
  }

  const payload = `${username}|${expires}`;
  const valid = await verifySignature(payload, signature, secret);

  if (!valid) {
    return {
      error: NextResponse.json(
        { error: "Invalid SSO signature" },
        { status: 401 },
      ),
    };
  }

  return { username };
}

export async function verifySso(
  request: NextRequest,
): Promise<NextResponse | null> {
  const result = await parseSsoCookie(request);
  if (result && "redirect" in result) return result.redirect;
  return null;
}

export async function verifySsoApi(
  request: NextRequest,
): Promise<NextResponse | null> {
  const result = await parseSsoCookieApi(request);
  if (result && "error" in result) return result.error;
  return null;
}
