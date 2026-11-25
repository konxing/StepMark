import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {NextRequest} from "next/server";
import {getDb} from "../src/server/db";
import {ApiError,enforceRateLimit,errorResponse,hashPassword,issueSession,lookupSession,requireSameOrigin,sourceKey,SESSION_COOKIE} from "../src/server/security";
import {listOwnHabits,findOwnHabit,listOwnEvents} from "../src/server/habit-service";
import {GET as habitsGET,POST as habitsPOST} from "../src/app/api/v1/habits/route";
import {POST as eventPOST, GET as eventGET} from "../src/app/api/v1/observations/route";
import {GET as correctionGET,PUT as correctionPUT} from "../src/app/api/v1/observations/[id]/route";
import {POST as logoutPOST} from "../src/app/api/v1/auth/logout/route";
import {POST as loginPOST} from "../src/app/api/v1/auth/login/route";
import {GET as insightGET} from "../src/app/api/v1/habits/[id]/insights/route";
import {GET as habitProgressGET} from "../src/app/api/v1/habits/[id]/progress/route";
import {GET as dueReviewsGET} from "../src/app/api/v1/habits/due/route";
import {POST as reflectionPOST, GET as reflectionGET} from "../src/app/api/v1/habits/[id]/reflections/route";
import {PATCH as reviewPATCH, PUT as reviewPUT} from "../src/app/api/v1/habits/[id]/reviews/route";
import {PATCH as revokeAI, PUT as revokeAIPUT, DELETE as deleteReflection, POST as addSelfRating} from "../src/app/api/v1/habits/[id]/reflections/[reflectionId]/route";
import {POST as mobilePOST} from "../src/app/api/v1/auth/wechat/route";
import {POST as resetPOST} from "../src/app/api/v1/auth/reset-password/route";
import {POST as deletePOST} from "../src/app/api/v1/account/delete/route";
import {GET as exportGET} from "../src/app/api/v1/account/export/route";
import {hashToken} from "../src/server/security";
import {GET as tasksGET} from "../src/app/api/v1/tasks/route";
import {POST as assessPOST,GET as assessGET} from "../src/app/api/v1/assessments/route";
import {GET as practiceGET,POST as practicePOST} from "../src/app/api/v1/practice/route";
import {GET as formOverviewGET} from "../src/app/api/v1/assessment-forms/route";
import {GET as measurementEvidenceGET} from "../src/app/api/v1/measurement-evidence/route";

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

test("habit progress uses local action dates and the same eligible counts as insights",async()=>{
  const owner=await db.user.create({data:{},select:{id:true}});
  try{
    const habit=await db.habit.create({data:{userId:owner.id,title:"Local morning",action:"Practise a skill"}});
    const earlier=await db.habitEvent.create({data:{habitId:habit.id,
      opportunityKey:"daily:2025-11-22",occurredAt:new Date("2025-11-22T01:00:00Z"),
      eligible:true,completed:true,source:"test"}});
    const later=await db.habitEvent.create({data:{habitId:habit.id,
      opportunityKey:"daily:2025-11-23",occurredAt:new Date("2025-11-22T23:00:00Z"),
      eligible:true,completed:true,source:"test"}});
    await db.habitEvent.createMany({data:[
      {habitId:habit.id,opportunityKey:"daily:2025-11-24",occurredAt:new Date("2025-11-24T01:00:00Z"),
        eligible:true,completed:false,source:"test"},
      {habitId:habit.id,opportunityKey:"daily:2025-11-25",occurredAt:new Date("2025-11-25T01:00:00Z"),
        eligible:false,completed:false,source:"test"}
    ]});
    await db.habitReflection.createMany({data:[earlier,later].map(event=>({
      habitId:habit.id,eventId:event.id,initiationLevel:4
    }))});

    const {token}=await issueSession(owner.id,"WECHAT");
    const context={params:Promise.resolve({id:habit.id})};
    const root="/api/v1/habits/"+habit.id;
    const [progressResponse,insightsResponse,dueResponse]=await Promise.all([
      habitProgressGET(req(root+"/progress","GET",undefined,token,"WECHAT"),context),
      insightGET(req(root+"/insights","GET",undefined,token,"WECHAT"),context),
      dueReviewsGET(req("/api/v1/habits/due","GET",undefined,token,"WECHAT"))
    ]);
    assert.deepEqual([progressResponse.status,insightsResponse.status,dueResponse.status],[200,200,200]);
    const [progress,insights,due]=await Promise.all([
      progressResponse.json(),insightsResponse.json(),dueResponse.json()
    ]);
    assert.equal(progress.evidenceCount,2);
    assert.equal(progress.lastRatingAt,later.occurredAt.toISOString());
    assert.equal(progress.eligibleOpportunities,3);
    assert.equal(progress.completedRepetitions,2);
    assert.deepEqual(progress.recentExecution,{eligible:3,completed:2,inconsistent:false});
    assert.equal(insights.observedRate,progress.observedCompletionRate);
    assert.equal(due.due.find((review:{habitId:string})=>review.habitId===habit.id)?.progress,progress.progress);
  }finally{
    await db.user.delete({where:{id:owner.id}});
  }
});

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
    const retry=await eventPOST(req("/api/v1/observations","POST",{...payload,
      occurredAt:new Date(Date.now()+1000).toISOString()},webToken));
    assert.equal(retry.status,200); // Same opportunity and state: timestamp is not a new event.
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

test("trusted proxy source IP requires a single valid address",()=>{
  const original=process.env.TRUSTED_CLIENT_IP_HEADER;
  try{
    process.env.TRUSTED_CLIENT_IP_HEADER="x-real-ip";
    const make=(ip:string)=>new Request("http://localhost/",{headers:{"x-real-ip":ip}});
    assert.equal(sourceKey(make("203.0.113.9")),"203.0.113.9");
    assert.equal(sourceKey(make("2001:db8::1")),"2001:db8::1");
    assert.equal(sourceKey(make("2001:0DB8:0000:0000:0000:0000:0000:0001")),"2001:db8::1");
    assert.equal(sourceKey(make("2001:DB8::1")),"2001:db8::1");
    assert.equal(sourceKey(make("203.0.113.9, 198.51.100.1")),"unresolved");
    assert.equal(sourceKey(make("invalid")),"unresolved");
    assert.equal(sourceKey(make("203.0.113.9:8080")),"unresolved");
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
    assert.equal(sourceKey(make("203.0.113.9")),"unresolved");
  } finally {
    if(original===undefined)delete process.env.TRUSTED_CLIENT_IP_HEADER;
    else process.env.TRUSTED_CLIENT_IP_HEADER=original;
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

test("private habit feelings, progress and review settings enforce user ownership",async()=>{
  const a=await db.user.create({data:{credential:{create:{
    email:"reflection_"+randomUUID()+"@example.test",passwordHash:await hashPassword("verified-password-123456"),
    verifiedAt:new Date()
  }}},select:{id:true}});
  const b=await db.user.create({data:{},select:{id:true}});
  try{
    const ha=await db.habit.create({data:{userId:a.id,title:"A reflection habit",action:"Start naturally"}});
    const hb=await db.habit.create({data:{userId:b.id,title:"B secret habit",action:"Never leak"}});
    const event=await db.habitEvent.create({data:{habitId:ha.id,opportunityKey:"one",eligible:true,
      completed:true,occurredAt:new Date(),source:"test"}});
    const token=(await issueSession(a.id,"WEB")).token;
    const context=(id:string)=>({params:Promise.resolve({id})});
    const foreign=await reflectionPOST(req("/api/v1/habits/"+hb.id+"/reflections","POST",
      {note:"private text",initiationLevel:3,aiConsent:false},token),context(hb.id));
    assert.equal(foreign.status,404);
    const unauthorized=await habitProgressGET(req("/api/v1/habits/"+hb.id+"/progress","GET",undefined,token),context(hb.id));
    assert.equal(unauthorized.status,404);
    const wrongEvent=await reflectionPOST(req("/api/v1/habits/"+ha.id+"/reflections","POST",
      {eventId:randomUUID(),initiationLevel:3},token),context(ha.id));
    assert.equal(wrongEvent.status,404);
    const outside=await reflectionPOST(req("/api/v1/habits/"+ha.id+"/reflections","POST",
      {eventId:event.id,note:"我开始前有一点小纠结",initiationLevel:2,aiConsent:false},token,"WEB","https://attacker.test"),context(ha.id));
    assert.equal(outside.status,403);
    const own=await reflectionPOST(req("/api/v1/habits/"+ha.id+"/reflections","POST",
      {eventId:event.id,note:"我开始前有一点小纠结",initiationLevel:2,aiConsent:false},token),context(ha.id));
    assert.equal(own.status,201);
    const body=await own.json() as {reflection:{aiStatus:string}};
    assert.equal(body.reflection.aiStatus,"DISABLED");
    const replay=await reflectionPOST(req("/api/v1/habits/"+ha.id+"/reflections","POST",
      {eventId:event.id,initiationLevel:4},token),context(ha.id));
    assert.equal(replay.status,409);
    const details=await reflectionGET(req("/api/v1/habits/"+ha.id+"/reflections","GET",undefined,token),context(ha.id));
    assert.equal(details.status,200);
    assert.ok((await details.text()).includes("一点小纠结"));
    const progress=await habitProgressGET(req("/api/v1/habits/"+ha.id+"/progress","GET",undefined,token),context(ha.id));
    assert.equal(progress.status,200);
    const status=await progress.json() as {progress:number;completedRepetitions:number;evidenceCount:number};
    assert.equal(status.completedRepetitions,1);
    assert.equal(status.evidenceCount,1);
    assert.ok(status.progress<65);
    const off=await reviewPATCH(req("/api/v1/habits/"+ha.id+"/reviews","PATCH",{enabled:false},token),context(ha.id));
    assert.equal(off.status,200);
    const again=await habitProgressGET(req("/api/v1/habits/"+ha.id+"/progress","GET",undefined,token),context(ha.id));
    assert.equal((await again.json() as {nextReviewAt:string|null}).nextReviewAt,null);
    const foreignOff=await reviewPATCH(req("/api/v1/habits/"+hb.id+"/reviews","PATCH",{enabled:false},token),context(hb.id));
    assert.equal(foreignOff.status,404);
  }finally{
    await db.user.deleteMany({where:{id:{in:[a.id,b.id]}}});
  }
});

test("completed, missed and absent-cue opportunities have distinct denominator semantics",async()=>{
  const user=await db.user.create({data:{},select:{id:true}});
  try{
    const habit=await db.habit.create({data:{userId:user.id,title:"Three states",action:"Start action"}});
    const token=(await issueSession(user.id,"WECHAT")).token;
    const send=(key:string,eligible:boolean,completed:boolean)=>eventPOST(req("/api/v1/observations","POST",{
      habitId:habit.id,opportunityKey:key,eligible,completed,occurredAt:new Date().toISOString()
    },token,"WECHAT"));
    assert.equal((await send("daily:a",true,true)).status,201);
    assert.equal((await send("daily:b",true,false)).status,201);
    assert.equal((await send("daily:c",false,false)).status,201);
    assert.equal((await send("daily:d",false,true)).status,400);
    const response=await insightGET(req("/api/v1/habits/"+habit.id+"/insights","GET",undefined,token,"WECHAT"),{
      params:Promise.resolve({id:habit.id})});
    const body=await response.json() as {eligibleOpportunities:number;completions:number;observedRate:number};
    assert.equal(body.eligibleOpportunities,2);
    assert.equal(body.completions,1);
    assert.equal(body.observedRate,.5);
    const progress=await habitProgressGET(req("/api/v1/habits/"+habit.id+"/progress","GET",undefined,token,"WECHAT"),{
      params:Promise.resolve({id:habit.id})});
    const status=await progress.json() as {completedRepetitions:number};
    assert.equal(status.completedRepetitions,1);
  }finally{await db.user.deleteMany({where:{id:user.id}});}
});

test("AI consent can be revoked, diary deleted, but in-flight requests cannot falsely be recalled",async()=>{
  const a=await db.user.create({data:{credential:{create:{
    email:"control_"+randomUUID()+"@example.test",passwordHash:await hashPassword("private-control-password-12345"),
    verifiedAt:new Date()
  }}},select:{id:true}});
  const b=await db.user.create({data:{},select:{id:true}});
  const dbA=()=>db.habitReflection.findMany({where:{habit:{userId:a.id}}});
  try{
    const h=await db.habit.create({data:{userId:a.id,title:"private reflection",action:"Do it"}});
    const foreign=await db.habit.create({data:{userId:b.id,title:"secret",action:"Private"}});
    const token=(await issueSession(a.id,"WEB")).token;
    const pending=await db.habitReflection.create({data:{habitId:h.id,aiConsent:true,
      aiStatus:"PENDING",note:"A personally sensitive note",initiationLevel:3}});
    const completed=await db.habitReflection.create({data:{habitId:h.id,aiConsent:true,
      aiStatus:"COMPLETED",note:"Started naturally",aiLevel:4,aiConfidence:.9,
      aiQuote:"naturally",aiModelId:"test-model",aiPromptVersion:"v1"}});
    const inFlight=await db.habitReflection.create({data:{habitId:h.id,aiConsent:true,
      aiStatus:"PROCESSING",note:"In-flight request"}});
    const context=(habitId:string,reflectionId:string)=>({params:Promise.resolve({id:habitId,reflectionId})});
    const route=(habitId:string,reflectionId:string,method:string,origin="http://localhost:3000")=>
      req("/api/v1/habits/"+habitId+"/reflections/"+reflectionId,method,undefined,token,"WEB",origin);
    assert.equal((await revokeAI(route(foreign.id,pending.id,"PATCH"),context(foreign.id,pending.id))).status,404);
    assert.equal((await deleteReflection(route(foreign.id,pending.id,"DELETE"),context(foreign.id,pending.id))).status,404);
    assert.equal((await revokeAI(route(h.id,pending.id,"PATCH","https://evil.example"),context(h.id,pending.id))).status,403);
    const revoked=await revokeAI(route(h.id,pending.id,"PATCH"),context(h.id,pending.id));
    assert.equal(revoked.status,200);
    const afterPending=await db.habitReflection.findUniqueOrThrow({where:{id:pending.id}});
    assert.equal(afterPending.aiConsent,false);
    assert.equal(afterPending.aiStatus,"DISABLED");
    assert.equal(afterPending.note,"A personally sensitive note");
    const inflightResponse=await revokeAI(route(h.id,inFlight.id,"PATCH"),context(h.id,inFlight.id));
    assert.equal(inflightResponse.status,409);
    assert.equal((await deleteReflection(route(h.id,inFlight.id,"DELETE"),context(h.id,inFlight.id))).status,409);
    const sent=await revokeAI(route(h.id,completed.id,"PATCH"),context(h.id,completed.id));
    assert.equal(sent.status,200);
    assert.equal((await sent.json() as {mayHaveBeenSentToProvider:boolean}).mayHaveBeenSentToProvider,true);
    const afterCompleted=await db.habitReflection.findUniqueOrThrow({where:{id:completed.id}});
    assert.equal(afterCompleted.aiLevel,null);
    assert.equal(afterCompleted.aiQuote,null);
    const erased=await deleteReflection(route(h.id,pending.id,"DELETE"),context(h.id,pending.id));
    assert.equal(erased.status,200);
    assert.equal(await db.habitReflection.findUnique({where:{id:pending.id}}),null);
    assert.equal((await dbA()).length,2);
    assert.notEqual(await db.habit.findUnique({where:{id:foreign.id}}),null);
  }finally{await db.user.deleteMany({where:{id:{in:[a.id,b.id]}}});}
});

test("batched due-review endpoint only exposes own opted-in habits",async()=>{
  const a=await db.user.create({data:{},select:{id:true}});
  const b=await db.user.create({data:{},select:{id:true}});
  try{
    const dueA=await db.habit.create({data:{userId:a.id,title:"Due A",action:"Do something"}});
    const hiddenA=await db.habit.create({data:{userId:a.id,title:"Hidden A",action:"Do something",reviewEnabled:false}});
    const dueB=await db.habit.create({data:{userId:b.id,title:"Secret B",action:"Private"}});
    const old=new Date(Date.now()-40*86400000);
    await Promise.all([dueA.id,hiddenA.id,dueB.id].map(habitId=>
      db.habitEvent.create({data:{habitId,opportunityKey:"old",eligible:true,completed:true,
        occurredAt:old,source:"test"}})
    ));
    await Promise.all([dueA.id,hiddenA.id,dueB.id].map(habitId=>
      db.habitReflection.create({data:{habitId,initiationLevel:3,createdAt:old}})
    ));
    const token=(await issueSession(a.id,"WECHAT")).token;
    const response=await dueReviewsGET(req("/api/v1/habits/due","GET",undefined,token,"WECHAT"));
    assert.equal(response.status,200);
    const result=await response.json() as {due:{habitId:string;title:string}[];totalDue:number};
    assert.equal(result.totalDue,1);
    assert.equal(result.due[0]!.habitId,dueA.id);
    assert.equal(JSON.stringify(result).includes("Secret B"),false);
    assert.equal(JSON.stringify(result).includes("Hidden A"),false);
  }finally{await db.user.deleteMany({where:{id:{in:[a.id,b.id]}}});}
});

test("late self-ratings preserve source records and use the completed action's day",async()=>{
  const owner=await db.user.create({data:{credential:{create:{
    email:`late-${randomUUID()}@example.test`,passwordHash:await hashPassword("verified-password-123456"),verifiedAt:new Date()
  }}},select:{id:true}});
  const other=await db.user.create({data:{},select:{id:true}});
  try{
    const habit=await db.habit.create({data:{userId:owner.id,title:"Observation habit",action:"Check"}});
    const when=new Date(Date.now()-60*86400000);
    const event=await db.habitEvent.create({data:{habitId:habit.id,eligible:true,completed:true,
      opportunityKey:"old",occurredAt:when,source:"test"}});
    const linked=await db.habitReflection.create({data:{habitId:habit.id,eventId:event.id,
      note:"I started naturally",aiConsent:true,aiStatus:"COMPLETED",aiLevel:4,aiQuote:"started naturally"}});
    const unlinked=await db.habitReflection.create({data:{habitId:habit.id,note:"No date"}});
    const [web,mobile,foreign]=await Promise.all([issueSession(owner.id,"WEB"),
      issueSession(owner.id,"WECHAT"),issueSession(other.id,"WECHAT")]);
    function rate(reflectionId:string,initiationLevel:number,token:string,kind:"WEB"|"WECHAT",origin?:string){
      return addSelfRating(req(`/api/v1/habits/${habit.id}/reflections/${reflectionId}`,"POST",
        {initiationLevel},token,kind,origin),{params:Promise.resolve({id:habit.id,reflectionId})});
    }
    assert.equal((await rate(linked.id,2,foreign.token,"WECHAT")).status,404);
    assert.equal((await rate(linked.id,2,web.token,"WEB","https://foreign.test")).status,403);
    assert.equal((await rate(unlinked.id,2,mobile.token,"WECHAT")).status,409);
    const results=await Promise.all([rate(linked.id,2,web.token,"WEB"),rate(linked.id,2,mobile.token,"WECHAT")]);
    assert.deepEqual(results.map(response=>response.status),[200,200]);
    assert.equal((await rate(linked.id,3,web.token,"WEB")).status,409);
    const persisted=await db.habitReflection.findUniqueOrThrow({where:{id:linked.id}});
    assert.equal(persisted.initiationLevel,2);
    assert.equal(persisted.aiLevel,4);
    assert.equal(persisted.note,"I started naturally");
    const response=await habitProgressGET(req(`/api/v1/habits/${habit.id}/progress`,"GET",undefined,web.token),
      {params:Promise.resolve({id:habit.id})});
    assert.equal(response.status,200);
    const progress=await response.json();
    assert.equal(progress.evidenceCount,1);
    assert.equal(progress.lastRatingAt,when.toISOString());
    assert.equal(progress.evidenceStale,true);
    const due=await dueReviewsGET(req("/api/v1/habits/due","GET",undefined,web.token));
    assert.equal(due.status,200);
    assert.equal((await due.json()).due[0]?.habitId,habit.id);
  }finally{await db.user.deleteMany({where:{id:{in:[owner.id,other.id]}}});}
});

test("WeChat-supported PUT performs secure consent and review changes without PATCH",async()=>{
  const a=await db.user.create({data:{},select:{id:true}});
  const b=await db.user.create({data:{},select:{id:true}});
  try{
    const h=await db.habit.create({data:{userId:a.id,title:"mobile habit",action:"Do it"}});
    const hb=await db.habit.create({data:{userId:b.id,title:"foreign mobile habit",action:"Secret"}});
    const own=await db.habitReflection.create({data:{habitId:h.id,aiConsent:true,aiStatus:"PENDING",note:"my private note"}});
    const mobile=(await issueSession(a.id,"WECHAT")).token;
    const ctx=(id:string)=>({params:Promise.resolve({id})});
    const revCtx=(id:string,reflectionId:string)=>({params:Promise.resolve({id,reflectionId})});
    const userRevoke=await revokeAIPUT(req("/api/v1/habits/"+h.id+"/reflections/"+own.id,
      "PUT",undefined,mobile,"WECHAT"),revCtx(h.id,own.id));
    assert.equal(userRevoke.status,200);
    const stored=await db.habitReflection.findUniqueOrThrow({where:{id:own.id}});
    assert.equal(stored.aiConsent,false);
    const foreign=await revokeAIPUT(req("/api/v1/habits/"+hb.id+"/reflections/"+own.id,
      "PUT",undefined,mobile,"WECHAT"),revCtx(hb.id,own.id));
    assert.equal(foreign.status,404);
    assert.equal((await reviewPUT(req("/api/v1/habits/"+h.id+"/reviews","PUT",{enabled:false},mobile,"WECHAT"),ctx(h.id))).status,200);
    assert.equal((await reviewPUT(req("/api/v1/habits/"+hb.id+"/reviews","PUT",{enabled:false},mobile,"WECHAT"),ctx(hb.id))).status,404);
  }finally{await db.user.deleteMany({where:{id:{in:[a.id,b.id]}}});}
});

test("opportunity corrections preserve history, ownership, CSRF and aggregate accuracy",async()=>{
  const a=await db.user.create({data:{credential:{create:{
    email:"correction_"+randomUUID()+"@example.test",
    passwordHash:await hashPassword("strong-password-for-test-123"),verifiedAt:new Date()
  }}},select:{id:true}});
  const b=await db.user.create({data:{},select:{id:true}});
  try{
    const habit=await db.habit.create({data:{userId:a.id,title:"Fix record",action:"Start once"}});
    const foreign=await db.habit.create({data:{userId:b.id,title:"Private",action:"Stay private"}});
    const ownEvent=await db.habitEvent.create({data:{
      habitId:habit.id,opportunityKey:"daily:today",eligible:true,completed:true,
      source:"test",occurredAt:new Date()
    }});
    const foreignEvent=await db.habitEvent.create({data:{
      habitId:foreign.id,opportunityKey:"daily:today",eligible:true,completed:true,
      source:"test",occurredAt:new Date()
    }});
    const mobile=(await issueSession(a.id,"WECHAT")).token;
    const web=(await issueSession(a.id,"WEB")).token;
    const url="/api/v1/observations/"+ownEvent.id;
    const send=(body:unknown,token=mobile,kind:"WEB"|"WECHAT"="WECHAT",origin="http://localhost:3000")=>
      correctionPUT(req(url,"PUT",body,token,kind,origin),{params:Promise.resolve({id:ownEvent.id})});
    const payload={expectedRevision:0,eligible:false,completed:false};
    assert.equal((await send({...payload,completed:true})).status,400);
    assert.equal((await send(payload,web,"WEB","https://evil.example")).status,403);
    assert.equal((await correctionPUT(req("/api/v1/observations/"+foreignEvent.id,"PUT",payload,mobile,"WECHAT"),
      {params:Promise.resolve({id:foreignEvent.id})})).status,404);
    const corrected=await send(payload);
    assert.equal(corrected.status,200);
    assert.equal((await corrected.json() as {event:{revision:number}}).event.revision,1);
    assert.equal((await send(payload)).status,409);
    const read=await eventGET(req("/api/v1/observations?habitId="+habit.id,"GET",undefined,mobile,"WECHAT"));
    assert.equal(read.status,200);
    assert.equal((await read.json() as {events:{revision:number;eligible:boolean}[]}).events[0]?.revision,1);
    const history=await db.habitEventCorrection.findMany({where:{eventId:ownEvent.id}});
    assert.equal(history.length,1);
    assert.equal(history[0]!.previousCompleted,true);
    assert.equal(history[0]!.updatedEligible,false);
    const summary=await insightGET(req("/api/v1/habits/"+habit.id+"/insights","GET",undefined,mobile,"WECHAT"),
      {params:Promise.resolve({id:habit.id})});
    assert.equal((await summary.json() as {eligibleOpportunities:number;completions:number}).eligibleOpportunities,0);
    const noChange=await send({expectedRevision:1,eligible:false,completed:false});
    assert.equal(noChange.status,200);
    assert.equal((await noChange.json() as {unchanged:boolean}).unchanged,true);
    assert.equal(await db.habitEventCorrection.count({where:{eventId:ownEvent.id}}),1);

    const concurrent=await Promise.all([
      send({expectedRevision:1,eligible:true,completed:true}),
      send({expectedRevision:1,eligible:true,completed:false})
    ]);
    assert.deepEqual(concurrent.map(x=>x.status).sort(),[200,409]);
    assert.equal(await db.habitEventCorrection.count({where:{eventId:ownEvent.id}}),2);

    const attached=await db.habitEvent.create({data:{
      habitId:habit.id,opportunityKey:"daily:diary",eligible:true,completed:true,
      source:"test",occurredAt:new Date()
    }});
    await db.habitReflection.create({data:{habitId:habit.id,eventId:attached.id,note:"private",initiationLevel:3}});
    const blocked=await correctionPUT(req("/api/v1/observations/"+attached.id,"PUT",
      {expectedRevision:0,eligible:true,completed:false},mobile,"WECHAT"),
      {params:Promise.resolve({id:attached.id})});
    assert.equal(blocked.status,409);
    assert.equal(await db.habitEventCorrection.count({where:{eventId:attached.id}}),0);
  }finally{
    await db.user.deleteMany({where:{id:{in:[a.id,b.id]}}});
  }
});

test("owned correction history is paginated, exportable and isolated across accounts",async()=>{
  const a=await db.user.create({data:{},select:{id:true}});
  const b=await db.user.create({data:{},select:{id:true}});
  try{
    const ha=await db.habit.create({data:{userId:a.id,title:"Audit A",action:"A habit"}});
    const hb=await db.habit.create({data:{userId:b.id,title:"Audit B",action:"B habit"}});
    const ae=await db.habitEvent.create({data:{
      habitId:ha.id,opportunityKey:"daily:a",eligible:true,completed:true,
      occurredAt:new Date(),source:"web"
    }});
    const be=await db.habitEvent.create({data:{
      habitId:hb.id,opportunityKey:"daily:b",eligible:true,completed:true,
      occurredAt:new Date(),source:"wechat"
    }});
    await db.habitEventCorrection.createMany({data:Array.from({length:23},(_,i)=>({
      eventId:ae.id,revision:i+1,previousEligible:true,previousCompleted:i%2===0,
      updatedEligible:true,updatedCompleted:i%2!==0,source:"web"
    }))});
    await db.habitEvent.update({where:{id:ae.id},data:{revision:23,completed:false}});
    await db.habitEventCorrection.create({data:{
      eventId:be.id,revision:1,previousEligible:true,previousCompleted:true,
      updatedEligible:false,updatedCompleted:false,source:"wechat"
    }});
    const token=(await issueSession(a.id,"WECHAT")).token;
    const read=(id:string,offset:string="0")=>
      correctionGET(req("/api/v1/observations/"+id+"?offset="+offset,"GET",undefined,token,"WECHAT"),
        {params:Promise.resolve({id})});
    assert.equal((await read(be.id)).status,404);
    assert.equal((await read(ae.id,"-1")).status,400);
    assert.equal((await read(ae.id,"100001")).status,400);
    assert.equal((await correctionGET(req("/api/v1/observations/"+ae.id,"GET"),
      {params:Promise.resolve({id:ae.id})})).status,401);
    const first=await read(ae.id);
    assert.equal(first.status,200);
    assert.equal(first.headers.get("Cache-Control"),"private, no-store");
    const one=await first.json() as {event:{revision:number};corrections:{revision:number}[];nextOffset:number|null};
    assert.equal(one.event.revision,23);
    assert.equal(one.corrections.length,20);
    assert.deepEqual(one.corrections.map(x=>x.revision),Array.from({length:20},(_,i)=>23-i));
    assert.equal(one.nextOffset,20);
    const second=await read(ae.id,"20");
    const two=await second.json() as {corrections:{revision:number}[];nextOffset:number|null};
    assert.deepEqual(two.corrections.map(x=>x.revision),[3,2,1]);
    assert.equal(two.nextOffset,null);
    const exportResponse=await exportGET(req("/api/v1/account/export?kind=corrections&offset=0",
      "GET",undefined,token,"WECHAT"));
    assert.equal(exportResponse.status,200);
    const exported=await exportResponse.json() as {items:{eventId:string;revision:number}[];nextOffset:number|null};
    assert.equal(exported.items.length,23);
    assert.ok(exported.items.every(x=>x.eventId===ae.id));
    assert.equal(exported.nextOffset,null);
    const eventsExport=await exportGET(req("/api/v1/account/export?kind=events&offset=0",
      "GET",undefined,token,"WECHAT"));
    const eventsData=await eventsExport.json() as {items:{id:string;revision:number}[]};
    assert.deepEqual(eventsData.items.map(x=>[x.id,x.revision]),[[ae.id,23]]);
    await db.habit.update({where:{id:ha.id},data:{archivedAt:new Date()}});
    assert.equal((await read(ae.id)).status,200); // Archived data remains accessible.
    await db.user.delete({where:{id:a.id}});
    assert.equal(await db.habitEventCorrection.count({where:{eventId:ae.id}}),0);
    assert.equal(await db.habitEventCorrection.count({where:{eventId:be.id}}),1);
  }finally{
    await db.user.deleteMany({where:{id:{in:[a.id,b.id]}}});
  }
});

test("independent logic forms require elapsed retest time and expose only owned deferred evidence",async()=>{
  const a=await db.user.create({data:{},select:{id:true}});
  const b=await db.user.create({data:{},select:{id:true}});
  try{
    const token=(await issueSession(a.id,"WECHAT")).token;
    const other=(await issueSession(b.id,"WECHAT")).token;
    const formUrl="/api/v1/assessment-forms";
    const overview=async(t:string)=>formOverviewGET(req(formUrl,"GET",undefined,t,"WECHAT"));
    assert.equal((await formOverviewGET(req(formUrl,"GET"))).status,401);
    const initial=await overview(token);
    assert.equal(initial.status,200);
    assert.equal(initial.headers.get("Cache-Control"),"private, no-store");
    const first=await initial.json() as {forms:{code:string;status:string;attempted:number}[];comparison:unknown};
    assert.deepEqual(first.forms.map(x=>[x.code,x.status]),[
      ["logic-a-v1","ready"],["logic-b-v1","locked"]]);
    assert.equal(first.comparison,null);
    assert.equal((await measurementEvidenceGET(req("/api/v1/measurement-evidence","GET"))).status,401);
    const firstEvidence=await measurementEvidenceGET(req("/api/v1/measurement-evidence",
      "GET",undefined,token,"WECHAT"));
    assert.equal(firstEvidence.status,200);
    assert.equal(firstEvidence.headers.get("Cache-Control"),"private, no-store");
    const initialEvidence=await firstEvidence.json() as {
      evidenceGrade:string;ability:{theta:number|null;populationPercentile:number|null};
      change:{status:string};verifiedCompletedItems:number
    };
    assert.equal(initialEvidence.evidenceGrade,"E0");
    assert.equal(initialEvidence.ability.theta,null);
    assert.equal(initialEvidence.ability.populationPercentile,null);
    assert.equal(initialEvidence.change.status,"insufficient_evidence");
    assert.equal(initialEvidence.verifiedCompletedItems,0);
    const formTasks=async(form:string,t:string)=>tasksGET(req(
      "/api/v1/tasks?construct=reasoning.logic&form="+form,"GET",undefined,t,"WECHAT"));
    const aRaw=await formTasks("logic-a-v1",token);
    const textA=await aRaw.text();
    assert.equal(textA.includes("correctKey"),false);
    assert.equal(textA.includes("explanation"),false);
    const itemsA=(JSON.parse(textA) as {tasks:{id:string;skillCode:string;options:{key:string}[]}[]}).tasks;
    assert.equal(itemsA.length,6);
    assert.deepEqual([...new Set(itemsA.map(t=>t.skillCode))].sort(),
      ["conditional","evidence","quantitative"]);
    assert.equal((await formTasks("logic-b-v1",token)).status,200);
    assert.equal((await formTasks("unknown",token)).status,400);
    const locked=await formTasks("logic-b-v1",token);
    assert.deepEqual((await locked.json() as {tasks:unknown[]}).tasks,[]);
    const bItems=await db.task.findMany({where:{formCode:"logic-b-v1"},orderBy:{formOrder:"asc"}});
    assert.equal(bItems.length,6);
    const premature=await assessPOST(req("/api/v1/assessments","POST",
      {taskId:bItems[0]!.id,selectedKey:"A"},token,"WECHAT"));
    assert.equal(premature.status,409);
    for(const [i,item] of itemsA.entries()){
      const response=await assessPOST(req("/api/v1/assessments","POST",
        {taskId:item.id,selectedKey:item.options[0]!.key},token,"WECHAT"));
      assert.equal(response.status,201);
      const json=await response.json() as Record<string,unknown>;
      assert.equal(json.deferredFeedback,true);
      assert.equal("correct" in json,false);
      assert.equal("explanation" in json,false);
      if(i<5){
        const mid=await overview(token);
        const midData=await mid.json() as {forms:{reviews:unknown[]}[]};
        assert.deepEqual(midData.forms[0]!.reviews,[]);
        const interim=await (await measurementEvidenceGET(req(
          "/api/v1/measurement-evidence","GET",undefined,token,"WECHAT"))).json() as {
          observations:{itemsCorrect:number|null}[];ability:{theta:number|null}
        };
        assert.equal(interim.observations[0]!.itemsCorrect,null);
        assert.equal(interim.ability.theta,null);
        // Neither general score history nor personal export may reveal
        // correctness while the independent form is unfinished.
        const history=await assessGET(req("/api/v1/assessments","GET",undefined,token,"WECHAT"));
        const records=await history.json() as {attempts:{taskId:string;rawScore:number|null;scoreDeferred:boolean}[]};
        const scored=records.attempts.filter(x=>itemsA.some(t=>t.id===x.taskId));
        assert.equal(scored.length,i+1);
        assert.ok(scored.every(x=>x.scoreDeferred&&x.rawScore===null));
        const exported=await exportGET(req("/api/v1/account/export?kind=assessments&offset=0",
          "GET",undefined,token,"WECHAT"));
        assert.equal(exported.status,200);
        const ex=await exported.json() as {items:{taskId:string;rawScore:number|null;
          scoreDeferred:boolean;evidence:Record<string,unknown>}[]};
        const items=ex.items.filter(x=>itemsA.some(t=>t.id===x.taskId));
        assert.equal(items.length,i+1);
        assert.ok(items.every(x=>x.scoreDeferred&&x.rawScore===null &&
          !Object.hasOwn(x.evidence,"correct")&&!Object.hasOwn(x.evidence,"scorerVersion")));
      }
    }
    const completed=await overview(token);
    const completedBody=await completed.json() as {forms:{
      status:string;correct:number|null;reviews:{taskId:string;correctKey:string}[];
      dimensions:{total:number;correct:number|null}[];availableAt:string|null}[]};
    assert.equal(completedBody.forms[0]!.status,"completed");
    const firstCompletedEvidence=await (await measurementEvidenceGET(req(
      "/api/v1/measurement-evidence","GET",undefined,token,"WECHAT"))).json() as {
      evidenceGrade:string;verifiedCompletedItems:number;
      observations:{itemsCorrect:number|null}[];
      rawComparison:unknown;ability:{theta:number|null}
    };
    assert.equal(firstCompletedEvidence.evidenceGrade,"E0");
    assert.equal(firstCompletedEvidence.verifiedCompletedItems,6);
    assert.equal(firstCompletedEvidence.observations[1]!.itemsCorrect,null);
    assert.equal(firstCompletedEvidence.rawComparison,null);
    assert.equal(firstCompletedEvidence.ability.theta,null);
    const scoreHistory=await assessGET(req("/api/v1/assessments","GET",undefined,token,"WECHAT"));
    const historyItems=(await scoreHistory.json() as {attempts:{
      taskId:string;rawScore:number|null;scoreDeferred:boolean}[]}).attempts
      .filter(x=>itemsA.some(t=>t.id===x.taskId));
    assert.equal(historyItems.length,6);
    assert.ok(historyItems.every(x=>!x.scoreDeferred&&x.rawScore!==null));
    const fullExport=await exportGET(req("/api/v1/account/export?kind=assessments&offset=0",
      "GET",undefined,token,"WECHAT"));
    const exportedItems=(await fullExport.json() as {items:{
      taskId:string;rawScore:number|null;scoreDeferred:boolean;evidence:Record<string,unknown>}[]}).items
      .filter(x=>itemsA.some(t=>t.id===x.taskId));
    assert.equal(exportedItems.length,6);
    assert.ok(exportedItems.every(x=>!x.scoreDeferred&&typeof x.evidence.correct==="boolean"));
    assert.ok(exportedItems.every(x=>
      typeof x.evidence.taskContentSha256==="string"&&
      /^[0-9a-f]{64}$/.test(String(x.evidence.taskContentSha256))));
    // In-place content drift with an unchanged item version is simulated by
    // a single-user fingerprint mismatch. No shared seed/task is modified.
    const row=await db.assessmentAttempt.findFirstOrThrow({
      where:{userId:a.id,taskId:itemsA[0]!.id},select:{id:true,evidence:true}
    });
    const originalEvidence=row.evidence as {selectedKey:string;correct:boolean;
      scorerVersion:string;taskContentSha256:string};
    await db.assessmentAttempt.update({where:{id:row.id},data:{
      evidence:{...originalEvidence,taskContentSha256:"0".repeat(64)}
    }});
    const mismatched=await (await overview(token)).json() as {forms:{
      status:string;reviews:unknown[];integrityStatus:string}[]};
    assert.equal(mismatched.forms[0]!.status,"unavailable");
    assert.equal(mismatched.forms[0]!.integrityStatus,"mismatch");
    assert.deepEqual(mismatched.forms[0]!.reviews,[]);
    const rejectedMeasurement=await (await measurementEvidenceGET(req(
      "/api/v1/measurement-evidence","GET",undefined,token,"WECHAT"))).json() as {
      verifiedCompletedItems:number;blockedBy:string[];ability:{theta:number|null}
    };
    assert.equal(rejectedMeasurement.verifiedCompletedItems,0);
    assert.ok(rejectedMeasurement.blockedBy.includes("TASK_CONTENT_MISMATCH"));
    assert.equal(rejectedMeasurement.ability.theta,null);
    const masked=await (await assessGET(req("/api/v1/assessments","GET",
      undefined,token,"WECHAT"))).json() as {attempts:{
      taskId:string;rawScore:number|null;scoreDeferred:boolean}[]};
    assert.ok(masked.attempts.filter(x=>itemsA.some(t=>t.id===x.taskId))
      .every(x=>x.rawScore===null&&x.scoreDeferred));
    await db.assessmentAttempt.update({where:{id:row.id},
      data:{evidence:originalEvidence}});
    assert.equal((await (await overview(token)).json() as {
      forms:{status:string}[]}).forms[0]!.status,"completed");
    const otherHistory=await assessGET(req("/api/v1/assessments","GET",undefined,other,"WECHAT"));
    assert.deepEqual((await otherHistory.json() as {attempts:unknown[]}).attempts,[]);

    assert.equal(completedBody.forms[0]!.reviews.length,6);
    assert.equal(completedBody.forms[0]!.dimensions.length,3);
    assert.ok(completedBody.forms[0]!.dimensions.every(d=>d.total===2 && d.correct!==null));
    assert.equal(completedBody.forms[1]!.status,"locked");
    assert.ok(completedBody.forms[1]!.availableAt);
    const otherResult=await overview(other);
    const otherBody=await otherResult.json() as {forms:{reviews:unknown[];status:string}[]};
    assert.deepEqual(otherBody.forms[0]!.reviews,[]);
    assert.equal(otherBody.forms[0]!.status,"ready");
    assert.equal((await assessPOST(req("/api/v1/assessments","POST",
      {taskId:bItems[0]!.id,selectedKey:"A"},token,"WECHAT"))).status,409);
    const aTaskIds=itemsA.map(t=>t.id);
    await db.assessmentAttempt.updateMany({where:{userId:a.id,taskId:{in:aTaskIds}},
      data:{createdAt:new Date(Date.now()-8*86400000)}});
    const unlocked=await overview(token);
    const unlockedData=await unlocked.json() as {forms:{status:string}[]};
    assert.equal(unlockedData.forms[1]!.status,"ready");
    await db.practiceAttempt.create({data:{
      userId:a.id,itemId:"practice-cond-01",bankVersion:"reasoning-practice-1",
      selectedKey:"A",correct:true,dayKey:"2026-11-08",
      createdAt:new Date(Date.now()-4*86400000)
    }});
    await db.practiceAttempt.create({data:{
      userId:b.id,itemId:"practice-cond-01",bankVersion:"reasoning-practice-1",
      selectedKey:"A",correct:true,dayKey:"2026-11-08",
      createdAt:new Date(Date.now()-4*86400000)
    }});
    const bTasks=await formTasks("logic-b-v1",token);
    const bData=await bTasks.json() as {tasks:{id:string;options:{key:string}[]}[]};
    assert.equal(bData.tasks.length,6);
    assert.equal(new Set([...aTaskIds,...bData.tasks.map(t=>t.id)]).size,12);
    for(const item of bData.tasks){
      const r=await assessPOST(req("/api/v1/assessments","POST",
        {taskId:item.id,selectedKey:item.options[0]!.key},token,"WECHAT"));
      assert.equal(r.status,201);
    }
    const final=await overview(token);
    const summary=await final.json() as {
      forms:{status:string;correct:number;reviews:{taskId:string}[]}[];
      comparison:{rawDifferencePoints:number;daysApart:number;practiceAttemptsBetweenForms:number}};
    assert.equal(summary.forms[1]!.status,"completed");
    assert.equal(summary.forms[1]!.reviews.length,6);
    assert.ok(Number.isFinite(summary.comparison.rawDifferencePoints));
    assert.ok(summary.comparison.daysApart>=7);
    assert.equal(summary.comparison.practiceAttemptsBetweenForms,1); // Other user's practice excluded.
    const evidenceFinal=await measurementEvidenceGET(req(
      "/api/v1/measurement-evidence","GET",undefined,token,"WECHAT"));
    const textFinal=await evidenceFinal.text();
    assert.equal(textFinal.includes("correctKey"),false);
    assert.equal(textFinal.includes("explanation"),false);
    assert.equal(textFinal.includes("selectedKey"),false);
    const evidenceJson=JSON.parse(textFinal) as {
      verifiedCompletedItems:number;rawComparison:{rawDifferencePoints:number}|null;
      change:{status:string;mdc95:number|null;reliableChange:number|null};
      ability:{theta:number|null;populationPercentile:number|null}
    };
    assert.equal(evidenceJson.verifiedCompletedItems,12);
    assert.equal(evidenceJson.rawComparison!.rawDifferencePoints,summary.comparison.rawDifferencePoints);
    assert.equal(evidenceJson.change.status,"insufficient_evidence");
    assert.equal(evidenceJson.change.mdc95,null);
    assert.equal(evidenceJson.change.reliableChange,null);
    assert.equal(evidenceJson.ability.theta,null);
    assert.equal(evidenceJson.ability.populationPercentile,null);
    const otherEvidence=await (await measurementEvidenceGET(req(
      "/api/v1/measurement-evidence","GET",undefined,other,"WECHAT"))).json() as {
      verifiedCompletedItems:number;rawComparison:unknown;observations:{itemsCorrect:number|null}[]
    };
    assert.equal(otherEvidence.verifiedCompletedItems,0);
    assert.equal(otherEvidence.rawComparison,null);
    assert.ok(otherEvidence.observations.every(x=>x.itemsCorrect===null));
    assert.equal(await db.abilityEstimate.count({where:{userId:a.id}}),0);
  }finally{
    await db.user.deleteMany({where:{id:{in:[a.id,b.id]}}});
  }
});

test("training recommendations and attempts remain tenant-scoped, answer-safe and outside form scores",async()=>{
  const a=await db.user.create({data:{credential:{create:{
    email:"practice_"+randomUUID()+"@example.test",
    passwordHash:await hashPassword("practice-test-strong-password-123"),
    verifiedAt:new Date()
  }}},select:{id:true}});
  const b=await db.user.create({data:{},select:{id:true}});
  try{
    const aToken=(await issueSession(a.id,"WECHAT")).token;
    const bToken=(await issueSession(b.id,"WECHAT")).token;
    const web=(await issueSession(a.id,"WEB")).token;
    assert.equal((await practiceGET(req("/api/v1/practice","GET"))).status,401);
    assert.equal((await practiceGET(req("/api/v1/practice?skill=invalid","GET",undefined,aToken,"WECHAT"))).status,400);
    const initial=await practiceGET(req("/api/v1/practice","GET",undefined,aToken,"WECHAT"));
    assert.equal(initial.status,200);
    assert.equal(initial.headers.get("Cache-Control"),"private, no-store");
    const raw=await initial.text();
    assert.equal(raw.includes("answerKey"),false);
    assert.equal(raw.includes("explanation"),false);
    const payload=JSON.parse(raw) as {item:{id:string;options:{key:string}[]};recommendedSkill:string|null};
    assert.equal(payload.recommendedSkill,null);
    assert.ok(payload.item.id.startsWith("practice-cond-"));
    assert.equal((await practicePOST(req("/api/v1/practice","POST",
      {itemId:payload.item.id,selectedKey:"A"},web,"WEB","https://evil.example"))).status,403);
    assert.equal((await practicePOST(req("/api/v1/practice","POST",
      {itemId:payload.item.id,selectedKey:"X"},aToken,"WECHAT"))).status,400);
    assert.equal((await practicePOST(req("/api/v1/practice","POST",
      {itemId:"practice-cond-99",selectedKey:"A"},aToken,"WECHAT"))).status,404);
    assert.equal((await practicePOST(req("/api/v1/practice","POST",
      {itemId:payload.item.id,selectedKey:"A",userId:b.id},aToken,"WECHAT"))).status,400);
    const submitted=await practicePOST(req("/api/v1/practice","POST",
      {itemId:payload.item.id,selectedKey:"A",hintUsed:true},aToken,"WECHAT"));
    assert.equal(submitted.status,201);
    const result=await submitted.json() as {answerKey:string;explanation:string;correct:boolean;hintUsed:boolean|null};
    assert.ok(result.answerKey);
    assert.equal(result.hintUsed,true);
    assert.ok(result.explanation.length>10);
    assert.equal((await practicePOST(req("/api/v1/practice","POST",
      {itemId:payload.item.id,selectedKey:"A"},aToken,"WECHAT"))).status,409);
    const own=await practiceGET(req("/api/v1/practice","GET",undefined,aToken,"WECHAT"));
    const ownData=await own.json() as {skills:{recentlyAnswered:number;unassistedCorrect:number;assistedOrUnknown:number}[];item:{id:string}};
    assert.equal(ownData.skills[0]!.recentlyAnswered,1);
    assert.equal(ownData.skills[0]!.unassistedCorrect,0);
    assert.equal(ownData.skills[0]!.assistedOrUnknown,1);
    assert.notEqual(ownData.item.id,payload.item.id);
    const foreign=await practiceGET(req("/api/v1/practice","GET",undefined,bToken,"WECHAT"));
    const foreignData=await foreign.json() as {skills:{recentlyAnswered:number}[];item:{id:string}};
    assert.equal(foreignData.skills[0]!.recentlyAnswered,0);
    assert.equal(foreignData.item.id,payload.item.id);
    assert.equal(await db.assessmentAttempt.count({where:{userId:a.id}}),0);
    assert.equal(await db.abilityEstimate.count({where:{userId:a.id}}),0);
    assert.equal(await db.practiceAttempt.count({where:{userId:a.id}}),1);
    const exportResponse=await exportGET(req("/api/v1/account/export?kind=practice&offset=0",
      "GET",undefined,aToken,"WECHAT"));
    assert.equal(exportResponse.status,200);
    const ex=await exportResponse.json() as {items:{itemId:string;hintUsed:boolean|null}[]};
    assert.deepEqual(ex.items.map(x=>x.itemId),[payload.item.id]);
    assert.deepEqual(ex.items.map(x=>x.hintUsed),[true]);
    await db.user.delete({where:{id:a.id}});
    assert.equal(await db.practiceAttempt.count({where:{userId:a.id}}),0);
  }finally{await db.user.deleteMany({where:{id:{in:[a.id,b.id]}}});}
});

test("old private diary evidence survives expiry and is flagged stale, not erased from progress",async()=>{
  const a=await db.user.create({data:{},select:{id:true}});
  const b=await db.user.create({data:{},select:{id:true}});
  try{
    const h=await db.habit.create({data:{userId:a.id,title:"Historic rating",action:"Natural start"}});
    const other=await db.habit.create({data:{userId:b.id,title:"Other person's diary",action:"Private"}});
    const old=new Date(Date.now()-190*86400000);
    await db.habitEvent.create({data:{habitId:h.id,opportunityKey:"old:one",
      completed:true,eligible:true,occurredAt:old,source:"test"}});
    await db.habitReflection.create({data:{habitId:h.id,createdAt:old,initiationLevel:4,aiConsent:false}});
    await db.habitReflection.create({data:{habitId:other.id,createdAt:old,initiationLevel:0,aiConsent:false}});
    const token=(await issueSession(a.id,"WECHAT")).token;
    const get=(id:string)=>habitProgressGET(req("/api/v1/habits/"+id+"/progress",
      "GET",undefined,token,"WECHAT"),{params:Promise.resolve({id})});
    const first=await get(h.id);
    assert.equal(first.status,200);
    const progress=await first.json() as {progress:number;evidenceCount:number;evidenceStale:boolean;stage:string};
    assert.equal(progress.evidenceCount,1);
    assert.equal(progress.evidenceStale,true);
    assert.ok(progress.progress>50);
    const due=await dueReviewsGET(req("/api/v1/habits/due","GET",undefined,token,"WECHAT"));
    const summary=await due.json() as {due:{habitId:string}[]};
    assert.ok(summary.due.some(x=>x.habitId===h.id));
    assert.ok(!summary.due.some(x=>x.habitId===other.id));
    assert.equal((await get(other.id)).status,404);
    await db.habit.update({where:{id:h.id},data:{reviewEnabled:false}});
    const suppressed=await get(h.id);
    const after=await suppressed.json() as {progress:number;evidenceStale:boolean;reviewDue:boolean;stage:string};
    assert.equal(after.progress,progress.progress);
    assert.equal(after.evidenceStale,true);
    assert.equal(after.reviewDue,false);
    assert.equal(after.stage,"needs_fresh_evidence");
  }finally{await db.user.deleteMany({where:{id:{in:[a.id,b.id]}}});}
});

test("AI-only habit ratings never inflate growth or suppress due reviews",async()=>{
  const owner=await db.user.create({data:{},select:{id:true}});
  const foreign=await db.user.create({data:{},select:{id:true}});
  try{
    const habit=await db.habit.create({data:{userId:owner.id,title:"AI label exclusion",action:"Read"}});
    const other=await db.habit.create({data:{userId:foreign.id,title:"Private",action:"Read"}});
    await db.habitEvent.create({data:{habitId:habit.id,opportunityKey:"old",
      eligible:true,completed:true,occurredAt:new Date(Date.now()-50*86400000),source:"test"}});
    for(const [habitId,level] of [[habit.id,4],[other.id,0]] as const){
      await db.habitReflection.create({data:{habitId,createdAt:new Date(),
        note:"Started automatically",aiConsent:true,aiStatus:"COMPLETED",
        aiLevel:level,aiConfidence:1,aiQuote:"Started automatically",
        aiModelId:"test",aiPromptVersion:"v1"}});
    }
    const token=(await issueSession(owner.id,"WECHAT")).token;
    const response=await habitProgressGET(req("/api/v1/habits/"+habit.id+"/progress",
      "GET",undefined,token,"WECHAT"),{params:Promise.resolve({id:habit.id})});
    assert.equal(response.status,200);
    const result=await response.json() as {policyVersion:string;progress:number;
      automaticitySignal:number|null;aiAnnotationCount:number;evidenceCount:number;reviewDue:boolean};
    assert.equal(result.policyVersion,"habit-progress-v3");
    assert.equal(result.evidenceCount,0);
    assert.equal(result.aiAnnotationCount,1);
    assert.equal(result.automaticitySignal,null);
    assert.ok(result.progress<=45);
    assert.equal(result.reviewDue,true);
    const due=await dueReviewsGET(req("/api/v1/habits/due","GET",undefined,token,"WECHAT"));
    const body=await due.json() as {due:{habitId:string}[]};
    assert.ok(body.due.some(x=>x.habitId===habit.id));
    assert.ok(!body.due.some(x=>x.habitId===other.id));
  }finally{await db.user.deleteMany({where:{id:{in:[owner.id,foreign.id]}}});}
});

test("many newer unrated and AI diary rows cannot crowd out historical direct ratings",async()=>{
  const owner=await db.user.create({data:{},select:{id:true}});
  const neighbor=await db.user.create({data:{},select:{id:true}});
  try{
    const habit=await db.habit.create({data:{userId:owner.id,title:"History priority",action:"Read"}});
    const other=await db.habit.create({data:{userId:neighbor.id,title:"Other diary",action:"Read"}});
    const old=new Date(Date.now()-65*86400000);
    await db.habitEvent.create({data:{habitId:habit.id,opportunityKey:"old",eligible:true,
      completed:true,occurredAt:old,source:"test"}});
    await db.habitReflection.create({data:{habitId:habit.id,createdAt:old,
      initiationLevel:4,aiConsent:false}});
    await db.habitReflection.createMany({data:Array.from({length:105},(_,i)=>({
      habitId:habit.id,createdAt:new Date(Date.now()-i*120000),
      initiationLevel:null,aiConsent:true,aiStatus:"COMPLETED" as const,
      aiLevel:0,aiConfidence:1,aiModelId:"test",aiPromptVersion:"v1"
    }))});
    await db.habitReflection.create({data:{habitId:other.id,createdAt:new Date(),
      initiationLevel:0,aiConsent:false}});
    const token=(await issueSession(owner.id,"WECHAT")).token;
    const get=()=>habitProgressGET(req("/api/v1/habits/"+habit.id+"/progress","GET",
      undefined,token,"WECHAT"),{params:Promise.resolve({id:habit.id})});
    const response=await get();
    assert.equal(response.status,200);
    const result=await response.json() as {
      progress:number;evidenceCount:number;evidenceStale:boolean;aiAnnotationCount:number;
      aiAnnotationCountScope:string;lastRatingAt:string|null;reviewDue:boolean
    };
    assert.equal(result.evidenceCount,1);
    assert.equal(result.evidenceStale,true);
    assert.equal(result.aiAnnotationCount,105);
    assert.equal(result.aiAnnotationCountScope,"historical_unconfirmed_ai_only");
    assert.equal(result.lastRatingAt,old.toISOString());
    assert.ok(result.progress>40);
    assert.equal(result.reviewDue,true);
    const dueResponse=await dueReviewsGET(req("/api/v1/habits/due","GET",undefined,
      token,"WECHAT"));
    const dueData=await dueResponse.json() as {due:{habitId:string;progress:number}[]};
    const scheduled=dueData.due.find(x=>x.habitId===habit.id);
    assert.ok(scheduled);
    assert.equal(scheduled.progress,result.progress);
    assert.ok(!dueData.due.some(x=>x.habitId===other.id));
  }finally{
    await db.user.deleteMany({where:{id:{in:[owner.id,neighbor.id]}}});
  }
});

test("unreviewed research draft forms cannot be accessed even if accidentally marked published",async()=>{
  const user=await db.user.create({data:{},select:{id:true}});
  const candidateId=randomUUID();
  const formCode="research-logic-a-v2";
  const content={kind:"single_choice_v1",prompt:"Unpublished research candidate that must not reach public clients",
    options:[{key:"A",label:"Choice alpha"},{key:"B",label:"Choice beta"},
      {key:"C",label:"Choice gamma"},{key:"D",label:"Choice delta"}],
    correctKey:"A",explanation:"Research-only scorer key; never sent to clients."};
  try{
    const task=await db.task.create({data:{
      id:candidateId,constructCode:"reasoning.logic",version:"research-draft-2",
      formCode,formOrder:1,skillCode:"conditional",content,
      // This deliberate mistaken public date tests the defense in depth.
      publishedAt:new Date(Date.now()-3600000)
    }});
    assert.equal(task.id,candidateId);
    const token=(await issueSession(user.id,"WECHAT")).token;
    const list=await tasksGET(req(
      "/api/v1/tasks?construct=reasoning.logic&form="+formCode,
      "GET",undefined,token,"WECHAT"));
    assert.equal(list.status,400,"private form name must not become a public selection");
    const unscoped=await tasksGET(req("/api/v1/tasks?construct=reasoning.logic",
      "GET",undefined,token,"WECHAT"));
    assert.equal(unscoped.status,200);
    const exposed=await unscoped.text();
    assert.equal(exposed.includes(candidateId),false);
    assert.equal(exposed.includes(content.prompt),false);
    assert.equal(exposed.includes(content.explanation),false);
    const post=await assessPOST(req("/api/v1/assessments","POST",
      {taskId:candidateId,selectedKey:"A"},token,"WECHAT"));
    assert.equal(post.status,503,"unknown form must fail closed at submission");
    assert.equal(await db.assessmentAttempt.count({where:{userId:user.id,taskId:candidateId}}),0);
    const overview=await formOverviewGET(req(
      "/api/v1/assessment-forms","GET",undefined,token,"WECHAT"));
    assert.equal(overview.status,200);
    const body=await overview.text();
    assert.equal(body.includes(formCode),false);
    assert.equal(body.includes(candidateId),false);
    assert.equal(body.includes(content.prompt),false);
  }finally{
    await db.task.deleteMany({where:{id:candidateId}});
    await db.user.deleteMany({where:{id:user.id}});
  }
});

test("accidentally published unformed research item is never listed or scored",async()=>{
  const user=await db.user.create({data:{},select:{id:true}});
  const privateTaskId=randomUUID();
  const content={kind:"single_choice_v1",prompt:"Research draft without a form code must never reach public assessment routes.",
    options:[{key:"A",label:"Option alpha"},{key:"B",label:"Option beta"},
      {key:"C",label:"Option gamma"},{key:"D",label:"Option delta"}],
    correctKey:"B",explanation:"Private provisional answer is not approved for release."};
  try{
    await db.task.create({data:{
      id:privateTaskId,constructCode:"reasoning.logic",version:"research-draft-2",
      formCode:null,content,publishedAt:new Date(Date.now()-3600000)
    }});
    const token=(await issueSession(user.id,"WECHAT")).token;
    const list=await tasksGET(req("/api/v1/tasks?construct=reasoning.logic",
      "GET",undefined,token,"WECHAT"));
    assert.equal(list.status,200);
    const response=await list.text();
    assert.equal(response.includes(privateTaskId),false);
    assert.equal(response.includes(content.prompt),false);
    assert.equal(response.includes(content.explanation),false);
    const post=await assessPOST(req("/api/v1/assessments","POST",
      {taskId:privateTaskId,selectedKey:"B"},token,"WECHAT"));
    assert.equal(post.status,404);
    assert.equal(await db.assessmentAttempt.count({
      where:{userId:user.id,taskId:privateTaskId}}),0);
    // A fresh user's already-published demo tasks remain usable.
    const demos=JSON.parse(response) as {tasks:{id:string}[]};
    assert.ok(demos.tasks.length>0);
    assert.ok(demos.tasks.every(x=>x.id!==privateTaskId));
  }finally{
    await db.task.deleteMany({where:{id:privateTaskId}});
    await db.user.deleteMany({where:{id:user.id}});
  }
});


test("rate limiter returns a bounded Retry-After without revealing bucket identities",async()=>{
  const kind="test-retry-after",subject=randomUUID();
  await enforceRateLimit(kind,subject,1,15*60*1000);
  let error:unknown;
  try{await enforceRateLimit(kind,subject,1,15*60*1000);}catch(e){error=e;}
  assert.ok(error instanceof ApiError);
  const response=errorResponse(error);
  assert.equal(response.status,429);
  assert.equal((await response.json() as {error:{code:string}}).error.code,"RATE_LIMITED");
  const retry=Number(response.headers.get("Retry-After"));
  assert.ok(Number.isInteger(retry)&&retry>=1&&retry<=900);
  assert.equal(response.headers.get("Cache-Control"),"no-store");
});

test("web and chat share a visible 50-active-habit quota",async()=>{
  const user=await db.user.create({data:{},select:{id:true}});
  try{
    const token=(await issueSession(user.id,"WECHAT")).token;
    await db.habit.createMany({data:Array.from({length:50},(_,i)=>({
      userId:user.id,title:"Habit "+i,action:"Visible habit action "+i
    }))});
    const listed=await habitsGET(req("/api/v1/habits","GET",undefined,token,"WECHAT"));
    assert.equal(listed.status,200);
    assert.equal((await listed.json() as {habits:unknown[]}).habits.length,50);
    const rejected=await habitsPOST(req("/api/v1/habits","POST",{
      title:"Hidden 51st habit",action:"Should never be saved"
    },token,"WECHAT"));
    assert.equal(rejected.status,409);
    assert.equal((await rejected.json() as {error:{code:string}}).error.code,"HABIT_QUOTA_EXCEEDED");
    assert.equal(await db.habit.count({where:{userId:user.id,archivedAt:null}}),50);
  }finally{await db.user.delete({where:{id:user.id}});}
});
