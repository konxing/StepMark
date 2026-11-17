import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {
  auditPrivateReviewManifest,auditPrivateReviewFiles
} from "./audit-private-review-evidence.mjs";
const SHA="9".repeat(64),NOW=new Date("2026-11-17T16:00:00.000Z");
const fields=["constructFit","answerKeyVerified","languageReviewed",
  "rightsConfirmed","exposureRiskReviewed","noSensitiveContent"];
function manifest(sha=SHA){
  return {kind:"stepmark-private-bank-review-v1",bankSha256:sha,
    reviewers:["content","psychometrics","rights_security"].map((role,i)=>({
      reviewerRef:"reviewer-opaque"+i,role,reviewedOn:"2026-11-16",
      decision:"pass",checks:Object.fromEntries(fields.map(key=>[key,"pass"]))
    }))};
}
function bank(){
  return {kind:"stepmark-private-research-bank-v1",bankVersion:"research-logic-v2",
    constructCode:"reasoning.logic",researchOnly:true,
    forms:["research-logic-a-v2","research-logic-b-v2"].map(code=>({
      code,items:Array.from({length:18},(_,i)=>({
        id:randomUUID(),order:i+1,skillCode:["conditional","evidence","quantitative"][i%3],
        prompt:"仅供模拟测试的内容，不得进入正式考试或用于任何能力结论："+code+(i+1),
        options:["A","B","C","D"].map(key=>({key,label:"占位选项内容"+key})),
        correctKey:["A","B","C","D"][i%4],
        explanation:"这个解释是一个仅用于验证结构的模拟占位，不是实证效度依据。"
      }))
    }))};
}
test("review evidence is explicitly bound to source, never certifies publication",()=>{
  const result=auditPrivateReviewManifest(manifest(),SHA,NOW);
  assert.equal(result.evidenceState,"COMPLETE_UNVERIFIED_REVIEW_DECLARATIONS");
  assert.equal(result.reviewDeclarations,3);
  assert.match(result.releaseGate,/BLOCKED/);
  const serialized=JSON.stringify(result);
  assert.equal(serialized.includes("reviewer-opaque"),false);
  assert.equal(serialized.includes("correctKey"),false);
  const edited=manifest();edited.reviewers[0].checks.constructFit="revise";
  assert.equal(auditPrivateReviewManifest(edited,SHA,NOW).evidenceState,"REVISIONS_RECORDED");
});
test("reject changed bank bytes, duplicate reviewers, missing roles and expired reviews",()=>{
  assert.throws(()=>auditPrivateReviewManifest(manifest("1".repeat(64)),SHA,NOW),/VERSION_MISMATCH/);
  const duplicate=manifest();duplicate.reviewers[1].reviewerRef=duplicate.reviewers[0].reviewerRef;
  assert.throws(()=>auditPrivateReviewManifest(duplicate,SHA,NOW),/NOT_INDEPENDENTLY_DECLARED/);
  const role=manifest();role.reviewers[2].role="content";
  assert.throws(()=>auditPrivateReviewManifest(role,SHA,NOW),/NOT_INDEPENDENTLY_DECLARED/);
  const dated=manifest();dated.reviewers[0].reviewedOn="2025-01-01";
  assert.throws(()=>auditPrivateReviewManifest(dated,SHA,NOW),/STALE/);
  const future=manifest();future.reviewers[0].reviewedOn="2026-11-18";
  assert.throws(()=>auditPrivateReviewManifest(future,SHA,NOW),/DATE_INVALID/);
  const invalid=manifest();invalid.reviewers[0].checks.unexpected="pass";
  assert.throws(()=>auditPrivateReviewManifest(invalid,SHA,NOW),/ENTRY_INVALID/);
  assert.throws(()=>auditPrivateReviewManifest(manifest(),SHA,new Date("invalid")),/CONTEXT_INVALID/);
});
test("offline CLI binds private bank and review manifest with no content leakage",async()=>{
  const folder=await mkdtemp(join(tmpdir(),"stepmark-opaque-reviews-"));
  const bankPath=join(folder,"private-original.json");
  const reviewPath=join(folder,"private-review.json");
  try{
    const privateBank=bank();
    const bankBytes=Buffer.from(JSON.stringify(privateBank));
    const digest=createHash("sha256").update(bankBytes).digest("hex");
    await writeFile(bankPath,bankBytes);
    await writeFile(reviewPath,JSON.stringify(manifest(digest)));
    const result=await auditPrivateReviewFiles(bankPath,reviewPath,NOW);
    assert.equal(result.bankItemCount,36);
    assert.equal(result.sourceSha256,digest);
    assert.match(result.releaseGate,/BLOCKED/);
    const noContext=spawnSync(process.execPath,[
      fileURLToPath(new URL("./audit-private-review-evidence.mjs",import.meta.url)),
      "--bank",bankPath,"--reviews",reviewPath
    ],{encoding:"utf8"});
    // The fixed 2026 dates become stale in future; CLI may reject safely
    // without exposing either filename or a draft response.
    assert.ok(noContext.status===0||noContext.status===1);
    assert.equal(noContext.stdout.includes(privateBank.forms[0].items[0].prompt),false);
    assert.equal(noContext.stderr.includes(bankPath),false);
    assert.equal(noContext.stderr.includes(reviewPath),false);
    const changed=manifest("1".repeat(64));
    await writeFile(reviewPath,JSON.stringify(changed));
    await assert.rejects(()=>auditPrivateReviewFiles(bankPath,reviewPath,NOW),
      /VERSION_MISMATCH/);
  }finally{await rm(folder,{recursive:true,force:true});}
});
