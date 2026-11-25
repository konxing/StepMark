import assert from "node:assert/strict";
import {calculateHabitProgress,describePublicReasoningEvidence,type InitiationEvidence,type ObservedForm} from "@stepmark/core";

export function habitComparison(){
  const day=86400000,nowMs=1800000000000;
  const input={completedRepetitions:90,completedOpportunities:90,eligibleOpportunities:100,
    nowMs,recentOpportunities:{completed:12,eligible:12}};
  const selfRatings:InitiationEvidence[]=[1,13,25].map(days=>({
    atMs:nowMs-days*day,level:4,confidence:1,source:"self_report"
  }));
  const aiRatings=selfRatings.map(rating=>({...rating,source:"ai_interpretation" as const}));
  const control=calculateHabitProgress({...input,observations:[]});
  const aiOnly=calculateHabitProgress({...input,observations:aiRatings});
  const self=calculateHabitProgress({...input,observations:selfRatings});
  const both=calculateHabitProgress({...input,observations:[...selfRatings,...aiRatings]});
  const manyMisses=calculateHabitProgress({...input,observations:selfRatings,recentOpportunities:{completed:4,eligible:12}});
  const noNewRecords=calculateHabitProgress({...input,observations:selfRatings,nowMs:nowMs+60*day});
  const twenty=calculateHabitProgress({
    completedRepetitions:20,completedOpportunities:20,eligibleOpportunities:20,nowMs,
    observations:[{atMs:nowMs-day,level:2,source:"self_report",confidence:1}]
  });
  assert.equal(aiOnly.progress,control.progress);
  assert.equal(both.progress,self.progress);
  assert.equal(noNewRecords.progress,self.progress);
  assert.ok(manyMisses.progress<80&&self.progress>=80);
  const forms:ObservedForm[]=["logic-a-v1","logic-b-v1"].map((code,index)=>({
    code,status:"completed",total:6,attempted:6,correct:index===0?3:5,
    completedAt:new Date(nowMs+(index*7-10)*day).toISOString(),integrityStatus:"verified"
  }));
  const measurement=describePublicReasoningEvidence(forms);
  assert.equal(measurement.rawComparison?.rawDifferencePoints,33);
  assert.equal(measurement.ability.theta,null);
  return {twentyMildHesitation:twenty.progress,ninetyNoRatings:control.progress,ninetyAiOnly:aiOnly.progress,
    ninetyRepeatedNatural:self.progress,ninetyNaturalWithAi:both.progress,observedFourOfTwelve:manyMisses.progress,
    noNewRecordsForSixtyDays:noNewRecords.progress,independentTaskDifferencePoints:measurement.rawComparison.rawDifferencePoints};
}

