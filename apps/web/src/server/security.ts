import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { getDb } from "./db";

export const SESSION_COOKIE = "sm_session";
const WEB_SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const MOBILE_SESSION_MS = 24 * 60 * 60 * 1000;

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new ApiError(503, "SERVICE_NOT_CONFIGURED");
  return value;
}
export function appOrigin(): string {
  const raw = process.env.APP_ORIGIN;
  if (!raw && process.env.NODE_ENV !== "production") return "http://localhost:3000";
  if (!raw) throw new ApiError(503, "SERVICE_NOT_CONFIGURED");
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new ApiError(503, "SERVICE_NOT_CONFIGURED"); }
  if (parsed.origin !== raw || parsed.username || parsed.password ||
      (parsed.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && parsed.hostname === "localhost"))) {
    throw new ApiError(503, "SERVICE_NOT_CONFIGURED");
  }
  return parsed.origin;
}

/** Reject missing/foreign Origin on cookie-authenticated mutations. */
export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== appOrigin()) throw new ApiError(403, "INVALID_ORIGIN");
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "none") {
    throw new ApiError(403, "CROSS_SITE_REQUEST");
  }
}
export function requireJson(request: Request): void {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    throw new ApiError(415, "JSON_REQUIRED");
  }
}
/** Bound request bytes while streaming; Content-Length alone is not sufficient. */
export async function boundedJson<S extends z.ZodType>(request: Request, schema: S, maxBytes = 8192): Promise<z.infer<S>> {
  requireJson(request);
  const len = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(len) && len > maxBytes) throw new ApiError(413, "REQUEST_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "INVALID_JSON");
  let count = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      count += result.value.byteLength;
      if (count > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, "REQUEST_TOO_LARGE");
      }
      chunks.push(result.value);
    }
    const bytes = new Uint8Array(count);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const parsed = schema.safeParse(JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(bytes)));
    if (!parsed.success) throw new ApiError(400, "INVALID_INPUT");
    return parsed.data as z.infer<S>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "INVALID_JSON");
  } finally { reader.releaseLock(); }
}

export function errorResponse(error: unknown): NextResponse {
  // Never expose ORM errors, account existence, tokens, model outputs or stack traces.
  const status = error instanceof ApiError ? error.status : 500;
  const code = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
  return NextResponse.json({error:{code}}, {
    status, headers: {"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
  });
}

const SCRYPT_PARAMS = {N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024};
async function derive(password: string, salt: Uint8Array): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, 32, SCRYPT_PARAMS, (error, derived) => {
      if (error) reject(error);
      else resolve(derived as Buffer);
    });
  });
}
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 128) throw new ApiError(400, "INVALID_PASSWORD");
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt-v1$${salt.toString("base64url")}$${key.toString("base64url")}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt-v1" || !parts[1] || !parts[2]) return false;
  try {
    const salt = Buffer.from(parts[1], "base64url");
    const expected = Buffer.from(parts[2], "base64url");
    if (salt.length !== 16 || expected.length !== 32) return false;
    const actual = await derive(password, salt);
    return timingSafeEqual(actual, expected);
  } catch { return false; }
}
/** Dummy hash ensures the same expensive key derivation for unknown accounts. */
export const DUMMY_PASSWORD_HASH = "scrypt-v1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function bucketIdentity(kind: string, subject: string, windowStart: number): string {
  const pepper = required("RATE_LIMIT_SECRET");
  return createHmac("sha256", pepper).update(`${kind}:${subject}:${windowStart}`).digest("hex");
}
export function sourceKey(request: Request): string {
  // Only trust a reverse-proxy header when deployment explicitly guarantees it
  // is stripped/re-written at ingress; otherwise use a conservative shared bucket.
  const header = process.env.TRUSTED_CLIENT_IP_HEADER;
  if (header !== "x-real-ip" && header !== "cf-connecting-ip") return "unresolved";
  const ip = request.headers.get(header);
  if (!ip || ip.length > 64 || !/^[0-9a-fA-F:.]+$/.test(ip)) return "unresolved";
  return ip;
}
export async function enforceRateLimit(kind: string, subject: string, limit: number, windowMs: number): Promise<void> {
  if (!Number.isInteger(limit) || limit < 1 || windowMs < 1000) throw new Error("invalid rate window");
  const windowStart = Math.floor(Date.now() / windowMs);
  const key = bucketIdentity(kind, subject, windowStart);
  // One atomic DB upsert; counts remain consistent on multi-process installations.
  const bucket = await getDb().rateLimitBucket.upsert({
    where: {key},
    create: {key, hits:1, expiresAt:new Date((windowStart + 1) * windowMs)},
    update: {hits:{increment:1}},
    select: {hits:true}
  });
  if (bucket.hits > limit) throw new ApiError(429, "RATE_LIMITED");
}

export type Principal = {userId:string; kind:"WEB"|"WECHAT"; email:string|null};
export async function lookupSession(token: string | undefined, kind: "WEB"|"WECHAT"): Promise<Principal|null> {
  if (!token || token.length < 32 || token.length > 128) return null;
  const session = await getDb().session.findUnique({
    where:{tokenHash:hashToken(token)},
    select:{userId:true, kind:true, expiresAt:true, revokedAt:true,
      user:{select:{deletedAt:true, credential:{select:{email:true,verifiedAt:true}}}}}
  });
  if (!session || session.kind !== kind || session.expiresAt <= new Date() || session.revokedAt ||
      session.user.deletedAt || (kind === "WEB" && !session.user.credential?.verifiedAt)) return null;
  return {userId:session.userId,kind,email:session.user.credential?.email ?? null};
}
export async function principalFromRequest(request: NextRequest): Promise<Principal> {
  const authorization = request.headers.get("authorization");
  if (authorization !== null) {
    if (!authorization.startsWith("Bearer ")) throw new ApiError(401, "UNAUTHENTICATED");
    const p = await lookupSession(authorization.slice(7), "WECHAT");
    if (!p) throw new ApiError(401, "UNAUTHENTICATED");
    return p;
  }
  const p = await lookupSession(request.cookies.get(SESSION_COOKIE)?.value, "WEB");
  if (!p) throw new ApiError(401, "UNAUTHENTICATED");
  return p;
}
export async function issueSession(userId: string, kind: "WEB"|"WECHAT"): Promise<{token:string; expiresAt:Date}> {
  const token = newSecret();
  const expiresAt = new Date(Date.now()+(kind==="WEB"?WEB_SESSION_MS:MOBILE_SESSION_MS));
  await getDb().session.create({data:{userId,kind,tokenHash:hashToken(token),expiresAt}});
  return {token,expiresAt};
}
export function setWebCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE,token,{
    httpOnly:true, secure:process.env.NODE_ENV==="production",
    sameSite:"lax", path:"/", maxAge:WEB_SESSION_MS / 1000
  });
}
export function clearWebCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:0});
}

export function normalizedEmail(email:string):string {
  return email.trim().toLowerCase();
}
