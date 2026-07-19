import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { locales, isValidLocale } from "@/lib/locales";
import { verifySso } from "@/lib/sso";

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale: "en",
  localeDetection: false,
  localePrefix: "as-needed",
});

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const firstSegment = pathname.split("/")[1];

  // Only apply SSO and intl routing to locale routes (editor pages) and root.
  // Static pages like /best-practices, /offline, etc. are public and bypass
  // both SSO and next-intl middleware.
  if (!firstSegment || isValidLocale(firstSegment)) {
    const ssoResponse = await verifySso(request);
    if (ssoResponse) return ssoResponse;
    return intlMiddleware(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
