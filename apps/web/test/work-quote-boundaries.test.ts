import {test} from "node:test";
import assert from "node:assert/strict";
import {groundedWorkEvidence} from "../src/server/work-evidence";

test("a terminal mark in an exact action or result quote keeps later plans outside the evidence",()=>{
  const previous=process.env.AI_ASSISTANT_DIGEST_SECRET;
  process.env.AI_ASSISTANT_DIGEST_SECRET="synthetic-exact-quote-regression-secret";
  try{
    const action="我比较了两种不同的工作流程。";
    const result="结果发现第二种流程少返工一次。";
    const candidate={domain:"thinking",actionQuote:action,outcomeQuote:result};
    assert.equal(groundedWorkEvidence([candidate],action+"明天我计划验证另一种流程。","synthetic-owner")[0]?.stage,1);
    assert.equal(groundedWorkEvidence([candidate],action+result+"明天我计划验证另一种流程。","synthetic-owner")[0]?.stage,2);
    assert.deepEqual(groundedWorkEvidence([candidate],"如果"+action+result,"synthetic-owner"),[]);
    assert.deepEqual(groundedWorkEvidence([candidate],"示例：“"+action+result+"”","synthetic-owner"),[]);
    assert.deepEqual(groundedWorkEvidence([{...candidate,actionQuote:action.slice(0,-1)}],
      action.slice(0,-1)+"？","synthetic-owner"),[]);
  }finally{
    if(previous===undefined)delete process.env.AI_ASSISTANT_DIGEST_SECRET;
    else process.env.AI_ASSISTANT_DIGEST_SECRET=previous;
  }
});
