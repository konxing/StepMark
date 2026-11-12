/**
 * Three transparent competing trend shapes for prospective validation of
 * habit automaticity, motivated by Fiorella (2026) and Lally et al. (2010).
 *
 * The data's repeated automaticity scale must be independent and comparable.
 * These fits NEVER power live user progress directly; temporal holdouts decide
 * whether a model earns further study.
 */
export type TrendShape="linear"|"square_root"|"logarithmic";
export interface TrendObservation {effectiveRepetitions:number;automaticity:number}
export interface TrendFit {
  shape:TrendShape;
  intercept:number;
  slope:number;
  trainingObservations:number;
  minRepetitions:number;
  maxRepetitions:number;
}
function feature(n:number,shape:TrendShape):number{
  if(!Number.isFinite(n)||n<0)throw new RangeError("invalid repetition count");
  if(shape==="linear")return n;
  if(shape==="square_root")return Math.sqrt(n);
  if(shape==="logarithmic")return Math.log1p(n);
  throw new RangeError("unknown trend shape");
}
export function fitTrend(
  observations:readonly TrendObservation[],shape:TrendShape
):TrendFit|null{
  if(observations.length<6||observations.length>500) return null;
  const xx:number[]=[],yy:number[]=[];
  for(const o of observations){
    const x=feature(o.effectiveRepetitions,shape),y=o.automaticity;
    if(!Number.isFinite(y)||y<0||y>100)throw new RangeError("invalid automaticity");
    xx.push(x);yy.push(y);
  }
  const n=xx.length;
  const xm=xx.reduce((a,b)=>a+b,0)/n,ym=yy.reduce((a,b)=>a+b,0)/n;
  let covariance=0,variance=0;
  for(let j=0;j<n;j++){
    const dx=xx[j]!-xm;
    covariance+=dx*(yy[j]!-ym);
    variance+=dx*dx;
  }
  // Flat exposure histories do not identify a repetition slope.
  if(variance<=1e-10)return null;
  const slope=covariance/variance;
  return {shape,intercept:ym-slope*xm,slope,
    trainingObservations:n,
    minRepetitions:Math.min(...observations.map(x=>x.effectiveRepetitions)),
    maxRepetitions:Math.max(...observations.map(x=>x.effectiveRepetitions))};
}
export function predictTrend(n:number,fit:TrendFit):number{
  if(!Number.isFinite(fit.intercept)||!Number.isFinite(fit.slope))
    throw new RangeError("invalid trend fit");
  // Measurements are defined within 0..100. Clipping cannot validate a fit.
  return Math.min(100,Math.max(0,fit.intercept+fit.slope*feature(n,fit.shape)));
}
