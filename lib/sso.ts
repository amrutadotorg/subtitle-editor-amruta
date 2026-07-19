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

type SsoErrorReason =
  | "missing"
  | "format"
  | "data"
  | "expired"
  | "no_secret"
  | "invalid_signature";

async function parseSsoCookieCore(
  request: NextRequest,
): Promise<{ username: string } | { reason: SsoErrorReason }> {
  const ssoCookie = request.cookies.get(COOKIE_NAME)?.value;
  if (!ssoCookie) return { reason: "missing" };

  const parts = ssoCookie.split("|");
  if (parts.length !== 3) return { reason: "format" };

  const [username, expiresStr, signature] = parts;
  if (!username || !expiresStr || !signature) return { reason: "data" };

  const expires = Number.parseInt(expiresStr, 10);
  if (Number.isNaN(expires) || expires <= Math.floor(Date.now() / 1000)) {
    return { reason: "expired" };
  }

  const secret = process.env.SSO_SALT;
  if (!secret) {
    console.error("SSO_SALT environment variable is not set");
    return { reason: "no_secret" };
  }

  const payload = `${username}|${expires}`;
  const valid = await verifySignature(payload, signature, secret);

  if (!valid) return { reason: "invalid_signature" };

  return { username };
}

async function parseSsoCookie(
  request: NextRequest,
): Promise<{ username: string } | { redirect: NextResponse } | null> {
  const result = await parseSsoCookieCore(request);
  if ("reason" in result) {
    return { redirect: NextResponse.redirect(LOGIN_URL) };
  }
  return { username: result.username };
}

async function parseSsoCookieApi(
  request: NextRequest,
): Promise<{ username: string } | { error: NextResponse } | null> {
  const result = await parseSsoCookieCore(request);
  if ("reason" in result) {
    const errorMap: Record<
      SsoErrorReason,
      { message: string; status: number }
    > = {
      missing: { message: "Authentication required", status: 401 },
      format: { message: "Invalid SSO cookie format", status: 401 },
      data: { message: "Invalid SSO cookie data", status: 401 },
      expired: { message: "SSO session expired", status: 401 },
      no_secret: { message: "SSO configuration error", status: 500 },
      invalid_signature: { message: "Invalid SSO signature", status: 401 },
    };
    const err = errorMap[result.reason];
    return {
      error: NextResponse.json({ error: err.message }, { status: err.status }),
    };
  }
  return { username: result.username };
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

export function withApiAuth(
  handler: (
    request: NextRequest,
    ...args: any[]
  ) => Promise<NextResponse> | NextResponse,
) {
  return async (request: NextRequest, ...args: any[]) => {
    const ssoResponse = await verifySsoApi(request);
    if (ssoResponse) return ssoResponse;
    return handler(request, ...args);
  };
}
