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
  warning:string;
}
const round=(n:number)=>Number(n.toFixed(6));
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
type Analysis={form:boolean;session:boolean;completedAB:number;completedBA:number;eligible:boolean};
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
  if(!eligible)return {form:false,session:false,completedAB:AB.length,completedBA:BA.length,eligible:false};
  const stats=(a:number[])=>{
    const mean=a.reduce((x,y)=>x+y,0)/a.length;
    const variance=a.reduce((x,y)=>x+(y-mean)**2,0)/(a.length-1);
    return {mean,variance,n:a.length};
  };
  const a=stats(AB),b=stats(BA);
  const se=Math.sqrt(a.variance/a.n+b.variance/b.n)/2;
  // If there is no empirical variation, a z test is not identified.
  if(se<=1e-12)return {form:false,session:false,completedAB:AB.length,completedBA:BA.length,eligible:false};
  const form=(a.mean+b.mean)/2,session=(a.mean-b.mean)/2;
  return {form:Math.abs(form/se)>1.95996398454,
    session:Math.abs(session/se)>1.95996398454,
    completedAB:AB.length,completedBA:BA.length,eligible:true};
}
/** Returns unconditional design assumptions plus conditional eligibility counts.
 *  Two hypothesis checks are NOT familywise-error controlled. No causal claim.
 */
export function simulateCrossoverPlanning(s:CrossoverPlanningScenario):CrossoverPlanningResult{
  validate(s);
  let effectEligible=0,nullEligible=0,formHits=0,sessionHits=0,nullFormHits=0,nullSessionHits=0;
  let completedAB=0,completedBA=0;
  const seeded=generator(s.seed);
  for(let i=0;i<s.replicates;i++){
    const study=simulateTrial(s,seeded,s.formLogitShift,s.secondSessionLogitShift);
    completedAB+=study.completedAB;completedBA+=study.completedBA;
    if(study.eligible){effectEligible++;formHits+=Number(study.form);sessionHits+=Number(study.session);}
    const zero=simulateTrial(s,seeded,0,0);
    if(zero.eligible){nullEligible++;nullFormHits+=Number(zero.form);nullSessionHits+=Number(zero.session);}
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
    warning:"Synthetic binomial item responses and Gaussian-like latent trait; effects are assumed log-odds shifts, not measured StepMark effects. The stated Gaussian z approximation assumes independent participants, conditional random missingness and constant effects. Two unadjusted tests are performed (familywise error may exceed 5%). These finite-seed simulation rates are NOT verified statistical power or a recommended enrollment N until effect, reliability, attrition, randomization, missingness and multiplicity assumptions are prospectively justified. No personal data or population norms."
  };
}
