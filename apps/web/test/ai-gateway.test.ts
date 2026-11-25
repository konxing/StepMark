import {test} from "node:test";
import assert from "node:assert/strict";
import {callAiJson,resolveAiProvider,validateCompatibleEndpoint} from "../src/server/ai-gateway";
import {inspectHabitNote,judgeHabitNote} from "../src/server/habit-ai";

const env={
  AI_HABIT_PROVIDER:"openai",
  AI_HABIT_API_KEY:"secret",
  AI_HABIT_MODEL:"gpt-test"
};
test("fixed providers and assistant fallback preserve deployed configuration",()=>{
  assert.equal(resolveAiProvider("habit",env).url,"https://api.openai.com/v1/chat/completions");
  assert.equal(resolveAiProvider("assistant",env).model,"gpt-test");
  assert.equal(resolveAiProvider("assistant",{...env,AI_ASSISTANT_PROVIDER:"openrouter",
    AI_ASSISTANT_API_KEY:"other",AI_ASSISTANT_MODEL:"model-1"}).url,
    "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(resolveAiProvider("assistant",{...env,AI_ASSISTANT_PROVIDER:"deepseek",
    AI_ASSISTANT_API_KEY:"test-only",AI_ASSISTANT_MODEL:"model-1"}).url,
    "https://api.deepseek.com/chat/completions");
  assert.throws(()=>resolveAiProvider("habit",{...env,AI_HABIT_MODEL:"invalid model"}));
  assert.throws(()=>resolveAiProvider("habit",{...env,AI_HABIT_PROVIDER:"unknown"}));
});
test("a DeepSeek key defaults to Flash without crossing explicit provider credentials",()=>{
  const deepseek={DEEPSEEK_API_KEY:"fixture-deepseek"};
  for(const purpose of ["assistant","habit"] as const){
    assert.deepEqual(resolveAiProvider(purpose,deepseek),{
      url:"https://api.deepseek.com/chat/completions",key:"fixture-deepseek",model:"deepseek-flash"
    });
  }
  assert.equal(resolveAiProvider("assistant",{...env,...deepseek}).key,"secret");
  assert.throws(()=>resolveAiProvider("assistant",{...env,...deepseek,
    AI_ASSISTANT_PROVIDER:"openrouter",AI_ASSISTANT_MODEL:"example"}),/AI_PROVIDER_NOT_CONFIGURED/);
  assert.throws(()=>resolveAiProvider("assistant",{...env,AI_ASSISTANT_PROVIDER:"__proto__",
    AI_ASSISTANT_API_KEY:"fixture-only",AI_ASSISTANT_MODEL:"example"}),/AI_PROVIDER_NOT_CONFIGURED/);
});
test("custom OpenAI-compatible endpoint is server-allowlisted, HTTPS and public",()=>{
  const good="https://llm.example.com/v1/chat/completions";
  assert.equal(validateCompatibleEndpoint(good,"llm.example.com"),good);
  assert.equal(validateCompatibleEndpoint("https://llm.example.com/chat/completions","llm.example.com"),
    "https://llm.example.com/chat/completions");
  assert.equal(resolveAiProvider("assistant",{
    AI_ASSISTANT_PROVIDER:"compatible",AI_ASSISTANT_API_KEY:"secret",
    AI_ASSISTANT_MODEL:"qwen/test-1",AI_ASSISTANT_ENDPOINT:good,
    AI_ASSISTANT_ALLOWED_HOST:"llm.example.com"
  }).url,good);
  for(const endpoint of [
    "http://llm.example.com/v1/chat/completions",
    "https://localhost/v1/chat/completions",
    "https://127.0.0.1/v1/chat/completions",
    "https://[::1]/v1/chat/completions",
    "https://metadata.internal/v1/chat/completions",
    "https://llm.example.com:8443/v1/chat/completions",
    "https://user:pass@llm.example.com/v1/chat/completions",
    "https://llm.example.com/v1/chat/completions?token=x",
    "https://llm.example.com/v1/other",
    "https://llm.example.com//chat/completions",
    "https://llm.example.com.evil.net/v1/chat/completions"
  ]){
    assert.throws(()=>validateCompatibleEndpoint(endpoint,"llm.example.com"),endpoint);
  }
  assert.throws(()=>resolveAiProvider("habit",{...env,AI_HABIT_PROVIDER:"compatible",
    AI_HABIT_ENDPOINT:good}),"allowlist must be explicitly configured");
});
test("bounded AI gateway parses JSON, denies redirects and oversized replies",async()=>{
  const original=globalThis.fetch;
  const calls:RequestInit[]=[];
  const payload={choices:[{message:{content:JSON.stringify({answer:"ok"})}}]};
  try{
    globalThis.fetch=async (_url,init)=>{
      calls.push(init??{});
      return new Response(JSON.stringify(payload),{status:200,
        headers:{"content-type":"application/json"}});
    };
    const cfg=resolveAiProvider("habit",env);
    const messages=[{role:"user" as const,content:"hello"}];
    assert.deepEqual(await callAiJson(cfg,{messages,timeoutMs:1000,maxTokens:50,
      maxResponseBytes:1000}),{answer:"ok"});
    assert.equal(calls[0]?.redirect,"error");
    assert.equal((calls[0]?.headers as Record<string,string>).Authorization,"Bearer secret");
    assert.equal(JSON.parse(String(calls[0]?.body)).messages[0].content,"hello");
    assert.equal(JSON.parse(String(calls[0]?.body)).thinking,undefined);
    await callAiJson(resolveAiProvider("habit",{DEEPSEEK_API_KEY:"fixture-deepseek"}),{
      messages,timeoutMs:1000,maxTokens:50,maxResponseBytes:1000
    });
    assert.deepEqual(JSON.parse(String(calls[1]?.body)).thinking,{type:"disabled"});
    globalThis.fetch=async()=>new Response("x".repeat(120),{status:200});
    await assert.rejects(()=>callAiJson(cfg,{messages,timeoutMs:1000,maxTokens:50,
      maxResponseBytes:100}),/AI_RESPONSE_TOO_LARGE/);
    globalThis.fetch=async()=>new Response("x",{status:200,
      headers:{"content-length":"999999"}});
    await assert.rejects(()=>callAiJson(cfg,{messages,timeoutMs:1000,maxTokens:50,
      maxResponseBytes:100}),/AI_RESPONSE_TOO_LARGE/);
    globalThis.fetch=async()=>new Response("not json",{status:200});
    await assert.rejects(()=>callAiJson(cfg,{messages,timeoutMs:1000,maxTokens:50,
      maxResponseBytes:100}),/AI_RESPONSE_INVALID_JSON/);
    globalThis.fetch=async()=>Response.json({choices:[{...payload.choices[0],finish_reason:"length"}]});
    await assert.rejects(()=>callAiJson(cfg,{messages,timeoutMs:1000,maxTokens:50,
      maxResponseBytes:1000}),/AI_RESPONSE_INCOMPLETE/);
    globalThis.fetch=async()=>new Response("",{status:302,headers:{location:"https://evil.test"}});
    await assert.rejects(()=>callAiJson(cfg,{messages,timeoutMs:1000,maxTokens:50,
      maxResponseBytes:100}),/AI_UPSTREAM_FAILED/);
  }finally{globalThis.fetch=original;}
});
test("habit note stays evidence-only through the common gateway",async()=>{
  const originalFetch=globalThis.fetch;
  const originalEnv={provider:process.env.AI_HABIT_PROVIDER,
    key:process.env.AI_HABIT_API_KEY,model:process.env.AI_HABIT_MODEL};
  try{
    process.env.AI_HABIT_PROVIDER="openai";
    process.env.AI_HABIT_API_KEY="secret";
    process.env.AI_HABIT_MODEL="model-v1";
    globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{
      content:JSON.stringify({initiationLevel:4,confidence:0.9,quote:"自然而然打开了笔记"})
    }}]}),{status:200});
    const coded=await judgeHabitNote("看到电脑就自然而然打开了笔记");
    assert.equal(coded.level,4);
    assert.equal(coded.modelId,"model-v1");
    assert.equal(coded.promptVersion,"habit-note-coding-v2");

    const incorrectProposal={initiationLevel:4,confidence:0.95,quote:"很自然地开始阅读"};
    globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify(incorrectProposal)}}]});
    const diagnostic=await inspectHabitNote("看到书就很自然地开始阅读。");
    assert.deepEqual(diagnostic.proposal,incorrectProposal);
    assert.equal(diagnostic.annotation.level,null);
    assert.equal((await judgeHabitNote("看到书就很自然地开始阅读。")).level,null);
  }finally{
    globalThis.fetch=originalFetch;
    for(const [name,value] of Object.entries({
      AI_HABIT_PROVIDER:originalEnv.provider,
      AI_HABIT_API_KEY:originalEnv.key,AI_HABIT_MODEL:originalEnv.model
    })){
      if(value===undefined)delete process.env[name];else process.env[name]=value;
    }
  }
});

test("AI failures distinguish credentials, balance, model, throttling and network restrictions",async()=>{
  const original=globalThis.fetch;
  const cfg=resolveAiProvider("habit",env);
  const args={messages:[{role:"user" as const,content:"Test"}],timeoutMs:1000,maxTokens:32,maxResponseBytes:1000};
  try{
    for(const [status,code] of [
      [401,"AI_AUTHENTICATION_FAILED"],[402,"AI_INSUFFICIENT_BALANCE"],
      [429,"AI_RATE_LIMITED"],[422,"AI_MODEL_UNAVAILABLE"],[503,"AI_UPSTREAM_FAILED"]] as const){
      globalThis.fetch=async()=>new Response("private upstream error",{status});
      await assert.rejects(()=>callAiJson(cfg,args),new RegExp("^Error: "+code+"$"));
    }
    globalThis.fetch=async()=>{throw new TypeError("fetch failed",{cause:Object.assign(new Error("hidden details"),{code:"EACCES"})});};
    await assert.rejects(()=>callAiJson(cfg,args),/^Error: AI_NETWORK_BLOCKED$/);
  }finally{globalThis.fetch=original;}
});
