/**
 * Local-level Gaussian state-space filter (online Kalman filter).
 * Compatible repeated measurements only: model-based interval, NOT psychometric
 * evidence of improvement or proof of treatment effect.
 */
export interface ComparableMeasurement {
  measuredAtMs: number;
  score: number;
  standardError: number;
  scaleVersion: string;
  comparable: true;
}
export interface FilteredPoint {
  measuredAtMs: number;
  mean: number;
  variance: number;
  standardDeviation: number;
  modelInterval95:readonly [number,number];
}
export function filterLongitudinal(
  measurements:readonly ComparableMeasurement[],
  config:Readonly<{scaleVersion:string; priorMean:number; priorVariance:number; processVariancePerDay:number}>
):{status:"exploratory";points:FilteredPoint[]}|null{
  if (!config.scaleVersion || !Number.isFinite(config.priorMean) ||
      !Number.isFinite(config.priorVariance) || config.priorVariance<=0 ||
      !Number.isFinite(config.processVariancePerDay) || config.processVariancePerDay<0 ||
      measurements.length>500) throw new RangeError("invalid local-level model configuration");
  if (!measurements.length) return null;
  const ordered=[...measurements].sort((a,b)=>a.measuredAtMs-b.measuredAtMs);
  let mean=config.priorMean,variance=config.priorVariance;
  let previous=ordered[0]!.measuredAtMs;
  const points:FilteredPoint[]=[];
  for(const m of ordered){
    if(m.comparable!==true || m.scaleVersion!==config.scaleVersion ||
        !Number.isFinite(m.measuredAtMs) || !Number.isFinite(m.score) ||
        !Number.isFinite(m.standardError) || m.standardError<=0) {
      throw new RangeError("unlinked or invalid measurement");
    }
    const dt=(m.measuredAtMs-previous)/(24*3600*1000);
    variance += config.processVariancePerDay*dt;
    const noise=m.standardError**2;
    const gain=variance/(variance+noise);
    mean += gain*(m.score-mean);
    variance=Math.max(0,(1-gain)*variance);
    const sd=Math.sqrt(variance);
    points.push({measuredAtMs:m.measuredAtMs,mean,variance,standardDeviation:sd,
      modelInterval95:[mean-1.96*sd,mean+1.96*sd]});
    previous=m.measuredAtMs;
  }
  return {status:"exploratory",points};
}
