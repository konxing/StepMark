/**
 * StepMark Measurement Evidence Engine v1.
 *
 * Distinguishes descriptive task performance from calibrated person ability.
 * No code in this module can approve publication or fabricate norms.
 * Its model-based reliable change estimate is research-only and conditional
 * on independently validated linking/retest/practice-error assumptions.
 */
export type EvidenceGrade="E0"|"E1"|"E2"|"E3"|"E4"|"E5"|"E6";
export type FormEvidenceStatus="ready"|"in_progress"|"locked"|"unavailable"|"completed";
export type ItemIntegrity="verified"|"legacy_unverified"|"mismatch";
export interface ObservedForm {
  code:string;
  status:FormEvidenceStatus;
  total:number;
  attempted:number;
  correct:number|null;
  completedAt:string|null;
  integrityStatus:ItemIntegrity;
}
export type MeasurementBlockReason=
  "NO_COMPLETE_FORM"|"PUBLIC_ANSWERS_EXPOSED"|"ITEM_BANK_NOT_CALIBRATED"|
  "FORM_EQUIVALENCE_UNVERIFIED"|"RETEST_RELIABILITY_UNVERIFIED"|
  "PRACTICE_EFFECT_UNVERIFIED"|"LONGITUDINAL_INVARIANCE_UNVERIFIED"|
  "NO_MATCHED_NORMS"|"SHORT_UNCALIBRATED_FORMS"|
  "LEGACY_UNVERIFIED_ANSWERS"|"TASK_CONTENT_MISMATCH";
export interface ObservationEvidence {
  code:string;
  status:FormEvidenceStatus;
  itemsAttempted:number;
  itemsCorrect:number|null;
  totalItems:number;
  observedAt:string|null;
  sourceIntegrity:ItemIntegrity;
}
export interface MeasurementEvidenceReport {
  policyVersion:"measurement-evidence-v1";
  constructCode:"reasoning.logic";
  evidenceGrade:"E0";
  evidenceGradeLabel:"原始任务表现，不是潜在能力";
  observations:ObservationEvidence[];
  verifiedCompletedItems:number;
  rawComparison:{firstForm:string;secondForm:string;rawDifferencePoints:number}|null;
  ability:{
    status:"not_estimated";
    theta:null;standardError:null;measurementInterval95:null;
    populationPercentile:null;compositeAbility:null;
  };
  change:{
    status:"insufficient_evidence";
    reliableChange:null;mdc95:null;practiceAdjustedDelta:null;
    message:string;
  };
  blockedBy:MeasurementBlockReason[];
  sourcePolicy:{
    uncalibratedObjectiveTasks:"descriptive_only";
    practiceTasks:"excluded_from_ability";
    habitCheckins:"excluded_from_ability";
    aiChatJudgements:"excluded_from_ability";
    subjectiveState:"context_only";
  };
}
const isValidDate=(value:string|null):boolean=>
  value!==null&&Number.isFinite(Date.parse(value))&&
  /^\d{4}-\d{2}-\d{2}T/.test(value);
function checkForm(input:ObservedForm):void{
  if(!input||!/^[a-z0-9-]{3,60}$/.test(input.code)||
     !["ready","in_progress","locked","unavailable","completed"].includes(input.status)||
     !["verified","legacy_unverified","mismatch"].includes(input.integrityStatus)||
     !Number.isSafeInteger(input.attempted)||input.attempted<0||
     !Number.isSafeInteger(input.total)||input.total<0||input.total>500||
     input.attempted>input.total)
    throw new RangeError("invalid observed form metadata");
  if(input.status==="completed"){
    if(input.total===0||input.attempted!==input.total||
       !Number.isSafeInteger(input.correct)||input.correct!<0||
       input.correct!>input.total||!isValidDate(input.completedAt)||
       input.integrityStatus==="mismatch")
      throw new RangeError("invalid completed form: unavailable correctness or content");
  }else if(input.correct!==null||input.completedAt!==null){
    // Critical: never reveal provisional accuracy through an E0 projection.
    throw new RangeError("incomplete form must not disclose correctness or completion time");
  }
}
/**
 * Current PUBLIC A/B demo is intentionally pinned at E0 regardless of how
 * good its raw score looks. Neither AI/habits nor legacy AbilityEstimate
 * rows are accepted as calibrated cognitive evidence.
 */
export function describePublicReasoningEvidence(forms:readonly ObservedForm[]):MeasurementEvidenceReport {
  if(forms.length!==2||forms[0]?.code!=="logic-a-v1"||
     forms[1]?.code!=="logic-b-v1")throw new RangeError("expected current A/B demonstration forms");
  for(const f of forms)checkForm(f);
  const first=forms[0]!,second=forms[1]!;
  const completed=forms.filter(f=>f.status==="completed");
  const problems:MeasurementBlockReason[]=[
    "PUBLIC_ANSWERS_EXPOSED","ITEM_BANK_NOT_CALIBRATED",
    "FORM_EQUIVALENCE_UNVERIFIED","RETEST_RELIABILITY_UNVERIFIED",
    "PRACTICE_EFFECT_UNVERIFIED","LONGITUDINAL_INVARIANCE_UNVERIFIED",
    "NO_MATCHED_NORMS","SHORT_UNCALIBRATED_FORMS"
  ];
  if(!completed.length)problems.unshift("NO_COMPLETE_FORM");
  if(completed.some(f=>f.integrityStatus==="legacy_unverified"))
    problems.push("LEGACY_UNVERIFIED_ANSWERS");
  if(forms.some(f=>f.integrityStatus==="mismatch"))
    problems.push("TASK_CONTENT_MISMATCH");
  return {
    policyVersion:"measurement-evidence-v1",
    constructCode:"reasoning.logic",
    evidenceGrade:"E0",
    evidenceGradeLabel:"原始任务表现，不是潜在能力",
    observations:forms.map(f=>({
      code:f.code,status:f.status,itemsAttempted:f.attempted,
      itemsCorrect:f.status==="completed"?f.correct:null,
      totalItems:f.total,observedAt:f.status==="completed"?f.completedAt:null,
      sourceIntegrity:f.integrityStatus
    })),
    verifiedCompletedItems:completed.filter(f=>f.integrityStatus==="verified")
      .reduce((sum,f)=>sum+f.total,0),
    rawComparison:completed.length===2?{
      firstForm:first.code,secondForm:second.code,
      rawDifferencePoints:Math.round(100*(second.correct!-first.correct!)/first.total)
    }:null,
    ability:{status:"not_estimated",theta:null,standardError:null,
      measurementInterval95:null,populationPercentile:null,compositeAbility:null},
    change:{
      status:"insufficient_evidence",reliableChange:null,
      mdc95:null,practiceAdjustedDelta:null,
      message:"当前只有公开演示卷的原始表现；缺少独立题库校准、跨卷等值、练习效应及测量误差证据，不能判断能力是否真正提升。"
    },
    blockedBy:problems,
    sourcePolicy:{
      uncalibratedObjectiveTasks:"descriptive_only",
      practiceTasks:"excluded_from_ability",
      habitCheckins:"excluded_from_ability",
      aiChatJudgements:"excluded_from_ability",
      subjectiveState:"context_only"
    }
  };
}
export interface ResearchMeasurement {
  measuredAtMs:number;
  theta:number;
  standardError:number;
  itemCount:number;
  constructCode:string;
  scaleVersion:string;
  calibrationVersion:string;
  formCode:string;
}
export interface ResearchLinkingAndChangeEvidence {
  constructCode:string;
  scaleVersion:string;
  calibrationVersion:string;
  sourceSha256:string;
  linkedFormCodes:readonly [string,string];
  /** True only after independent empirical equating/invariance checks. */
  independentEquatingValidated:boolean;
  independentRetestValidated:boolean;
  longitudinalInvarianceValidated:boolean;
  independentPracticeModelValidated:boolean;
  independentErrorsJustified:boolean;
  calibrationHoldoutPeople:number;
  retestReliabilityLower95:number;
  /** Expected repeated-test score gain ON THE SAME theta scale. */
  expectedPracticeEffect:number;
  practiceEffectSE:number;
  linkingSE:number;
}
export interface ResearchReliableChange {
  status:"insufficient_evidence"|"model_detected_increase"|"model_detected_decrease";
  evidenceScope:"research_only_no_production_release";
  difference:number|null;
  practiceAdjustedDifference:number|null;
  differenceSE:number|null;
  minimumDetectableChange:number|null;
  intervalFamilywise95:readonly [number,number]|null;
  familywiseMethod:"bonferroni";
  plannedComparisons:number;
  reason:string;
}
const Z95_BONFERRONI:readonly number[]=[
  1.959963984540054,2.241402727604947,2.39397979981851,
  2.497705474412374,2.5758293035489004,2.6382572734761
];
const isSha=(x:string)=>/^[a-f0-9]{64}$/.test(x);
const validId=(x:string)=>/^[a-z0-9][a-z0-9_.-]{1,79}$/.test(x);
const finite=(x:number)=>Number.isFinite(x);
function validMeasurement(x:ResearchMeasurement):boolean {
  return x!==null && typeof x==="object"&&
    finite(x.measuredAtMs)&&Number.isSafeInteger(x.measuredAtMs)&&
    finite(x.theta)&&Math.abs(x.theta)<=10&&
    finite(x.standardError)&&x.standardError>0&&x.standardError<10&&
    Number.isSafeInteger(x.itemCount)&&x.itemCount>=1&&x.itemCount<=200&&
    validId(x.constructCode)&&validId(x.scaleVersion)&&
    validId(x.calibrationVersion)&&validId(x.formCode);
}
const blocked=(plannedComparisons:number,reason:string):ResearchReliableChange=>({
  status:"insufficient_evidence",evidenceScope:"research_only_no_production_release",
  difference:null,practiceAdjustedDifference:null,differenceSE:null,
  minimumDetectableChange:null,intervalFamilywise95:null,
  familywiseMethod:"bonferroni",plannedComparisons,reason
});
/**
 * Paired repeat-test model, ONLY where empirical evidence certifies comparability.
 *
 * D = theta2 - theta1 - expected practice effect.
 * SE(D) = sqrt(SE1^2 + SE2^2 + practiceSE^2 + linkingSE^2).
 * Independent errors and approximate normality are ASSUMPTIONS, not inferred
 * from point scores. Separate planned changes use Bonferroni FWER control.
 * The output is NOT automatically suitable for real-user interpretation.
 */
export function evaluateResearchReliableChange(
  baseline:ResearchMeasurement,
  followup:ResearchMeasurement,
  link:ResearchLinkingAndChangeEvidence|null,
  plannedComparisons:number
):ResearchReliableChange {
  if(!Number.isSafeInteger(plannedComparisons)||plannedComparisons<1||plannedComparisons>6)
    throw new RangeError("planned comparisons must be predeclared from 1 to 6");
  if(!validMeasurement(baseline)||!validMeasurement(followup))
    throw new RangeError("invalid measurement estimates");
  if(followup.measuredAtMs<=baseline.measuredAtMs)
    return blocked(plannedComparisons,"FOLLOWUP_NOT_AFTER_BASELINE");
  if(baseline.constructCode!==followup.constructCode)
    return blocked(plannedComparisons,"INCOMPATIBLE_CONSTRUCT");
  if(baseline.scaleVersion!==followup.scaleVersion||
     baseline.calibrationVersion!==followup.calibrationVersion)
    return blocked(plannedComparisons,"UNLINKED_SCALE_OR_CALIBRATION");
  if(!link)return blocked(plannedComparisons,"NO_INDEPENDENT_LINKING_OR_RETEST_EVIDENCE");
  if(!validId(link.constructCode)||!validId(link.scaleVersion)||
     !validId(link.calibrationVersion)||!isSha(link.sourceSha256)||
     !Array.isArray(link.linkedFormCodes)||link.linkedFormCodes.length!==2||
     !link.linkedFormCodes.every(validId)||
     ![link.retestReliabilityLower95,link.expectedPracticeEffect,
       link.practiceEffectSE,link.linkingSE].every(finite)||
     link.retestReliabilityLower95<0||link.retestReliabilityLower95>1||
     link.practiceEffectSE<0||link.linkingSE<0||
     !Number.isSafeInteger(link.calibrationHoldoutPeople)||
     link.calibrationHoldoutPeople<0)
    throw new RangeError("invalid research linking evidence");
  if(link.constructCode!==baseline.constructCode||
     link.scaleVersion!==baseline.scaleVersion||
     link.calibrationVersion!==baseline.calibrationVersion||
     link.linkedFormCodes[0]!==baseline.formCode||
     link.linkedFormCodes[1]!==followup.formCode)
    return blocked(plannedComparisons,"RETEST_LINKAGE_VERSION_MISMATCH");
  if(!link.independentEquatingValidated||
     !link.independentRetestValidated||
     !link.longitudinalInvarianceValidated||
     !link.independentPracticeModelValidated||
     !link.independentErrorsJustified)
    return blocked(plannedComparisons,"VALIDATION_GATES_NOT_SATISFIED");
  // These are StepMark pilot acceptance proposals, NOT universal psychometric laws.
  if(baseline.itemCount<18||followup.itemCount<18||
     link.calibrationHoldoutPeople<200||
     link.retestReliabilityLower95<0.80)
    return blocked(plannedComparisons,"INSUFFICIENT_ITEM_COUNT_OR_RELIABILITY_EVIDENCE");
  const difference=followup.theta-baseline.theta;
  const adj=difference-link.expectedPracticeEffect;
  const se=Math.hypot(baseline.standardError,followup.standardError,
    link.practiceEffectSE,link.linkingSE);
  const mdc=Z95_BONFERRONI[plannedComparisons-1]!*se;
  return {status:adj>mdc?"model_detected_increase":
        adj< -mdc?"model_detected_decrease":"insufficient_evidence",
    evidenceScope:"research_only_no_production_release",
    difference,practiceAdjustedDifference:adj,differenceSE:se,
    minimumDetectableChange:mdc,
    intervalFamilywise95:[adj-mdc,adj+mdc],
    familywiseMethod:"bonferroni",plannedComparisons,
    reason:Math.abs(adj)<=mdc?"CHANGE_WITHIN_MEASUREMENT_UNCERTAINTY":
      "MODEL_CONDITIONAL_CHANGE_NOT_PRODUCT_VALIDATION"};
}
