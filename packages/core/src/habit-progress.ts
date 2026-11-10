/**
 * StepMark visual growth indicator, policy v1. This 0-100 value is a user-facing
 * heuristic, NOT a probability of habit formation nor a validated SRBAI score.
 * Observed repetitions and automaticity are deliberately kept separate.
 */
export const HABIT_PROGRESS_POLICY_VERSION = "habit-progress-v1";
export type InitiationLevel = 0|1|2|3|4;
export type ReflectionSource = "self_report"|"ai_interpretation";
export interface InitiationEvidence {
  atMs:number;
  level:InitiationLevel;
  source:ReflectionSource;
  confidence:number; // for AI only; self-report is always retained as stated
}
export interface HabitProgressInput {
  completedRepetitions:number;
  eligibleOpportunities:number;
  completedOpportunities:number;
  observations:readonly InitiationEvidence[];
  nowMs:number;
  lastCompletedAtMs?:number|null;
  seed?:string;
  reviewEnabled?:boolean;
}
export type HabitStage = "collecting_evidence"|"developing"|"maintaining"|"review_due";
export interface HabitProgress {
  policyVersion:typeof HABIT_PROGRESS_POLICY_VERSION;
  progress:number;
  repetitionSignal:number;
  automaticitySignal:number|null;
  evidenceLevel:"insufficient"|"limited"|"moderate"|"repeated";
  stage:HabitStage;
  completedRepetitions:number;
  evidenceCount:number;
  evidenceSpanDays:number;
  mostRecentAutomaticity:number|null;
  reviewDue:boolean;
  nextReviewAt:string|null;
  note:string;
}
const DAY=24*60*60*1000;
const levelStrength:Record<InitiationLevel,number>={0:0,1:15,2:35,3:70,4:100};
function between(value:number,min:number,max:number):number {
  return Math.max(min,Math.min(max,value));
}
/** A deterministic, reproducible jitter of {-2,-1,0,1,2} days. */
function reviewJitter(seed:string):number {
  let acc=0;
  for(let i=0;i<seed.length;i++)acc=(acc*31+seed.charCodeAt(i))>>>0;
  return acc%5-2;
}
export function calculateHabitProgress(input:HabitProgressInput):HabitProgress {
  const {completedRepetitions,eligibleOpportunities,completedOpportunities,nowMs}=input;
  if (![completedRepetitions,eligibleOpportunities,completedOpportunities].every(Number.isSafeInteger) ||
      completedRepetitions<0 || eligibleOpportunities<0 ||
      completedOpportunities<0 || completedOpportunities>eligibleOpportunities ||
      completedRepetitions!==completedOpportunities || !Number.isFinite(nowMs) ||
      input.observations.length>500 ||
      (input.lastCompletedAtMs!=null && (!Number.isFinite(input.lastCompletedAtMs) || input.lastCompletedAtMs>nowMs+5*60*1000))) {
    throw new RangeError("invalid habit progress inputs");
  }
  // Curated event-level subjective observations, at most one per calendar day.
  // Intra-day repeated feedback must not inflate confidence.
  const observations=[...input.observations].sort((a,b)=>b.atMs-a.atMs);
  const unique:InitiationEvidence[]=[];
  const dates=new Set<string>();
  for(const o of observations){
    if (!Number.isFinite(o.atMs) || o.atMs>nowMs+5*60*1000 || o.atMs<0 ||
        !Number.isInteger(o.level) || o.level<0 || o.level>4 ||
        !Number.isFinite(o.confidence) || o.confidence<0 || o.confidence>1 ||
        (o.source!=="self_report" && o.source!=="ai_interpretation")) {
      throw new RangeError("invalid subjective evidence");
    }
    if (o.source==="ai_interpretation" && o.confidence<0.65)continue;
    const key=new Date(o.atMs).toISOString().slice(0,10);
    if(dates.has(key))continue;
    dates.add(key);
    unique.push(o);
    if(unique.length>=12)break;
  }
  const n=completedRepetitions;
  const repetitionSignal=100*(-Math.expm1(-n/55)); // demo shape, NOT a norm
  const recent=unique.filter(x=>nowMs-x.atMs<=90*DAY);
  const count=recent.length;
  const oldest=count?recent[count-1]!.atMs:null;
  const span=count>1 ? (recent[0]!.atMs-oldest!)/DAY : 0;
  let automaticitySignal:number|null=null;
  if(count){
    let weighted=0,weights=0;
    for(const o of recent){
      const ageDays=Math.max(0,(nowMs-o.atMs)/DAY);
      const weight=Math.pow(0.5,ageDays/35)*(o.source==="self_report"?1:between(o.confidence,0.65,1)*0.8);
      weighted+=levelStrength[o.level]*weight;
      weights+=weight;
    }
    automaticitySignal=weighted/weights;
  }
  // Without subjective evidence, repetition cannot exceed 45/100, no matter how often repeated.
  // One report: cap 65; two temporally separated reports: cap 80.
  const cap=count===0?45:count===1?65:count===2?80:span>=14?96:85;
  const raw=0.45*repetitionSignal+0.55*(automaticitySignal??0);
  const progress=Number(between(raw,0,cap).toFixed(1));
  const evidenceLevel=count===0?"insufficient":count===1?"limited":count===2||span<14?"moderate":"repeated";
  const latest=recent[0];
  const lastRating=latest?levelStrength[latest.level]:null;
  const stable=evidenceLevel==="repeated" && n>=20 && progress>=80 &&
    lastRating!==null && lastRating>=70;
  const lastAnchor=latest?.atMs??input.lastCompletedAtMs??null;
  const baseInterval=stable?28:count>=2?14:7;
  const interval=Math.max(5,baseInterval+(stable?reviewJitter(input.seed??""):0));
  const nextReviewMs=lastAnchor===null?null:lastAnchor+interval*DAY;
  const due=input.reviewEnabled!==false && nextReviewMs!==null && nowMs>=nextReviewMs;
  const stage:HabitStage=due?"review_due":stable?"maintaining":
    count===0?"collecting_evidence":"developing";
  return {
    policyVersion:HABIT_PROGRESS_POLICY_VERSION,
    progress,repetitionSignal:Number(repetitionSignal.toFixed(1)),
    automaticitySignal:automaticitySignal===null?null:Number(automaticitySignal.toFixed(1)),
    evidenceLevel,stage,completedRepetitions:n,evidenceCount:count,
    evidenceSpanDays:Number(span.toFixed(1)),mostRecentAutomaticity:lastRating,
    reviewDue:due,nextReviewAt:input.reviewEnabled===false||nextReviewMs===null?null:new Date(nextReviewMs).toISOString(),
    note:"Progress is a configurable visual indicator, not probability of habit formation; changes in ability require independent tests."
  };
}
