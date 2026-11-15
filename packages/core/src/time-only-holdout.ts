/**
 * Research-only time-index forecast check.
 *
 * Unlike an exposure-conditioned retrospective holdout, this model *never*
 * uses how many repetitions participants actually completed during future
 * held-out days. Prediction targets only a scheduled future DAY and uses
 * observed training history available before the holdout boundary.
 *
 * It remains retrospective evaluation, not deployed prospective validation:
 * observed test days may be selected by non-random diary response.
 */
import {pairedRmseBootstrap,type PairedRmseAudit} from "./research-audit.ts";
import type {AutomaticitySeriesRow,BaselineScore} from "./validation.ts";
export interface TimeOnlyHoldout {
  status:"descriptive_time_only_holdout";
  version:"time-only-holdout-v1";
  split:"first 70% of observed ratings per participant, later 30% held out";
  quality:{
    participants:number;eligibleParticipants:number;excludedParticipants:number;
    evaluatedRows:number;recordedMissingRows:number;
  };
  lastRating:BaselineScore;
  trainingMean:BaselineScore;
  timeLinear:BaselineScore;
  pairedTimeLinear:PairedRmseAudit;
  note:string;
}
const round=(x:number)=>Number(x.toFixed(6));
const clamp=(x:number)=>Math.max(0,Math.min(100,x));
function score(all:readonly (readonly number[])[]):BaselineScore{
  if(!all.length)return {participants:0,rmse:null,mae:null};
  let squares=0,absolute=0;
  for(const row of all){
    squares+=row.reduce((s,e)=>s+e*e,0)/row.length;
    absolute+=row.reduce((s,e)=>s+Math.abs(e),0)/row.length;
  }
  return {participants:all.length,rmse:round(Math.sqrt(squares/all.length)),
    mae:round(absolute/all.length)};
}
export function evaluateTimeOnlyAutomaticityHoldout(
  records:readonly AutomaticitySeriesRow[]
):TimeOnlyHoldout{
  if(!records.length||records.length>150000)throw new RangeError("invalid sample size");
  const grouped=new Map<string,{day:number;automaticity:number|null}[]>();
  let missing=0;
  for(const r of records){
    if(typeof r.participantId!=="string"||
       !/^[A-Za-z0-9_.:-]{1,100}$/.test(r.participantId)||
       !Number.isSafeInteger(r.day)||r.day<0||r.day>10000||
       (r.automaticity!==null&&(!Number.isFinite(r.automaticity)||
          r.automaticity<0||r.automaticity>100)))
      throw new RangeError("invalid study date or scored observation");
    if(r.automaticity===null)missing++;
    const rows=grouped.get(r.participantId)??[];
    rows.push({day:r.day,automaticity:r.automaticity});
    grouped.set(r.participantId,rows);
    if(grouped.size>10000)throw new RangeError("too many participants");
  }
  let eligible=0,held=0;
  const lastErrors:number[][]=[],meanErrors:number[][]=[],linearErrors:number[][]=[];
  for(const original of grouped.values()){
    const rows=[...original].sort((a,b)=>a.day-b.day);
    if(rows.some((r,i)=>i>0&&r.day===rows[i-1]!.day))
      throw new RangeError("duplicate person-day observation");
    const observed=rows.filter((r):r is {day:number;automaticity:number}=>r.automaticity!==null);
    if(observed.length<9)continue;
    const cut=Math.floor(observed.length*.7);
    const train=observed.slice(0,cut),test=observed.slice(cut);
    if(train.length<6||test.length<3||train.length>500||test.length>500)continue;
    eligible++;held+=test.length;
    const xMean=train.reduce((s,v)=>s+v.day,0)/train.length;
    const yMean=train.reduce((s,v)=>s+v.automaticity,0)/train.length;
    let xx=0,xy=0;
    for(const r of train){
      xx+=(r.day-xMean)**2;
      xy+=(r.day-xMean)*(r.automaticity-yMean);
    }
    // Distinct person-days guarantee nonzero xx; no future exposure counts.
    if(xx<=0)throw new RangeError("nonidentifiable day-only model");
    const slope=xy/xx;
    const latest=train[train.length-1]!.automaticity;
    lastErrors.push(test.map(r=>latest-r.automaticity));
    meanErrors.push(test.map(r=>yMean-r.automaticity));
    // Fix the bounded outcome support *before* checking held-out scores.
    linearErrors.push(test.map(r=>
      clamp(yMean+slope*(r.day-xMean))-r.automaticity));
  }
  const pairs=lastErrors.map((baseline,i)=>({
    baseline,candidate:linearErrors[i]!
  }));
  return {
    status:"descriptive_time_only_holdout",version:"time-only-holdout-v1",
    split:"first 70% of observed ratings per participant, later 30% held out",
    quality:{participants:grouped.size,eligibleParticipants:eligible,
      excludedParticipants:grouped.size-eligible,evaluatedRows:held,
      recordedMissingRows:missing},
    lastRating:score(lastErrors),trainingMean:score(meanErrors),
    timeLinear:score(linearErrors),pairedTimeLinear:pairedRmseBootstrap(pairs),
    note:"Retrospective time-only holdout: train uses past ratings/days, predictions use future calendar day but NEVER actual future repetition counts. Holdout dates are observed-response days; nonresponse and causal change remain unmodeled. Positive paired RMSE improvement alone never validates StepMark habit progress or an optimal review cadence."
  };
}
