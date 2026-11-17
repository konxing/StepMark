/**
 * OFFLINE, PRIVATE, RESEARCH-ONLY reviewer attestations.
 * Ed25519 trust is anchored in a separate OWNER-controlled local registry,
 * not a user-provided signature's claimed reviewer identity.
 * Even verified attestations NEVER authorize web/WeChat release.
 */
import {createPublicKey,createPrivateKey,sign,verify} from "node:crypto";
import {readFile,realpath,stat,writeFile} from "node:fs/promises";
import {dirname,relative,resolve,isAbsolute} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {auditPrivateResearchBankFile,repositoryPathAllowed}
  from "./audit-private-research-bank.mjs";

const ROLES=["content","psychometrics","rights_security"];
const CHECKS=["constructFit","answerKeyVerified","languageReviewed",
  "rightsConfirmed","exposureRiskReviewed","noSensitiveContent"];
const REVIEWER=/^reviewer-[a-z0-9_-]{5,40}$/;
const SHA=/^[0-9a-f]{64}$/;
const SIGNATURE=/^[A-Za-z0-9_-]{86}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const MAX_BYTES=65536;
const SCHEMA="stepmark-signed-bank-review-v1";
const error=code=>{throw new Error(code);};
const exact=(x,keys)=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&
  Object.keys(x).sort().join("|")===keys.slice().sort().join("|");
function validDate(s,now,days){
  if(typeof s!=="string"||!DATE.test(s))return false;
  const ms=Date.parse(s+"T00:00:00Z");
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===s&&
    ms<=now.getTime()&&now.getTime()-ms<=days*86400000;
}
function validEntry(e,now){
  if(!exact(e,["reviewerRef","role","bankSha256","reviewedOn","decision","checks"])||
     !REVIEWER.test(e.reviewerRef)||!ROLES.includes(e.role)||
     !SHA.test(e.bankSha256)||!validDate(e.reviewedOn,now,180)||
     !["pass","revise"].includes(e.decision)||
     !exact(e.checks,CHECKS)||
     !CHECKS.every(k=>["pass","revise"].includes(e.checks[k])))
    error("PRIVATE_SIGNED_REVIEW_FIELDS_INVALID");
}
function wireObject(e){
  // Explicitly ordered, unambiguous UTF-8 domain-separated payload.
  return {kind:SCHEMA,reviewerRef:e.reviewerRef,role:e.role,
    bankSha256:e.bankSha256,reviewedOn:e.reviewedOn,
    decision:e.decision,checks:Object.fromEntries(CHECKS.map(k=>[k,e.checks[k]]))};
}
export function signedReviewMessage(entry){
  if(!entry||typeof entry!=="object")error("PRIVATE_SIGNED_REVIEW_FIELDS_INVALID");
  return Buffer.from("STEPMARK-PRIVATE-REVIEW-ED25519-V1\n"+
    JSON.stringify(wireObject(entry)),"utf8");
}
function isPem(s){return typeof s==="string"&&s.length<2500&&
  s.startsWith("-----BEGIN PUBLIC KEY-----\n")&&s.includes("-----END PUBLIC KEY-----");}
function reviewerRegistry(trust){
  if(!exact(trust,["kind","reviewers"])||
     trust.kind!=="stepmark-offline-reviewer-trust-v1"||
     !Array.isArray(trust.reviewers)||trust.reviewers.length<3||
     trust.reviewers.length>40)error("PRIVATE_TRUST_REGISTRY_INVALID");
  const refs=new Set(),publicKeys=new Set(),registry=new Map();
  for(const item of trust.reviewers){
    if(!exact(item,["reviewerRef","role","publicKeySpkiPem"])||
       !REVIEWER.test(item.reviewerRef)||!ROLES.includes(item.role)||
       !isPem(item.publicKeySpkiPem)||refs.has(item.reviewerRef))
      error("PRIVATE_TRUST_REVIEWER_INVALID");
    let key;
    try{key=createPublicKey(item.publicKeySpkiPem);}catch{
      error("PRIVATE_TRUST_KEY_INVALID");
    }
    if(key.asymmetricKeyType!=="ed25519")error("PRIVATE_TRUST_KEY_NOT_ED25519");
    const fingerprint=key.export({type:"spki",format:"der"}).toString("hex");
    if(publicKeys.has(fingerprint))error("PRIVATE_TRUST_KEY_REUSED");
    refs.add(item.reviewerRef);publicKeys.add(fingerprint);
    registry.set(item.reviewerRef,{role:item.role,key});
  }
  return registry;
}
export function verifySignedPrivateReviews(bankSha256,manifest,trust,now=new Date()){
  if(!SHA.test(bankSha256)||!Number.isFinite(now.getTime()))
    error("PRIVATE_SIGNED_REVIEW_CONTEXT_INVALID");
  const registry=reviewerRegistry(trust);
  if(!exact(manifest,["kind","bankSha256","reviews"])||
     manifest.kind!==SCHEMA||!SHA.test(manifest.bankSha256)||
     !Array.isArray(manifest.reviews)||manifest.reviews.length!==3)
    error("PRIVATE_SIGNED_REVIEW_MANIFEST_INVALID");
  if(bankSha256!==manifest.bankSha256)
    error("PRIVATE_SIGNED_REVIEW_BANK_CHANGED");
  const roles=new Set(),refs=new Set();
  let needsRevision=false;
  for(const signed of manifest.reviews){
    if(!exact(signed,["entry","signature"])||
       !SIGNATURE.test(signed.signature))
      error("PRIVATE_SIGNED_REVIEW_SIGNATURE_INVALID");
    const entry=signed.entry;validEntry(entry,now);
    if(entry.bankSha256!==bankSha256)error("PRIVATE_SIGNED_REVIEW_BANK_CHANGED");
    const authorized=registry.get(entry.reviewerRef);
    if(!authorized||authorized.role!==entry.role)
      error("PRIVATE_SIGNED_REVIEW_UNTRUSTED_REVIEWER");
    if(refs.has(entry.reviewerRef)||roles.has(entry.role))
      error("PRIVATE_SIGNED_REVIEW_ROLES_NOT_INDEPENDENT");
    refs.add(entry.reviewerRef);roles.add(entry.role);
    let actual;
    try{actual=Buffer.from(signed.signature,"base64url");}catch{
      error("PRIVATE_SIGNED_REVIEW_SIGNATURE_INVALID");
    }
    if(actual.length!==64||
       actual.toString("base64url")!==signed.signature||
       !verify(null,signedReviewMessage(entry),authorized.key,actual))
      error("PRIVATE_SIGNED_REVIEW_SIGNATURE_INVALID");
    if(entry.decision!=="pass"||CHECKS.some(k=>entry.checks[k]!=="pass"))
      needsRevision=true;
  }
  if(ROLES.some(role=>!roles.has(role)))
    error("PRIVATE_SIGNED_REVIEW_ROLES_REQUIRED");
  return {
    auditVersion:"private-signed-review-v1",bankSha256,
    cryptographicallyVerifiedReviews:refs.size,verifiedRoles:[...ROLES],
    evidenceStatus:needsRevision?"REVISIONS_REQUIRED":
      "SIGNED_DECLARATIONS_VERIFIED",
    releaseGate:"BLOCKED_UNTIL_REAL_CALIBRATION_AND_AUTHORIZED_RELEASE",
    warning:"Ed25519 signatures verify that three trusted private keys signed statements about exact bank bytes. This does NOT verify the reviewers' real-world identities, truth of their judgments, content rights, psychometric validity or permission to publish. Trust registry custody and private-key controls are essential."
  };
}
export function signPrivateReview(entry,privatePem,now=new Date()){
  validEntry(entry,now);
  if(typeof privatePem!=="string"||privatePem.length>10000)
    error("PRIVATE_SIGNER_KEY_INVALID");
  let key;
  try{key=createPrivateKey(privatePem);}catch{
    error("PRIVATE_SIGNER_KEY_INVALID");
  }
  if(key.asymmetricKeyType!=="ed25519")
    error("PRIVATE_SIGNER_KEY_NOT_ED25519");
  return {entry,signature:sign(null,signedReviewMessage(entry),key).toString("base64url")};
}
async function privateRead(path,limit=MAX_BYTES){
  if(typeof path!=="string"||!repositoryPathAllowed(path))
    error("PRIVATE_SIGNED_REVIEW_FILE_MUST_BE_OUTSIDE_GIT");
  const canonical=await realpath(path);
  if(!repositoryPathAllowed(canonical))
    error("PRIVATE_SIGNED_REVIEW_FILE_MUST_BE_OUTSIDE_GIT");
  const info=await stat(canonical);
  if(!info.isFile()||info.size>limit||info.size<10)
    error("PRIVATE_SIGNED_REVIEW_FILE_SIZE_INVALID");
  const bytes=await readFile(canonical);
  if(bytes.length!==info.size)error("PRIVATE_SIGNED_REVIEW_FILE_CHANGED");
  return bytes;
}
async function privateJson(path){
  try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(await privateRead(path)));}
  catch(err){if(String(err?.message).startsWith("PRIVATE_"))throw err;
    error("PRIVATE_SIGNED_REVIEW_JSON_INVALID");}
}
export async function verifySignedPrivateReviewFiles(bankPath,manifestPath,trustPath,now=new Date()){
  const bank=await auditPrivateResearchBankFile(bankPath);
  const manifest=await privateJson(manifestPath);
  const trust=await privateJson(trustPath);
  return {bankItemCount:bank.itemCount,
    ...verifySignedPrivateReviews(bank.sourceSha256,manifest,trust,now)};
}
async function main(args){
  if(args.length===7&&args[0]==="--verify"&&args[1]==="--bank"&&
     args[3]==="--reviews"&&args[5]==="--trust"){
    const value=await verifySignedPrivateReviewFiles(args[2],args[4],args[6]);
    process.stdout.write(JSON.stringify(value,null,2)+"\n");
    return;
  }
  if(args.length===7&&args[0]==="--sign"&&args[1]==="--entry"&&
     args[3]==="--key"&&args[5]==="--output"){
    const entry=await privateJson(args[2]);
    const keyBytes=await privateRead(args[4],10000);
    if(!repositoryPathAllowed(args[6]))error("PRIVATE_SIGNED_REVIEW_FILE_MUST_BE_OUTSIDE_GIT");
    const parent=await realpath(dirname(resolve(args[6])));
    if(!repositoryPathAllowed(parent))error("PRIVATE_SIGNED_REVIEW_FILE_MUST_BE_OUTSIDE_GIT");
    const result=signPrivateReview(entry,keyBytes.toString("utf8"));
    // No overwrite of an existing signed review, and owner-only mode on POSIX.
    await writeFile(args[6],JSON.stringify(result,null,2)+"\n",
      {encoding:"utf8",flag:"wx",mode:0o600});
    process.stdout.write("PRIVATE_SIGNED_REVIEW_CREATED\n");
    return;
  }
  error("PRIVATE_SIGNED_REVIEW_USAGE_INVALID");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2)).catch(err=>{
    // Never allow filesystem errors to disclose private absolute filenames.
    const msg=typeof err?.message==="string"?err.message:"";
    const code=/^PRIVATE_[A-Z0-9_]+$/.test(msg)?msg:
      "PRIVATE_SIGNED_REVIEW_OPERATION_FAILED";
    process.stderr.write(code+"\n");process.exitCode=1;
  });
