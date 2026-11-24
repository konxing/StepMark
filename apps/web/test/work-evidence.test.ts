import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {NextRequest} from "next/server";
import {getDb} from "../src/server/db";
import {issueSession} from "../src/server/security";
import {groundedWorkEvidence,WORK_EVIDENCE_RUBRIC,workDomains} from "../src/server/work-evidence";
import {executeAssistantCommand} from "../src/server/assistant-execute";
import {authorizeAssistantCommand} from "../src/server/assistant-command";
import {POST as chat} from "../src/app/api/v1/assistant/route";
import {GET as list,DELETE as remove} from "../src/app/api/v1/assistant/evidence/route";
import {GET as exportData} from "../src/app/api/v1/account/export/route";

const actionQuote="我比较了两种不同的工作流程";
const outcomeQuote="结果发现第二种流程少返工一次";
const candidate={domain:"thinking",actionQuote,outcomeQuote};

test("work candidates require a first-person completed action and exact quoted outcome",()=>{
  const message=`${actionQuote}。${outcomeQuote}。`;
  assert.equal(groundedWorkEvidence([candidate],message,"owner")[0]?.stage,2);
  assert.equal(groundedWorkEvidence([candidate],actionQuote,"owner")[0]?.stage,1);
  assert.equal(groundedWorkEvidence([candidate],`${actionQuote}。希望${outcomeQuote}。`,"owner")[0]?.stage,1);
  for(const rejected of ["我想做个测试",`如果${message}`,`假设${message}`,`这是测试。${message}`,
    `示例：“${actionQuote}”。${outcomeQuote}`,`别记录这段话。${message}`]){
    assert.deepEqual(groundedWorkEvidence([candidate],rejected,"owner"),[],rejected);
  }
  const supported=groundedWorkEvidence([candidate,candidate],message,"owner");
  assert.equal(supported.length,1);
  assert.notEqual(supported[0]?.digest,groundedWorkEvidence([candidate],message,"other")[0]?.digest);
});

test("results must directly follow their action and describe observed events",()=>{
  const stage=(message:string)=>groundedWorkEvidence([candidate],message,"owner")[0]?.stage;
  assert.equal(stage(`${actionQuote}，${outcomeQuote}。`),2);
  for(const message of [
    `${outcomeQuote}。${actionQuote}。`,
    `${actionQuote}。我测试了另一台设备。${outcomeQuote}。`,
    `${actionQuote}。“${outcomeQuote}”。`,
    `${actionQuote}。${outcomeQuote}？`
  ])assert.equal(stage(message),1,message);
  const anticipated="结果预计可以减少一次返工";
  assert.equal(groundedWorkEvidence([{...candidate,outcomeQuote:anticipated}],
    `${actionQuote}。${anticipated}。`,"owner")[0]?.stage,1);
  assert.deepEqual(groundedWorkEvidence([candidate],`${actionQuote}？`,"owner"),[]);
  assert.deepEqual(groundedWorkEvidence([candidate],`${actionQuote}。${actionQuote}。`,"owner"),[]);
  assert.deepEqual(groundedWorkEvidence([candidate],
    `转述原文：“接下来说说项目的情况。${actionQuote}。${outcomeQuote}。”`,"owner"),[]);
  assert.equal(groundedWorkEvidence([candidate,{...candidate,domain:"creation"}],
    `${actionQuote}。${outcomeQuote}。`,"owner").length,1);
});

test("AI-assisted work needs a concrete contribution by the person",()=>{
  const delegated="我请AI写了整份系统设计文档";
  assert.deepEqual(groundedWorkEvidence([{domain:"creation",actionQuote:delegated,outcomeQuote:null}],
    delegated,"owner"),[]);
  const checked="我检查了AI方案里的三条假设";
  const result="结果发现第三条假设不符合实测数据";
  const evidence=groundedWorkEvidence([{domain:"thinking",actionQuote:checked,outcomeQuote:result}],
    `${delegated}。${checked}。${result}。`,"owner");
  assert.equal(evidence[0]?.stage,2);
  assert.equal(evidence[0]?.actionQuote,checked);
});

test("consented chat writes bounded evidence, incorporates later results and isolates accounts",async()=>{
  const db=getDb();
  const owner=await db.user.create({data:{},select:{id:true}});
  const other=await db.user.create({data:{},select:{id:true}});
  const oldFetch=globalThis.fetch;
  const vars={AI_ASSISTANT_PROVIDER:"deepseek",AI_ASSISTANT_API_KEY:"fixture-only",AI_ASSISTANT_MODEL:"deepseek-flash"};
  const previous=Object.keys(vars).map(name=>[name,process.env[name]] as const);
  let calls=0;
  const now=new Date();
  const localDate=now.toISOString().slice(0,10);
  const [a,b]=await Promise.all([issueSession(owner.id,"WECHAT"),issueSession(other.id,"WECHAT")]);
  function request(path:string,token=a.token,method="GET",body?:object){
    return new NextRequest("http://localhost:3000"+path,{method,
      headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},
      ...(body?{body:JSON.stringify(body)}:{})});
  }
  function send(message:string,recordGrowthEvidence:boolean,requestId=randomUUID()){
    return chat(request("/api/v1/assistant",a.token,"POST",{message,requestId,localDate,consentToAI:true,recordGrowthEvidence}));
  }
  try{
    Object.assign(process.env,vars);
    globalThis.fetch=async()=>{
      calls++;
      return Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify({
        intent:"chat",habitId:null,title:null,action:null,cue:null,status:null,when:null,initiationLevel:null,
        confidence:0,quote:null,reply:actionQuote,growthEvidence:[candidate]
      })}}]});
    };
    const initial=await send(actionQuote,false);
    assert.equal(initial.status,200);
    assert.equal(await db.workEvidence.count({where:{userId:owner.id}}),0);
    const firstId=randomUUID();
    const first=await send(actionQuote,true,firstId);
    assert.equal(first.status,200);
    assert.equal((await first.json()).workEvidenceAdded,1);
    assert.equal((await send(actionQuote,true,firstId)).status,200);
    assert.equal(calls,2);
    const receipt=await db.assistantAction.findUniqueOrThrow({where:{userId_requestId:{userId:owner.id,requestId:firstId}}});
    assert(!JSON.stringify(receipt.result).includes(actionQuote));
    const enhanced=await send(`${actionQuote}。${outcomeQuote}。`,true);
    assert.equal(enhanced.status,200);
    assert.equal((await enhanced.json()).workEvidenceAdded,1);
    const item=await db.workEvidence.findFirstOrThrow({where:{userId:owner.id}});
    assert.equal(item.stage,2);
    assert.equal(item.outcomeQuote,outcomeQuote);
    assert.equal(await db.workEvidence.count({where:{userId:owner.id}}),1);
    const base="/api/v1/assistant/evidence";
    const page=await list(request(base));
    assert.equal(page.status,200);
    const {items,summary}=await page.json();
    assert.equal(items.length,1);
    assert.equal(items[0].digest,undefined);
    assert.deepEqual(summary.find((row:{domain:string})=>row.domain==="thinking"),
      {domain:"thinking",label:workDomains.thinking,reportedDays:1,outcomeDays:1});
    assert.deepEqual((await (await list(request(base,b.token))).json()).items,[]);
    const exported=await exportData(request("/api/v1/account/export?kind=work_evidence"));
    assert.equal(exported.status,200);
    assert.equal((await exported.json()).items[0].id,item.id);
    assert.equal((await remove(request(`${base}?id=${item.id}`,b.token,"DELETE"))).status,404);
    assert.equal((await remove(request(`${base}?id=${item.id}`,a.token,"DELETE"))).status,200);
  }finally{
    globalThis.fetch=oldFetch;
    for(const [name,value] of previous){if(value===undefined)delete process.env[name];else process.env[name]=value;}
    await db.user.deleteMany({where:{id:{in:[owner.id,other.id]}}});
  }
});

test("concurrent requests and later domain changes cannot duplicate an action",async()=>{
  const db=getDb();
  const owner=await db.user.create({data:{},select:{id:true}});
  const message=`${actionQuote}。${outcomeQuote}。`;
  const command=authorizeAssistantCommand({
    intent:"chat",habitId:null,title:null,action:null,cue:null,status:null,when:null,
    initiationLevel:null,confidence:0,quote:null,reply:"已理解这次行动。"
  },message,[]);
  const localDate=new Date().toISOString().slice(0,10);
  const write=(domain:string,requestId=randomUUID())=>executeAssistantCommand({
    userId:owner.id,requestId,localDate,message,command,model:"fixture-only",
    workEvidence:groundedWorkEvidence([{...candidate,domain}],message,owner.id)
  });
  try{
    const replies=await Promise.all([write("thinking"),write("creation")]);
    assert.equal(replies.reduce((sum,reply)=>sum+(reply.workEvidenceAdded??0),0),1);
    assert.equal(await db.workEvidence.count({where:{userId:owner.id}}),1);
    const original=await db.workEvidence.findFirstOrThrow({where:{userId:owner.id}});
    assert.equal((await write("learning")).workEvidenceAdded,0);
    assert.equal((await db.workEvidence.findUniqueOrThrow({where:{id:original.id}})).domain,original.domain);
    // Revalidating an older result updates it without changing the original report.
    await db.workEvidence.update({where:{id:original.id},data:{rubric:"reported-action-v1"}});
    assert.equal((await write("learning")).workEvidenceAdded,1);
    const reviewed=await db.workEvidence.findUniqueOrThrow({where:{id:original.id}});
    assert.equal(reviewed.rubric,WORK_EVIDENCE_RUBRIC);
    assert.equal(reviewed.reportDay,original.reportDay);
    assert.equal(reviewed.domain,original.domain);
    const requestId=randomUUID();
    await db.workEvidence.deleteMany({where:{userId:owner.id}});
    const retried=await Promise.all([write("thinking",requestId),write("thinking",requestId)]);
    assert.equal(retried.length,2);
    assert.equal(await db.workEvidence.count({where:{userId:owner.id}}),1);
    assert.equal(await db.assistantAction.count({where:{userId:owner.id,requestId}}),1);
  }finally{await db.user.delete({where:{id:owner.id}});}
});

test("summary uses 30 report dates and flags unmatched historical outcomes",async()=>{
  const db=getDb();
  const owner=await db.user.create({data:{},select:{id:true}});
  const session=await issueSession(owner.id,"WECHAT");
  const today=new Date().toISOString().slice(0,10);
  function day(offset:number){
    const date=new Date(today+"T12:00:00Z");
    date.setUTCDate(date.getUTCDate()+offset);
    return date.toISOString().slice(0,10);
  }
  function request(localDate=today){
    return new NextRequest("http://localhost:3000/api/v1/assistant/evidence?localDate="+localDate,
      {headers:{authorization:"Bearer "+session.token}});
  }
  try{
    const common={userId:owner.id,actionQuote,outcomeQuote,stage:2,modelId:"fixture-only",rubric:WORK_EVIDENCE_RUBRIC};
    await db.workEvidence.createMany({data:[
      {...common,domain:"thinking",digest:"a".repeat(64),reportDay:day(-29),createdAt:new Date(Date.now()-2000)},
      {...common,domain:"creation",digest:"a".repeat(64),reportDay:day(-29)},
      {...common,domain:"thinking",digest:"b".repeat(64),reportDay:day(-30),createdAt:new Date(Date.now()-3000)},
      {...common,domain:"creation",digest:"b".repeat(64),reportDay:today},
      {...common,domain:"thinking",digest:"c".repeat(64),reportDay:day(1)},
      {...common,domain:"thinking",digest:"d".repeat(64),reportDay:today,rubric:"reported-action-v1"}
    ]});
    const response=await list(request());
    assert.equal(response.status,200);
    const page=await response.json();
    assert.deepEqual(page.summary.find((row:{domain:string})=>row.domain==="thinking"),
      {domain:"thinking",label:workDomains.thinking,reportedDays:2,outcomeDays:1});
    assert.equal(page.summary.find((row:{domain:string})=>row.domain==="creation").reportedDays,0);
    assert.equal(page.items.find((item:{rubric:string})=>item.rubric==="reported-action-v1").outcomeNeedsReview,true);
    assert(page.items.filter((item:{rubric:string})=>item.rubric===WORK_EVIDENCE_RUBRIC)
      .every((item:{outcomeNeedsReview:boolean})=>item.outcomeNeedsReview===false));
    assert.equal((await list(request("2026-02-30"))).status,400);
    assert.equal((await list(request(day(-100)))).status,400);
  }finally{await db.user.delete({where:{id:owner.id}});}
});
