/**
 * RESEARCH ONLY. Audit pre-registered, binary, resolved forecasts without
 * estimating "prediction intelligence" or calculating population norms.
 *
 * Each distinct outcome must be represented once. Reference forecasts must
 * have existed at or before the person's forecast, both before resolution.
 * Outcome timestamps are supplied by the caller and cannot be authenticated
 * mathematically; tamper-evident storage is an independent requirement.
 */
export interface ResolvedForecastEvidence {
  eventKey:string;
  forecastProbability:number;
  referenceProbability:number;
  outcome:0|1;
  forecastAtMs:number;
  referenceAtMs:number;
  resolvedAtMs:number;
}
export interface ProbabilityCalibrationBin {
  fromInclusive:number;
  toInclusive:number;
  count:number;
  meanProbability:number|null;
  observedFrequency:number|null;
}
export interface ResolvedForecastAudit {
  status:"insufficient_evidence"|"descriptive_only";
  version:"resolved-forecast-audit-v1";
  referencePolicyVersion:string;
  eventCount:number;
  meanForecastProbability:number;
  observedEventFrequency:number;
  brier:number;
  referenceBrier:number;
  /** 1 - Brier / fixed reference Brier. Null if the reference has zero error. */
  brierSkill:number|null;
  /** Null instead of clipping impossible forecasts to conceal infinite log loss. */
  logLoss:number|null;
  referenceLogLoss:number|null;
  infiniteLogLossEvents:number;
  infiniteReferenceLogLossEvents:number;
  /** Five bins fixed in advance; descriptive, not individual ability percentiles. */
  bins:ProbabilityCalibrationBin[];
  /** An exploratory expected calibration error; null for <30 unique outcomes. */
  calibrationGap:number|null;
  /** Optional predeclared issued-time split; only descriptive diagnostics. */
  timeSplit:Readonly<{
    cutoffAtMs:number;
    earlier:{events:number;brier:number|null;referenceBrier:number|null};
    later:{events:number;brier:number|null;referenceBrier:number|null};
  }>|null;
  note:string;
}
const round=(n:number)=>Number(n.toFixed(6));
function unit(p:number):boolean{return typeof p==="number"&&Number.isFinite(p)&&p>=0&&p<=1;}
function time(t:number):boolean{return Number.isSafeInteger(t)&&t>=0;}
function logLoss(p:number,y:0|1):number|null{
  if((p===0&&y===1)||(p===1&&y===0))return null;
  return y===1?-Math.log(p):-Math.log1p(-p);
}
export function auditResolvedForecasts(
  rows:readonly ResolvedForecastEvidence[],
  settings:Readonly<{referencePolicyVersion:string;nowMs:number;timeSplitAtMs?:number}>
):ResolvedForecastAudit {
  if(!rows.length||rows.length>10000||
    !settings||typeof settings.referencePolicyVersion!=="string"||
    !/^[a-zA-Z0-9._:-]{1,100}$/.test(settings.referencePolicyVersion)||
    !time(settings.nowMs)||
    (settings.timeSplitAtMs!==undefined&&!time(settings.timeSplitAtMs)))
    throw new RangeError("invalid research audit configuration");
  const ids=new Set<string>();
  const bins=Array.from({length:5},(_,i)=>({
    fromInclusive:i/5,toInclusive:(i+1)/5,count:0,
    sumProbability:0,sumOutcome:0
  }));
  let probability=0,positives=0,bs=0,referenceBs=0,ll=0,referenceLl=0,infinite=0,referenceInfinite=0;
  const split=[{n:0,loss:0,refLoss:0},{n:0,loss:0,refLoss:0}];
  for(const item of rows){
    if(!item||typeof item.eventKey!=="string"||
      !/^[a-zA-Z0-9_.:-]{1,128}$/.test(item.eventKey)||ids.has(item.eventKey)||
      !unit(item.forecastProbability)||!unit(item.referenceProbability)||
      (item.outcome!==0&&item.outcome!==1)||
      !time(item.forecastAtMs)||!time(item.referenceAtMs)||!time(item.resolvedAtMs)||
      item.referenceAtMs>item.forecastAtMs||
      item.forecastAtMs>=item.resolvedAtMs||item.resolvedAtMs>settings.nowMs)
      throw new RangeError("invalid, duplicated or hindsight-contaminated resolved forecast");
    ids.add(item.eventKey);
    const err=(item.forecastProbability-item.outcome)**2;
    const refErr=(item.referenceProbability-item.outcome)**2;
    probability+=item.forecastProbability;positives+=item.outcome;
    bs+=err;referenceBs+=refErr;
    const l=logLoss(item.forecastProbability,item.outcome);
    const rl=logLoss(item.referenceProbability,item.outcome);
    if(l===null)infinite++;else ll+=l;
    if(rl===null)referenceInfinite++;else referenceLl+=rl;
    const bucket=bins[Math.min(4,Math.floor(item.forecastProbability*5))]!;
    bucket.count++;bucket.sumProbability+=item.forecastProbability;bucket.sumOutcome+=item.outcome;
    if(settings.timeSplitAtMs!==undefined){
      const group=split[item.forecastAtMs<settings.timeSplitAtMs?0:1]!;
      group.n++;group.loss+=err;group.refLoss+=refErr;
    }
  }
  const count=rows.length,binOutput:ProbabilityCalibrationBin[]=bins.map(b=>({
    fromInclusive:b.fromInclusive,toInclusive:b.toInclusive,count:b.count,
    meanProbability:b.count?round(b.sumProbability/b.count):null,
    observedFrequency:b.count?round(b.sumOutcome/b.count):null
  }));
  // Use unrounded means internally; do not introduce rounding into ECE.
  let ece=0;
  for(const b of bins)if(b.count)
    ece+=b.count/count*Math.abs(b.sumProbability/b.count-b.sumOutcome/b.count);
  const score=bs/count,referenceScore=referenceBs/count;
  const splitOut=(b:{n:number;loss:number;refLoss:number})=>({
    events:b.n,brier:b.n?round(b.loss/b.n):null,
    referenceBrier:b.n?round(b.refLoss/b.n):null
  });
  return {
    version:"resolved-forecast-audit-v1",
    status:count>=30?"descriptive_only":"insufficient_evidence",
    referencePolicyVersion:settings.referencePolicyVersion,eventCount:count,
    meanForecastProbability:round(probability/count),
    observedEventFrequency:round(positives/count),
    brier:round(score),referenceBrier:round(referenceScore),
    brierSkill:referenceScore>0?round(1-score/referenceScore):null,
    logLoss:infinite?null:round(ll/count),
    referenceLogLoss:referenceInfinite?null:round(referenceLl/count),
    infiniteLogLossEvents:infinite,infiniteReferenceLogLossEvents:referenceInfinite,
    bins:binOutput,
    calibrationGap:count>=30?round(ece):null,
    timeSplit:settings.timeSplitAtMs===undefined?null:{
      cutoffAtMs:settings.timeSplitAtMs,
      earlier:splitOut(split[0]!),later:splitOut(split[1]!)
    },
    note:"Research-only proper-score and fixed-bin calibration diagnostics. Bin gaps can be noisy and do not certify individual prediction ability. Each unique event is counted once; correlated events, selection bias, source timing authenticity, pre-registration and external replication require separate controls. Scores are not population norms."
  };
}
