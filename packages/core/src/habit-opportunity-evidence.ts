import {auditAdherenceSensitivity,type AdherenceSensitivityAudit} from "./adherence-sensitivity.ts";
/**
 * Research-grade opportunity semantics for habit formation.
 *
 * Explicit true/false/unknown values preserve absence of reporting. This
 * intentionally does NOT estimate automaticity, formation probability, or
 * replace habit-progress-v1. AI-parsed statements remain separately marked
 * provisional and cannot silently become self-report ground truth.
 */
export type TriState = true | false | null;
export type HabitOpportunityInitiationLevel = 0|1|2|3|4;
export type EvidenceOrigin = "user_explicit" | "ai_interpretation";
export interface HabitOpportunityEvidence {
  opportunityKey: string;
  occurredAtMs: number;
  /** Was the nominated context cue encountered? This is NOT eligibility. */
  cueEncountered: TriState;
  /** Did an opportunity for the target behavior exist? */
  eligibleOpportunity: TriState;
  /** Was the target action performed? This is NOT equivalent to automaticity. */
  performed: TriState;
  /** Person-rated automaticity of starting action. Missing != zero. */
  initiationAutomaticity: HabitOpportunityInitiationLevel|null;
  source: EvidenceOrigin;
  /**
   * Required for AI interpreted evidence: extract quote tied to an existing
   * user message, without implicitly treating it as a verified scale answer.
   */
  userMessageId?:string|null;
  supportingQuote?:string|null;
}
export interface HabitOpportunityEvidenceAudit {
  version:"habit-opportunity-evidence-v1";
  events:number;
  confirmedUserEvents:number;
  provisionalAiEvents:number;
  confirmedEligibleOpportunities:number;
  performedEligible:number;
  missedEligible:number;
  eligibleButPerformanceUnknown:number;
  eligibilityUnknown:number;
  explicitlyNoOpportunity:number;
  cueEncountered:number;
  cueNotEncountered:number;
  cueUnknown:number;
  /** User's direct ratings only, not automatically inferred AI scores. */
  directAutomaticityRatings:number;
  /** Newest explicitly rated initiation level; null means unobserved. */
  latestDirectInitiationLevel:HabitOpportunityInitiationLevel|null;
  /** Descriptive only: null if no known eligible behavior outcomes. */
  observedAdherence:number|null;
  /** Research-only conservative missingness bounds, not a confidence interval. */
  adherenceSensitivity:AdherenceSensitivityAudit;
  note:string;
}
const isTri=(x:unknown):x is TriState=> x===true || x===false || x===null;
const isRating=(x:unknown):x is HabitOpportunityInitiationLevel|null=>x===null ||
 (typeof x==="number" && Number.isInteger(x) && x>=0 && x<=4);
/** All records refer to a single habit within one owner's isolated collection. */
export function auditHabitOpportunities(
  events:readonly HabitOpportunityEvidence[]
):HabitOpportunityEvidenceAudit {
  if(events.length>10000)throw new RangeError("too many recorded opportunities");
  const keys=new Set<string>();
  let confirmedUserEvents=0,provisionalAiEvents=0;
  let confirmedEligibleOpportunities=0,performedEligible=0,missedEligible=0;
  let eligibleButPerformanceUnknown=0,eligibilityUnknown=0,explicitlyNoOpportunity=0;
  let cueEncountered=0,cueNotEncountered=0,cueUnknown=0;
  let directAutomaticityRatings=0;
  let lastRating:-1|HabitOpportunityInitiationLevel=-1,lastRatingTime=-Infinity;
  for(const r of events){
    if(typeof r.opportunityKey!=="string" || r.opportunityKey.length>128 ||
      !/^[A-Za-z0-9_.:-]{1,128}$/.test(r.opportunityKey) ||
      keys.has(r.opportunityKey))throw new RangeError("invalid or repeated opportunity key");
    keys.add(r.opportunityKey);
    if(!Number.isFinite(r.occurredAtMs) || r.occurredAtMs<0 ||
       !isTri(r.cueEncountered) || !isTri(r.eligibleOpportunity) ||
       !isTri(r.performed) || !isRating(r.initiationAutomaticity) ||
       (r.source!=="user_explicit" && r.source!=="ai_interpretation"))
      throw new RangeError("invalid cue, opportunity, performance or rating");
    if(r.eligibleOpportunity===false && r.performed===true)
      throw new RangeError("performed action contradicts explicitly absent eligible opportunity");
    if(r.initiationAutomaticity!==null && r.performed!==true)
      throw new RangeError("event-level automaticity rating requires observed performed action");
    if(r.source==="ai_interpretation"){
      if(typeof r.userMessageId!=="string" || !/^[A-Za-z0-9_.:-]{1,128}$/.test(r.userMessageId) ||
         typeof r.supportingQuote!=="string" ||
         r.supportingQuote.trim().length<3 || r.supportingQuote.length>500)
        throw new RangeError("AI interpretation needs linked user evidence");
      provisionalAiEvents++;
      // Preserve pending candidate interpretation separately. Nothing learned
      // from AI-only records is counted as a confirmed user observation.
      continue;
    }
    confirmedUserEvents++;
    if(r.cueEncountered===true)cueEncountered++;
    else if(r.cueEncountered===false)cueNotEncountered++;
    else cueUnknown++;
    if(r.eligibleOpportunity===true){
      confirmedEligibleOpportunities++;
      if(r.performed===true)performedEligible++;
      else if(r.performed===false)missedEligible++;
      else eligibleButPerformanceUnknown++;
    }else if(r.eligibleOpportunity===false){
      explicitlyNoOpportunity++;
    }else{
      eligibilityUnknown++;
    }
    if(r.initiationAutomaticity!==null){
      directAutomaticityRatings++;
      if(r.occurredAtMs>=lastRatingTime){
        lastRating=r.initiationAutomaticity;
        lastRatingTime=r.occurredAtMs;
      }
    }
  }
  const sensitivity=auditAdherenceSensitivity({performedEligible,missedEligible,
    eligibleButPerformanceUnknown,eligibilityUnknown});
  const known=performedEligible+missedEligible;
  return {
    version:"habit-opportunity-evidence-v1",events:events.length,
    confirmedUserEvents,provisionalAiEvents,
    confirmedEligibleOpportunities,performedEligible,missedEligible,
    eligibleButPerformanceUnknown,eligibilityUnknown,explicitlyNoOpportunity,
    cueEncountered,cueNotEncountered,cueUnknown,
    directAutomaticityRatings,latestDirectInitiationLevel:lastRating===-1?null:lastRating,
    observedAdherence:known?Number((performedEligible/known).toFixed(6)):null,
    adherenceSensitivity:sensitivity,
    note:"Descriptive, eligible-and-observed events only. AI interpretations and absent reports do not count as missed performance or zero automaticity. No validated habit-formation probability is computed."
  };
}
