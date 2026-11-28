import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import pg from "pg";

const root=fileURLToPath(new URL("../../",import.meta.url));
const web=fileURLToPath(new URL("../../apps/web/",import.meta.url));
const origin="http://127.0.0.1:8080";

function child(args,environment,options={}){
  const processHandle=spawn(process.execPath,args,{cwd:root,env:environment,
    stdio:["pipe","pipe","pipe"],...options});
  processHandle.stdin.on("error",()=>{});
  let output="";
  for(const stream of [processHandle.stdout,processHandle.stderr]){
    stream.setEncoding("utf8");
    stream.on("data",chunk=>{output=(output+chunk).slice(-4000);});
  }
  const done=new Promise((resolve,reject)=>{
    processHandle.once("error",reject);
    processHandle.once("close",code=>resolve({code,output}));
  });
  return {processHandle,done};
}

test("local production startup, login and desktop PKCE stay on loopback",{timeout:55000},async()=>{
  const email="local_smoke_"+randomBytes(6).toString("hex")+"@example.test";
  const password=randomBytes(24).toString("base64url");
  const env={...process.env,NODE_ENV:"production",RATE_LIMIT_SECRET:randomBytes(32).toString("base64url"),
    NEXT_TELEMETRY_DISABLED:"1",RESEND_API_KEY:"",AUTH_FROM_EMAIL:"",WECHAT_APP_ID:"",WECHAT_APP_SECRET:""};
  const db=new pg.Pool({connectionString:env.DATABASE_URL,max:1});
  const account=child(["../../node_modules/tsx/dist/cli.mjs","--tsconfig","tsconfig.json",
    "scripts/create-local-account.ts",email],env,{cwd:web});
  account.processHandle.stdin.end(password+"\n");
  let site;
  try{
    const created=await account.done;
    assert.equal(created.code,0,created.output);
    site=child(["deploy/windows/start-site.mjs"],env);
    let healthy=false;
    for(let tries=0;tries<120&&site.processHandle.exitCode===null;tries++){
      try{
        const response=await fetch(origin+"/api/health",{signal:AbortSignal.timeout(500)});
        healthy=response.ok&&(await response.json()).service==="stepmark-web";
      }catch{}
      if(healthy)break;
      await delay(200);
    }
    if(!healthy){
      if(site.processHandle.exitCode!==null)assert.fail((await site.done).output);
      assert.fail("local production server did not start");
    }

    const homepage=await fetch(origin+"/login");
    assert.equal(homepage.status,200);
    assert.ok(homepage.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"));
    assert.doesNotMatch(homepage.headers.get("content-security-policy")??"",/upgrade-insecure-requests/);
    assert.equal((await fetch(origin+"/api/health",{headers:{"x-forwarded-host":"stepmark.xin"}})).status,421);
    const body=JSON.stringify({email,password});
    const login=(requestOrigin)=>fetch(origin+"/api/v1/auth/login",{method:"POST",
      body,headers:{origin:requestOrigin,"Content-Type":"application/json"}});
    assert.equal((await login("https://stepmark.xin")).status,403);
    const authenticated=await login(origin);
    assert.equal(authenticated.status,200);
    const setCookie=authenticated.headers.get("set-cookie")??"";
    assert.match(setCookie,/HttpOnly/i);
    assert.doesNotMatch(setCookie,/; ?secure(?:;|$)/i);
    const cookie=setCookie.split(";")[0];
    const dashboard=await fetch(origin+"/dashboard",{headers:{cookie},redirect:"manual"});
    assert.equal(dashboard.status,200);
    const dashboardHtml=await dashboard.text();
    assert.match(dashboardHtml,/可选练习、初测与复测/);
    assert.doesNotMatch(dashboardHtml,/逻辑推理训练与复测/);
    const coaching=await fetch(origin+"/api/v1/ability-coaching",{headers:{cookie}});
    assert.equal(coaching.status,200);
    assert.equal((await coaching.json()).canCoach,false);
    const verifier=randomBytes(32).toString("base64url");
    const state=randomBytes(32).toString("base64url");
    const redirectUri="http://127.0.0.1:42991/callback";
    const authUrl=new URL("/api/v1/auth/desktop/authorize",origin);
    authUrl.search=new URLSearchParams({code_challenge:createHash("sha256").update(verifier).digest("base64url"),
      state,redirect_uri:redirectUri}).toString();
    const anonymous=await fetch(authUrl,{redirect:"manual"});
    assert.equal(anonymous.status,302);
    assert.equal(new URL(anonymous.headers.get("location")).origin,origin);
    const consent=await fetch(authUrl,{method:"POST",headers:{cookie,origin},redirect:"manual"});
    assert.equal(consent.status,303);
    const callback=new URL(consent.headers.get("location"));
    assert.equal(callback.origin+callback.pathname,redirectUri);
    assert.equal(callback.searchParams.get("state"),state);
    const exchange=await fetch(origin+"/api/v1/auth/desktop/exchange",{method:"POST",
      headers:{"Content-Type":"application/json"},body:JSON.stringify({
        code:callback.searchParams.get("code"),codeVerifier:verifier,redirectUri
      })});
    assert.equal(exchange.status,200);
    const {accessToken}=await exchange.json();
    const me=await fetch(origin+"/api/v1/me",{headers:{authorization:"Bearer "+accessToken}});
    assert.equal(me.status,200);
    assert.equal((await me.json()).user.email,email);

    site.processHandle.stdin.end("stop\n");
    const stopped=await site.done;
    assert.equal(stopped.code,0,stopped.output);
  }finally{
    if(site?.processHandle.exitCode===null)site.processHandle.kill();
    await db.query('DELETE FROM "User" WHERE id IN (SELECT "userId" FROM "Credential" WHERE email=$1)',[email]);
    await db.end();
  }
});
