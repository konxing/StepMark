import { test } from "node:test";
import assert from "node:assert/strict";
import { automaticityResponseIndex, habitCurve, observedAdherence, fitHabitCurve } from "../src/index.ts";

test("habit curve asymptotes without a magic day threshold", () => {
  const p = { baseline: 10, asymptote: 90, rate: 0.06 };
  assert.equal(habitCurve(0,p), 10);
  assert.ok(habitCurve(50,p) > habitCurve(1,p));
  assert.ok(habitCurve(100,p) < 90);
});
test("automaticity four-response arithmetic", () => {
  assert.equal(automaticityResponseIndex([1,1,1,1]), 0);
  assert.equal(automaticityResponseIndex([7,7,7,7]), 100);
  assert.throws(() => automaticityResponseIndex([7]));
});
test("adherence counts only eligible opportunities", () => {
  assert.deepEqual(observedAdherence([{eligible:true, completed:true},{eligible:true,completed:false},{eligible:false,completed:true}]),
    {numerator:1,denominator:2,ratio:.5});
  assert.equal(observedAdherence([]).ratio,null);
});
test("fit is unavailable without sufficient spread and observations", () => {
  assert.equal(fitHabitCurve([{effectiveRepetitions:1,automaticity:20}]),null);
});
test("exploratory fit approximates a known synthetic curve", () => {
  const p = {baseline:10,asymptote:85,rate:.04};
  const sample = [0,5,10,15,20,30,40,60,80].map(n => ({
    effectiveRepetitions:n,automaticity:habitCurve(n,p)
  }));
  const fit = fitHabitCurve(sample)!;
  assert.equal(fit.status,"exploratory");
  assert.ok(fit.rmse < 1.5);
});

test("curve baseline is fitted rather than copied from noisy first check",()=>{
  const p={baseline:12,asymptote:85,rate:0.05};
  const xs=[10,14,18,22,28,34,41,50,60,78];
  const points=xs.map((n,i)=>({effectiveRepetitions:n,
    automaticity:habitCurve(n,p)+(i===0?12: i%2===0?0.5:-0.5)}));
  const fit=fitHabitCurve(points)!;
  assert.ok(fit);
  assert.ok(fit.parameters.baseline!==points[0]!.automaticity);
  assert.ok(fit.parameters.asymptote<=100);
  assert.ok(fit.rmse<fit.constantRmse);
  assert.equal(fit.modelVersion,"asymptote-constrained-ls-v2");
});
test("constant automaticity and invalid observations do not produce faux growth",()=>{
  assert.equal(fitHabitCurve([0,5,10,15,20,30,50].map(n=>({effectiveRepetitions:n,automaticity:40}))),null);
  assert.throws(()=>fitHabitCurve([0,5,10,15,20,30,50].map(n=>({effectiveRepetitions:n,automaticity:n===15?NaN:40}))));
});
