import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {NextRequest} from "next/server";
import {getDb} from "../src/server/db";
import {issueSession} from "../src/server/security";
import {groundedWorkEvidence} from "../src/server/work-evidence";
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
  for(const rejected of ["我想做个测试",`如果${message}`,`这是测试。${message}`,
    `示例：“${actionQuote}”。${outcomeQuote}`,`别记录这段话。${message}`]){
    assert.deepEqual(groundedWorkEvidence([candidate],rejected,"owner"),[],rejected);
  }
  const supported=groundedWorkEvidence([candidate,candidate],message,"owner");
  assert.equal(supported.length,1);
  assert.notEqual(supported[0]?.digest,groundedWorkEvidence([candidate],message,"other")[0]?.digest);
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
      {domain:"thinking",label:"问题拆解与推理",reportedDays:1,outcomeDays:1});
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
