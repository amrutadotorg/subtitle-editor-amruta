import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { locales, isValidLocale } from "@/lib/locales";

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

async function verifySso(request: NextRequest): Promise<NextResponse | null> {
  const ssoCookie = request.cookies.get(COOKIE_NAME)?.value;

  if (!ssoCookie) {
    return NextResponse.redirect(LOGIN_URL);
  }

  const parts = ssoCookie.split("|");
  if (parts.length !== 3) {
    return NextResponse.redirect(LOGIN_URL);
  }

  const [username, expiresStr, signature] = parts;

  if (!username || !expiresStr || !signature) {
    return NextResponse.redirect(LOGIN_URL);
  }

  const expires = Number.parseInt(expiresStr, 10);
  if (Number.isNaN(expires) || expires <= Math.floor(Date.now() / 1000)) {
    return NextResponse.redirect(LOGIN_URL);
  }

  const secret = process.env.SSO_SALT;
  if (!secret) {
    console.error("SSO_SALT environment variable is not set");
    return NextResponse.redirect(LOGIN_URL);
  }

  const payload = `${username}|${expires}`;
  const valid = await verifySignature(payload, signature, secret);

  if (!valid) {
    return NextResponse.redirect(LOGIN_URL);
  }

  return null;
}

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale: "en",
  localeDetection: false,
  localePrefix: "as-needed",
});

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const firstSegment = pathname.split("/")[1];

  // Only apply SSO to locale routes (editor pages) and root.
  // Static pages like /best-practices, /offline, etc. are public.
  if (!firstSegment || isValidLocale(firstSegment)) {
    const ssoResponse = await verifySso(request);
    if (ssoResponse) return ssoResponse;
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
