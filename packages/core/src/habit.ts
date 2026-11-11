/**
 * Automaticity is different from adherence and skill. A curve is descriptive,
 * not a scientific claim that a number of repetitions guarantees a habit.
 */
export interface AutomaticityObservation { effectiveRepetitions: number; automaticity: number }
export interface HabitCurveParameters { baseline: number; asymptote: number; rate: number }
function validNumber(n: number): boolean { return Number.isFinite(n); }
export function habitCurve(repetitions: number, p: HabitCurveParameters): number {
  if (![repetitions, p.baseline, p.asymptote, p.rate].every(validNumber) ||
      repetitions < 0 || p.baseline < 0 || p.asymptote > 100 ||
      p.asymptote < p.baseline || p.rate <= 0 || p.rate > 1) throw new RangeError("invalid habit curve parameters");
  return p.baseline + (p.asymptote - p.baseline) * (-Math.expm1(-p.rate * repetitions));
}
/**
 * SRBAI-like four responses on a 1-7 Likert scale. Only arithmetic is supplied:
 * DO NOT treat independently written questions as the validated SRBAI instrument.
 * A localized scale requires authorization/translation validation.
 */
export function automaticityResponseIndex(answers: readonly number[]): number {
  if (answers.length !== 4 || answers.some(a => !Number.isInteger(a) || a < 1 || a > 7)) {
    throw new RangeError("four integer Likert responses in 1..7 required");
  }
  return ((answers.reduce((sum, n) => sum + n, 0) / 4 - 1) / 6) * 100;
}
export function observedAdherence(opportunities: readonly { eligible: boolean; completed: boolean }[]): {
  numerator: number; denominator: number; ratio: number | null
} {
  let numerator = 0, denominator = 0;
  for (const o of opportunities) {
    if (!o.eligible) continue;
    denominator++;
    if (o.completed) numerator++;
  }
  return { numerator, denominator, ratio: denominator ? numerator / denominator : null };
}
export type HabitFit = {
  status: "exploratory";
  parameters: HabitCurveParameters;
  rmse: number;
  observations: number;
  /** RMSE of constant automaticity baseline, for descriptive comparison. */
  constantRmse: number;
  /** AICc(constant model) - AICc(asymptotic model); positive favors curve. */
  aiccAdvantage: number;
  /** Descriptive guard only: never implies that a habit has formed. */
  trendSupported: boolean;
  modelVersion: "asymptote-constrained-ls-v2";
};
/**
 * Constrained nonlinear least squares. For each candidate growth rate, fit
 * the intercept and amplitude analytically and enforce 0<=baseline<=asymptote<=100.
 * The first observation is NOT treated as the true baseline. x uses absolute
 * effective repetitions since the behavior began, not index since first check.
 *
 * AICc compares an intercept-only reference (k=1) to a 3-parameter curve.
 * AICc assumes independent comparable residuals; it is a heuristic here
 * because repeated self-reports are often serially correlated.
 */
export function fitHabitCurve(observations: readonly AutomaticityObservation[]): HabitFit | null {
  if (observations.length < 6 || observations.length > 500) return null;
  const sorted=[...observations].sort((a,b)=>a.effectiveRepetitions-b.effectiveRepetitions);
  if (sorted.some(o => !validNumber(o.effectiveRepetitions) || o.effectiveRepetitions < 0 ||
    !validNumber(o.automaticity) || o.automaticity < 0 || o.automaticity > 100)) {
    throw new RangeError("invalid automaticity observation");
  }
  const n=sorted.length;
  if (sorted[n-1]!.effectiveRepetitions - sorted[0]!.effectiveRepetitions < 12) return null;
  const y=sorted.map(p=>p.automaticity), x=sorted.map(p=>p.effectiveRepetitions);
  const avgY=y.reduce((a,b)=>a+b,0)/n;
  const constantRSS=y.reduce((s,v)=>s+(v-avgY)**2,0);
  if (constantRSS < 1e-8) return null;
  let bestRSS=Infinity;
  let bestParams:HabitCurveParameters|null=null;
  // Log-spaced grid handles slow and fast automaticity trajectories.
  for(let i=0;i<=120;i++){
    const rate=Math.exp(Math.log(0.0005)+(i/120)*Math.log(0.35/0.0005));
    const f=x.map(t=>-Math.expm1(-rate*t));
    const avgF=f.reduce((a,b)=>a+b,0)/n;
    let covariance=0,variance=0;
    for(let j=0;j<n;j++){
      covariance+=(f[j]!-avgF)*(y[j]!-avgY);
      variance+=(f[j]!-avgF)**2;
    }
    if(variance<1e-12)continue;
    let delta=covariance/variance;
    if(delta<=0)continue;
    let baseline=avgY-delta*avgF;
    if(baseline<0){
      baseline=0;
      delta=f.reduce((s,q,j)=>s+q*y[j]!,0)/f.reduce((s,q)=>s+q*q,0);
    }
    if(baseline>100)continue;
    if(baseline+delta>100){
      // Solve constrained maximum=100: y = 100*f + baseline*(1-f).
      const weights=f.map(q=>1-q);
      const denom=weights.reduce((s,q)=>s+q*q,0);
      if(denom<1e-12)continue;
      baseline=Math.max(0,Math.min(100,
        weights.reduce((s,q,j)=>s+q*(y[j]!-100*f[j]!),0)/denom));
      delta=100-baseline;
    }
    const params={baseline,asymptote:Math.min(100,baseline+delta),rate};
    const rss=x.reduce((s,t,j)=>{
      const diff=habitCurve(t,params)-y[j]!;
      return s+diff*diff;
    },0);
    if(rss<bestRSS){bestRSS=rss;bestParams=params;}
  }
  if(!bestParams)return null;
  const aicc=(rss:number,k:number)=>{
    const residual=Math.max(rss,1e-9);
    return n*Math.log(residual/n)+2*k+(2*k*(k+1))/(n-k-1);
  };
  const aiccAdvantage=aicc(constantRSS,1)-aicc(bestRSS,3);
  return {
    status:"exploratory",parameters:bestParams,rmse:Math.sqrt(bestRSS/n),
    constantRmse:Math.sqrt(constantRSS/n),aiccAdvantage,
    trendSupported:aiccAdvantage>2 && bestParams.asymptote-bestParams.baseline>3,
    observations:n,modelVersion:"asymptote-constrained-ls-v2"
  };
}
