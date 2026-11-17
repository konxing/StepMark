import {test} from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,createHash,randomUUID} from "node:crypto";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {
  verifySignedPrivateReviews,signPrivateReview,verifySignedPrivateReviewFiles
} from "./private-review-crypto.mjs";
const ROLES=["content","psychometrics","rights_security"];
const FIELDS=["constructFit","answerKeyVerified","languageReviewed",
  "rightsConfirmed","exposureRiskReviewed","noSensitiveContent"];
const NOW=new Date("2026-11-17T16:00:00Z");
const SHA="9".repeat(64);
const roleKeys=ROLES.map((role,i)=>{
  const {privateKey,publicKey}=generateKeyPairSync("ed25519");
  return {role,ref:"reviewer-test"+i,
    privatePem:privateKey.export({type:"pkcs8",format:"pem"}).toString(),
    publicPem:publicKey.export({type:"spki",format:"pem"}).toString()};
});
function manifest(sha=SHA){
  const entries=roleKeys.map(r=>({reviewerRef:r.ref,role:r.role,bankSha256:sha,
    reviewedOn:"2026-11-17",decision:"pass",
    checks:Object.fromEntries(FIELDS.map(field=>[field,"pass"]))}));
  return {kind:"stepmark-signed-bank-review-v1",bankSha256:sha,
    reviews:entries.map((e,i)=>signPrivateReview(e,roleKeys[i].privatePem,NOW))};
}
const trust={
  kind:"stepmark-offline-reviewer-trust-v1",
  reviewers:roleKeys.map(r=>({reviewerRef:r.ref,role:r.role,
    publicKeySpkiPem:r.publicPem}))
};
test("three independently pinned Ed25519 reviewers bind exact bank content",()=>{
  const result=verifySignedPrivateReviews(SHA,manifest(),trust,NOW);
  assert.equal(result.cryptographicallyVerifiedReviews,3);
  assert.equal(result.evidenceStatus,"SIGNED_DECLARATIONS_VERIFIED");
  assert.match(result.releaseGate,/BLOCKED_/);
  assert.equal(JSON.stringify(result).includes("reviewer-test"),false);
});
test("tampering with a signed decision, checklist, date, role or source fails closed",()=>{
  const candidates=[
    x=>{x.reviews[0].entry.decision="revise";},
    x=>{x.reviews[1].entry.checks.rightsConfirmed="revise";},
    x=>{x.reviews[2].entry.bankSha256="1".repeat(64);},
    x=>{x.reviews[0].entry.role="rights_security";},
    x=>{x.reviews[0].entry.reviewedOn="2026-11-16";},
    x=>{x.reviews[2].signature="A".repeat(86);}
  ];
  for(const mutate of candidates){
    const x=manifest();mutate(x);
    assert.throws(()=>verifySignedPrivateReviews(SHA,x,trust,NOW),/PRIVATE_/);
  }
  assert.throws(()=>verifySignedPrivateReviews("8".repeat(64),manifest(),trust,NOW),
    /PRIVATE_SIGNED_REVIEW_BANK_CHANGED/);
});
test("unknown keys, reused keys, reviewer roles, expired statements are rejected",()=>{
  const wrong=structuredClone(trust);
  wrong.reviewers[0].publicKeySpkiPem=roleKeys[1].publicPem;
  assert.throws(()=>verifySignedPrivateReviews(SHA,manifest(),wrong,NOW),
    /PRIVATE_TRUST_KEY_REUSED/);
  const wrongRole=structuredClone(trust);wrongRole.reviewers[0].role="psychometrics";
  assert.throws(()=>verifySignedPrivateReviews(SHA,manifest(),wrongRole,NOW),
    /PRIVATE_SIGNED_REVIEW_UNTRUSTED_REVIEWER/);
  assert.throws(()=>verifySignedPrivateReviews(SHA,manifest(),trust,
    new Date("2027-12-01T00:00:00Z")) , /FIELDS_INVALID/);
});
function bank(){
  return {kind:"stepmark-private-research-bank-v1",bankVersion:"research-logic-v2",
    constructCode:"reasoning.logic",researchOnly:true,
    forms:["research-logic-a-v2","research-logic-b-v2"].map(code=>({
      code,items:Array.from({length:18},(_,i)=>({
        id:randomUUID(),order:i+1,skillCode:["conditional","evidence","quantitative"][i%3],
        prompt:"虚构的离线测试题材，仅用于测试签名与数据安全，无法推断真实能力"+code+(i+1),
        options:["A","B","C","D"].map(key=>({key,label:"模拟选择项"+key})),
        correctKey:["A","B","C","D"][i%4],
        explanation:"这是虚构的单元测试解释，不能用于真人能力判断或临床评估。"
      }))
    }))}
}
test("CLI sign & verify uses only out-of-repository files with no content leakage",async()=>{
  const folder=await mkdtemp(join(tmpdir(),"stepmark-sign-"));
  try{
    const bankPath=join(folder,"bank.json"),reviewsPath=join(folder,"reviews.json"),
      trustPath=join(folder,"trust.json"),keyPath=join(folder,"signer.pem"),
      entryPath=join(folder,"entry.json"),signedPath=join(folder,"signed.json");
    const privateBank=bank();const bytes=Buffer.from(JSON.stringify(privateBank));
    await writeFile(bankPath,bytes);
    const digest=createHash("sha256").update(bytes).digest("hex");
    const envelope=manifest(digest);
    await writeFile(reviewsPath,JSON.stringify(envelope));
    await writeFile(trustPath,JSON.stringify(trust));
    const verified=await verifySignedPrivateReviewFiles(bankPath,reviewsPath,trustPath,NOW);
    assert.equal(verified.bankItemCount,36);
    assert.equal(verified.cryptographicallyVerifiedReviews,3);
    await writeFile(entryPath,JSON.stringify(envelope.reviews[0].entry));
    await writeFile(keyPath,roleKeys[0].privatePem,{mode:0o600});
    const signer=spawnSync(process.execPath,[
      fileURLToPath(new URL("./private-review-crypto.mjs",import.meta.url)),
      "--sign","--entry",entryPath,"--key",keyPath,"--output",signedPath
    ],{encoding:"utf8"});
    assert.equal(signer.status,0,signer.stderr);
    assert.equal(signer.stdout.trim(),"PRIVATE_SIGNED_REVIEW_CREATED");
    assert.ok(!signer.stdout.includes(privateBank.forms[0].items[0].prompt));
    const exists=spawnSync(process.execPath,[
      fileURLToPath(new URL("./private-review-crypto.mjs",import.meta.url)),
      "--sign","--entry",entryPath,"--key",keyPath,"--output",signedPath
    ],{encoding:"utf8"});
    assert.notEqual(exists.status,0);
    assert.equal(exists.stderr.includes(signedPath),false);
    const unchecked=spawnSync(process.execPath,[
      fileURLToPath(new URL("./private-review-crypto.mjs",import.meta.url)),
      "--verify","--bank",bankPath,"--reviews",reviewsPath,"--trust",trustPath
    ],{encoding:"utf8"});
    assert.equal(unchecked.status,0,unchecked.stderr);
    assert.equal(unchecked.stdout.includes(roleKeys[0].ref),false);
    assert.equal(unchecked.stdout.includes(privateBank.forms[0].items[0].prompt),false);
  }finally{await rm(folder,{recursive:true,force:true});}
});
