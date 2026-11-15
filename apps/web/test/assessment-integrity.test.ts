import {test} from "node:test";
import assert from "node:assert/strict";
import {taskContentDigest,verifyTaskAttemptEvidence} from "../src/server/assessment-integrity";
const content={kind:"single_choice_v1",prompt:"If A then B, what follows?",options:[
  {key:"A",label:"One"},{key:"B",label:"Two"}],correctKey:"A",explanation:"A is correct"};
test("canonical content fingerprint ignores JSON object-key ordering",()=>{
  const rearranged={explanation:content.explanation,correctKey:"A",options:content.options.map(x=>
    ({label:x.label,key:x.key})),prompt:content.prompt,kind:content.kind};
  assert.equal(taskContentDigest(rearranged),taskContentDigest(content));
});
test("accidental answer-key edit with unchanged version invalidates scored evidence",()=>{
  const digest=taskContentDigest(content);
  const attempt={taskVersion:"logic-form-1",taskVersionToIgnore:"other",evidence:{taskContentSha256:digest}};
  const verify=(c:unknown,e:unknown=attempt.evidence,version="logic-form-1")=>
    verifyTaskAttemptEvidence({taskVersion:version,attemptVersion:attempt.taskVersion,
      content:c,evidence:e});
  assert.equal(verify(content),"verified");
  assert.equal(verify({...content,correctKey:"B"}),"mismatch");
  assert.equal(verify(content,{taskContentSha256:"bad"}),"mismatch");
  assert.equal(verify(content,{}, "logic-form-1"),"legacy_unverified");
  assert.equal(verify(content,null,"logic-form-1"),"legacy_unverified");
  assert.equal(verify(content,attempt.evidence,"logic-form-2"),"mismatch");
});
test("unserializable content and unbounded depth cannot create a trusted fingerprint",()=>{
  assert.throws(()=>taskContentDigest({broken:undefined}),/UNSERIALIZABLE/);
  assert.throws(()=>taskContentDigest({attack:Infinity}),/INVALID_TASK/);
  const obj={child:{child:{child:{child:{child:{child:content}}}}}};
  assert.equal(typeof taskContentDigest(obj),"string");
});
