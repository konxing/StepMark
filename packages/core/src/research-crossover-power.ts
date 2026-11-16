/**
 * Research-only MONTE CARLO planning tool for a future counterbalanced A/B
 * study. No real participant data; no psychometric standard setting.
 * The specified logit effects are assumptions, not StepMark estimates.
 */
export interface CrossoverPlanningScenario {
  assignedParticipants:number;
  itemsPerForm:number;
  formLogitShift:number;
  secondSessionLogitShift:number;
  dropoutAB:number;
  dropoutBA:number;
  replicates:number;
  seed:number;
}
export interface CrossoverPlanningResult {
  kind:"synthetic_counterbalanced_planning_v1";
  status:"planning_scenario_only"|"insufficient_simulated_pairs";
  assumptions:CrossoverPlanningScenario;
  eligibleEffectReplicates:number;
  eligibleNullReplicates:number;
  meanCompletedAB:number;
  meanCompletedBA:number;
  twoSidedFormDetectionRate:number|null;
  twoSidedSessionDetectionRate:number|null;
  nullFormFalsePositiveRate:number|null;
  nullSessionFalsePositiveRate:number|null;
  /** Holm step-down adjusted, two planned contrasts with familywise alpha=0.05. */
  holmAdjustedFormDetectionRate:number|null;
  holmAdjustedSessionDetectionRate:number|null;
  holmNullFormFalsePositiveRate:number|null;
  holmNullSessionFalsePositiveRate:number|null;
  holmNullFamilywiseFalsePositiveRate:number|null;
  unadjustedNullFamilywiseFalsePositiveRate:number|null;
  /** Wilson 95% intervals for finite Monte Carlo runs, NOT participant uncertainty. */
  holmNullFamilywiseMonteCarlo95:Readonly<[number,number]>|null;
  unadjustedNullFamilywiseMonteCarlo95:Readonly<[number,number]>|null;
  warning:string;
}
const round=(n:number)=>Number(n.toFixed(6));
function binomialMonteCarlo95(successes:number,n:number):Readonly<[number,number]>|null{
  if(!Number.isInteger(successes)||!Number.isInteger(n)||n<=0||
     successes<0||successes>n)throw new RangeError("invalid monte carlo counts");
  // Wilson binomial interval, using the simulation replicate (NOT subject) as
  // the independent Bernoulli unit.
  const z=1.959963984540054,z2=z*z;
  const p=successes/n,denom=1+z2/n;
  const mid=(p+z2/(2*n))/denom;
  const half=z*Math.sqrt((p*(1-p)+z2/(4*n))/n)/denom;
  return [round(Math.max(0,mid-half)),round(Math.min(1,mid+half))];
}
const logistic=(x:number)=>x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x));
function validate(s:CrossoverPlanningScenario){
  if(!s||!Number.isInteger(s.assignedParticipants)||
    s.assignedParticipants<80||s.assignedParticipants>10000||s.assignedParticipants%2!==0||
    !Number.isInteger(s.itemsPerForm)||s.itemsPerForm<4||s.itemsPerForm>80||
    !Number.isInteger(s.replicates)||s.replicates<100||s.replicates>2500||
    !Number.isSafeInteger(s.seed)||s.seed===0||
    !Number.isFinite(s.formLogitShift)||Math.abs(s.formLogitShift)>2||
    !Number.isFinite(s.secondSessionLogitShift)||Math.abs(s.secondSessionLogitShift)>2||
    !Number.isFinite(s.dropoutAB)||s.dropoutAB<0||s.dropoutAB>.7||
    !Number.isFinite(s.dropoutBA)||s.dropoutBA<0||s.dropoutBA>.7)
    throw new RangeError("invalid crossover simulation assumptions");
}
function generator(seed:number){
  let state=seed>>>0;
  return ()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return (state>>>0)/4294967296;
  };
}
/**
 * Two-sided Holm step-down for exactly TWO prespecified z tests.
 * The more significant test must pass alpha/2, then the other alpha.
 * z values are absolute; this routine does not make the z approximation valid.
 */
export function holmTwoContrasts(absFormZ:number,absSessionZ:number):{
  form:boolean;session:boolean
}{
  if(!Number.isFinite(absFormZ)||!Number.isFinite(absSessionZ)||
     absFormZ<0||absSessionZ<0)throw new RangeError("invalid z statistics");
  const nominal=1.959963984540054,first=2.241402727604948;
  return {
    form:absFormZ>=absSessionZ?
      absFormZ>first:(absSessionZ>first&&absFormZ>nominal),
    session:absSessionZ>=absFormZ?
      absSessionZ>first:(absFormZ>first&&absSessionZ>nominal)
  };
}
type Analysis={form:boolean;session:boolean;holmForm:boolean;holmSession:boolean;
  completedAB:number;completedBA:number;eligible:boolean};
function simulateTrial(s:CrossoverPlanningScenario, rng:()=>number,
  formShift:number,sessionShift:number):Analysis {
  const AB:number[]=[],BA:number[]=[];
  const count=(p:number)=>{
    let successes=0;
    for(let j=0;j<s.itemsPerForm;j++)if(rng()<p)successes++;
    return successes;
  };
  for(let i=0;i<s.assignedParticipants;i++){
    // I.i.d. synthetic latent effect, approximately N(0,1).
    // Assignment is balanced and independent of latent effect.
    let theta=-6;
    for(let j=0;j<12;j++)theta+=rng();
    const ab=i%2===0;
    const firstProb=logistic(theta+(ab?0:formShift));
    const secondProb=logistic(theta+(ab?formShift:0)+sessionShift);
    const first=count(firstProb),second=count(secondProb);
    const dropout=ab?s.dropoutAB:s.dropoutBA;
    if(rng()<dropout)continue;
    const bMinusA=(ab?second-first:first-second)/s.itemsPerForm;
    (ab?AB:BA).push(bMinusA);
  }
  const eligible=AB.length>=20&&BA.length>=20;
  if(!eligible)return {form:false,session:false,holmForm:false,holmSession:false,
    completedAB:AB.length,completedBA:BA.length,eligible:false};
  const stats=(a:number[])=>{
    const mean=a.reduce((x,y)=>x+y,0)/a.length;
    const variance=a.reduce((x,y)=>x+(y-mean)**2,0)/(a.length-1);
    return {mean,variance,n:a.length};
  };
  const a=stats(AB),b=stats(BA);
  const se=Math.sqrt(a.variance/a.n+b.variance/b.n)/2;
  // If there is no empirical variation, a z test is not identified.
  if(se<=1e-12)return {form:false,session:false,holmForm:false,holmSession:false,
    completedAB:AB.length,completedBA:BA.length,eligible:false};
  const form=(a.mean+b.mean)/2,session=(a.mean-b.mean)/2;
  const absFormZ=Math.abs(form/se),absSessionZ=Math.abs(session/se);
  const holm=holmTwoContrasts(absFormZ,absSessionZ);
  return {form:absFormZ>1.959963984540054,
    session:absSessionZ>1.959963984540054,
    holmForm:holm.form,holmSession:holm.session,
    completedAB:AB.length,completedBA:BA.length,eligible:true};
}
/** Returns unconditional design assumptions plus conditional eligibility counts.
 *  Two hypothesis checks are NOT familywise-error controlled. No causal claim.
 */
export function simulateCrossoverPlanning(s:CrossoverPlanningScenario):CrossoverPlanningResult{
  validate(s);
  let effectEligible=0,nullEligible=0,formHits=0,sessionHits=0,nullFormHits=0,nullSessionHits=0;
  let effectHolmForm=0,effectHolmSession=0,nullHolmForm=0,nullHolmSession=0;
  let nullAny=0,nullHolmAny=0;
  let completedAB=0,completedBA=0;
  const seeded=generator(s.seed);
  for(let i=0;i<s.replicates;i++){
    const study=simulateTrial(s,seeded,s.formLogitShift,s.secondSessionLogitShift);
    completedAB+=study.completedAB;completedBA+=study.completedBA;
    if(study.eligible){
      effectEligible++;formHits+=Number(study.form);sessionHits+=Number(study.session);
      effectHolmForm+=Number(study.holmForm);effectHolmSession+=Number(study.holmSession);
    }
    const zero=simulateTrial(s,seeded,0,0);
    if(zero.eligible){
      nullEligible++;nullFormHits+=Number(zero.form);nullSessionHits+=Number(zero.session);
      nullHolmForm+=Number(zero.holmForm);nullHolmSession+=Number(zero.holmSession);
      nullAny+=Number(zero.form||zero.session);
      nullHolmAny+=Number(zero.holmForm||zero.holmSession);
    }
  }
  const enough=effectEligible>=.95*s.replicates&&nullEligible>=.95*s.replicates;
  const rate=(hits:number,n:number)=>enough&&n>0?round(hits/n):null;
  return {
    kind:"synthetic_counterbalanced_planning_v1",
    status:enough?"planning_scenario_only":"insufficient_simulated_pairs",
    assumptions:{...s},
    eligibleEffectReplicates:effectEligible,eligibleNullReplicates:nullEligible,
    meanCompletedAB:round(completedAB/s.replicates),
    meanCompletedBA:round(completedBA/s.replicates),
    twoSidedFormDetectionRate:rate(formHits,effectEligible),
    twoSidedSessionDetectionRate:rate(sessionHits,effectEligible),
    nullFormFalsePositiveRate:rate(nullFormHits,nullEligible),
    nullSessionFalsePositiveRate:rate(nullSessionHits,nullEligible),
    holmAdjustedFormDetectionRate:rate(effectHolmForm,effectEligible),
    holmAdjustedSessionDetectionRate:rate(effectHolmSession,effectEligible),
    holmNullFormFalsePositiveRate:rate(nullHolmForm,nullEligible),
    holmNullSessionFalsePositiveRate:rate(nullHolmSession,nullEligible),
    holmNullFamilywiseFalsePositiveRate:rate(nullHolmAny,nullEligible),
    unadjustedNullFamilywiseFalsePositiveRate:rate(nullAny,nullEligible),
    holmNullFamilywiseMonteCarlo95:enough?binomialMonteCarlo95(nullHolmAny,nullEligible):null,
    unadjustedNullFamilywiseMonteCarlo95:enough?binomialMonteCarlo95(nullAny,nullEligible):null,
    warning:"Synthetic binomial item responses and Gaussian-like latent trait; effects are assumed log-odds shifts, not measured StepMark effects. The stated Gaussian z approximation assumes independent participants, conditional random missingness and constant effects. Two legacy unadjusted contrasts are retained for comparison. The additional Holm step-down contrasts control two-test familywise Type I error under valid individual z-test assumptions. Report the simulated any-rejection FWER; neither test is a validated psychometric measurement. Finite-replicate Wilson 95% intervals describe only Monte Carlo error, not study-participant uncertainty or model misspecification. These finite-seed simulation rates are NOT verified statistical power or a recommended enrollment N until effect, reliability, attrition, randomization, missingness and multiplicity assumptions are prospectively justified. No personal data or population norms."
  };
}
