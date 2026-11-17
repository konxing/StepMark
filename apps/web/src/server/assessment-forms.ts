import {getDb} from "./db";
import {verifyTaskAttemptEvidence} from "./assessment-integrity";
import {describePublicReasoningEvidence,type ObservedForm,
  type FormEvidenceStatus,type ItemIntegrity} from "@stepmark/core";

/**
 * Original, independent, deliberately UNCALIBRATED short forms.
 * The matched domain blueprint does not establish psychometric equivalence.
 */
export const LOGIC_FORMS=[
  {code:"logic-a-v1",title:"逻辑推理 A 卷 · 初测",phase:"baseline"},
  {code:"logic-b-v1",title:"逻辑推理 B 卷 · 复测",phase:"followup"}
] as const;
export const FORM_SIZE=6;
export const RETEST_WAIT_DAYS=7;
export const SKILLS=[
  {code:"conditional",label:"条件推理"},
  {code:"evidence",label:"论证与证据"},
  {code:"quantitative",label:"数量与比例"}
] as const;
const WAIT_MS=RETEST_WAIT_DAYS*86400000;

export function isLogicFormCode(value:string):boolean {
  return LOGIC_FORMS.some(form=>form.code===value);
}

/**
 * Two indexed, owner-scoped database reads; completed forms have detailed
 * answer review, unfinished forms never disclose their correct answers.
 */
export async function getLogicFormOverview(userId:string,now=new Date()){
  const db=getDb();
  const tasks=await db.task.findMany({
    where:{constructCode:"reasoning.logic",formCode:{in:LOGIC_FORMS.map(f=>f.code)},
      publishedAt:{lte:now}},
    orderBy:[{formOrder:"asc"},{id:"asc"}],
    select:{id:true,formCode:true,skillCode:true,formOrder:true,version:true,content:true}
  });
  const attempts=await db.assessmentAttempt.findMany({
    where:{userId,taskId:{in:tasks.map(t=>t.id)}},
    select:{taskId:true,taskVersion:true,rawScore:true,evidence:true,createdAt:true}
  });
  const attemptById=new Map(attempts.map(a=>[a.taskId,a]));
  const forms=LOGIC_FORMS.map((form,index)=>{
    const items=tasks.filter(t=>t.formCode===form.code);
    const validBank=items.length===FORM_SIZE &&
      items.every((t,i)=>t.formOrder===i+1 && t.version==="logic-form-1") &&
      SKILLS.every(s=>items.filter(t=>t.skillCode===s.code).length===2);
    const done=items.filter(t=>attemptById.has(t.id));
    // Old attempts cannot be silently re-scored against a replaced form item.
    // A form with mismatched attempt versions is unavailable until reviewed,
    // not "completed" with potentially contradictory answer explanations.
    const integrity=done.map(t=>verifyTaskAttemptEvidence({
      taskVersion:t.version,attemptVersion:attemptById.get(t.id)!.taskVersion,
      content:t.content,evidence:attemptById.get(t.id)!.evidence
    }));
    const attemptVersionsValid=integrity.every(x=>x!=="mismatch");
    const legacyAttemptCount=integrity.filter(x=>x==="legacy_unverified").length;
    const trustworthyBank=validBank&&attemptVersionsValid;
    const complete=trustworthyBank && done.length===FORM_SIZE;
    const completedAt=complete?new Date(Math.max(...done.map(t=>
      attemptById.get(t.id)!.createdAt.getTime()))).toISOString():null;
    const previous=index===0?null:LOGIC_FORMS[index-1];
    const previousItems=previous?tasks.filter(t=>t.formCode===previous.code):[];
    const previousDone=previousItems.filter(t=>attemptById.has(t.id));
    const previousValid=previousItems.length===FORM_SIZE &&
      previousItems.every((t,i)=>t.formOrder===i+1&&t.version==="logic-form-1" &&
        (!attemptById.has(t.id)||verifyTaskAttemptEvidence({
          taskVersion:t.version,attemptVersion:attemptById.get(t.id)!.taskVersion,
          content:t.content,evidence:attemptById.get(t.id)!.evidence
        })!=="mismatch")) &&
      SKILLS.every(s=>previousItems.filter(t=>t.skillCode===s.code).length===2);
    const lastPrevious=previousDone.length===FORM_SIZE && previousValid?
      Math.max(...previousDone.map(t=>attemptById.get(t.id)!.createdAt.getTime())):null;
    const readyAt=lastPrevious===null?null:new Date(lastPrevious+WAIT_MS).toISOString();
    const unlocked=index===0 || (readyAt!==null && now.getTime()>=new Date(readyAt).getTime());
    const status:FormEvidenceStatus=!trustworthyBank?"unavailable":complete?"completed":
      done.length>0?"in_progress":unlocked?"ready":"locked";
    const integrityStatus:ItemIntegrity=!attemptVersionsValid?"mismatch":
      legacyAttemptCount>0?"legacy_unverified":"verified";
    const correct=complete?done.filter(t=>attemptById.get(t.id)!.rawScore===100).length:null;
    const dimensions=SKILLS.map(skill=>{
      const domainItems=items.filter(t=>t.skillCode===skill.code);
      return {code:skill.code,label:skill.label,total:domainItems.length,
        attempted:domainItems.filter(t=>attemptById.has(t.id)).length,
        correct:complete?domainItems.filter(t=>attemptById.get(t.id)?.rawScore===100).length:null};
    });
    const reviews=complete?items.map(t=>{
      const a=attemptById.get(t.id)!;
      const contents=t.content as {prompt?:unknown;correctKey?:unknown;explanation?:unknown};
      const evidence=a.evidence as {selectedKey?:unknown};
      return {taskId:t.id,taskVersion:a.taskVersion,skillCode:t.skillCode,
        prompt:typeof contents.prompt==="string"?contents.prompt:"",
        selectedKey:typeof evidence.selectedKey==="string"?evidence.selectedKey:null,
        correctKey:typeof contents.correctKey==="string"?contents.correctKey:null,
        explanation:typeof contents.explanation==="string"?contents.explanation:"",
        correct:a.rawScore===100};
    }):[];
    return {code:form.code,title:form.title,phase:form.phase,status,total:trustworthyBank?FORM_SIZE:0,
      integrityStatus,
      legacyAttemptCount,
      attempted:done.length,correct,completedAt,availableAt:status==="locked"?readyAt:null,
      dimensions,reviews};
  });
  const first=forms[0]!,second=forms[1]!;
  const comparison=first.status==="completed" && second.status==="completed" && 
    first.correct!==null && second.correct!==null ?{
      baselineCorrect:first.correct,retestCorrect:second.correct,total:FORM_SIZE,
      rawDifferencePoints:Math.round(100*(second.correct-first.correct)/FORM_SIZE),
      daysApart:Math.round((new Date(second.completedAt!).getTime()-
        new Date(first.completedAt!).getTime())/WAIT_MS*RETEST_WAIT_DAYS*10)/10
    }:null;
  const practiceAttemptsBetweenForms=comparison?await db.practiceAttempt.count({
    where:{userId,createdAt:{
      gt:new Date(first.completedAt!),lt:new Date(second.completedAt!)
    }}
  }):null;
  // Evidence-grade projection is derived ONLY from tenant-scoped, already
  // visibility-filtered form summaries. No raw answers, AI, habit, practice,
  // AbilityEstimate or unpublished Task data enter the ability layer.
  const observed:ObservedForm[]=forms.map(form=>({
    code:form.code,status:form.status,total:FORM_SIZE,attempted:form.attempted,
    correct:form.status==="completed"?form.correct:null,
    completedAt:form.status==="completed"?form.completedAt:null,
    integrityStatus:form.integrityStatus
  }));
  const measurementEvidence=describePublicReasoningEvidence(observed);
  return {construct:"reasoning.logic",forms,measurementEvidence,
    comparison:comparison?{...comparison,practiceAttemptsBetweenForms}:null,
    interpretation:"Raw independent-form performance only. Forms are not equated, " +
      "item counts are small, and a higher result is not validated ability growth. " +
      "New submissions have canonical content fingerprints; earlier records without them remain unverified legacy evidence."};
}
