import {createHash} from "node:crypto";

/** Deterministic JSON content fingerprint for a published task definition.
 * Protects historical scoring against accidental in-place bank edits even
 * when the task author neglects to increment a version. Not a signature:
 * a malicious DB administrator can replace both task and attempt evidence.
 */
function normalize(value:unknown,depth=0):unknown {
  if(depth>32)throw new RangeError("TASK_CONTENT_TOO_DEEP");
  if(value===null||typeof value==="boolean"||typeof value==="string")return value;
  if(typeof value==="number"){
    if(!Number.isFinite(value))throw new RangeError("INVALID_TASK_NUMBER");
    return value;
  }
  if(Array.isArray(value))return value.map(x=>normalize(x,depth+1));
  if(typeof value==="object"&&value!==null){
    const result:Record<string,unknown>={};
    for(const key of Object.keys(value).sort()){
      if(key==="__proto__"||key==="constructor"||key==="prototype")
        throw new RangeError("RESERVED_TASK_KEY");
      const child=(value as Record<string,unknown>)[key];
      if(child===undefined)throw new RangeError("UNSERIALIZABLE_TASK_KEY");
      result[key]=normalize(child,depth+1);
    }
    return result;
  }
  throw new RangeError("INVALID_TASK_CONTENT");
}
export function taskContentDigest(content:unknown):string {
  const raw=JSON.stringify(normalize(content));
  if(raw.length>24000)throw new RangeError("TASK_CONTENT_TOO_LARGE");
  return createHash("sha256").update(raw,"utf8").digest("hex");
}
export type TaskIntegrityStatus="verified"|"legacy_unverified"|"mismatch";
/** A missing fingerprint is an old record, not automatically a forgery. */
export function verifyTaskAttemptEvidence(input:{
  taskVersion:string;attemptVersion:string;content:unknown;evidence:unknown
}):TaskIntegrityStatus{
  if(input.taskVersion!==input.attemptVersion)return "mismatch";
  const evidence=input.evidence;
  if(!evidence||typeof evidence!=="object"||Array.isArray(evidence))return "legacy_unverified";
  const digest=(evidence as Record<string,unknown>).taskContentSha256;
  if(digest===undefined)return "legacy_unverified";
  if(typeof digest!=="string"||!/^[0-9a-f]{64}$/.test(digest))return "mismatch";
  return taskContentDigest(input.content)===digest?"verified":"mismatch";
}
