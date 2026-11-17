/**
 * RESEARCH-ONLY authenticated encrypted private question vault.
 * AES-256-GCM with a 256-bit randomly generated key supplied via process env.
 * No production import / no database / never returns item content on CLI.
 */
import {randomBytes,createHash,createCipheriv,createDecipheriv} from "node:crypto";
import {readFile,realpath,stat,writeFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {auditPrivateResearchBank,repositoryPathAllowed}
  from "./audit-private-research-bank.mjs";
import {verifySignedPrivateReviews} from "./private-review-crypto.mjs";
const ALG="aes-256-gcm",KIND="stepmark-encrypted-private-bank-v1";
const MAX=262144,PLAIN_MAX=131072,HEX=/^[0-9a-f]{64}$/;
const B64=/^[A-Za-z0-9_-]+$/;
const reject=code=>{throw new Error(code);};
const exact=(x,keys)=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&
  Object.keys(x).sort().join("|")===keys.slice().sort().join("|");
const toUtf8=x=>new TextDecoder("utf-8",{fatal:true}).decode(x);
const digest=x=>createHash("sha256").update(x).digest("hex");
function validKey(encoded){
  if(typeof encoded!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(encoded))
    reject("PRIVATE_VAULT_KEY_MUST_BE_32_RANDOM_BYTES");
  const bytes=Buffer.from(encoded,"base64url");
  if(bytes.length!==32||bytes.toString("base64url")!==encoded)
    reject("PRIVATE_VAULT_KEY_MUST_BE_32_RANDOM_BYTES");
  return bytes;
}
function validateBankBytes(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length<100||bytes.length>PLAIN_MAX)
    reject("PRIVATE_VAULT_SOURCE_SIZE_INVALID");
  let candidate;
  try{candidate=JSON.parse(toUtf8(bytes));}
  catch{reject("PRIVATE_VAULT_SOURCE_JSON_INVALID");}
  return auditPrivateResearchBank(candidate);
}
function parseEnvelope(envelope){
  if(!exact(envelope,["kind","algorithm","iv","tag","ciphertext",
      "sourceSha256","researchOnly"])||
     envelope.kind!==KIND||envelope.algorithm!==ALG||
     envelope.researchOnly!==true||
     typeof envelope.iv!=="string"||!/^[A-Za-z0-9_-]{16}$/.test(envelope.iv)||
     typeof envelope.tag!=="string"||!/^[A-Za-z0-9_-]{22}$/.test(envelope.tag)||
     typeof envelope.ciphertext!=="string"||!B64.test(envelope.ciphertext)||
     !HEX.test(envelope.sourceSha256))
    reject("PRIVATE_VAULT_ENVELOPE_INVALID");
  const iv=Buffer.from(envelope.iv,"base64url");
  const tag=Buffer.from(envelope.tag,"base64url");
  const ciphertext=Buffer.from(envelope.ciphertext,"base64url");
  if(iv.length!==12||tag.length!==16||
     ciphertext.length<100||ciphertext.length>PLAIN_MAX||
     iv.toString("base64url")!==envelope.iv||
     tag.toString("base64url")!==envelope.tag||
     ciphertext.toString("base64url")!==envelope.ciphertext)
    reject("PRIVATE_VAULT_ENVELOPE_INVALID");
  return {iv,tag,ciphertext};
}
function authenticatedContext(sourceSha256){
  return Buffer.from("STEPMARK-RESEARCH-PRIVATE-BANK-V1\n"+sourceSha256,"utf8");
}
export function sealPrivateBankBytes(sourceBytes,keyEncoded){
  const info=validateBankBytes(sourceBytes);
  const key=validKey(keyEncoded),iv=randomBytes(12);
  const sha=digest(sourceBytes);
  const cipher=createCipheriv(ALG,key,iv,{authTagLength:16});
  cipher.setAAD(authenticatedContext(sha));
  const ciphertext=Buffer.concat([cipher.update(sourceBytes),cipher.final()]);
  const envelope={
    kind:KIND,algorithm:ALG,researchOnly:true,
    sourceSha256:sha,iv:iv.toString("base64url"),
    tag:cipher.getAuthTag().toString("base64url"),
    ciphertext:ciphertext.toString("base64url")
  };
  return {envelope,summary:{version:KIND,sourceSha256:sha,
    itemCount:info.itemCount,formCount:info.formCount,
    releaseGate:"BLOCKED_PENDING_AUTHORIZED_STUDY_RELEASE"}};
}
function decryptVerifiedBytes(envelope,keyEncoded){
  const {iv,tag,ciphertext}=parseEnvelope(envelope);
  const key=validKey(keyEncoded);
  let plaintext;
  try{
    const decipher=createDecipheriv(ALG,key,iv,{authTagLength:16});
    decipher.setAAD(authenticatedContext(envelope.sourceSha256));
    decipher.setAuthTag(tag);
    plaintext=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
  }catch{
    reject("PRIVATE_VAULT_AUTHENTICATION_FAILED");
  }
  if(digest(plaintext)!==envelope.sourceSha256)
    reject("PRIVATE_VAULT_AUTHENTICATION_FAILED");
  return plaintext;
}
export function inspectSealedBank(envelope,keyEncoded){
  const plaintext=decryptVerifiedBytes(envelope,keyEncoded);
  let summary;
  try{summary=validateBankBytes(plaintext);}
  finally{plaintext.fill(0);}
  return {sourceSha256:envelope.sourceSha256,
    itemCount:summary.itemCount,formCount:summary.formCount,
    warnings:summary.warnings,
    releaseGate:"BLOCKED_PENDING_AUTHORIZED_STUDY_RELEASE"};
}
async function privateRead(path,cap=MAX){
  if(typeof path!=="string"||!repositoryPathAllowed(path))
    reject("PRIVATE_VAULT_FILE_MUST_BE_OUTSIDE_GIT");
  const actual=await realpath(path);
  if(!repositoryPathAllowed(actual))reject("PRIVATE_VAULT_FILE_MUST_BE_OUTSIDE_GIT");
  const info=await stat(actual);
  if(!info.isFile()||info.size<10||info.size>cap)
    reject("PRIVATE_VAULT_FILE_SIZE_INVALID");
  const bytes=await readFile(actual);
  if(bytes.length!==info.size)reject("PRIVATE_VAULT_FILE_CHANGED_DURING_READ");
  return bytes;
}
async function privateJson(path){
  let value;
  try{value=JSON.parse(toUtf8(await privateRead(path)));}
  catch(err){
    if(typeof err?.message==="string"&&err.message.startsWith("PRIVATE_"))throw err;
    reject("PRIVATE_VAULT_JSON_INVALID");
  }
  return value;
}
async function privateOutput(path,contents){
  if(!repositoryPathAllowed(path))reject("PRIVATE_VAULT_FILE_MUST_BE_OUTSIDE_GIT");
  const parent=await realpath(dirname(resolve(path)));
  if(!repositoryPathAllowed(parent))reject("PRIVATE_VAULT_FILE_MUST_BE_OUTSIDE_GIT");
  await writeFile(path,contents,{encoding:"utf8",flag:"wx",mode:0o600});
}
export async function auditSealedBankFile(bundlePath,reviewsPath,trustPath,keyEncoded){
  const envelope=await privateJson(bundlePath);
  const info=inspectSealedBank(envelope,keyEncoded);
  const [manifest,registry]=await Promise.all([privateJson(reviewsPath),privateJson(trustPath)]);
  const signed=verifySignedPrivateReviews(info.sourceSha256,manifest,registry);
  return {
    version:KIND,
    itemCount:info.itemCount,formCount:info.formCount,sourceSha256:info.sourceSha256,
    signedReviewCount:signed.cryptographicallyVerifiedReviews,
    reviewState:signed.evidenceStatus,
    warnings:info.warnings,
    releaseGate:"BLOCKED_UNTIL_REAL_CALIBRATION_AND_AUTHORIZED_RELEASE"
  };
}
async function main(args){
  const key=process.env.STEPMARK_PRIVATE_BANK_KEY_B64URL;
  if(args.length===5&&args[0]==="--seal"&&args[1]==="--input"&&args[3]==="--output"){
    const raw=await privateRead(args[2],PLAIN_MAX);
    const output=sealPrivateBankBytes(raw,key);
    await privateOutput(args[4],JSON.stringify(output.envelope)+"\n");
    process.stdout.write(JSON.stringify(output.summary)+"\n");
    return;
  }
  if(args.length===3&&args[0]==="--inspect"&&args[1]==="--bundle"){
    const envelope=await privateJson(args[2]);
    const result=inspectSealedBank(envelope,key);
    process.stdout.write(JSON.stringify(result,null,2)+"\n");
    return;
  }
  if(args.length===5&&args[0]==="--unseal"&&args[1]==="--bundle"&&
    args[3]==="--output"){
    const envelope=await privateJson(args[2]);
    const plain=decryptVerifiedBytes(envelope,key);
    try{
      validateBankBytes(plain);
      await privateOutput(args[4],plain);
    }finally{plain.fill(0);}
    process.stdout.write("PRIVATE_BANK_PLAINTEXT_CREATED_OUTSIDE_GIT\n");
    return;
  }
  if(args.length===7&&args[0]==="--audit"&&args[1]==="--bundle"&&
    args[3]==="--reviews"&&args[5]==="--trust"){
    const report=await auditSealedBankFile(args[2],args[4],args[6],key);
    process.stdout.write(JSON.stringify(report,null,2)+"\n");
    return;
  }
  reject("PRIVATE_VAULT_USAGE_INVALID");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2)).catch(e=>{
    const msg=typeof e?.message==="string"?e.message:"";
    const code=/^PRIVATE_[A-Z0-9_]+$/.test(msg)?msg:"PRIVATE_VAULT_OPERATION_FAILED";
    process.stderr.write(code+"\n");process.exitCode=1;
  });
