/**
 * RESEARCH ONLY: matched-person prediction error audit.
 * Cluster resampling of participants respects within-person correlation.
 * Not a clinical confidence interval or person-level habit probability.
 */
export interface PairedErrorSeries {
  baseline:readonly number[];
  candidate:readonly number[];
}
export interface PairedRmseAudit {
  participants:number;
  baselineRmse:number|null;
  candidateRmse:number|null;
  /** Positive = candidate has lower RMSE on the *same* participants and test rows. */
  improvement:number|null;
  ci95:Readonly<{low:number;high:number}>|null;
  bootstrapIterations:number;
  status:"insufficient"|"descriptive";
}
function round(n:number):number{return Number(n.toFixed(6));}
function rmse(personMse:readonly number[]):number {
  return Math.sqrt(personMse.reduce((s,v)=>s+v,0)/personMse.length);
}
/** Fixed seeded xorshift32; deterministic for audit reruns (not cryptographic). */
function rng(seed:number):()=>number{
  let x=(seed>>>0)||0x9e3779b9;
  return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};
}
function quantile(sorted:readonly number[],p:number):number{
  const k=(sorted.length-1)*p;
  const i=Math.floor(k),fraction=k-i;
  return sorted[i]!*(1-fraction)+sorted[Math.min(i+1,sorted.length-1)]!*fraction;
}
export function pairedRmseBootstrap(
  pairs:readonly PairedErrorSeries[],
  options:Readonly<{iterations?:number;seed?:number}>={}
):PairedRmseAudit{
  const iterations=options.iterations??2000,seed=options.seed??20261113;
  if(pairs.length>10000 || !Number.isSafeInteger(iterations) ||
      iterations<200 || iterations>10000 ||
      !Number.isSafeInteger(seed))throw new RangeError("invalid bootstrap configuration");
  if(!pairs.length)return {participants:0,baselineRmse:null,candidateRmse:null,
    improvement:null,ci95:null,bootstrapIterations:0,status:"insufficient"};
  const squared=pairs.map(pair=>{
    if(!pair.baseline.length || pair.baseline.length!==pair.candidate.length ||
       pair.baseline.length>5000)throw new RangeError("matched holdout required");
    const mse=(x:readonly number[])=>{
      let total=0;
      for(const err of x){
        if(!Number.isFinite(err)||Math.abs(err)>100)
          throw new RangeError("error must be a finite 0-100 scale difference");
        total+=err*err;
      }
      return total/x.length;
    };
    return [mse(pair.baseline),mse(pair.candidate)] as const;
  });
  const baselineRmse=rmse(squared.map(v=>v[0]));
  const candidateRmse=rmse(squared.map(v=>v[1]));
  // Below ten participants there is no defensible percentile interval.
  if(pairs.length<10)return {participants:pairs.length,
    baselineRmse:round(baselineRmse),candidateRmse:round(candidateRmse),
    improvement:round(baselineRmse-candidateRmse),
    ci95:null,bootstrapIterations:0,status:"insufficient"};
  const sample=rng(seed),differences:number[]=[];
  for(let b=0;b<iterations;b++){
    let base=0,candidate=0;
    for(let i=0;i<squared.length;i++){
      const v=squared[Math.floor(sample()*squared.length)]!;
      base+=v[0];candidate+=v[1];
    }
    differences.push(Math.sqrt(base/squared.length)-Math.sqrt(candidate/squared.length));
  }
  differences.sort((a,b)=>a-b);
  return {participants:pairs.length,
    baselineRmse:round(baselineRmse),candidateRmse:round(candidateRmse),
    improvement:round(baselineRmse-candidateRmse),
    ci95:{low:round(quantile(differences,.025)),high:round(quantile(differences,.975))},
    bootstrapIterations:iterations,status:"descriptive"};
}
export interface RecordedMissingnessAudit {
  /** Counts refer ONLY to recorded rows; unrecorded calendar days are unknown. */
  scope:"recorded_study_rows_only";
  participants:number;
  participantsWithRecordedMissing:number;
  earlyRecordedRows:number;
  lateRecordedRows:number;
  earlyMissing:number;
  lateMissing:number;
  earlyMissingRate:number|null;
  lateMissingRate:number|null;
  note:string;
}
export function auditRecordedMissingness(
  series:readonly {participantId:string;day:number;automaticity:number|null}[]
):RecordedMissingnessAudit {
  const people=new Map<string,{day:number;missing:boolean}[]>();
  if(series.length>150000)throw new RangeError("too many rows");
  for(const r of series){
    if(!r.participantId || !Number.isSafeInteger(r.day) || r.day<0 ||
       (r.automaticity!==null && (!Number.isFinite(r.automaticity) ||
         r.automaticity<0 || r.automaticity>100)))
      throw new RangeError("invalid study row");
    const person=people.get(r.participantId)??[];
    person.push({day:r.day,missing:r.automaticity===null});
    people.set(r.participantId,person);
  }
  let earlyRecordedRows=0,lateRecordedRows=0,earlyMissing=0,lateMissing=0,withMissing=0;
  for(const rows of people.values()){
    rows.sort((a,b)=>a.day-b.day);
    if(rows.some(x=>x.missing))withMissing++;
    // Split by chronological *recorded* study rows, not observed scores.
    const cut=Math.max(1,Math.floor(rows.length*.7));
    for(let i=0;i<rows.length;i++){
      if(i<cut){earlyRecordedRows++;if(rows[i]!.missing)earlyMissing++;}
      else{lateRecordedRows++;if(rows[i]!.missing)lateMissing++;}
    }
  }
  return {scope:"recorded_study_rows_only",participants:people.size,
    participantsWithRecordedMissing:withMissing,earlyRecordedRows,lateRecordedRows,
    earlyMissing,lateMissing,
    earlyMissingRate:earlyRecordedRows?round(earlyMissing/earlyRecordedRows):null,
    lateMissingRate:lateRecordedRows?round(lateMissing/lateRecordedRows):null,
    note:"Recorded NA is not zero; unrecorded calendar days cannot be inferred as observed or missing. Splits describe missingness, not causal attrition or MNAR."};
}
