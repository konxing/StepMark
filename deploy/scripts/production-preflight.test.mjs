import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
import {validateProductionEnv} from "../../apps/web/scripts/production-preflight.mjs";

const script=resolve(dirname(fileURLToPath(import.meta.url)),
  "../../apps/web/scripts/production-preflight.mjs");
const goodSecret=Buffer.from(Array.from({length:32},(_,i)=>i+1)).toString("base64url");
const base={
  NODE_ENV:"production",
  APP_ORIGIN:"https://stepmark.xin",
  DATABASE_URL:"postgresql://stepmark_app:valid-password@db.private.invalid:5432/stepmark?sslmode=verify-full",
  RATE_LIMIT_SECRET:goodSecret,
  DB_POOL_MAX:"6",
  STEPMARK_INGRESS_MODE:"caddy-direct",
  TRUSTED_CLIENT_IP_HEADER:"x-real-ip",
  RESEND_API_KEY:"re_1234567890abcdef",
  AUTH_FROM_EMAIL:"StepMark <no-reply@stepmark.xin>"
};
function rejected(key,value){
  assert.throws(()=>validateProductionEnv({...base,[key]:value}),Error,
    key+" should fail closed");
}

test("accepts a well-formed direct-Caddy production configuration",()=>{
  assert.deepEqual(validateProductionEnv(base),{
    emailConfigured:true,wechatConfigured:false
  });
  assert.deepEqual(validateProductionEnv({...base,
    DATABASE_URL:base.DATABASE_URL.replace("verify-full","require"),
    RESEND_API_KEY:"re_1234567890abcdef",
    AUTH_FROM_EMAIL:"StepMark <no-reply@stepmark.xin>",
    WECHAT_APP_ID:"wx1234567890",
    WECHAT_APP_SECRET:"a-real-configured-secret"
  }),{emailConfigured:true,wechatConfigured:true});
});

test("requires canonical HTTPS origin and production mode",()=>{
  rejected("APP_ORIGIN","http://stepmark.xin");
  rejected("APP_ORIGIN","https://stepmark.xin/");
  rejected("APP_ORIGIN","https://other.example");
  rejected("NODE_ENV","development");
});

test("requires non-placeholder PostgreSQL credentials and explicit TLS",()=>{
  rejected("DATABASE_URL","postgresql://stepmark_app:password@db.private.invalid:5432/stepmark");
  rejected("DATABASE_URL","postgresql://stepmark_app:password@db.private.invalid:5432/stepmark?sslmode=disable");
  rejected("DATABASE_URL","postgresql://stepmark_app:REPLACE_ME@db.private.invalid:5432/stepmark?sslmode=require");
  rejected("DATABASE_URL","postgresql://stepmark_app:password@localhost:5432/stepmark?sslmode=require");
  rejected("DATABASE_URL","postgresql://stepmark_app:password@postgres-private-host:5432/stepmark?sslmode=require");
  rejected("DATABASE_URL","not-a-database-url");
});

test("requires a 32-byte base64url secret and rejects obvious weak values",()=>{
  rejected("RATE_LIMIT_SECRET","REPLACE_WITH_CRYPTOGRAPHICALLY_RANDOM_32_PLUS_BYTES");
  rejected("RATE_LIMIT_SECRET","a-readable-secret-that-is-not-random");
  rejected("RATE_LIMIT_SECRET","A".repeat(43));
  rejected("RATE_LIMIT_SECRET",undefined);
});

test("refuses unverified CDN forwarding and invalid pool limits",()=>{
  rejected("TRUSTED_CLIENT_IP_HEADER","cf-connecting-ip");
  rejected("TRUSTED_CLIENT_IP_HEADER",undefined);
  rejected("STEPMARK_INGRESS_MODE","cloudflare");
  rejected("STEPMARK_INGRESS_MODE",undefined);
  rejected("DB_POOL_MAX","13");
  rejected("DB_POOL_MAX","0");
});

test("authentication requires a complete email or WeChat channel",()=>{
  rejected("RESEND_API_KEY",undefined);
  rejected("AUTH_FROM_EMAIL",undefined);
  rejected("WECHAT_APP_ID","wx1234567890");
  rejected("WECHAT_APP_SECRET","configured-secret");
  assert.throws(()=>validateProductionEnv({...base,
    RESEND_API_KEY:"REPLACE_ME",AUTH_FROM_EMAIL:"no-reply@stepmark.xin"}));
  const wechatOnly={...base,RESEND_API_KEY:undefined,AUTH_FROM_EMAIL:undefined,
    WECHAT_APP_ID:"wx1234567890",WECHAT_APP_SECRET:"valid-wechat-secret"};
  assert.deepEqual(validateProductionEnv(wechatOnly),{
    emailConfigured:false,wechatConfigured:true
  });
  rejected("RESEND_API_KEY",undefined); // Email alone cannot be partially configured.
  assert.throws(()=>validateProductionEnv({...base,
    RESEND_API_KEY:undefined,AUTH_FROM_EMAIL:undefined}),/AUTH_PROVIDER/);
});

test("CLI exits before startup and never prints credential values",()=>{
  const password="sensitive-test-password-unique";
  const env={...base,DATABASE_URL:
    "postgresql://stepmark_app:"+password+"@db.private.invalid:5432/stepmark?sslmode=disable"};
  const result=spawnSync(process.execPath,[script],{env,encoding:"utf8"});
  assert.equal(result.status,1);
  assert.match(result.stderr,/preflight FAILED: DATABASE_URL sslmode/);
  assert.doesNotMatch(result.stdout+result.stderr,new RegExp(password));
  assert.doesNotMatch(result.stdout+result.stderr,new RegExp(goodSecret));
});
