import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {test} from "node:test";
import {NextRequest} from "next/server";
import {GET as getPractices,POST as createPractice} from "../src/app/api/v1/growth-practices/route";
import {DELETE as deletePractice,PUT as updatePractice} from "../src/app/api/v1/growth-practices/[id]/route";
import {POST as requestFeedback} from "../src/app/api/v1/growth-practices/feedback/route";
import {GET as exportData} from "../src/app/api/v1/account/export/route";
import {getDb} from "../src/server/db";
import {issueSession,SESSION_COOKIE} from "../src/server/security";

const base="/api/v1/growth-practices";
const plan={
  dimension:"thinking",title:"找出练习失误的原因",
  question:"我是在理解定义时出错，还是在使用条件时出错？",
  nextAction:"先从例题中找两个条件不同的情况。",
  successCriteria:"我能说明这两个条件怎样改变解法。"
};

function request(path:string,method:string,token?:string,body?:unknown,origin="http://localhost:3000"){
  const headers=new Headers({origin});
  if(token)headers.set("cookie",SESSION_COOKIE+"="+token);
  if(body!==undefined)headers.set("content-type","application/json");
  return new NextRequest("http://localhost:3000"+path,{
    method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})
  });
}

function verifiedUser(){
  return getDb().user.create({data:{credential:{create:{
    email:"growth_"+randomUUID()+"@example.test",passwordHash:"test-only",verifiedAt:new Date()
  }}}});
}

test("growth practice isolates accounts, deduplicates creation, reviews with evidence, and exports",async()=>{
  const db=getDb();
  const [owner,other]=await Promise.all([verifiedUser(),verifiedUser()]);
  try{
    const [a,b]=await Promise.all([issueSession(owner.id,"WEB"),issueSession(other.id,"WEB")]);
    const input={...plan,requestId:randomUUID()};
    assert.equal((await getPractices(request(base,"GET"))).status,401);
    assert.equal((await createPractice(request(base,"POST",a.token,input,"https://other.example"))).status,403);
    const responses=await Promise.all([
      createPractice(request(base,"POST",a.token,input)),
      createPractice(request(base,"POST",a.token,input))
    ]);
    assert.deepEqual(responses.map(response=>response.status).sort(),[200,201]);
    const first=await responses[0]!.json();
    const replay=await responses[1]!.json();
    assert.equal(first.practice.id,replay.practice.id);
    assert.equal((await createPractice(request(base,"POST",a.token,{...input,title:"改写问题"}))).status,409);
    const id:string=first.practice.id;
    const path=base+"/"+id;
    const context={params:Promise.resolve({id})};
    const foreign=await getPractices(request(base,"GET",b.token));
    assert.deepEqual(await foreign.json(),{practices:[],nextOffset:null});
    const patch={...plan,revision:0,complete:true,evidence:"  ",reflection:"我改变了判断。",nextQuestion:"怎样验证迁移？"};
    assert.equal((await updatePractice(request(path,"PUT",a.token,patch),context)).status,400);
    const actual={...patch,evidence:"两道题共用同一个定义，差别在连续性条件。"};
    assert.equal((await updatePractice(request(path,"PUT",b.token,actual),context)).status,404);
    assert.equal((await deletePractice(request(path,"DELETE",b.token),context)).status,404);
    const updated=await updatePractice(request(path,"PUT",a.token,actual),context);
    assert.equal(updated.status,200);
    const {practice}=await updated.json();
    assert.equal(practice.revision,1);
    assert.equal(practice.evidence,actual.evidence);
    assert.equal(practice.nextQuestion,actual.nextQuestion);
    assert.ok(practice.completedAt);
    assert.equal((await updatePractice(request(path,"PUT",a.token,actual),context)).status,409);
    const exported=await exportData(request("/api/v1/account/export?kind=growth_practices","GET",a.token));
    assert.equal(exported.status,200);
    assert.deepEqual((await exported.json()).items.map((item:{id:string})=>item.id),[id]);
    assert.equal((await deletePractice(request(path,"DELETE",a.token),context)).status,200);
    assert.equal(await db.growthPractice.count({where:{userId:owner.id}}),0);
  }finally{
    await db.user.deleteMany({where:{id:{in:[owner.id,other.id]}}});
  }
});

test("growth AI drafts plans and reviews without storing drafts or sharing unrelated fields",async()=>{
  const db=getDb();
  const user=await verifiedUser();
  const oldFetch=globalThis.fetch;
  const configuration={
    DEEPSEEK_API_KEY:"test-only",AI_ASSISTANT_PROVIDER:"deepseek",
    AI_ASSISTANT_API_KEY:"fallback-only",AI_ASSISTANT_MODEL:"deepseek-v4-pro"
  };
  const saved=Object.keys(configuration).map(key=>[key,process.env[key]] as const);
  try{
    Object.assign(process.env,configuration);
    const {token}=await issueSession(user.id,"WEB");
    let calls=0;
    const {title,dimension,question,nextAction,successCriteria}=plan;
    const reviewInput={question,nextAction,successCriteria,evidence:"两道题使用了同一个定义。"};
    const planDraft={title,dimension,nextAction,successCriteria};
    const reviewDraft={reflection:"这次观察支持先识别共同定义。",nextQuestion:"新题能否沿用同一定义？"};
    const expectedCalls=[{input:{question},draft:planDraft,key:"test-only"},{input:reviewInput,draft:reviewDraft,key:"fallback-only"},
      {input:{question},draft:{...planDraft,completed:true},key:"fallback-only"}];
    globalThis.fetch=async(url,init)=>{
      const expected=expectedCalls[calls++]!;
      assert.equal(url,"https://api.deepseek.com/chat/completions");
      assert.equal(init?.redirect,"error");
      assert.equal(new Headers(init?.headers).get("authorization"),"Bearer "+expected.key);
      const payload=JSON.parse(String(init?.body));
      assert.equal(payload.model,"deepseek-flash");
      assert.deepEqual(payload.thinking,{type:"disabled"});
      assert.deepEqual(JSON.parse(payload.messages[1].content),expected.input);
      return Response.json({choices:[{message:{content:JSON.stringify(expected.draft)}}]});
    };
    const generate=(body:unknown)=>requestFeedback(request(base+"/feedback","POST",token,body));
    assert.equal((await generate({mode:"plan",question})).status,400);
    assert.equal((await generate({mode:"plan",question,consentToAI:true,title})).status,400);
    assert.equal((await generate({mode:"review",...reviewInput,evidence:" ",consentToAI:true})).status,400);
    assert.equal(calls,0);
    const draftedPlan=await generate({mode:"plan",question,consentToAI:true});
    assert.equal(draftedPlan.status,200);
    assert.deepEqual(await draftedPlan.json(),{draft:planDraft});
    delete process.env.DEEPSEEK_API_KEY;
    const draftedReview=await generate({mode:"review",...reviewInput,consentToAI:true});
    assert.equal(draftedReview.status,200);
    assert.deepEqual(await draftedReview.json(),{draft:reviewDraft});
    assert.equal((await generate({mode:"plan",question,consentToAI:true})).status,502);
    assert.equal(calls,3);
    assert.equal(await db.growthPractice.count({where:{userId:user.id}}),0);
  }finally{
    globalThis.fetch=oldFetch;
    for(const [key,value] of saved){
      if(value===undefined)delete process.env[key];
      else process.env[key]=value;
    }
    await db.user.delete({where:{id:user.id}});
  }
});
