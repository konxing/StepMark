import {fitHabitCurve,habitCurve} from "./habit.ts";
import {fitTrend,predictTrend,type TrendShape} from "./trend-benchmarks.ts";
import {pairedRmseBootstrap,auditRecordedMissingness,type PairedErrorSeries,type PairedRmseAudit,type RecordedMissingnessAudit} from "./research-audit.ts";

export interface AutomaticitySeriesRow {
  participantId:string;
  day:number;  // relative study day, NOT seconds
  effectiveRepetitions:number; // cumulative completed opportunities
  automaticity:number|null; // normalized and instrument-defined 0..100, missing!=0
}
export interface SeriesQuality {
  participants:number;
  rows:number;
  observedAutomaticity:number;
  missingAutomaticity:number;
  missingFraction:number;
  evaluatedParticipants:number;
  excludedParticipants:number;
  predictedHoldoutRecords:number;
  curveEligibleParticipants:number;
}
export interface BaselineScore {
  rmse:number|null;
  mae:number|null;
  participants:number;
}
export interface SeriesValidation {
  status:"descriptive_out_of_time_comparison";
  methodVersion:"time-split-v2";
  split:"first 70% observed timepoints per participant train, later 30% test";
  note:string;
  quality:SeriesQuality;
  lastObservation:BaselineScore;
  constantMean:BaselineScore;
  asymptoticCurve:BaselineScore;
  /** Matched holdout persons: apples-to-apples baseline comparison for curve. */
  matchedLastObservation:BaselineScore;
  curveWinsFraction:number|null;
  /** Competing time-forward models, not a product-calibrated growth scale. */
  trendCandidates:Record<TrendShape,BaselineScore>;
  /** Matched cohort for trend candidates (separate from asymptotic fit cohort). */
  matchedLastObservationForTrend:BaselineScore;
  trendWinsFraction:Record<TrendShape,number|null>;
  /** Matched-person cluster bootstrap; positive improvement means smaller candidate error. */
  pairedAsymptote:PairedRmseAudit;
  pairedTrends:Record<TrendShape,PairedRmseAudit>;
  recordedMissingness:RecordedMissingnessAudit;
}
function rounded(x:number):number{return Number(x.toFixed(6));}
function score(errors:readonly number[][]):BaselineScore {
  if(!errors.length)return {rmse:null,mae:null,participants:0};
  let mse=0,mae=0;
  for(const person of errors){
    mse+=person.reduce((s,e)=>s+e*e,0)/person.length;
    mae+=person.reduce((s,e)=>s+Math.abs(e),0)/person.length;
  }
  return {rmse:rounded(Math.sqrt(mse/errors.length)),
    mae:rounded(mae/errors.length),participants:errors.length};
}
/**
 * Person-stratified temporal holdout: never mixes a person's future answers
 * into a training model; do not confuse post-hoc fit RMSE with forecast RMSE.
 * Grouping equally weights people so prolific reporters don't dominate.
 */
export function evaluateAutomaticitySeries(
  records:readonly AutomaticitySeriesRow[]
):SeriesValidation {
  if(!records.length || records.length>150000)throw new RangeError("invalid dataset size");
  const byPerson=new Map<string,AutomaticitySeriesRow[]>();
  for(const r of records){
    if(typeof r.participantId!=="string"||!/^[a-zA-Z0-9_.:-]{1,100}$/.test(r.participantId)||
      !Number.isSafeInteger(r.day)||r.day<0||r.day>10000||
      !Number.isSafeInteger(r.effectiveRepetitions)||r.effectiveRepetitions<0||
      (r.automaticity!==null&&(!Number.isFinite(r.automaticity)||r.automaticity<0||r.automaticity>100)))
      throw new RangeError("invalid or potentially identifying dataset row");
    const data=byPerson.get(r.participantId)??[];
    data.push(r);byPerson.set(r.participantId,data);
    if(byPerson.size>10000)throw new RangeError("too many distinct participants");
  }
  let totalMissing=0,eligible=0,recordsHeld=0,curveWins=0,people=0;
  const trends:readonly TrendShape[]=["linear","square_root","logarithmic"];
  const trendErrors:Record<TrendShape,number[][]>={linear:[],square_root:[],logarithmic:[]};
  const trendMatchErrors:number[][]=[];
  const trendWinCount:Record<TrendShape,number>={linear:0,square_root:0,logarithmic:0};
  const trendPairs:Record<TrendShape,PairedErrorSeries[]>={linear:[],square_root:[],logarithmic:[]};
  const curvePairs:PairedErrorSeries[]=[];
  const lastErrors:number[][]=[],constantErrors:number[][]=[],curveErrors:number[][]=[],matchedErrors:number[][]=[];
  for(const original of byPerson.values()){
    const rows=[...original].sort((a,b)=>a.day-b.day);
    for(let i=0;i<rows.length;i++){
      if(i>0 && (rows[i]!.day===rows[i-1]!.day ||
        rows[i]!.effectiveRepetitions < rows[i-1]!.effectiveRepetitions))
        throw new RangeError("duplicate day or declining cumulative repetitions");
      if(rows[i]!.automaticity===null)totalMissing++;
    }
    const points=rows.filter(x=>x.automaticity!==null);
    if(points.length<9)continue;
    const boundary=Math.floor(points.length*0.7);
    const train=points.slice(0,boundary),test=points.slice(boundary);
    if(train.length<6||test.length<3||train.length>500||test.length>500)continue;
    people++;recordsHeld+=test.length;
    const mean=train.reduce((s,x)=>s+x.automaticity!,0)/train.length;
    const latest=train[train.length-1]!.automaticity!;
    const lastErr=test.map(x=>latest-x.automaticity!);
    const constantErr=test.map(x=>mean-x.automaticity!);
    lastErrors.push(lastErr);constantErrors.push(constantErr);
    const linearSamples=train.map(x=>({effectiveRepetitions:x.effectiveRepetitions,automaticity:x.automaticity!}));
    const fits=trends.map(shape=>fitTrend(linearSamples,shape));
    if(fits.every(x=>x!==null))trendMatchErrors.push(lastErr);
    for(let j=0;j<trends.length;j++){
      const shape=trends[j]!,fit=fits[j];
      if(!fit)continue;
      const errors=test.map(x=>predictTrend(x.effectiveRepetitions,fit)-x.automaticity!);
      trendErrors[shape].push(errors);
      trendPairs[shape].push({baseline:lastErr,candidate:errors});
      const mse=(e:readonly number[])=>e.reduce((sum,v)=>sum+v*v,0)/e.length;
      if(mse(errors)<mse(lastErr))trendWinCount[shape]++;
    }
    const fitted=fitHabitCurve(train.map(x=>({
      effectiveRepetitions:x.effectiveRepetitions,automaticity:x.automaticity!
    })));
    if(fitted){
      eligible++;
      const curveErr=test.map(x=>habitCurve(x.effectiveRepetitions,fitted.parameters)-x.automaticity!);
      curveErrors.push(curveErr);matchedErrors.push(lastErr);
      curvePairs.push({baseline:lastErr,candidate:curveErr});
      const mse=(e:readonly number[])=>e.reduce((s,v)=>s+v*v,0)/e.length;
      if(mse(curveErr)<mse(lastErr))curveWins++;
    }
  }
  const n=records.length;
  return {
    status:"descriptive_out_of_time_comparison",
    methodVersion:"time-split-v2",
    split:"first 70% observed timepoints per participant train, later 30% test",
    note:"Candidate curves are retrospective research comparisons with person-specific time-forward holdouts, not calibrated habit probabilities. Never choose a live model on this test set. Do not combine incomparable measure versions or treat intention as confirmed cue exposure.",
    quality:{
      participants:byPerson.size,rows:n,observedAutomaticity:n-totalMissing,
      missingAutomaticity:totalMissing,missingFraction:rounded(totalMissing/n),
      evaluatedParticipants:people,excludedParticipants:byPerson.size-people,
      predictedHoldoutRecords:recordsHeld,curveEligibleParticipants:eligible
    },
    lastObservation:score(lastErrors),constantMean:score(constantErrors),
    asymptoticCurve:score(curveErrors),
    matchedLastObservation:score(matchedErrors),
    curveWinsFraction:eligible?rounded(curveWins/eligible):null,
    trendCandidates:{linear:score(trendErrors.linear),square_root:score(trendErrors.square_root),
      logarithmic:score(trendErrors.logarithmic)},
    matchedLastObservationForTrend:score(trendMatchErrors),
    trendWinsFraction:{linear:trendErrors.linear.length?rounded(trendWinCount.linear/trendErrors.linear.length):null,
      square_root:trendErrors.square_root.length?rounded(trendWinCount.square_root/trendErrors.square_root.length):null,
      logarithmic:trendErrors.logarithmic.length?rounded(trendWinCount.logarithmic/trendErrors.logarithmic.length):null},
    pairedAsymptote:pairedRmseBootstrap(curvePairs),
    pairedTrends:{linear:pairedRmseBootstrap(trendPairs.linear),
      square_root:pairedRmseBootstrap(trendPairs.square_root),
      logarithmic:pairedRmseBootstrap(trendPairs.logarithmic)},
    recordedMissingness:auditRecordedMissingness(records)
  };
}
