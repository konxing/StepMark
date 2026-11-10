import { test } from "node:test";
import assert from "node:assert/strict";
import { brierScore, irt2plInformation, irt2plProbability, rubricTaskScore, wilsonInterval } from "../src/index.ts";

test("2PL midpoint, monotonicity and information", () => {
  assert.equal(irt2plProbability(0, 1, 0), 0.5);
  assert.ok(irt2plProbability(2, 1, 0) > irt2plProbability(0, 1, 0));
  assert.equal(irt2plInformation(0, 2, 0), 1);
  assert.throws(() => irt2plProbability(0, -1, 0));
});
test("rubric task scoring keeps dimensions explicit", () => {
  assert.equal(rubricTaskScore([{key:"clarity",level:4,weight:3},{key:"logic",level:2,weight:1}]),87.5);
  assert.throws(() => rubricTaskScore([{key:"a",level:4,weight:1},{key:"a",level:0,weight:1}]));
});
test("Brier score rewards calibrated resolved forecasts", () => {
  assert.equal(brierScore([{probability:1,outcome:1},{probability:0,outcome:0}]), 0);
  assert.equal(brierScore([{probability:0,outcome:1}]), 1);
  assert.throws(() => brierScore([{probability:1.5,outcome:1}]));
});
test("Wilson interval never invents evidence for zero observations", () => {
  assert.equal(wilsonInterval(0,0), null);
  const ci = wilsonInterval(8,10)!;
  assert.ok(ci.low < .8 && ci.high > .8);
});
