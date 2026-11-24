import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {NextRequest} from "next/server";
import {getDb} from "../src/server/db";
import {newDesktopCode,parseDesktopAuthorization,verifyDesktopCode} from "../src/server/desktop-auth";
import {hashPassword,issueSession,lookupSession,SESSION_COOKIE} from "../src/server/security";
import {GET as authorizeGET,POST as authorizePOST} from "../src/app/api/v1/auth/desktop/authorize/route";
import {POST as exchangePOST} from "../src/app/api/v1/auth/desktop/exchange/route";
import {POST as desktopLogoutPOST} from "../src/app/api/v1/auth/desktop/logout/route";
import {GET as habitsGET,POST as habitsPOST} from "../src/app/api/v1/habits/route";
import {GET as meGET} from "../src/app/api/v1/me/route";
import {GET as exportGET} from "../src/app/api/v1/account/export/route";
import {GET as progressGET} from "../src/app/api/v1/habits/[id]/progress/route";
import {GET as trainingGET,PUT as trainingPUT} from "../src/app/api/v1/habits/[id]/training/route";

const origin="http://localhost:3000";
function req(path:string,method="GET",body?:unknown,token?:string,desktop=false,requestOrigin=origin){
  const headers:Record<string,string>={origin:requestOrigin};
  if(body!==undefined)headers["content-type"]="application/json";
  if(token)headers[desktop?"authorization":"cookie"]=desktop?"Bearer "+token:SESSION_COOKIE+"="+token;
  return new NextRequest(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
}
function authParams(verifier:string,state:string,redirectUri:string){
  const challenge=createHash("sha256").update(verifier).digest("base64url");
  return "/api/v1/auth/desktop/authorize?"+new URLSearchParams({
    code_challenge:challenge,state,redirect_uri:redirectUri
  }).toString();
}
test("PKCE code requires exact verifier, signed payload, fresh expiry and strict loopback",()=>{
  const verifier=randomBytes(32).toString("base64url");
  const challenge=createHash("sha256").update(verifier).digest("base64url");
  const redirectUri="http://127.0.0.1:34567/callback";
  const {code,nonce}=newDesktopCode(challenge,redirectUri,10000);
  assert.equal(verifyDesktopCode(code,verifier,redirectUri,10001),nonce);
  assert.throws(()=>verifyDesktopCode(code,randomBytes(32).toString("base64url"),redirectUri,10001));
  assert.throws(()=>verifyDesktopCode(code,verifier,redirectUri,140000));
  assert.throws(()=>verifyDesktopCode(code+"a",verifier,redirectUri,10001));
  assert.throws(()=>verifyDesktopCode(code,verifier,"http://127.0.0.1:34568/callback",10001));
  for(const bad of ["https://127.0.0.1:34567/callback","http://localhost:34567/callback",
    "http://127.0.0.1:80/callback","http://127.0.0.1:34567/other",
    "http://127.0.0.1:34567/callback?x=1","http://127.0.0.1.evil.test:34567/callback",
    "http://user@127.0.0.1:34567/callback","http://[::1]:34567/callback"]){
    assert.throws(()=>parseDesktopAuthorization(new URLSearchParams({
      code_challenge:challenge,state:verifier,redirect_uri:bad
    })),bad);
  }
});
test("browser consent -> one-time PKCE exchange -> scoped desktop reads -> logout",async()=>{
  const db=getDb();
  const a=await db.user.create({data:{credential:{create:{
    email:"desktop_"+randomUUID()+"@example.test",
    passwordHash:await hashPassword("desktop-test-password-123"),
    verifiedAt:new Date()
  }}},select:{id:true}});
  const b=await db.user.create({data:{},select:{id:true}});
  try{
    const ownHabit=await db.habit.create({data:{userId:a.id,title:"Visible habit",action:"Read daily"}});
    const otherHabit=await db.habit.create({data:{userId:b.id,title:"Other person's private habit",action:"Hidden"}});
    const browser=(await issueSession(a.id,"WEB")).token;
    const verifier=randomBytes(32).toString("base64url");
    const state=randomBytes(32).toString("base64url");
    const redirectUri="http://127.0.0.1:54321/callback";
    const path=authParams(verifier,state,redirectUri);
    const loginRequired=await authorizeGET(req(path));
    assert.equal(loginRequired.status,302);
    assert.equal(new URL(loginRequired.headers.get("location")??"").pathname,"/login");
    const consent=await authorizeGET(req(path,"GET",undefined,browser));
    assert.equal(consent.status,200);
    assert.ok((await consent.text()).includes("确认连接"));
    assert.equal(consent.headers.get("cache-control"),"no-store");
    const crossOrigin=await authorizePOST(req(path,"POST",undefined,browser,false,"https://evil.test"));
    assert.equal(crossOrigin.status,403);
    const confirmed=await authorizePOST(req(path,"POST",undefined,browser));
    assert.equal(confirmed.status,303);
    const callback=new URL(confirmed.headers.get("location")??"");
    assert.equal(callback.origin,"http://127.0.0.1:54321");
    assert.equal(callback.searchParams.get("state"),state);
    const code=callback.searchParams.get("code")??"";
    assert.ok(code.length>100);
    // The signed code contains a visible nonce; it must never be usable as a web session.
    const nonce=JSON.parse(Buffer.from(code.split(".")[0]??"","base64url").toString("utf8")).n as string;
    assert.equal(await lookupSession("desktop-code-v1:"+nonce,"WEB"),null);
    const payload={code,codeVerifier:verifier,redirectUri};
    const wrong=await exchangePOST(req("/api/v1/auth/desktop/exchange","POST",{...payload,codeVerifier:randomBytes(32).toString("base64url")}));
    assert.equal(wrong.status,400);
    const exchange=await exchangePOST(req("/api/v1/auth/desktop/exchange","POST",payload));
    assert.equal(exchange.status,200);
    const token=(await exchange.json() as {accessToken:string}).accessToken;
    assert.ok(token.startsWith("sm_desktop_"));
    assert.equal(await lookupSession(token,"WEB"),null,"desktop token must not authenticate as browser cookie");
    assert.equal((await lookupSession(token,"WEB",true))?.kind,"DESKTOP");
    const me=await meGET(req("/api/v1/me","GET",undefined,token,true));
    assert.equal(me.status,200);
    assert.equal((await me.json() as {user:{id:string;kind:string}}).user.kind,"DESKTOP");
    const habits=await habitsGET(req("/api/v1/habits","GET",undefined,token,true));
    assert.equal(habits.status,200);
    const body=await habits.text();
    assert.ok(body.includes("Visible habit"));
    assert.ok(!body.includes("Other person's private habit"));
    const own={params:Promise.resolve({id:ownHabit.id})};
    const other={params:Promise.resolve({id:otherHabit.id})};
    const ownPath="/api/v1/habits/"+ownHabit.id;
    assert.equal((await progressGET(req(ownPath+"/progress","GET",undefined,token,true),own)).status,200);
    assert.equal((await progressGET(req("/api/v1/habits/"+otherHabit.id+"/progress","GET",undefined,token,true),other)).status,404);
    assert.equal((await trainingGET(req(ownPath+"/training","GET",undefined,token,true),own)).status,200);
    assert.equal((await trainingPUT(req(ownPath+"/training","PUT",{target:"reasoning.logic"},token,true),own)).status,403);
    assert.equal((await habitsPOST(req("/api/v1/habits","POST",{title:"Forbidden",action:"No"},token,true))).status,403);
    assert.equal((await exportGET(req("/api/v1/account/export?kind=habits","GET",undefined,token,true))).status,403);
    assert.equal((await exchangePOST(req("/api/v1/auth/desktop/exchange","POST",payload))).status,400,"replay rejected");
    assert.equal((await habitsGET(req("/api/v1/habits","GET",undefined,token))).status,401,"cookie token rejected");
    assert.equal((await desktopLogoutPOST(req("/api/v1/auth/desktop/logout","POST",undefined,token,true))).status,200);
    assert.equal((await meGET(req("/api/v1/me","GET",undefined,token,true))).status,401);
    assert.equal((await meGET(req("/api/v1/me","GET",undefined,browser))).status,200,"browser unaffected");
  }finally{
    await db.user.deleteMany({where:{id:{in:[a.id,b.id]}}});
  }
});
