/**
 * RESEARCH ONLY. Descriptive classical-test-theory checks for independently
 * administered binary cognitive items. This intentionally does not fit IRT,
 * issue latent-ability estimates, derive norms, or update StepMark scores.
 *
 * Explicit missing answers are NOT wrong answers. Unadministered person-item
 * pairs never enter the denominator. Item-rest correlations use only other
 * observed items from the SAME person/form, not a leaked full-form outcome.
 */
export interface RecordedItemResponse {
  /** Pseudonym. Never emit in summaries or CI logs. */
  personKey:string;
  itemKey:string;
  formKey:string;
  correct:0|1|null;
  /** Optional recorded timing, not an across-device ability metric. */
  responseTimeMs?:number|null;
}
export interface DescriptiveItemAudit {
  formKey:string;
  itemKey:string;
  recordedRows:number;
  observedAnswers:number;
  recordedMissing:number;
  observedAccuracy:number|null;
  /** Corrected item-rest Pearson r, using observed rest-of-form proportion. */
  itemRestCorrelation:number|null;
  itemRestPairs:number;
  observedMedianResponseMs:number|null;
  flags:readonly ("few_observations"|"extreme_accuracy"|"negative_item_rest"|"large_recorded_missingness")[];
}
export interface DescriptiveFormAudit {
  formKey:string;
  participantsWithAnyRecordedRow:number;
  itemCount:number;
  recordedRows:number;
  observedAnswers:number;
  recordedMissing:number;
  recordedResponseCoverage:number;
}
export interface ItemQualityAudit {
  version:"binary-item-quality-audit-v1";
  status:"insufficient_evidence"|"descriptive_only";
  observedParticipants:number;
  formCount:number;
  itemCount:number;
  recordedRows:number;
  recordedMissing:number;
  forms:DescriptiveFormAudit[];
  items:DescriptiveItemAudit[];
  note:string;
}
const keyRe=/^[A-Za-z0-9_.:-]{1,128}$/;
const round=(x:number)=>Number(x.toFixed(6));
function correlation(pairs:readonly {x:number;y:number}[]):number|null{
  if(pairs.length<30)return null;
  const n=pairs.length;
  let sx=0,sy=0,sxx=0,syy=0,sxy=0;
  for(const {x,y} of pairs){sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;}
  const vx=n*sxx-sx*sx,vy=n*syy-sy*sy;
  if(vx<=1e-10||vy<=1e-10)return null;
  return round(Math.max(-1,Math.min(1,(n*sxy-sx*sy)/Math.sqrt(vx*vy))));
}
function median(values:number[]):number|null{
  if(!values.length)return null;
  values.sort((a,b)=>a-b);
  const half=Math.floor(values.length/2);
  return round(values.length%2?values[half]!:(values[half-1]!+values[half]!)/2);
}
export function auditRecordedBinaryItems(rows:readonly RecordedItemResponse[]):ItemQualityAudit{
  if(!rows.length||rows.length>150000)throw new RangeError("invalid research sample size");
  type PersonData={total:number;sum:number;};
  type ItemData={
    formKey:string;itemKey:string;observed:number;sum:number;missing:number;
    pairs:{x:number;y:number}[];times:number[];
  };
  const seen=new Set<string>(),participants=new Set<string>();
  const perPersonForm=new Map<string,PersonData>();
  const perForm=new Map<string,{people:Set<string>;items:Set<string>;rows:number;observed:number;missing:number}>();
  const perItem=new Map<string,ItemData>();
  let missing=0;
  for(const r of rows){
    if(!r||!keyRe.test(r.personKey)||!keyRe.test(r.itemKey)||!keyRe.test(r.formKey)||
      (r.correct!==0&&r.correct!==1&&r.correct!==null)||
      (r.responseTimeMs!==undefined&&r.responseTimeMs!==null&&
        (!Number.isFinite(r.responseTimeMs)||r.responseTimeMs<=0||r.responseTimeMs>3600000))||
      (r.correct===null&&r.responseTimeMs!=null))
      throw new RangeError("invalid item response evidence");
    const personForm=JSON.stringify([r.personKey,r.formKey]);
    const itemId=JSON.stringify([r.formKey,r.itemKey]);
    const unique=JSON.stringify([r.personKey,r.formKey,r.itemKey]);
    if(seen.has(unique))throw new RangeError("duplicate person-form-item response");
    seen.add(unique);participants.add(r.personKey);
    if(participants.size>20000)throw new RangeError("too many respondents");
    let group=perForm.get(r.formKey);
    if(!group){group={people:new Set(),items:new Set(),rows:0,observed:0,missing:0};perForm.set(r.formKey,group);}
    group.people.add(r.personKey);group.items.add(r.itemKey);group.rows++;
    let item=perItem.get(itemId);
    if(!item){item={formKey:r.formKey,itemKey:r.itemKey,observed:0,sum:0,missing:0,pairs:[],times:[]};perItem.set(itemId,item);}
    if(perItem.size>2500)throw new RangeError("too many distinct item variants");
    if(r.correct===null){missing++;group.missing++;item.missing++;}
    else {
      group.observed++;item.observed++;item.sum+=r.correct;
      if(r.responseTimeMs!=null)item.times.push(r.responseTimeMs);
      const earlier=perPersonForm.get(personForm)??{sum:0,total:0};
      earlier.sum+=r.correct;earlier.total++;
      perPersonForm.set(personForm,earlier);
    }
  }
  // Use all rows to compute rest-of-form summaries, rather than treating
  // skipped items as zero or inferring missing unadministered items.
  for(const r of rows){
    if(r.correct===null)continue;
    const pf=perPersonForm.get(JSON.stringify([r.personKey,r.formKey]))!;
    if(pf.total<4)continue; // at least 3 OTHER known responses
    const item=perItem.get(JSON.stringify([r.formKey,r.itemKey]))!;
    item.pairs.push({x:r.correct,y:(pf.sum-r.correct)/(pf.total-1)});
  }
  const forms:DescriptiveFormAudit[]=[...perForm.entries()].sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([formKey,v])=>({
      formKey,participantsWithAnyRecordedRow:v.people.size,itemCount:v.items.size,
      recordedRows:v.rows,observedAnswers:v.observed,recordedMissing:v.missing,
      recordedResponseCoverage:round(v.observed/v.rows)
    }));
  const items:DescriptiveItemAudit[]=[...perItem.values()].sort((a,b)=>
    a.formKey.localeCompare(b.formKey)||a.itemKey.localeCompare(b.itemKey)).map(item=>{
    const n=item.observed,miss=item.missing;
    const p=n?round(item.sum/n):null;
    const corr=correlation(item.pairs);
    const flags:DescriptiveItemAudit["flags"][number][]=[];
    // Review triggers, NOT empirically calibrated item rejection thresholds.
    if(n<100)flags.push("few_observations");
    if(n>=100&&p!==null&&(p<=0.1||p>=0.9))flags.push("extreme_accuracy");
    if(item.pairs.length>=100&&corr!==null&&corr<0)flags.push("negative_item_rest");
    if(n+miss>=100&&miss/(n+miss)>0.2)flags.push("large_recorded_missingness");
    return {
      formKey:item.formKey,itemKey:item.itemKey,
      recordedRows:n+miss,observedAnswers:n,recordedMissing:miss,
      observedAccuracy:p,itemRestCorrelation:corr,itemRestPairs:item.pairs.length,
      observedMedianResponseMs:median(item.times),flags
    };
  });
  const enough=forms.some(f=>f.participantsWithAnyRecordedRow>=200&&f.itemCount>=6)&&
    items.some(i=>i.observedAnswers>=100&&i.itemRestCorrelation!==null);
  return {
    version:"binary-item-quality-audit-v1",
    status:enough?"descriptive_only":"insufficient_evidence",
    observedParticipants:participants.size,formCount:forms.length,itemCount:items.length,
    recordedRows:rows.length,recordedMissing:missing,forms,items,
    note:"Research-only sample diagnostics. Explicit recorded omission != incorrect; unadministered person-item cells have no denominator. Item-rest correlations are within person/form and require >=3 other known answers, >=30 pairs and variation. Flags (n<100, extremes <=.1/>=.9, negative r, >20% recorded missing) are exploratory review triggers, not IRT fit, measurement invariance, reliability, causality or population ability norms. Response times cannot be equated across devices; study sample selection and planned-missing design need independent checks."
  };
}
