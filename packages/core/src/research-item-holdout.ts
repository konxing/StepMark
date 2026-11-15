/**
 * External research only: deterministic person-level held-out item-rate
 * benchmark. This is NOT an IRT fit and cannot calibrate StepMark's items.
 * Missing responses are not failures; other-form data are never pooled.
 */
import type {RecordedItemResponse} from "./item-quality-audit.ts";
export interface ItemRateHoldout {
  kind:"research_item_rate_person_holdout_v1";
  forms:{
    formKey:string;status:"descriptive_only"|"insufficient_evidence";
    peopleWithRows:number;trainPeople:number;testPeople:number;
    trainAnswers:number;testAnswers:number;recordedMissing:number;
    minimumTrainItemExposures:number;
    formRateBrier:number|null;itemRateBrier:number|null;
    formRateLogLoss:number|null;itemRateLogLoss:number|null;
    improvementBrier:number|null;pairedBootstrap95:[number,number]|null;
  }[];
  note:string;
}
const keyRe=/^[A-Za-z0-9_.:-]{1,128}$/;
const round=(n:number)=>Number(n.toFixed(6));
const logLoss=(p:number,y:0|1)=>-y*Math.log(p)-(1-y)*Math.log1p(-p);
function hash(value:string){
  let h=2166136261;
  for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);
  return h>>>0;
}
function bootstrap(values:readonly number[],seed:number):[number,number]|null {
  if(values.length<20)return null;
  let state=seed>>>0;
  const rand=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
  const stats:number[]=[];
  for(let b=0;b<2000;b++){
    let sum=0;
    for(let i=0;i<values.length;i++)sum+=values[Math.floor(rand()*values.length)]!;
    stats.push(sum/values.length);
  }
  stats.sort((a,b)=>a-b);
  return [round(stats[49]!),round(stats[1949]!)];
}
export function evaluateHeldoutItemRates(rows:readonly RecordedItemResponse[]):ItemRateHoldout {
  if(!rows.length||rows.length>150000)throw new RangeError("invalid research cohort size");
  const seen=new Set<string>();
  const grouped=new Map<string,RecordedItemResponse[]>();
  for(const r of rows){
    if(!r||!keyRe.test(r.personKey)||!keyRe.test(r.formKey)||!keyRe.test(r.itemKey)||
      (r.correct!==0&&r.correct!==1&&r.correct!==null))
      throw new RangeError("invalid research response");
    const composite=JSON.stringify([r.personKey,r.formKey,r.itemKey]);
    if(seen.has(composite))throw new RangeError("duplicate person-form-item");
    seen.add(composite);
    const group=grouped.get(r.formKey)??[];
    group.push(r);grouped.set(r.formKey,group);
    if(grouped.size>100)throw new RangeError("too many forms");
  }
  const forms=[...grouped].sort((a,b)=>a[0].localeCompare(b[0])).map(([formKey,data])=>{
    const people=new Set(data.map(x=>x.personKey));
    const trainPeople=new Set<string>(),testPeople=new Set<string>();
    const itemStats=new Map<string,{count:number;correct:number}>();
    let trainAnswers=0,formCorrect=0,recordedMissing=0;
    for(const row of data){
      const test=hash("stepmark-fixed-research-holdout-v1:"+row.personKey)%5===0;
      (test?testPeople:trainPeople).add(row.personKey);
      if(row.correct===null){recordedMissing++;continue;}
      if(!test){
        trainAnswers++;formCorrect+=row.correct;
        const s=itemStats.get(row.itemKey)??{count:0,correct:0};
        s.count++;s.correct+=row.correct;itemStats.set(row.itemKey,s);
      }
    }
    const formProbability=(formCorrect+1)/(trainAnswers+2);
    const heldout=new Map<string,{baseBrier:number;itemBrier:number;baseLog:number;itemLog:number;count:number}>();
    let testAnswers=0;
    for(const row of data){
      if(row.correct===null||hash("stepmark-fixed-research-holdout-v1:"+row.personKey)%5!==0)continue;
      const stats=itemStats.get(row.itemKey)??{count:0,correct:0};
      const itemProbability=(stats.correct+1)/(stats.count+2);
      const y=row.correct;
      const v=heldout.get(row.personKey)??{baseBrier:0,itemBrier:0,baseLog:0,itemLog:0,count:0};
      v.baseBrier+=(formProbability-y)**2;
      v.itemBrier+=(itemProbability-y)**2;
      v.baseLog+=logLoss(formProbability,y);
      v.itemLog+=logLoss(itemProbability,y);
      v.count++;testAnswers++;
      heldout.set(row.personKey,v);
    }
    const paired=[...heldout.values()].map(x=>({
      baseBrier:x.baseBrier/x.count,itemBrier:x.itemBrier/x.count,
      baseLog:x.baseLog/x.count,itemLog:x.itemLog/x.count
    }));
    const minTrain=itemStats.size===new Set(data.map(x=>x.itemKey)).size?
      Math.min(...[...itemStats.values()].map(s=>s.count)):0;
    // The sample threshold is a conservative PRODUCT RESEARCH gate,
    // not a scientific proof of calibration or external validity.
    const sufficient=heldout.size>=20&&trainPeople.size>=60&&
      minTrain>=30&&new Set(data.map(x=>x.itemKey)).size>=6;
    const mean=(f:(v:typeof paired[number])=>number)=>
      paired.length?round(paired.reduce((sum,v)=>sum+f(v),0)/paired.length):null;
    const diff=paired.map(x=>x.baseBrier-x.itemBrier);
    return {
      formKey,status:(sufficient?"descriptive_only":"insufficient_evidence") as "descriptive_only"|"insufficient_evidence",
      peopleWithRows:people.size,trainPeople:trainPeople.size,testPeople:heldout.size,
      trainAnswers,testAnswers,recordedMissing,minimumTrainItemExposures:minTrain,
      formRateBrier:sufficient?mean(x=>x.baseBrier):null,
      itemRateBrier:sufficient?mean(x=>x.itemBrier):null,
      formRateLogLoss:sufficient?mean(x=>x.baseLog):null,
      itemRateLogLoss:sufficient?mean(x=>x.itemLog):null,
      improvementBrier:sufficient?mean(x=>x.baseBrier-x.itemBrier):null,
      pairedBootstrap95:sufficient?bootstrap(diff,hash(formKey)||1):null
    };
  });
  return {kind:"research_item_rate_person_holdout_v1",forms,
    note:"Each form is trained and tested separately, with a deterministic held-out PERSON partition and a participant-cluster paired bootstrap. Outcomes are never used to select the partition or fit the item baseline. Missing answers are omitted, not scored wrong. These are empirical probability baselines on the SOURCE items, not IRT, reliability, clinical inference, norms or StepMark ability calibration. Research thresholds are provisional; split reuse for tuning invalidates confirmatory evaluation."};
}
