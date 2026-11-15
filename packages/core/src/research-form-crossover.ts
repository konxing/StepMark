/**
 * RESEARCH ONLY: descriptive two-sequence common-person A/B crossover.
 *
 * In a genuinely randomized, otherwise stable experiment:
 *   E(B-A | A_then_B) = form difference + second-session effect
 *   E(B-A | B_then_A) = form difference - second-session effect
 * This decomposition does NOT verify randomization, measure latent ability,
 * perform score equating, or establish longitudinal improvement.
 */
export interface RecordedCrossoverForm {
  personKey:string;
  assignedSequence:"A_B"|"B_A";
  form:"A"|"B";
  formVersion:string;
  correctItems:number;
  totalItems:number;
  sessionAtMs:number;
}
export interface CrossoverAudit {
  kind:"unlinked_counterbalanced_crossover_v1";
  status:"descriptive_only"|"insufficient_evidence";
  peopleWithAnyObservation:number;
  completedPairs:number;
  incompletePairs:number;
  completeAB:number;
  completeBA:number;
  meanRawBMinusA:{AB:number|null;BA:number|null};
  formContrast:number|null;
  secondSessionContrast:number|null;
  formContrastBootstrap95:[number,number]|null;
  secondSessionBootstrap95:[number,number]|null;
  medianDaysBetweenSessions:{AB:number|null;BA:number|null};
  warning:string;
}
const valid=/^[a-zA-Z0-9_.:-]{1,128}$/;
const round=(n:number)=>Number(n.toFixed(6));
function median(values:number[]):number|null{
  if(!values.length)return null;
  values.sort((a,b)=>a-b);
  const m=Math.floor(values.length/2);
  return round(values.length%2?values[m]!:(values[m-1]!+values[m]!)/2);
}
function bootstrap(
  ab:readonly number[],ba:readonly number[],seed:number
):{form:[number,number];session:[number,number]}{
  let state=seed>>>0;
  const rand=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
  const form:number[]=[],session:number[]=[];
  for(let b=0;b<2000;b++){
    let x=0,y=0;
    for(let i=0;i<ab.length;i++)x+=ab[Math.floor(rand()*ab.length)]!;
    for(let i=0;i<ba.length;i++)y+=ba[Math.floor(rand()*ba.length)]!;
    x/=ab.length;y/=ba.length;
    form.push((x+y)/2);
    session.push((x-y)/2);
  }
  form.sort((a,b)=>a-b);session.sort((a,b)=>a-b);
  return {form:[round(form[49]!),round(form[1949]!)],
    session:[round(session[49]!),round(session[1949]!)]};
}
export function auditCounterbalancedCrossover(rows:readonly RecordedCrossoverForm[]):CrossoverAudit{
  if(!rows.length||rows.length>100000)throw new RangeError("invalid crossover cohort");
  const persons=new Map<string,{sequence:"A_B"|"B_A";a?:RecordedCrossoverForm;b?:RecordedCrossoverForm}>();
  const formDefinitions=new Map<string,{version:string;length:number}>();
  for(const r of rows){
    if(!r||!valid.test(r.personKey)||!valid.test(r.formVersion)||
      (r.assignedSequence!=="A_B"&&r.assignedSequence!=="B_A")||
      (r.form!=="A"&&r.form!=="B")||
      !Number.isInteger(r.totalItems)||r.totalItems<2||r.totalItems>200||
      !Number.isInteger(r.correctItems)||r.correctItems<0||r.correctItems>r.totalItems||
      !Number.isSafeInteger(r.sessionAtMs)||r.sessionAtMs<0)
      throw new RangeError("invalid crossover observation");
    const definition=formDefinitions.get(r.form);
    if(definition&&(definition.version!==r.formVersion||definition.length!==r.totalItems))
      throw new RangeError("inconsistent form version or content length");
    formDefinitions.set(r.form,{version:r.formVersion,length:r.totalItems});
    const person=persons.get(r.personKey)??{sequence:r.assignedSequence};
    if(person.sequence!==r.assignedSequence||
      (r.form==="A"&&person.a!==undefined)||
      (r.form==="B"&&person.b!==undefined))
      throw new RangeError("duplicate form or changed assigned sequence");
    if(r.form==="A")person.a=r;
    else person.b=r;
    persons.set(r.personKey,person);
    if(persons.size>30000)throw new RangeError("too many research participants");
  }
  let incomplete=0;
  const ab:number[]=[],ba:number[]=[],abDays:number[]=[],baDays:number[]=[];
  for(const person of persons.values()){
    if(!person.a||!person.b){incomplete++;continue;}
    const first=person.sequence==="A_B"?person.a:person.b;
    const second=person.sequence==="A_B"?person.b:person.a;
    const gap=(second.sessionAtMs-first.sessionAtMs)/86400000;
    if(!Number.isFinite(gap)||gap<1||gap>120)
      throw new RangeError("invalid order or session interval");
    const delta=person.b.correctItems/person.b.totalItems -
      person.a.correctItems/person.a.totalItems;
    if(person.sequence==="A_B"){ab.push(delta);abDays.push(gap);}
    else{ba.push(delta);baDays.push(gap);}
  }
  const n=ab.length+ba.length;
  const mean=(values:readonly number[]):number|null=>
    values.length?round(values.reduce((s,v)=>s+v,0)/values.length):null;
  const a=mean(ab),b=mean(ba);
  // These are provisional evidence gates, not a pre-specified powered test.
  const sufficient=ab.length>=30&&ba.length>=30&&
    incomplete/(n+incomplete)<=0.2;
  const ci=sufficient?bootstrap(ab,ba,20261116):null;
  return {
    kind:"unlinked_counterbalanced_crossover_v1",
    status:sufficient?"descriptive_only":"insufficient_evidence",
    peopleWithAnyObservation:persons.size,
    completedPairs:n,incompletePairs:incomplete,
    completeAB:ab.length,completeBA:ba.length,
    meanRawBMinusA:{AB:a,BA:b},
    formContrast:sufficient?round((a!+b!)/2):null,
    secondSessionContrast:sufficient?round((a!-b!)/2):null,
    formContrastBootstrap95:ci?.form??null,
    secondSessionBootstrap95:ci?.session??null,
    medianDaysBetweenSessions:{AB:median(abDays),BA:median(baDays)},
    warning:"Research-only unlinked raw-score contrasts. Even counterbalanced order does not certify random allocation, common-person linking, item/content equivalence, no carryover, equal dropout, stable latent ability, practice-corrected change, measurement invariance or generalization. The 95% intervals are descriptive within-group person bootstraps, not preregistered acceptance/equivalence tests."
  };
}
