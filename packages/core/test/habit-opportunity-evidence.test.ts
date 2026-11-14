import {test} from "node:test";
import assert from "node:assert/strict";
import {auditHabitOpportunities,type HabitOpportunityEvidence} from "../src/habit-opportunity-evidence.ts";

function row(key:string,changes:Partial<HabitOpportunityEvidence>={}):HabitOpportunityEvidence {
  return {opportunityKey:key,occurredAtMs:1762992000000,
    cueEncountered:null,eligibleOpportunity:null,performed:null,
    initiationAutomaticity:null,source:"user_explicit",...changes};
}
test("only confirmed known eligible and observed actions count in adherence",()=>{
  const out=auditHabitOpportunities([
    row("completed",{cueEncountered:true,eligibleOpportunity:true,performed:true,initiationAutomaticity:4}),
    row("missed",{cueEncountered:true,eligibleOpportunity:true,performed:false}),
    row("unknown-work",{cueEncountered:true,eligibleOpportunity:true,performed:null}),
    row("no-opportunity",{cueEncountered:false,eligibleOpportunity:false,performed:false}),
    row("unreported",{cueEncountered:null,eligibleOpportunity:null,performed:null})
  ]);
  assert.equal(out.confirmedEligibleOpportunities,3);
  assert.equal(out.performedEligible,1);
  assert.equal(out.missedEligible,1);
  assert.equal(out.eligibleButPerformanceUnknown,1);
  assert.equal(out.explicitlyNoOpportunity,1);
  assert.equal(out.eligibilityUnknown,1);
  assert.equal(out.cueUnknown,1);
  assert.equal(out.observedAdherence,.5);
  assert.equal(out.directAutomaticityRatings,1);
  assert.equal(out.latestDirectInitiationLevel,4);
});
test("AI parse is provisional even if it contains positive automaticity",()=>{
  const ai=row("ai",{source:"ai_interpretation",cueEncountered:true,
    eligibleOpportunity:true,performed:true,initiationAutomaticity:4,
    userMessageId:"message-1",supportingQuote:"I started naturally without thinking"});
  const out=auditHabitOpportunities([ai]);
  assert.equal(out.events,1);
  assert.equal(out.provisionalAiEvents,1);
  assert.equal(out.confirmedUserEvents,0);
  assert.equal(out.confirmedEligibleOpportunities,0);
  assert.equal(out.directAutomaticityRatings,0);
  assert.equal(out.observedAdherence,null);
});
test("AI cannot create ungrounded claims",()=>{
  assert.throws(()=>auditHabitOpportunities([row("ai",{
    source:"ai_interpretation",eligibleOpportunity:true,performed:true
  })]),/linked user evidence/);
  assert.throws(()=>auditHabitOpportunities([row("ai",{
    source:"ai_interpretation",eligibleOpportunity:true,performed:true,
    userMessageId:"msg-1",supportingQuote:"no"
  })]),/linked user evidence/);
});
test("missing and zero rating have different meanings",()=>{
  assert.equal(auditHabitOpportunities([row("unreported")]).latestDirectInitiationLevel,null);
  assert.equal(auditHabitOpportunities([row("observed",{
    eligibleOpportunity:true,performed:true,initiationAutomaticity:0
  })]).latestDirectInitiationLevel,0);
  assert.throws(()=>auditHabitOpportunities([row("missed",{
    eligibleOpportunity:true,performed:false,initiationAutomaticity:4
  })]),/requires observed performed action/);
});
test("duplicate events and invalid types fail closed",()=>{
  assert.throws(()=>auditHabitOpportunities([row("a"),row("a")]),/repeated/);
  assert.throws(()=>auditHabitOpportunities([row("a",{cueEncountered:undefined} as unknown as Partial<HabitOpportunityEvidence>)]),/invalid cue/);
  assert.throws(()=>auditHabitOpportunities([row("a",{initiationAutomaticity:10 as never})]),/invalid cue/);
  assert.equal(auditHabitOpportunities([]).observedAdherence,null);
});

test("adherence ranges expose uncertainty without treating unknown as failure",()=>{
  const a=auditHabitOpportunities([
    row("s1",{eligibleOpportunity:true,performed:true}),
    row("f1",{eligibleOpportunity:true,performed:false}),
    row("q1",{eligibleOpportunity:true,performed:null}),
    row("u1",{eligibleOpportunity:null,performed:null}),
    row("ai1",{eligibleOpportunity:true,performed:true,source:"ai_interpretation",
      userMessageId:"m1",supportingQuote:"I clearly did the task"})
  ]);
  assert.equal(a.observedAdherence,.5);
  assert.equal(a.adherenceSensitivity.knownEligibleOutcomeCoverage,0.666667);
  assert.deepEqual(a.adherenceSensitivity.knownEligibleIdentificationBounds,
    {low:0.333333,high:0.666667});
  assert.deepEqual(a.adherenceSensitivity.recordedEventConservativeBounds,
    {low:.25,high:.75});
  assert.equal(a.adherenceSensitivity.unknownEligibility,1);
  assert.equal(a.adherenceSensitivity.status,"unresolved");
});
test("contradictory performed actions with no eligible opportunity fail closed",()=>{
  assert.throws(()=>auditHabitOpportunities([row("impossible",{
    eligibleOpportunity:false,performed:true
  })]),/contradicts/);
});
