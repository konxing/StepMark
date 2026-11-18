import {createHash,createHmac,randomBytes,timingSafeEqual} from "node:crypto";
import {ApiError,hashToken} from "./security";

/**
 * Desktop authorization is deliberately read-only. An authorization code is
 * signed and tied to PKCE + the exact loopback redirect. Its random nonce is
 * consumed atomically in the existing Session table; no migration is needed.
 */
export const DESKTOP_TOKEN_PREFIX="sm_desktop_";
export const DESKTOP_CODE_TTL_MS=2*60*1000;
const B64_256=/^[A-Za-z0-9_-]{43}$/;
const VERIFIER=/^[A-Za-z0-9_-]{43,128}$/;

function secret():string {
  const value=process.env.RATE_LIMIT_SECRET;
  if(!value || value.length<32)throw new ApiError(503,"SERVICE_NOT_CONFIGURED");
  return value;
}
function hmac(payload:string):Buffer {
  return createHmac("sha256",secret()).update("stepmark-desktop-pkce-v1:").update(payload).digest();
}
export function desktopCodeHash(nonce:string):string {
  return hashToken("desktop-code-v1:"+nonce);
}
export function validateLoopbackRedirect(raw:string):string {
  if(raw.length>120)throw new ApiError(400,"INVALID_DESKTOP_REDIRECT");
  let url:URL;
  try{url=new URL(raw);}catch{throw new ApiError(400,"INVALID_DESKTOP_REDIRECT");}
  const port=Number(url.port);
  if(url.protocol!=="http:" || url.hostname!=="127.0.0.1" ||
     !Number.isInteger(port) || port<1024 || port>65535 ||
     url.pathname!=="/callback" || url.search || url.hash ||
     url.username || url.password || url.href!==raw) {
    throw new ApiError(400,"INVALID_DESKTOP_REDIRECT");
  }
  return raw;
}
export function parseDesktopAuthorization(query:URLSearchParams) {
  const challenge=query.get("code_challenge")??"";
  const state=query.get("state")??"";
  const redirectUri=validateLoopbackRedirect(query.get("redirect_uri")??"");
  if(!B64_256.test(challenge) || !B64_256.test(state) ||
     query.getAll("code_challenge").length!==1 ||
     query.getAll("state").length!==1 ||
     query.getAll("redirect_uri").length!==1) {
    throw new ApiError(400,"INVALID_DESKTOP_AUTHORIZATION");
  }
  return {challenge,state,redirectUri};
}
export function newDesktopCode(challenge:string,redirectUri:string,now=Date.now()) {
  const nonce=randomBytes(32).toString("base64url");
  const payload=Buffer.from(JSON.stringify({
    v:1,n:nonce,c:challenge,r:redirectUri,e:now+DESKTOP_CODE_TTL_MS
  })).toString("base64url");
  return {nonce,code:payload+"."+hmac(payload).toString("base64url")};
}
export function verifyDesktopCode(code:string,verifier:string,redirectUri:string,now=Date.now()):string {
  if(!VERIFIER.test(verifier) || code.length>2048)throw new ApiError(400,"INVALID_DESKTOP_CODE");
  const parts=code.split(".");
  if(parts.length!==2 || !parts[0] || !B64_256.test(parts[1]??""))
    throw new ApiError(400,"INVALID_DESKTOP_CODE");
  const expected=hmac(parts[0]);
  const signature=Buffer.from(parts[1],"base64url");
  if(signature.length!==expected.length || !timingSafeEqual(signature,expected))
    throw new ApiError(400,"INVALID_DESKTOP_CODE");
  let payload:unknown;
  try{payload=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));}
  catch{throw new ApiError(400,"INVALID_DESKTOP_CODE");}
  if(!payload || typeof payload!=="object")throw new ApiError(400,"INVALID_DESKTOP_CODE");
  const p=payload as Record<string,unknown>;
  const challenge=createHash("sha256").update(verifier).digest("base64url");
  if(p.v!==1 || typeof p.n!=="string" || !B64_256.test(p.n) ||
     p.c!==challenge || p.r!==validateLoopbackRedirect(redirectUri) ||
     typeof p.e!=="number" || !Number.isSafeInteger(p.e) ||
     p.e<=now || p.e>now+DESKTOP_CODE_TTL_MS) {
    throw new ApiError(400,"INVALID_DESKTOP_CODE");
  }
  return p.n;
}
