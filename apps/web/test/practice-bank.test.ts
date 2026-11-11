import {test} from "node:test";
import assert from "node:assert/strict";
import {PRACTICE_BANK,choosePracticeItem,findPracticeItem,publicPracticeItem,
 PRACTICE_SKILLS} from "../src/server/practice-bank";

test("coaching item bank is independent and internally consistent",()=>{
 assert.equal(PRACTICE_BANK.length,15);
 assert.equal(new Set(PRACTICE_BANK.map(x=>x.id)).size,PRACTICE_BANK.length);
 for(const skill of PRACTICE_SKILLS){
  assert.equal(PRACTICE_BANK.filter(x=>x.skillCode===skill.code).length,5);
 }
 for(const item of PRACTICE_BANK){
  assert.equal(item.options.length,4);
  assert.equal(new Set(item.options.map(x=>x.key)).size,4);
  assert.ok(item.options.some(x=>x.key===item.answerKey));
  assert.ok(item.explanation.length>20);
  assert.ok(item.hint.length>10);
  assert.equal(JSON.stringify(publicPracticeItem(item)).includes(item.explanation),false);
  assert.equal(JSON.stringify(publicPracticeItem(item)).includes("answerKey"),false);
 }
});
test("training chooses unseen items and prevents repeat on same UTC day",()=>{
 const today="2026-11-12";
 const initial=choosePracticeItem("conditional",[],today)!;
 assert.equal(initial.id,"practice-cond-01");
 const old=new Date("2026-11-11T10:00:00Z");
 const once=[{itemId:initial.id,correct:false,dayKey:today,createdAt:old}];
 const next=choosePracticeItem("conditional",once,today)!;
 assert.notEqual(next.id,initial.id);
 const full=PRACTICE_BANK.filter(x=>x.skillCode==="conditional").map(x=>({
  itemId:x.id,correct:false,dayKey:today,createdAt:old
 }));
 assert.equal(choosePracticeItem("conditional",full,today),null);
 const resumed=choosePracticeItem("conditional",full,"2026-11-13");
 assert.ok(resumed);
 assert.equal(findPracticeItem("practice-cond-01")?.skillCode,"conditional");
});
