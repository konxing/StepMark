import {test} from "node:test";
import assert from "node:assert/strict";
import {
  prepareAiHabitChatClaim,
  type OwnedHabit,type HabitChatMessage,type AiHabitClaim
} from "../src/habit-chat-evidence.ts";
import {auditHabitOpportunities} from "../src/habit-opportunity-evidence.ts";

const habit:OwnedHabit={id:"habit-1",ownerUserId:"owner-1",name:"羽毛球",aliases:["打球"]};
function data(text:string){
  const message:HabitChatMessage={id:"msg-1",role:"user",authorUserId:"owner-1",
     sentAtMs:1762992000000,text};
  const claim:AiHabitClaim={sourceMessageId:"msg-1",targetHabitId:"habit-1",
    start:0,end:text.length,exactQuote:text,
    cueEncountered:null,eligibleOpportunity:true,performed:true,
    proposedInitiationLevel:null};
  return {message,claim};
}
test("grounded message is still provisional, never directly confirmed",()=>{
  const {message,claim}=data("今天我打羽毛球了");
  const r=prepareAiHabitChatClaim("owner-1",habit,message,claim);
  assert.equal(r.accepted,true);
  if(!r.accepted)throw new Error("unexpected rejection");
  assert.equal(r.candidate.userReportConfirmed,false);
  assert.equal(r.candidate.observedEventAtMs,null);
  assert.equal(r.candidate.sourceMessageAtMs,message.sentAtMs);
  assert.equal(r.candidate.requiresEventTimeResolution,true);
  assert.equal(r.candidate.source,"ai_interpretation");
  // A model proposal is NOT a confirmed HabitOpportunityEvidence event.
  assert.equal(auditHabitOpportunities([]).observedAdherence,null);
});
test("assistant role and other tenant cannot be relabelled as user truth",()=>{
  const {message,claim}=data("我今天练了羽毛球");
  assert.deepEqual(prepareAiHabitChatClaim("owner-1",habit,
    {...message,role:"assistant"},claim),
    {accepted:false,reason:"not_user_authored"});
  assert.deepEqual(prepareAiHabitChatClaim("owner-2",habit,message,claim),
    {accepted:false,reason:"wrong_owner"});
  assert.deepEqual(prepareAiHabitChatClaim("owner-1",habit,
    {...message,authorUserId:"owner-2"},claim),
    {accepted:false,reason:"wrong_owner"});
  assert.deepEqual(prepareAiHabitChatClaim("owner-1",habit,message,
    {...claim,targetHabitId:"habit-other"}),
    {accepted:false,reason:"wrong_habit"});
});
test("fabricated, shifted and too-short quotes are rejected",()=>{
  const {message,claim}=data("今天练了羽毛球");
  for(const patch of [
    {exactQuote:"昨天练了羽毛球"},
    {start:1},
    {end:2},
    {sourceMessageId:"msg-2"},
  ]){
    const r=prepareAiHabitChatClaim("owner-1",habit,message,{...claim,...patch});
    assert.equal(r.accepted,false);
  }
});
test("scope requires habit mention, not ambiguous pronouns",()=>{
  const {message,claim}=data("今天我完成了训练");
  assert.deepEqual(prepareAiHabitChatClaim("owner-1",habit,message,claim),
    {accepted:false,reason:"habit_not_anchored"});
});
test("future, hypothetical, negative and third-party quotes carry caution, not facts",()=>{
  const examples=[
    ["我打算明天练羽毛球","prospective_or_conditional"],
    ["今天还没练羽毛球","negation_conflict"],
    ["我的朋友今天打羽毛球了","third_party_statement"]
  ] as const;
  for(const [sentence,flag] of examples){
    const {message,claim}=data(sentence);
    const result=prepareAiHabitChatClaim("owner-1",habit,message,claim);
    assert.equal(result.accepted,true);
    if(result.accepted) {
      assert.ok(result.candidate.cautionFlags.includes(flag));
      assert.equal(result.candidate.userReportConfirmed,false);
      assert.equal(result.candidate.observedEventAtMs,null);
    }
  }
});
test("contradictory observation and AI inferred automaticity fail closed",()=>{
  const {message,claim}=data("今天练羽毛球");
  for(const patch of ([
    {performed:false,proposedInitiationLevel:4},
    {eligibleOpportunity:false,performed:true},
    {performed:"yes" as never},
    {proposedInitiationLevel:5 as never}
  ] satisfies Partial<AiHabitClaim>[])){
    assert.deepEqual(prepareAiHabitChatClaim("owner-1",habit,message,
      {...claim,...patch}),{accepted:false,reason:"invalid_measurement"});
  }
});
test("message and quote bounds stop prompt-injection length abuse",()=>{
  const {message,claim}=data("我打羽毛球");
  assert.deepEqual(prepareAiHabitChatClaim("owner-1",habit,
    {...message,text:"x".repeat(8001)},claim),
    {accepted:false,reason:"invalid_scoped_input"});
  const long="羽毛球"+"很".repeat(600);
  const d=data(long);
  assert.deepEqual(prepareAiHabitChatClaim("owner-1",habit,d.message,d.claim),
    {accepted:false,reason:"unverifiable_quote"});
});
