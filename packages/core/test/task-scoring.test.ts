import {test} from "node:test";
import assert from "node:assert/strict";
import {evaluateSingleChoice} from "../src/index.ts";
test("single choice score is deterministic and not an ability estimate",()=>{
  const task={options:[{key:"A",label:"yes"},{key:"B",label:"no"}],correctKey:"B"};
  assert.equal(evaluateSingleChoice(task,"B").taskScore,100);
  assert.equal(evaluateSingleChoice(task,"A").taskScore,0);
  assert.throws(()=>evaluateSingleChoice(task,"C"));
  assert.throws(()=>evaluateSingleChoice({...task,correctKey:"C"},"A"));
});
