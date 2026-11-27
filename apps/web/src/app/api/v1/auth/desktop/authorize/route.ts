import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db";
import {
  desktopCodeHash,
  DESKTOP_CODE_TTL_MS,
  newDesktopCode,
  parseDesktopAuthorization
} from "@/server/desktop-auth";
import {
  ApiError,
  appOrigin,
  enforceRateLimit,
  errorResponse,
  lookupSession,
  requireSameOrigin,
  SESSION_COOKIE
} from "@/server/security";
import { renderDesktopConsentPage } from "./consent-page";

export const runtime = "nodejs";

const safeHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'"
  ].join("; ")
};

export async function GET(request: NextRequest) {
  try {
    parseDesktopAuthorization(request.nextUrl.searchParams);

    const session = await lookupSession(request.cookies.get(SESSION_COOKIE)?.value, "WEB");
    const authorizationPath = request.nextUrl.pathname + request.nextUrl.search;
    if (!session) {
      const loginUrl = new URL("/login?next=" + encodeURIComponent(authorizationPath), appOrigin());
      return NextResponse.redirect(loginUrl, 302);
    }

    const html = renderDesktopConsentPage(authorizationPath, session.email ?? "当前账号");
    return new NextResponse(html, {
      status: 200,
      headers: { ...safeHeaders, "Content-Type": "text/html; charset=utf-8" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const { challenge, state, redirectUri } = parseDesktopAuthorization(request.nextUrl.searchParams);
    const session = await lookupSession(request.cookies.get(SESSION_COOKIE)?.value, "WEB");
    if (!session) throw new ApiError(401, "UNAUTHENTICATED");
    await enforceRateLimit("desktop-authorize", session.userId, 10, 15 * 60 * 1000);

    const now = Date.now();
    const { nonce, code } = newDesktopCode(challenge, redirectUri, now);
    await getDb().session.create({
      data: {
        userId: session.userId,
        kind: "WEB",
        tokenHash: desktopCodeHash(nonce),
        expiresAt: new Date(now + DESKTOP_CODE_TTL_MS)
      }
    });

    const callback = new URL(redirectUri);
    callback.searchParams.set("code", code);
    callback.searchParams.set("state", state);
    return NextResponse.redirect(callback, { status: 303, headers: safeHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
