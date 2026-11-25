import {test} from "node:test";
import assert from "node:assert/strict";
import {authorizeAssistantCommand} from "../src/server/assistant-command";

const habit={id:"24ebf673-828e-4c01-94ea-c0112a8cb432",title:"睡前阅读"};
const proposal={intent:"check_progress",habitId:habit.id,title:null,action:null,cue:null,
  status:"done",when:"today",initiationLevel:4,confidence:0.95,quote:"完成了睡前阅读",reply:"已记录。"};

test("a progress label cannot swallow an explicit dated completion",()=>{
  for(const [date,when] of [["今天","today"],["昨天","yesterday"]] as const){
    const result=authorizeAssistantCommand({...proposal,when},"我"+date+"完成了睡前阅读。",[habit]);
    assert.equal(result.intent,"record_opportunity");
    assert.equal(result.status,"done");
    assert.equal(result.when,when);
    assert.equal(result.target?.id,habit.id);
    assert.equal(result.initiationLevel,null);
  }
});

test("mistagged completions still require the original date and habit",()=>{
  assert.equal(authorizeAssistantCommand(proposal,"我完成了睡前阅读。",[habit]).intent,"clarify");
  assert.equal(authorizeAssistantCommand(proposal,"我昨天完成了睡前阅读。",[habit]).intent,"clarify");
  assert.equal(authorizeAssistantCommand(proposal,"我今天完成了睡前阅读。",[]).intent,"clarify");
  assert.equal(authorizeAssistantCommand({...proposal,confidence:0.5},
    "我今天完成了睡前阅读。",[habit]).intent,"clarify");
});

test("a progress question or quoted, conditional or private statement stays read-only",()=>{
  for(const message of [
    "睡前阅读的进度如何？",
    "我今天完成了睡前阅读，进度如何？",
    "如果我今天完成了睡前阅读。",
    "“我今天完成了睡前阅读。”",
    "不要记录，我今天完成了睡前阅读。"
  ]){
    assert.equal(authorizeAssistantCommand(proposal,message,[habit]).intent,"check_progress",message);
  }
});
