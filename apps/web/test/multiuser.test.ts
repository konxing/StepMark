import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {NextRequest} from "next/server";
import {getDb} from "../src/server/db";
import {hashPassword,issueSession,lookupSession,requireSameOrigin,SESSION_COOKIE} from "../src/server/security";
import {listOwnHabits,findOwnHabit,listOwnEvents} from "../src/server/habit-service";
import {GET as habitsGET,POST as habitsPOST} from "../src/app/api/v1/habits/route";
import {POST as eventPOST} from "../src/app/api/v1/observations/route";
import {POST as logoutPOST} from "../src/app/api/v1/auth/logout/route";
import {POST as loginPOST} from "../src/app/api/v1/auth/login/route";
import {GET as insightGET} from "../src/app/api/v1/habits/[id]/insights/route";
import {POST as mobilePOST} from "../src/app/api/v1/auth/wechat/route";
import {POST as resetPOST} from "../src/app/api/v1/auth/reset-password/route";
import {POST as deletePOST} from "../src/app/api/v1/account/delete/route";
import {GET as exportGET} from "../src/app/api/v1/account/export/route";
import {hashToken} from "../src/server/security";
import {GET as tasksGET} from "../src/app/api/v1/tasks/route";
import {POST as assessPOST} from "../src/app/api/v1/assessments/route";

const db=getDb();
function req(path:string,method:string,body?:unknown,token?:string,kind:"WEB"|"WECHAT"="WEB",origin="http://localhost:3000"){
  const headers:Record<string,string>={origin};
  if(body!==undefined)headers["content-type"]="application/json";
  if(token) {
    if(kind==="WEB") headers.cookie=`${SESSION_COOKIE}=${token}`;
    else headers.authorization=`Bearer ${token}`;
  }
  return new NextRequest("http://localhost:3000"+path,{
    method,headers,body:body===undefined?undefined:JSON.stringify(body)
  });
}

test("per-user queries, CSRF rejection, idempotency and revocation",async()=>{
  const email="user_"+randomUUID()+"@example.test";
  const password="very-strong-test-password-123";
  const a=await db.user.create({data:{credential:{create:{
    email,passwordHash:await hashPassword(password),verifiedAt:new Date()
  }}},select:{id:true}});
  const b=await db.user.create({data:{},select:{id:true}});
  try {
    const aHabit=await db.habit.create({data:{userId:a.id,title:"A habit",action:"A actions"}});
    const bHabit=await db.habit.create({data:{userId:b.id,title:"B secret",action:"B actions"}});
    assert.deepEqual((await listOwnHabits(a.id)).map(h=>h.id),[aHabit.id]);
    assert.equal(await findOwnHabit(a.id,bHabit.id),null);
    assert.equal(await listOwnEvents(a.id,bHabit.id),null);
    const unauthed=await habitsGET(req("/api/v1/habits","GET"));
    assert.equal(unauthed.status,401);
    const login=await loginPOST(req("/api/v1/auth/login","POST",{email,password}));
    assert.equal(login.status,200);
    const webToken=login.cookies.get(SESSION_COOKIE)?.value;
    assert.ok(webToken);
    const permitted=await habitsGET(req("/api/v1/habits","GET",undefined,webToken));
    assert.equal(permitted.status,200);
    const owned=await permitted.json() as {habits:{id:string}[]};
    assert.equal(owned.habits.length,1);
    assert.equal(owned.habits[0]!.id,aHabit.id);
    const crossSite=await habitsPOST(req("/api/v1/habits","POST",
      {title:"Injected",action:"Bad action"},webToken,"WEB","https://evil.example"));
    assert.equal(crossSite.status,403);
    const foreign=await eventPOST(req("/api/v1/observations","POST",
      {habitId:bHabit.id,opportunityKey:"day-1",eligible:true,completed:true,
        occurredAt:new Date().toISOString()},webToken));
    assert.equal(foreign.status,404);
    const now=new Date().toISOString();
    const payload={habitId:aHabit.id,opportunityKey:"day-1",eligible:true,completed:true,occurredAt:now};
    const first=await eventPOST(req("/api/v1/observations","POST",payload,webToken));
    assert.equal(first.status,201);
    const again=await eventPOST(req("/api/v1/observations","POST",payload,webToken));
    assert.equal(again.status,200);
    assert.equal((await again.json() as {replayed:boolean}).replayed,true);
    const changed=await eventPOST(req("/api/v1/observations","POST",{...payload,completed:false},webToken));
    assert.equal(changed.status,409);
    const logout=await logoutPOST(req("/api/v1/auth/logout","POST",undefined,webToken));
    assert.equal(logout.status,200);
    assert.equal(await lookupSession(webToken,"WEB"),null);
  } finally {
    await db.user.deleteMany({where:{id:{in:[a.id,b.id]}}});
  }
});

test("WeChat code exchanges are single-use and bearer sessions isolate identities",async()=>{
  const oldFetch=globalThis.fetch;
  const subject="openid-"+randomUUID();
  globalThis.fetch=async(input:RequestInfo | URL)=>{
    const url=new URL(input.toString());
    assert.equal(url.hostname,"api.weixin.qq.com");
    assert.equal(url.pathname,"/sns/jscode2session");
    return new Response(JSON.stringify({openid:subject,session_key:"fake_server_only"}),{
      status:200,headers:{"Content-Type":"application/json"}
    });
  };
  let userId:string|null=null;
  try{
    const code="test-"+randomUUID();
    const response=await mobilePOST(req("/api/v1/auth/wechat","POST",{code}));
    assert.equal(response.status,200);
    const output=await response.json() as {accessToken:string};
    assert.ok(output.accessToken);
    const principal=await lookupSession(output.accessToken,"WECHAT");
    assert.ok(principal);
    userId=principal.userId;
    const replay=await mobilePOST(req("/api/v1/auth/wechat","POST",{code}));
    assert.equal(replay.status,409);
    const habits=await habitsGET(req("/api/v1/habits","GET",undefined,output.accessToken,"WECHAT"));
    assert.equal(habits.status,200);
    assert.deepEqual((await habits.json() as {habits:unknown[]}).habits,[]);
  }finally{
    globalThis.fetch=oldFetch;
    if(userId)await db.user.deleteMany({where:{id:userId}});
  }
});

test("origin enforcement never trusts attacker-supplied Host",()=>{
  assert.throws(()=>requireSameOrigin(new Request("http://evil.example/",{
    method:"POST",headers:{origin:"https://evil.example"}
  })));
});

test("objective tasks are owner-isolated, answer-safe and one-shot",async()=>{
  const a=await db.user.create({data:{},select:{id:true}});
  const b=await db.user.create({data:{},select:{id:true}});
  try{
    const aToken=(await issueSession(a.id,"WECHAT")).token;
    const bToken=(await issueSession(b.id,"WECHAT")).token;
    const aRes=await tasksGET(req("/api/v1/tasks?construct=reasoning.logic","GET",undefined,aToken,"WECHAT"));
    assert.equal(aRes.status,200);
    const serialized=await aRes.text();
    assert.equal(serialized.includes("correctKey"),false);
    assert.equal(serialized.includes("explanation"),false);
    const tasks=(JSON.parse(serialized) as {tasks:{id:string;options:{key:string}[]}[]}).tasks;
    assert.ok(tasks.length>=2);
    const first=tasks[0]!;
    const selectedKey=first.options[0]!.key;
    const accepted=await assessPOST(req("/api/v1/assessments","POST",{taskId:first.id,selectedKey},aToken,"WECHAT"));
    assert.equal(accepted.status,201);
    const duplicate=await assessPOST(req("/api/v1/assessments","POST",{taskId:first.id,selectedKey},aToken,"WECHAT"));
    assert.equal(duplicate.status,409);
    const aAgain=await tasksGET(req("/api/v1/tasks?construct=reasoning.logic","GET",undefined,aToken,"WECHAT"));
    assert.equal((await aAgain.json() as {tasks:unknown[]}).tasks.length,tasks.length-1);
    const bRes=await tasksGET(req("/api/v1/tasks?construct=reasoning.logic","GET",undefined,bToken,"WECHAT"));
    assert.equal((await bRes.json() as {tasks:unknown[]}).tasks.length,tasks.length);
  }finally{
    await db.user.deleteMany({where:{id:{in:[a.id,b.id]}}});
  }
});


test("password-reset token is single use and immediately revokes old sessions",async()=>{
  const email="recover_"+randomUUID()+"@example.test";
  const a=await db.user.create({data:{credential:{create:{
    email,passwordHash:await hashPassword("original-password-123456"),
    verifiedAt:new Date()
  }}},select:{id:true}});
  try{
    const token=randomUUID()+randomUUID();
    const c=await db.credential.findUniqueOrThrow({where:{userId:a.id}});
    await db.verificationToken.create({data:{credentialId:c.id,purpose:"RESET",tokenHash:hashToken(token),expiresAt:new Date(Date.now()+100000)}});
    const session=(await issueSession(a.id,"WEB")).token;
    const response=await resetPOST(req("/api/v1/auth/reset-password","POST",{token,newPassword:"new-recovery-password-1234"}));
    assert.equal(response.status,200);
    assert.equal(await lookupSession(session,"WEB"),null);
    const replay=await resetPOST(req("/api/v1/auth/reset-password","POST",{token,newPassword:"another-password-123456"}));
    assert.equal(replay.status,400);
    const login=await loginPOST(req("/api/v1/auth/login","POST",{email,password:"new-recovery-password-1234"}));
    assert.equal(login.status,200);
  }finally{
    await db.user.deleteMany({where:{id:a.id}});
  }
});

test("owner-scoped export and explicit deletion never touch another user",async()=>{
  const email="delete_"+randomUUID()+"@example.test",password="permanent-delete-test-1234";
  const a=await db.user.create({data:{credential:{create:{
    email,passwordHash:await hashPassword(password),verifiedAt:new Date()
  }}},select:{id:true}});
  const b=await db.user.create({data:{},select:{id:true}});
  try{
    await db.habit.create({data:{userId:a.id,title:"My habit",action:"only mine"}});
    await db.habit.create({data:{userId:b.id,title:"Secret B habit",action:"private"}});
    const token=(await issueSession(a.id,"WEB")).token;
    const read=await exportGET(req("/api/v1/account/export?kind=habits&offset=0","GET",undefined,token));
    assert.equal(read.status,200);
    const exportText=await read.text();
    assert.ok(exportText.includes("My habit"));
    assert.equal(exportText.includes("Secret B habit"),false);
    const wrongPassword=await deletePOST(req("/api/v1/account/delete","POST",
      {password:"wrong-password",confirmation:"DELETE"},token));
    assert.equal(wrongPassword.status,403);
    const deleted=await deletePOST(req("/api/v1/account/delete","POST",{password,confirmation:"DELETE"},token));
    assert.equal(deleted.status,200);
    assert.equal(await db.user.findUnique({where:{id:a.id}}),null);
    assert.notEqual(await db.user.findUnique({where:{id:b.id}}),null);
    assert.equal(await lookupSession(token,"WEB"),null);
  }finally{
    await db.user.deleteMany({where:{id:{in:[a.id,b.id]}}});
  }
});

test("habit insights respect ownership and never fabricate a rate from zero opportunities",async()=>{
  const a=await db.user.create({data:{},select:{id:true}});
  const b=await db.user.create({data:{},select:{id:true}});
  try {
    const ha=await db.habit.create({data:{userId:a.id,title:"A",action:"action A"}});
    const hb=await db.habit.create({data:{userId:b.id,title:"B",action:"action B"}});
    const token=(await issueSession(a.id,"WECHAT")).token;
    const get=(id:string)=>insightGET(req(`/api/v1/habits/${id}/insights`,"GET",undefined,token,"WECHAT"),{
      params:Promise.resolve({id})});
    const denied=await get(hb.id);
    assert.equal(denied.status,404);
    const empty=await get(ha.id);
    assert.equal(empty.status,200);
    const output=await empty.json() as {posterior:unknown;observedRate:unknown};
    assert.equal(output.posterior,null);
    assert.equal(output.observedRate,null);
    await db.habitEvent.create({data:{habitId:ha.id,opportunityKey:"t1",eligible:true,completed:true,occurredAt:new Date(),source:"test"}});
    const filled=await get(ha.id);
    const result=await filled.json() as {posterior:{posteriorMean:number};completions:number};
    assert.equal(result.completions,1);
    assert.ok(result.posterior.posteriorMean<1);
  } finally {
    await db.user.deleteMany({where:{id:{in:[a.id,b.id]}}});
  }
});
