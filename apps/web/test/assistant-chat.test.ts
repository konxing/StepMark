import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {authorizeAssistantCommand,verifiedInitiationEvidence,
  observationDay,validateClientLocalDate} from "../src/server/assistant-command";
import {executeAssistantCommand} from "../src/server/assistant-execute";
import {getDb} from "../src/server/db";
import {POST as assistantPOST} from "../src/app/api/v1/assistant/route";
import {GET as exportGET} from "../src/app/api/v1/account/export/route";
import {issueSession,SESSION_COOKIE} from "../src/server/security";
import {NextRequest} from "next/server";
const db=getDb();
const localDate=()=>{
  const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
};
const template=(intent:string,override:Record<string,unknown>={})=>({
  intent,habitId:null,title:null,action:null,cue:null,status:null,when:null,
  initiationLevel:null,confidence:.94,quote:null,reply:"可以。",...override
});
test("AI output is a proposal, not arbitrary database authorization",()=>{
  const own={id:randomUUID(),title:"睡前阅读"};
  const foreign={id:randomUUID(),title:"别人的习惯"};
  assert.equal(authorizeAssistantCommand(
    template("record_opportunity",{habitId:foreign.id,status:"done",when:"today"}),
    "今天完成了别人的习惯",[own]).intent,"clarify");
  assert.equal(authorizeAssistantCommand(
    template("record_opportunity",{habitId:own.id,status:"done",when:"today"}),
    "今天睡前阅读做了吗？",[own]).intent,"clarify");
  assert.equal(authorizeAssistantCommand(
    template("record_opportunity",{habitId:own.id,status:"done",when:"today"}),
    "昨天完成了睡前阅读",[own]).intent,"clarify");
  assert.equal(authorizeAssistantCommand(
    template("record_opportunity",{habitId:own.id,status:"done",when:null}),
    "昨天完成了睡前阅读",[own]).intent,"clarify");
  assert.equal(authorizeAssistantCommand(
    template("record_opportunity",{habitId:own.id,status:"done",when:"yesterday"}),
    "昨天完成了睡前阅读",[own]).intent,"record_opportunity");
  assert.equal(authorizeAssistantCommand(
    template("record_opportunity",{habitId:own.id,status:"done",when:"today"}),
    "今天没做睡前阅读",[own]).intent,"clarify");
  assert.equal(authorizeAssistantCommand(
    template("record_opportunity",{habitId:own.id,status:"no_cue",when:"today"}),
    "今天没有触发睡前阅读机会",[own]).intent,"record_opportunity");
  assert.equal(authorizeAssistantCommand(
    template("update_ability",{habitId:own.id}),"给我加能力分",[own]).intent,"clarify");
  assert.equal(authorizeAssistantCommand(
    template("create_habit",{title:"高效阅读",action:"睡前阅读10页"}),
    "帮我添加一个睡前阅读10页的习惯",[own]).intent,"create_habit");
  assert.equal(authorizeAssistantCommand(
    template("create_habit",{title:"高效阅读",action:"睡前阅读10页"}),
    "你觉得我是否应该添加一个习惯？",[own]).intent,"clarify");
  assert.equal(authorizeAssistantCommand(
    template("create_habit",{title:"每天阅读",action:"睡前阅读10页"}),
    "帮我添加一个每天阅读的习惯",[own]).intent,"clarify");
});
test("chat cannot misrecord hypothetical, future or third-party achievements",()=>{
  const habit={id:randomUUID(),title:"睡前阅读"};
  const plans=[
    ["假设昨天完成了睡前阅读","yesterday"],
    ["明天打算完成睡前阅读","today"],
    ["我的朋友今天完成了睡前阅读","today"],
    ["今天完成了睡前阅读，但先不要记录","today"],
    ["今天想打卡睡前阅读","today"],
    ["完成了睡前阅读","today"],
    ["今天做完了其他运动","today"],
  ] as const;
  for(const [message,when] of plans){
    const outcome=authorizeAssistantCommand(template("record_opportunity",{
      habitId:habit.id,status:"done",when
    }),message,[habit]);
    assert.equal(outcome.intent,"clarify",message);
  }
  const noOpportunityMisclassified=authorizeAssistantCommand(
    template("record_opportunity",{habitId:habit.id,status:"missed",when:"today"}),
    "今天没做睡前阅读，因为没有机会",[habit]);
  assert.equal(noOpportunityMisclassified.intent,"clarify");
  const incompleteToday=authorizeAssistantCommand(
    template("record_opportunity",{habitId:habit.id,status:"missed",when:"today"}),
    "今天还没做睡前阅读",[habit]);
  assert.equal(incompleteToday.intent,"clarify");
  const noCue=authorizeAssistantCommand(template("record_opportunity",{
    habitId:habit.id,status:"no_cue",when:"today"
  }),"今天没做睡前阅读，因为没有机会",[habit]);
  assert.equal(noCue.intent,"record_opportunity");
  const expected=authorizeAssistantCommand(template("record_opportunity",{
    habitId:habit.id,status:"done",when:"today"
  }),"今天完成了睡前阅读",[habit]);
  assert.equal(expected.intent,"record_opportunity");
});
test("model-selected title must be unambiguous among multiple owned habits",()=>{
  const list=[{id:randomUUID(),title:"睡前阅读"},{id:randomUUID(),title:"每日运动"}];
  assert.equal(authorizeAssistantCommand(template("record_opportunity",{
    habitId:list[0]!.id,status:"done",when:"today"
  }),"今天完成了阅读",list).intent,"clarify");
  assert.equal(authorizeAssistantCommand(template("record_opportunity",{
    habitId:list[0]!.id,status:"done",when:"today"
  }),"今天完成了睡前阅读",list).intent,"record_opportunity");
});
test("AI-only initiation code requires an exact quote; cannot impersonate human self-score",()=>{
  const text="今天完成了睡前阅读，开始时完全不用思考";
  const habit={id:randomUUID(),title:"睡前阅读"};
  const plan=authorizeAssistantCommand(template("record_opportunity",{
    habitId:habit.id,status:"done",when:"today",initiationLevel:4,quote:"完全不用思考"
  }),text,[habit]);
  assert.equal(verifiedInitiationEvidence(plan,text)?.level,4);
  assert.equal(verifiedInitiationEvidence({...plan,quote:"编造不存在的事实"},text),null);
  assert.equal(verifiedInitiationEvidence({...plan,confidence:.5},text),null);
});
test("date resolution rejects calendar overflow and arbitrary backdating",()=>{
  const today=localDate();
  assert.equal(observationDay(today,"today"),today);
  assert.notEqual(observationDay(today,"yesterday"),today);
  assert.equal(validateClientLocalDate(today),today);
  assert.throws(()=>validateClientLocalDate("2026-02-31"));
  assert.throws(()=>validateClientLocalDate("2020-01-01"));
});
test("multiuser chat action receipts are idempotent and never authorize foreign writes",async()=>{
  const a=await db.user.create({data:{},select:{id:true}});
  const b=await db.user.create({data:{},select:{id:true}});
  try{
    const createMsg="帮我添加一个睡前阅读10页的习惯";
    const create=authorizeAssistantCommand(template("create_habit",{
      title:"睡前阅读",action:"睡前读10页",cue:"睡觉前"
    }),createMsg,[]);
    const args={userId:a.id,requestId:randomUUID(),message:createMsg,
      localDate:localDate(),command:create,model:"test-v1"};
    const created=await executeAssistantCommand(args);
    assert.equal(created.change?.kind,"habit_created");
    const habitId=created.change!.habitId;
    assert.equal((await executeAssistantCommand(args)).change?.habitId,habitId);
    assert.equal(await db.habit.count({where:{userId:a.id}}),1);
    await assert.rejects(()=>executeAssistantCommand({...args,message:"不同的文本"}),
      (error:any)=>error.code==="ASSISTANT_REQUEST_ID_REUSED");
    const foreign=await db.habit.create({data:{userId:b.id,title:"别人的习惯",action:"不属于账户A"}});
    const badMsg="今天完成了别人的习惯";
    const bad=authorizeAssistantCommand(template("record_opportunity",{
      habitId:foreign.id,status:"done",when:"today"
    }),badMsg,[{id:habitId,title:"睡前阅读"}]);
    assert.equal(bad.intent,"clarify");
    const direct={...bad,intent:"record_opportunity" as const,
      status:"done" as const,target:{id:foreign.id,title:foreign.title},habitId:foreign.id};
    await assert.rejects(()=>executeAssistantCommand({
      userId:a.id,requestId:randomUUID(),message:badMsg,localDate:localDate(),
      command:direct,model:"test-v1"
    }),(error:any)=>error.code==="HABIT_NOT_FOUND");
    const msg="今天完成了睡前阅读，开始时完全不用思考";
    const rec=authorizeAssistantCommand(template("record_opportunity",{
      habitId,status:"done",when:"today",initiationLevel:4,quote:"完全不用思考"
    }),msg,[{id:habitId,title:"睡前阅读"}]);
    const recordId=randomUUID();
    const result=await executeAssistantCommand({userId:a.id,requestId:recordId,
      message:msg,localDate:localDate(),command:rec,model:"test-v1"});
    assert.equal(result.change?.kind,"reflection_recorded");
    await executeAssistantCommand({userId:a.id,requestId:recordId,
      message:msg,localDate:localDate(),command:rec,model:"test-v1"});
    assert.equal(await db.habitEvent.count({where:{habitId}}),1);
    assert.equal(await db.habitReflection.count({where:{habitId}}),1);
    const reflection=await db.habitReflection.findFirstOrThrow({where:{habitId}});
    assert.equal(reflection.initiationLevel,null);
    assert.equal(reflection.aiLevel,4);
    assert.equal(reflection.aiQuote,"完全不用思考");
    const ask=authorizeAssistantCommand(template("check_progress",{habitId}),
      "查看睡前阅读的习惯进度",[{id:habitId,title:"睡前阅读"}]);
    const progress=await executeAssistantCommand({userId:a.id,requestId:randomUUID(),
      message:"查看睡前阅读的习惯进度",localDate:localDate(),command:ask,model:"test-v1"});
    assert.equal(progress.progress?.repetitions,1);
    assert.equal(progress.change,null);
    assert.ok(progress.progress!.percent>=0&&progress.progress!.percent<=100);
    assert.equal(await db.assistantAction.count({where:{userId:a.id}}),2);
    const token=(await issueSession(a.id,"WECHAT")).token;
    const exportRes=await exportGET(new NextRequest(
      "http://localhost:3000/api/v1/account/export?kind=assistant_actions&offset=0",{
        headers:{authorization:"Bearer "+token}
      }));
    assert.equal(exportRes.status,200);
    const exportData=await exportRes.json() as {items:Record<string,unknown>[]};
    assert.equal(exportData.items.length,2);
    assert.ok(exportData.items.every(x=>!Object.hasOwn(x,"messageDigest")));
    assert.ok(exportData.items.every(x=>!Object.hasOwn(x,"message")));
    const talk=authorizeAssistantCommand(template("chat",{reply:"你好，先说说你的目标。"}),
      "我想跟你聊聊习惯",[{id:habitId,title:"睡前阅读"}]);
    await executeAssistantCommand({userId:a.id,requestId:randomUUID(),localDate:localDate(),
      message:"我想跟你聊聊习惯",command:talk,model:"test-v1"});
    assert.equal(await db.assistantAction.count({where:{userId:a.id}}),2,
      "ordinary chat must not persist a conversation transcript");
  }finally{await db.user.deleteMany({where:{id:{in:[a.id,b.id]}}});}
});
test("unauthorized assistant HTTP calls cannot trigger provider access",async()=>{
  const noAuth=await assistantPOST(new NextRequest("http://localhost:3000/api/v1/assistant",{
    method:"POST",headers:{origin:"http://localhost:3000","content-type":"application/json"},
    body:JSON.stringify({message:"今天完成了阅读",requestId:randomUUID(),
      localDate:localDate(),consentToAI:true})}));
  assert.equal(noAuth.status,401);
  const user=await db.user.create({data:{credential:{create:{
    email:"chat_"+randomUUID()+"@example.test",passwordHash:"test",verifiedAt:new Date()
  }}},select:{id:true}});
  try{
    const token=(await issueSession(user.id,"WEB")).token;
    const base={message:"今天完成了阅读",requestId:randomUUID(),localDate:localDate()};
    const request=(body:unknown,origin="http://localhost:3000")=>assistantPOST(
      new NextRequest("http://localhost:3000/api/v1/assistant",{
        method:"POST",headers:{origin,"content-type":"application/json",
          cookie:`${SESSION_COOKIE}=${token}`},
        body:JSON.stringify(body)}));
    assert.equal((await request({...base,consentToAI:false})).status,400);
    assert.equal((await request({...base,consentToAI:true},"https://evil.example")).status,403);
  }finally{await db.user.delete({where:{id:user.id}});}
});

test("real assistant HTTP route: mocked LLM only proposes, server writes owner-only and replays without refetch",async()=>{
  const user=await db.user.create({data:{},select:{id:true}});
  const other=await db.user.create({data:{},select:{id:true}});
  const oldFetch=globalThis.fetch;
  const old={provider:process.env.AI_ASSISTANT_PROVIDER,
    key:process.env.AI_ASSISTANT_API_KEY,model:process.env.AI_ASSISTANT_MODEL};
  try{
    await db.habit.create({data:{userId:other.id,title:"绝不应外传的其他用户习惯",action:"隐藏"}});
    const token=(await issueSession(user.id,"WECHAT")).token;
    process.env.AI_ASSISTANT_PROVIDER="openai";
    process.env.AI_ASSISTANT_API_KEY="fake-ci-only";
    process.env.AI_ASSISTANT_MODEL="fake-json-capable-model";
    let calls=0;
    globalThis.fetch=async(input,init)=>{
      calls++;
      assert.equal(String(input),"https://api.openai.com/v1/chat/completions");
      const sent=JSON.parse(String(init?.body)) as {messages:{role:string;content:string}[]};
      assert.ok(!sent.messages[1]!.content.includes("绝不应外传的其他用户习惯"));
      assert.ok(!sent.messages[1]!.content.includes(user.id));
      assert.equal(sent.messages[1]!.role,"user");
      const plan=template("create_habit",{
        title:"晨起阅读",action:"每天早晨阅读10页",cue:"起床以后"
      });
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(plan)}}]}),{
        status:200,headers:{"content-type":"application/json"}
      });
    };
    const text="帮我添加一个每天早晨阅读10页的习惯";
    const requestId=randomUUID();
    const request=(message:string,id=requestId)=>new NextRequest(
      "http://localhost:3000/api/v1/assistant",{
        method:"POST",headers:{"content-type":"application/json",
          authorization:"Bearer "+token},
        body:JSON.stringify({message,requestId:id,localDate:localDate(),consentToAI:true})
      });
    const created=await assistantPOST(request(text));
    assert.equal(created.status,200);
    const body=await created.json() as {reply:string;change:{habitId:string;kind:string}};
    assert.equal(body.change.kind,"habit_created");
    assert.equal(await db.habit.count({where:{userId:user.id}}),1);
    assert.equal(await db.habit.count({where:{userId:other.id}}),1);
    const duplicate=await assistantPOST(request(text));
    assert.equal(duplicate.status,200);
    assert.equal((await duplicate.json() as {change:{habitId:string}}).change.habitId,
      body.change.habitId);
    assert.equal(calls,1,"retry must not pay for a second provider call");
    assert.equal((await assistantPOST(request("我想修改这次消息"))).status,409);
    assert.equal(calls,1);
  }finally{
    globalThis.fetch=oldFetch;
    for(const [key,value] of [
      ["AI_ASSISTANT_PROVIDER",old.provider],["AI_ASSISTANT_API_KEY",old.key],
      ["AI_ASSISTANT_MODEL",old.model]
    ] as const){
      if(value===undefined)delete process.env[key];
      else process.env[key]=value;
    }
    await db.user.deleteMany({where:{id:{in:[user.id,other.id]}}});
  }
});
