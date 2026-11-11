import {test} from "node:test";
import assert from "node:assert/strict";
import {PRACTICE_BANK,choosePracticeItem,findPracticeItem,publicPracticeItem,
 PRACTICE_SKILLS,reviewDueDay,getPracticeSchedule} from "../src/server/practice-bank";

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

test("spaced retrieval uses gap progression without claiming a memory probability",()=>{
 const date=(day:number)=>"2026-11-"+String(day).padStart(2,"0");
 const make=(day:number,correct:boolean,hintUsed:boolean|null=false)=>({
   itemId:"practice-cond-01",dayKey:date(day),createdAt:new Date(date(day)+"T12:00:00Z"),
   correct,hintUsed
 });
 assert.equal(reviewDueDay([],date(12)),null);
 assert.equal(reviewDueDay([make(12,true)],date(12)),date(13));
 assert.equal(reviewDueDay([make(12,true),make(13,true)],date(13)),date(16));
 assert.equal(reviewDueDay([make(12,true),make(13,true),make(16,true)],date(16)),date(23));
 assert.equal(reviewDueDay([make(12,true),make(13,true),make(16,false)],date(16)),date(17));
 assert.equal(reviewDueDay([make(12,true),make(13,true),make(16,true,true)],date(16)),date(17));
 assert.equal(reviewDueDay([make(12,true),make(13,true),make(16,true,null)],date(16)),date(17));
 const due=getPracticeSchedule("conditional",[make(12,false)],date(13));
 assert.equal(due.item?.id,"practice-cond-01");
 assert.equal(due.dueCount,1);
 assert.equal(due.policyVersion,"retrieval-spacing-heuristic-1");
 const scheduled=getPracticeSchedule("conditional",[make(12,true),make(13,true)],date(14));
 assert.notEqual(scheduled.item?.id,"practice-cond-01");
 assert.equal(scheduled.nextReviewUtc,date(16));
 assert.throws(()=>getPracticeSchedule("conditional",[],"2026-02-30"),/INVALID_UTC_DAY/);
});
