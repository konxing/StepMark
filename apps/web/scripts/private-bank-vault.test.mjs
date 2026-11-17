import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID,randomBytes,generateKeyPairSync,createHash} from "node:crypto";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {sealPrivateBankBytes,inspectSealedBank,auditSealedBankFile}
  from "./private-bank-vault.mjs";
import {signPrivateReview} from "./private-review-crypto.mjs";
const KEY=randomBytes(32).toString("base64url");
function bank(){
  return {kind:"stepmark-private-research-bank-v1",bankVersion:"research-logic-v2",
    constructCode:"reasoning.logic",researchOnly:true,
    forms:["research-logic-a-v2","research-logic-b-v2"].map(code=>({
      code,items:Array.from({length:18},(_,i)=>({
        id:randomUUID(),order:i+1,
        skillCode:["conditional","evidence","quantitative"][i%3],
        prompt:"原创测试样例只验证加密封存能力，不能用作真人能力测验"+code+i,
        options:["A","B","C","D"].map(k=>({key:k,label:"测试选项"+k})),
        correctKey:["A","B","C","D"][i%4],
        explanation:"该文字仅用于测试加密工具，不代表真实测量模型通过审核。"
      }))
    }))}
}
function signedBundle(sha){
  const roles=["content","psychometrics","rights_security"];
  const checks=["constructFit","answerKeyVerified","languageReviewed",
    "rightsConfirmed","exposureRiskReviewed","noSensitiveContent"];
  const signers=roles.map((role,i)=>{
    const {privateKey,publicKey}=generateKeyPairSync("ed25519");
    return {role,ref:"reviewer-vault"+i,privatePem:privateKey.export({
      format:"pem",type:"pkcs8"}).toString(),publicPem:publicKey.export({
      format:"pem",type:"spki"}).toString()};
  });
  return {
    trust:{kind:"stepmark-offline-reviewer-trust-v1",
      reviewers:signers.map(s=>({reviewerRef:s.ref,role:s.role,
        publicKeySpkiPem:s.publicPem}))},
    manifest:{kind:"stepmark-signed-bank-review-v1",bankSha256:sha,
      reviews:signers.map(s=>signPrivateReview({
        reviewerRef:s.ref,role:s.role,bankSha256:sha,
        reviewedOn:new Date().toISOString().slice(0,10),
        decision:"pass",checks:Object.fromEntries(checks.map(k=>[k,"pass"]))
      },s.privatePem))}
  };
}
test("AES-GCM private vault is randomized, authenticated and decrypts only into memory",()=>{
  const bytes=Buffer.from(JSON.stringify(bank()));
  const first=sealPrivateBankBytes(bytes,KEY);
  const second=sealPrivateBankBytes(bytes,KEY);
  assert.notEqual(first.envelope.iv,second.envelope.iv);
  assert.notEqual(first.envelope.ciphertext,second.envelope.ciphertext);
  assert.equal(first.summary.itemCount,36);
  assert.equal(inspectSealedBank(first.envelope,KEY).itemCount,36);
  assert.ok(!JSON.stringify(first.envelope).includes("correctKey"));
  assert.ok(!JSON.stringify(first.envelope).includes("研究"));
  const wrong=randomBytes(32).toString("base64url");
  assert.throws(()=>inspectSealedBank(first.envelope,wrong),/AUTHENTICATION_FAILED/);
  const tamper={...first.envelope,sourceSha256:"0".repeat(64)};
  assert.throws(()=>inspectSealedBank(tamper,KEY),/AUTHENTICATION_FAILED/);
  const ciphertext={...first.envelope,ciphertext:"A"+first.envelope.ciphertext.slice(1)};
  assert.throws(()=>inspectSealedBank(ciphertext,KEY),/AUTHENTICATION_FAILED/);
});
test("malformed, extra-field and weak keys are not accepted",()=>{
  const bytes=Buffer.from(JSON.stringify(bank()));
  const good=sealPrivateBankBytes(bytes,KEY);
  assert.throws(()=>sealPrivateBankBytes(bytes,"password123"),/32_RANDOM_BYTES/);
  assert.throws(()=>inspectSealedBank({...good.envelope,unexpected:"flag"},KEY),/ENVELOPE_INVALID/);
  assert.throws(()=>inspectSealedBank({...good.envelope,tag:"bad"},KEY),/ENVELOPE_INVALID/);
  assert.throws(()=>sealPrivateBankBytes(Buffer.from("not JSON".repeat(20)),KEY),/JSON_INVALID/);
});
test("CLI seals outside Git, audit uses signed review registry, never logs questions",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"stepmark-vault-ci-"));
  try{
    const input=join(dir,"bank.json"),output=join(dir,"bundle.encrypted.json"),
      reviews=join(dir,"signed-reviews.json"),trust=join(dir,"trust-registry.json");
    const value=bank();
    const bytes=Buffer.from(JSON.stringify(value));
    await writeFile(input,bytes);
    const digest=createHash("sha256").update(bytes).digest("hex");
    const att=signedBundle(digest);
    await writeFile(reviews,JSON.stringify(att.manifest));
    await writeFile(trust,JSON.stringify(att.trust));
    const script=fileURLToPath(new URL("./private-bank-vault.mjs",import.meta.url));
    const env={...process.env,STEPMARK_PRIVATE_BANK_KEY_B64URL:KEY};
    const seal=spawnSync(process.execPath,[script,"--seal","--input",input,
      "--output",output],{encoding:"utf8",env});
    assert.equal(seal.status,0,seal.stderr);
    assert.equal(seal.stdout.includes(value.forms[0].items[0].prompt),false);
    const audit=spawnSync(process.execPath,[script,"--audit","--bundle",output,
      "--reviews",reviews,"--trust",trust],{encoding:"utf8",env});
    assert.equal(audit.status,0,audit.stderr);
    assert.match(audit.stdout,/BLOCKED_UNTIL_REAL_CALIBRATION/);
    assert.equal(audit.stdout.includes(value.forms[0].items[0].prompt),false);
    assert.equal(audit.stdout.includes(att.trust.reviewers[0].reviewerRef),false);
    const verified=await auditSealedBankFile(output,reviews,trust,KEY);
    assert.equal(verified.signedReviewCount,3);
    const rerun=spawnSync(process.execPath,[script,"--seal","--input",input,
      "--output",output],{encoding:"utf8",env});
    assert.notEqual(rerun.status,0);
    assert.equal(rerun.stderr.includes(output),false);
    const denied=spawnSync(process.execPath,[script,"--audit","--bundle",output,
      "--reviews",reviews,"--trust",trust],{encoding:"utf8",env:{
      ...process.env,STEPMARK_PRIVATE_BANK_KEY_B64URL:randomBytes(32).toString("base64url")}});
    assert.notEqual(denied.status,0);
    assert.equal(denied.stdout,"");
    assert.equal(denied.stderr.includes(output),false);
  }finally{await rm(dir,{recursive:true,force:true});}
});
