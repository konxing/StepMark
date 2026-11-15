/**
 * Assessment confidentiality projection, including the explicit personal
 * export API. A partial independent form must not leak correctness through
 * score history, a per-attempt evidence JSON, or a private export.
 * The owner's selected answer and submission time are preserved.
 */
export function projectDeferredAssessment<T extends {
  rawScore:number|null;
  evidence:unknown;
  task:{formCode:string|null;version:string};
  taskVersion:string;
}>(attempt:T,released:boolean){
  const {task,...publicFields}=attempt;
  if(released)return {...publicFields,scoreDeferred:false};
  const raw=attempt.evidence;
  // Do not include unknown scoring keys on unfinished form exports.
  const selectedKey=typeof raw==="object"&&raw!==null&&!Array.isArray(raw)&&
    typeof (raw as Record<string,unknown>).selectedKey==="string"?
      (raw as Record<string,unknown>).selectedKey:null;
  return {...publicFields,rawScore:null,
    evidence:{selectedKey},scoreDeferred:true};
}
