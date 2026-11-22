import {isIP} from "node:net";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";

/**
 * Fail closed before starting the production Node server. This checks only
 * configuration shape and obvious placeholders; it does NOT prove secret
 * entropy, network isolation, certificate trust, or provider availability.
 * Never print environment values (they may contain credentials).
 */
function invalid(name) {
  throw new Error(name+" is missing or unsafe for production");
}
function nonPlaceholder(value) {
  return typeof value==="string" && value.trim()===value && value.length>0 &&
    !/(REPLACE|CHANGE_ME|YOUR[_-]|EXAMPLE|PLACEHOLDER|CI[_-]TEST)/i.test(value);
}
export function validateProductionEnv(env=process.env) {
  if(env.NODE_ENV!=="production")invalid("NODE_ENV");
  if(env.APP_ORIGIN!=="https://stepmark.xin")invalid("APP_ORIGIN");

  const raw=env.DATABASE_URL;
  if(!nonPlaceholder(raw) || raw.length>4096)invalid("DATABASE_URL");
  let db;
  try{db=new URL(raw);}catch{invalid("DATABASE_URL");}
  if(!["postgresql:","postgres:"].includes(db.protocol) ||
     !db.username || !db.password || !db.hostname || !db.pathname || db.pathname==="/" ||
     db.hash || db.hostname==="localhost" || db.hostname.endsWith(".localhost") ||
     ["127.0.0.1","::1"].includes(db.hostname.replace(/^\[|\]$/g,"")) ||
     db.hostname==="postgres-private-host" ||
     (isIP(db.hostname)!==0 && db.hostname==="0.0.0.0"))invalid("DATABASE_URL");
  let user,pass;
  try{user=decodeURIComponent(db.username);pass=decodeURIComponent(db.password);}
  catch{invalid("DATABASE_URL");}
  if(!nonPlaceholder(user)||!nonPlaceholder(pass))invalid("DATABASE_URL");
  const modes=db.searchParams.getAll("sslmode");
  if(modes.length!==1 || !["require","verify-ca","verify-full"].includes(modes[0]))
    invalid("DATABASE_URL sslmode");

  // The deployment requires a random 32-byte base64url secret, not a readable
  // phrase. This cannot certify randomness; generate it with crypto.randomBytes.
  const pepper=env.RATE_LIMIT_SECRET;
  if(!nonPlaceholder(pepper) || !/^[A-Za-z0-9_-]{43}$/.test(pepper))
    invalid("RATE_LIMIT_SECRET");
  const bytes=Buffer.from(pepper,"base64url");
  if(bytes.length!==32 || bytes.toString("base64url")!==pepper ||
     new Set(bytes).size<12)invalid("RATE_LIMIT_SECRET");

  const mode=env.STEPMARK_INGRESS_MODE;
  const trusted=env.TRUSTED_CLIENT_IP_HEADER;
  if(mode!=="caddy-direct" || trusted!=="x-real-ip")
    invalid("STEPMARK_INGRESS_MODE / TRUSTED_CLIENT_IP_HEADER");
  if(env.DB_POOL_MAX!==undefined &&
     !/^(?:[1-9]|1[0-2])$/.test(env.DB_POOL_MAX))invalid("DB_POOL_MAX");

  const resend=env.RESEND_API_KEY,from=env.AUTH_FROM_EMAIL;
  if(Boolean(resend)!==Boolean(from))invalid("RESEND_API_KEY / AUTH_FROM_EMAIL");
  if(resend){
    if(!nonPlaceholder(resend)||resend.length<16)invalid("RESEND_API_KEY");
    const email=from.match(/<([^<>]+)>$/)?.[1]??from;
    if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))invalid("AUTH_FROM_EMAIL");
  }
  const wxId=env.WECHAT_APP_ID,wxSecret=env.WECHAT_APP_SECRET;
  if(Boolean(wxId)!==Boolean(wxSecret))invalid("WECHAT_APP_ID / WECHAT_APP_SECRET");
  if(wxId && (!nonPlaceholder(wxId)||!nonPlaceholder(wxSecret)))
    invalid("WECHAT_APP_ID / WECHAT_APP_SECRET");
  // With neither provider configured, new users cannot sign in through any
  // supported registration path. Fail rather than serve an unusable release.
  if(!resend && !wxId)invalid("AUTH_PROVIDER");
  return {emailConfigured:Boolean(resend),wechatConfigured:Boolean(wxId)};
}

if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  try{
    const state=validateProductionEnv();
    process.stdout.write("Production configuration preflight passed (offline checks only).\n");
    if(!state.emailConfigured)
      process.stdout.write("Email registration/recovery unavailable until configured.\n");
    if(!state.wechatConfigured)
      process.stdout.write("WeChat login unavailable until configured.\n");
  }catch(error){
    process.stderr.write("Production configuration preflight FAILED: "+
      (error instanceof Error?error.message:"invalid configuration")+"\n");
    process.exitCode=1;
  }
}
