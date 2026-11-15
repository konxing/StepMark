/**
 * RESEARCH SANDBOX ONLY: mathematical checks for public/synthetic item data.
 * Deliberately not exported by src/index.ts, and makes NO production, clinical,
 * IQ, percentile, individual growth, or construct-validity claim.
 */
export type Binary = 0 | 1;
export interface SimulatedItem {key: string; discrimination: number; difficulty: number;}
export interface OracleTrial {personKey: string; itemKey: string; knownTheta: number; correct: Binary;}
const keyRe = /^[A-Za-z0-9_.:-]{1,100}$/;
const round = (v:number) => Number(v.toFixed(6));
const probability = (z:number) => z >= 0 ? 1/(1+Math.exp(-z)) : Math.exp(z)/(1+Math.exp(z));
const clip = (v:number, lo:number, hi:number) => Math.min(hi,Math.max(lo,v));
function hashKey(s:string):number {let h=2166136261;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),16777619);}return h>>>0;}

/** Deterministic standardised synthetic theta; TRUE theta is known by design. */
export function generateOracleIRT(seed:number, people:number, items: readonly SimulatedItem[]):OracleTrial[] {
  if (!Number.isInteger(seed) || seed === 0 || !Number.isInteger(people) || people < 20 || people > 50000 ||
      !items.length || items.length > 100 || new Set(items.map(x=>x.key)).size !== items.length ||
      items.some(x=>!keyRe.test(x.key)||!Number.isFinite(x.discrimination)||x.discrimination<=0||x.discrimination>4||!Number.isFinite(x.difficulty)||Math.abs(x.difficulty)>4))
    throw new RangeError("invalid synthetic IRT design");
  let state=seed>>>0;
  const rand=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
  const rows: OracleTrial[]=[];
  for(let i=0;i<people;i++) {
    let theta=0;for(let j=0;j<12;j++)theta+=rand();theta-=6;
    for(const item of items)rows.push({personKey:`s${i}`,itemKey:item.key,knownTheta:theta,
      correct:rand()<probability(item.discrimination*(theta-item.difficulty))?1:0});
  }
  return rows;
}
interface Fit {intercept:number; slope:number;}
function fitLogistic(train:readonly OracleTrial[], freeSlope:boolean):Fit|null {
  const n=train.length, successes=train.reduce((a,r)=>a+r.correct,0);
  if(n<80 || successes<10 || n-successes<10)return null;
  let b0=Math.log((successes+1)/(n-successes+1)), b1=1;
  const lambda=2;
  const loss=(x:number,y:number)=>{
    let l=(lambda/2)*(x*x+(freeSlope?y*y:0));
    for(const r of train){const z=x+y*r.knownTheta;l+=Math.max(z,0)-r.correct*z+Math.log1p(Math.exp(-Math.abs(z)));}
    return l;
  };
  for(let it=0;it<45;it++){
    let g0=lambda*b0,g1=freeSlope?lambda*b1:0,h00=lambda,h01=0,h11=lambda;
    for(const r of train){const p=probability(b0+b1*r.knownTheta),w=p*(1-p),e=p-r.correct,t=r.knownTheta;
      g0+=e;h00+=w;
      if(freeSlope){g1+=e*t;h01+=w*t;h11+=w*t*t;}
    }
    let d0:number,d1:number;
    if(freeSlope){const det=h00*h11-h01*h01;if(det<=1e-10)return null;
      d0=(g0*h11-g1*h01)/det;d1=(g1*h00-g0*h01)/det;
    }else{d0=g0/h00;d1=0;}
    const old=loss(b0,b1);let accepted=false;
    for(let k=0;k<16;k++){
      const step=2**(-k), x=clip(b0-step*d0,-12,12),y=freeSlope?clip(b1-step*d1,-4,4):1;
      if(loss(x,y)<=old+1e-10){b0=x;b1=y;accepted=true;break;}
    }
    if(!accepted||Math.abs(d0)+Math.abs(d1)<1e-7)break;
  }
  return {intercept:b0,slope:b1};
}
export interface OracleBenchmarkItem {
  key:string; trainingRows:number; holdoutRows:number;
  observedDiscrimination:number|null; observedDifficulty:number|null;
  fitStatus:"fitted"|"insufficient_data";
}
export interface OracleBenchmarkResult {
  kind:"synthetic_oracle_parameter_recovery_v1";
  status:"research_simulation_only";
  trainingPeople:number;holdoutPeople:number;
  trainingRows:number;holdoutRows:number;
  candidateItems:OracleBenchmarkItem[];
  metrics:{constantBrier:number;raschBrier:number|null;twoPlBrier:number|null;
    constantLogLoss:number;raschLogLoss:number|null;twoPlLogLoss:number|null;
    discriminationRMSE:number|null;difficultyRMSE:number|null;};
  warning:string;
}
/**
 * Fit item logits using *known synthetic theta*. A held-out PERSON never fits
 * item parameters. No ability is inferred for anyone: this is an oracle test.
 */
export function benchmarkOracle2PL(rows:readonly OracleTrial[],truth:readonly SimulatedItem[]):OracleBenchmarkResult {
  if(rows.length<100||rows.length>300000||truth.length<1||truth.length>100)throw new RangeError("invalid benchmark size");
  const known=new Map(truth.map(i=>[i.key,i]));
  if(known.size!==truth.length||truth.some(i=>!keyRe.test(i.key)||!Number.isFinite(i.discrimination)||i.discrimination<=0||!Number.isFinite(i.difficulty)))throw new RangeError("invalid truth");
  const perItem=new Map<string,{training:OracleTrial[];holdout:OracleTrial[]}>();
  const unique=new Set<string>(),thetaByPerson=new Map<string,number>();
  const trainPeople=new Set<string>(),testPeople=new Set<string>();
  for(const r of rows){
    if(!r||!keyRe.test(r.personKey)||!known.has(r.itemKey)||!Number.isFinite(r.knownTheta)||Math.abs(r.knownTheta)>6||
       (r.correct!==0&&r.correct!==1))throw new RangeError("invalid synthetic trial");
    const u=JSON.stringify([r.personKey,r.itemKey]);
    if(unique.has(u))throw new RangeError("duplicate person-item observation");unique.add(u);
    if(thetaByPerson.has(r.personKey)&&thetaByPerson.get(r.personKey)!==r.knownTheta)throw new RangeError("inconsistent synthetic theta");
    thetaByPerson.set(r.personKey,r.knownTheta);
    const isTest=hashKey(r.personKey)%5===0;
    (isTest?testPeople:trainPeople).add(r.personKey);
    const bucket=perItem.get(r.itemKey)??{training:[],holdout:[]};
    (isTest?bucket.holdout:bucket.training).push(r);perItem.set(r.itemKey,bucket);
  }
  const sums={constantBrier:0,raschBrier:0,twoPlBrier:0,constantLogLoss:0,raschLogLoss:0,twoPlLogLoss:0};
  let total=0,fittedHoldout=0,rmseA=0,rmseB=0,fitCount=0;
  const candidateItems:OracleBenchmarkItem[]=[];
  for(const item of truth){
    const b=perItem.get(item.key)??{training:[],holdout:[]};
    const rasch=fitLogistic(b.training,false),two=fitLogistic(b.training,true);
    const fit=rasch!==null&&two!==null&&b.holdout.length>=20;
    candidateItems.push({key:item.key,trainingRows:b.training.length,holdoutRows:b.holdout.length,
      observedDiscrimination:fit?round(two.slope):null,
      observedDifficulty:fit&&Math.abs(two.slope)>1e-6?round(-two.intercept/two.slope):null,
      fitStatus:fit?"fitted":"insufficient_data"});
    const baseline=(b.training.reduce((s,r)=>s+r.correct,0)+1)/(b.training.length+2);
    for(const r of b.holdout){
      const y=r.correct;const p=clip(baseline,1e-9,1-1e-9);
      sums.constantBrier+=(p-y)**2;sums.constantLogLoss+=-y*Math.log(p)-(1-y)*Math.log1p(-p);total++;
      if(!fit)continue;
      const pr=clip(probability(rasch.intercept+r.knownTheta),1e-9,1-1e-9);
      const pt=clip(probability(two.intercept+two.slope*r.knownTheta),1e-9,1-1e-9);
      sums.raschBrier+=(pr-y)**2;sums.twoPlBrier+=(pt-y)**2;
      sums.raschLogLoss+=-y*Math.log(pr)-(1-y)*Math.log1p(-pr);
      sums.twoPlLogLoss+=-y*Math.log(pt)-(1-y)*Math.log1p(-pt);fittedHoldout++;
    }
    if(fit){rmseA+=(two.slope-item.discrimination)**2;rmseB+=(-two.intercept/two.slope-item.difficulty)**2;fitCount++;}
  }
  if(total===0)throw new RangeError("no held-out people");
  // Only report Rasch/2PL metrics if ALL candidate items were fit: comparable populations.
  const complete=fitCount===truth.length&&fittedHoldout===total;
  return {kind:"synthetic_oracle_parameter_recovery_v1",status:"research_simulation_only",
    trainingPeople:trainPeople.size,holdoutPeople:testPeople.size,
    trainingRows:rows.length-total,holdoutRows:total,candidateItems,
    metrics:{constantBrier:round(sums.constantBrier/total),raschBrier:complete?round(sums.raschBrier/total):null,
      twoPlBrier:complete?round(sums.twoPlBrier/total):null,constantLogLoss:round(sums.constantLogLoss/total),
      raschLogLoss:complete?round(sums.raschLogLoss/total):null,twoPlLogLoss:complete?round(sums.twoPlLogLoss/total):null,
      discriminationRMSE:complete?round(Math.sqrt(rmseA/fitCount)):null,
      difficultyRMSE:complete?round(Math.sqrt(rmseB/fitCount)):null},
    warning:"Oracle theta is known only in synthetic data. Person-level held-out estimates test algorithm implementation, NOT StepMark item validity, human intelligence or live ability scoring."};
}

export interface StratifiedResponse {personKey:string;itemKey:string;correct:Binary|null;group:"reference"|"focal";}
export interface MHResult {
  kind:"exploratory_mh_dif_v1";status:"descriptive_only"|"insufficient_evidence";
  referencePeople:number;focalPeople:number;excludedPeople:number;matchedStrata:number;
  oddsRatioReferenceVsFocal:number|null;
  warning:string;
}
/**
 * 2-group Mantel-Haenszel odds-ratio, matching solely on COMPLETE *other*
 * prespecified anchor items. Missing responses never become wrong answers.
 * Returns no p-value/DIF label; confounding and anchor purity remain unresolved.
 */
export function auditAnchorMatchedDIF(rows:readonly StratifiedResponse[],target:string,anchors:readonly string[]):MHResult {
  if(rows.length<1||rows.length>250000||!keyRe.test(target)||anchors.length<3||anchors.length>60||
     new Set(anchors).size!==anchors.length||anchors.includes(target)||anchors.some(a=>!keyRe.test(a)))
    throw new RangeError("invalid anchor design");
  const needed=new Set([target,...anchors]);
  const people=new Map<string,{group:"reference"|"focal";obs:Map<string,Binary|null>}>();
  for(const r of rows){
    if(!r||!keyRe.test(r.personKey)||!needed.has(r.itemKey)||!([0,1,null] as unknown[]).includes(r.correct)||
      (r.group!=="reference"&&r.group!=="focal"))throw new RangeError("invalid matched item response");
    let p=people.get(r.personKey);
    if(!p){p={group:r.group,obs:new Map()};people.set(r.personKey,p);}
    if(p.group!==r.group||p.obs.has(r.itemKey))throw new RangeError("duplicate or inconsistent group");
    p.obs.set(r.itemKey,r.correct);
  }
  const strata=new Map<number,{rc:number;rw:number;fc:number;fw:number}>();
  let ref=0,focal=0,excluded=0;
  for(const p of people.values()){
    const y=p.obs.get(target);
    if(y!==0&&y!==1){excluded++;continue;}
    let rest=0,complete=true;
    for(const anchor of anchors){const x=p.obs.get(anchor);if(x!==0&&x!==1){complete=false;break;}rest+=x;}
    if(!complete){excluded++;continue;}
    const s=strata.get(rest)??{rc:0,rw:0,fc:0,fw:0};
    if(p.group==="reference"){ref++;if(y===1)s.rc++;else s.rw++;}
    else{focal++;if(y===1)s.fc++;else s.fw++;}
    strata.set(rest,s);
  }
  let numerator=0,denominator=0,matched=0;
  for(const {rc,rw,fc,fw} of strata.values()){
    const n=rc+rw+fc+fw;
    if(rc+rw===0||fc+fw===0)continue;
    numerator+=rc*fw/n;denominator+=rw*fc/n;matched++;
  }
  const sufficient=ref>=100&&focal>=100&&matched>=3&&numerator>0&&denominator>0;
  return {kind:"exploratory_mh_dif_v1",status:sufficient?"descriptive_only":"insufficient_evidence",
    referencePeople:ref,focalPeople:focal,excludedPeople:excluded,matchedStrata:matched,
    oddsRatioReferenceVsFocal:sufficient?round(numerator/denominator):null,
    warning:"Exploratory anchor-matched odds ratio, no significance test or DIF clearance. Anchors must be invariant; valid subgroup inference requires independent study design, effect thresholds, multiple-test control and adequate power. No protected attributes are persisted here."};
}
export interface PairedForm {personKey:string;form:"A"|"B";sequence:"A_B"|"B_A";fractionCorrect:number;}
export interface PairedFormResult {kind:"unlinked_form_contrast_v1";status:"descriptive_only"|"insufficient_evidence";
  pairedPeople:number;sequenceAB:number;sequenceBA:number;meanBMinusA:number|null;
  meanBMinusABySequence:{AB:number|null;BA:number|null};
  warning:string;}
/** Common-person form contrast is NOT equating: order and practice can confound it. */
export function auditCommonPersonForms(rows:readonly PairedForm[]):PairedFormResult {
  if(!rows.length||rows.length>200000)throw new RangeError("invalid paired forms");
  const people=new Map<string,{a?:number;b?:number;sequence:"A_B"|"B_A"}>();
  for(const r of rows){
    if(!r||!keyRe.test(r.personKey)||(r.form!=="A"&&r.form!=="B")||
      (r.sequence!=="A_B"&&r.sequence!=="B_A")||!Number.isFinite(r.fractionCorrect)||r.fractionCorrect<0||r.fractionCorrect>1)throw new RangeError("invalid form observation");
    let p=people.get(r.personKey);
    if(!p){p={sequence:r.sequence};people.set(r.personKey,p);}
    if(p.sequence!==r.sequence||p[r.form==="A"?"a":"b"]!==undefined)throw new RangeError("duplicate form or incompatible sequence");
    if(r.form==="A")p.a=r.fractionCorrect;else p.b=r.fractionCorrect;
  }
  let ab=0,ba=0,sum=0,sumAB=0,sumBA=0;
  for(const p of people.values()){
    if(p.a===undefined||p.b===undefined)continue;
    const delta=p.b-p.a;sum+=delta;
    if(p.sequence==="A_B"){ab++;sumAB+=delta;}else{ba++;sumBA+=delta;}
  }
  const n=ab+ba,good=ab>=30&&ba>=30;
  return {kind:"unlinked_form_contrast_v1",status:good?"descriptive_only":"insufficient_evidence",
    pairedPeople:n,sequenceAB:ab,sequenceBA:ba,meanBMinusA:n?round(sum/n):null,
    meanBMinusABySequence:{AB:ab?round(sumAB/ab):null,BA:ba?round(sumBA/ba):null},
    warning:"A/B paired raw performance is not linked latent ability. Common-person randomized order does not alone remove practice/item-memory effects. No IRT equating or reliable growth claim."};
}

/** Published reliable-change formula, deliberately restricted to independent study inputs. */
export function exploratoryPracticeAdjustedRCI(input:{baseline:number;followup:number;
  baselineSD:number;retestReliability:number;expectedPracticeGain:number;
  evidence:"independent_retest_study";}):{kind:"research_rci_only";z:number;observedDelta:number;practiceAdjustedDelta:number;standardErrorOfDifference:number;warning:string} {
  const v=[input?.baseline,input?.followup,input?.baselineSD,input?.retestReliability,input?.expectedPracticeGain];
  if(!input||input.evidence!=="independent_retest_study"||v.some(x=>!Number.isFinite(x))||input.baselineSD<=0||
    input.retestReliability<=0||input.retestReliability>=1)throw new RangeError("requires independent retest reliability, SD and practice estimate");
  const se=Math.sqrt(2)*input.baselineSD*Math.sqrt(1-input.retestReliability);
  return {kind:"research_rci_only",z:round((input.followup-input.baseline-input.expectedPracticeGain)/se),
    observedDelta:round(input.followup-input.baseline),practiceAdjustedDelta:round(input.followup-input.baseline-input.expectedPracticeGain),
    standardErrorOfDifference:round(se),
    warning:"Exploratory RCI conditional on independently estimated reliability, SD, practice and stable scale. Does not establish individual change or validate StepMark scores."};
}
