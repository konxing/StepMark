import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {requestApi}=require("../lib/api.js");
const base={apiBase:"https://api.stepmark.example",path:"/api/v1/habits",
  method:"GET",authenticated:true,accessToken:"test-token"};
test("WeChat transport sends only StepMark bearer token to configured API",async()=>{
  const original=globalThis.wx;
  const sent=[];
  try{
    globalThis.wx={request(options){sent.push(options);options.success({statusCode:200,
      data:{habits:[]}});}};
    assert.deepEqual(await requestApi(base),{habits:[]});
    assert.equal(sent[0].url,"https://api.stepmark.example/api/v1/habits");
    assert.equal(sent[0].header.Authorization,"Bearer test-token");
    assert.equal(sent[0].timeout,8000);
    await requestApi({...base,path:"/api/v1/auth/wechat",method:"POST",
      authenticated:false,accessToken:null,data:{code:"temporary-code"}});
    assert.equal(sent[1].header.Authorization,undefined);
    await requestApi({...base,path:"/api/v1/assistant",method:"POST"});
    assert.equal(sent[2].timeout,17000);
  }finally{globalThis.wx=original;}
});
test("WeChat transport rejects invalid endpoints and absent sessions before networking",async()=>{
  const original=globalThis.wx;
  let count=0;
  try{
    globalThis.wx={request(){count++;}};
    for(const apiBase of ["","http://api.stepmark.example","https://api.stepmark.example.evil/x",
      "https://user@api.stepmark.example","https://127.0.0.1:8443"]){
      await assert.rejects(requestApi({...base,apiBase}),/HTTPS API 域名/);
    }
    for(const path of ["https://evil.example","//evil.example","/api/v1/../secrets",
      "/api/v1/%2e%2e/secrets"]){
      await assert.rejects(requestApi({...base,path}),/不支持的 API 请求/);
    }
    await assert.rejects(requestApi({...base,accessToken:null}),/登录信息已过期/);
    await assert.rejects(requestApi({...base,method:"PATCH"}),/不支持的 API 请求/);
    assert.equal(count,0);
  }finally{globalThis.wx=original;}
});
test("WeChat transport retains rate-limit, login expiry and network errors",async()=>{
  const original=globalThis.wx;
  try{
    globalThis.wx={request(options){options.success({statusCode:429,
      data:{error:{code:"RATE_LIMITED"}}});}};
    await assert.rejects(requestApi(base),/AI 对话次数达到上限/);
    globalThis.wx={request(options){options.success({statusCode:401,
      data:{error:{code:"UNAUTHENTICATED"}}});}};
    await assert.rejects(requestApi(base),/登录信息已过期/);
    globalThis.wx={request(options){options.fail({});}};
    await assert.rejects(requestApi(base),/网络请求失败/);
  }finally{globalThis.wx=original;}
});

test("mini-program public endpoint is the owner-approved canonical origin",()=>{
  const config=require("../config.js");
  assert.deepEqual(config,{apiBase:"https://stepmark.xin"});
});
