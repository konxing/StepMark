import {test} from "node:test";
import assert from "node:assert/strict";
import {calculateHabitProgress} from "../src/index.ts";
const DAY=86400000,now=1800000000000;
const base=(n:number,observations:{atMs:number;level:0|1|2|3|4;source:"self_report";confidence:number}[]=[])=>
  calculateHabitProgress({completedRepetitions:n,eligibleOpportunities:n,completedOpportunities:n,observations,
    nowMs:now,lastCompletedAtMs:now-1*DAY,seed:"fixed-user"});
const evidence=(daysAgo:number,level:0|1|2|3|4)=>({atMs:now-daysAgo*DAY,level,source:"self_report" as const,confidence:1});
test("20 repetitions plus a mild hesitation produces a visual progress indicator, not a norm",()=>{
  const x=base(20,[evidence(1,2)]);
  assert.ok(x.progress>=29 && x.progress<=36);
  assert.equal(x.evidenceLevel,"limited");
  assert.equal(x.stage,"developing");
});
test("90 repetitions and spaced natural starts can reach maintaining status",()=>{
  const x=base(90,[evidence(1,4),evidence(13,4),evidence(25,4)]);
  assert.ok(x.progress>=88 && x.progress<=96);
  assert.equal(x.stage,"maintaining");
  assert.equal(x.evidenceLevel,"repeated");
  assert.ok(x.nextReviewAt);
});
test("many repetitions with no introspective data must not imply habit formation",()=>{
  const x=base(1000);
  assert.ok(x.progress<=45);
  assert.equal(x.automaticitySignal,null);
  assert.equal(x.stage,"collecting_evidence");
});
test("a single strong note is not enough to certify a mature habit",()=>{
  const x=base(90,[evidence(1,4)]);
  assert.ok(x.progress<=65);
});
test("a new hesitation can move progress down; later review comes due",()=>{
  const strong=[evidence(2,4),evidence(14,4),evidence(28,4)];
  const before=base(90,strong);
  const after=base(91,[evidence(0,1),...strong]);
  assert.ok(after.progress<before.progress);
  const due=base(90,[evidence(45,4),evidence(58,4),evidence(75,4)]);
  assert.equal(due.reviewDue,true);
  assert.equal(due.stage,"review_due");
});
test("same-day repeated notes do not inflate subjective evidence count",()=>{
  const x=base(40,[evidence(1,4),evidence(1,4),evidence(2,4)]);
  assert.equal(x.evidenceCount,2);
  assert.ok(x.progress<=80);
});
test("missing opportunity, false count and invalid AI confidence are guarded",()=>{
  assert.throws(()=>calculateHabitProgress({completedRepetitions:2,completedOpportunities:3,eligibleOpportunities:3,nowMs:now,observations:[]}));
  const x=calculateHabitProgress({completedRepetitions:10,eligibleOpportunities:10,completedOpportunities:10,
    nowMs:now,observations:[{atMs:now-2*DAY,level:4,source:"ai_interpretation",confidence:.4}]});
  assert.equal(x.automaticitySignal,null);
});
test("review opt-out hides deadlines",()=>{
  const a=calculateHabitProgress({completedRepetitions:90,completedOpportunities:90,eligibleOpportunities:90,
    nowMs:now,observations:[evidence(1,4),evidence(13,4),evidence(25,4)],reviewEnabled:false});
  assert.equal(a.nextReviewAt,null);
  assert.equal(a.reviewDue,false);
});
