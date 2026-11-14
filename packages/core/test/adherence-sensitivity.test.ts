import {test} from "node:test";
import assert from "node:assert/strict";
import {auditAdherenceSensitivity} from "../src/adherence-sensitivity.ts";

const counts=(a:number,b:number,c:number,d:number)=>({
  performedEligible:a,missedEligible:b,eligibleButPerformanceUnknown:c,eligibilityUnknown:d
});

test("missing behavior never becomes failure; 50% complete case may have broad bounds",()=>{
  const a=auditAdherenceSensitivity(counts(1,1,2,1));
  assert.equal(a.observedAdherence,.5);
  assert.equal(a.knownEligibleOutcomeCoverage,.5);
  assert.deepEqual(a.knownEligibleIdentificationBounds,{low:.25,high:.75});
  assert.deepEqual(a.recordedEventConservativeBounds,{low:.2,high:.8});
  assert.equal(a.status,"unresolved");
});

test("fully observed and all-success/all-failure extremes are exact",()=>{
  assert.deepEqual(auditAdherenceSensitivity(counts(3,0,0,0)).knownEligibleIdentificationBounds,
    {low:1,high:1});
  assert.deepEqual(auditAdherenceSensitivity(counts(0,4,0,0)).knownEligibleIdentificationBounds,
    {low:0,high:0});
  const fully=auditAdherenceSensitivity(counts(3,2,0,0));
  assert.deepEqual(fully.knownEligibleIdentificationBounds,{low:.6,high:.6});
  assert.equal(fully.knownEligibleOutcomeCoverage,1);
  assert.equal(fully.status,"observed_known_eligibility");
});

test("unknown eligibility alone cannot imply zero adherence",()=>{
  const a=auditAdherenceSensitivity(counts(0,0,0,4));
  assert.equal(a.observedAdherence,null);
  assert.equal(a.knownEligibleOutcomeCoverage,null);
  assert.equal(a.knownEligibleIdentificationBounds,null);
  assert.deepEqual(a.recordedEventConservativeBounds,{low:0,high:1});
  const empty=auditAdherenceSensitivity(counts(0,0,0,0));
  assert.equal(empty.status,"no_recorded_potential_opportunity");
  assert.equal(empty.recordedEventConservativeBounds,null);
});

test("outcome absence does not inflate observed denominator",()=>{
  const a=auditAdherenceSensitivity(counts(0,0,3,0));
  assert.equal(a.observedAdherence,null);
  assert.equal(a.knownEligibleOutcomeCoverage,0);
  assert.deepEqual(a.knownEligibleIdentificationBounds,{low:0,high:1});
});

test("invalid or unsafe counts fail closed",()=>{
  for(const input of [counts(-1,0,0,0),counts(1.1,0,0,0),
    counts(10001,0,0,0),counts(0,NaN,0,0),counts(0,0,Infinity,0),
    counts(3000,3000,3000,3000)]) {
    assert.throws(()=>auditAdherenceSensitivity(input),/invalid|too many/);
  }
});
