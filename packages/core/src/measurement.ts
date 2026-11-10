/**
 * Deterministic, versionable scoring primitives. None is a validated
 * person-level score by itself; validated items and reference samples are needed.
 */
function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(label + " must be finite");
}
function unit(value: number, label: string): void {
  finite(value, label);
  if (value < 0 || value > 1) throw new RangeError(label + " must be between 0 and 1");
}
export function irt2plProbability(theta: number, discrimination: number, difficulty: number): number {
  finite(theta, "theta"); finite(discrimination, "discrimination"); finite(difficulty, "difficulty");
  if (discrimination <= 0) throw new RangeError("discrimination must be positive");
  const x = discrimination * (theta - difficulty);
  return x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
}
/** Fisher information for a calibrated binary 2PL item. */
export function irt2plInformation(theta: number, discrimination: number, difficulty: number): number {
  const p = irt2plProbability(theta, discrimination, difficulty);
  return discrimination ** 2 * p * (1 - p);
}
export interface RubricDimension {
  key: string;
  /** Anchored ordinal level, 0..4; must have a published scoring rubric. */
  level: number;
  weight: number;
}
export function rubricTaskScore(dimensions: readonly RubricDimension[]): number {
  if (!dimensions.length) throw new RangeError("at least one rubric dimension is required");
  let numerator = 0, denominator = 0;
  const keys = new Set<string>();
  for (const d of dimensions) {
    finite(d.level, "rubric level"); finite(d.weight, "rubric weight");
    if (keys.has(d.key)) throw new RangeError("duplicate rubric key");
    keys.add(d.key);
    if (!Number.isInteger(d.level) || d.level < 0 || d.level > 4 || d.weight <= 0) {
      throw new RangeError("level must be 0..4 and weight positive");
    }
    numerator += d.weight * d.level;
    denominator += d.weight;
  }
  return (numerator / (4 * denominator)) * 100;
}
/** Proper scoring rule: lower is better. Do not turn into a global ability score. */
export function brierScore(forecasts: readonly { probability: number; outcome: 0 | 1 }[]): number {
  if (!forecasts.length) throw new RangeError("at least one resolved forecast is required");
  return forecasts.reduce((sum, f) => {
    unit(f.probability, "probability");
    if (f.outcome !== 0 && f.outcome !== 1) throw new RangeError("outcome must be 0 or 1");
    return sum + (f.probability - f.outcome) ** 2;
  }, 0) / forecasts.length;
}
/** Wilson score interval for an observed binary success rate, not a latent ability CI. */
export function wilsonInterval(successes: number, trials: number, z = 1.96): { low: number; high: number } | null {
  finite(successes, "successes"); finite(trials, "trials"); finite(z, "z");
  if (!Number.isInteger(trials) || !Number.isInteger(successes) || trials < 0 ||
      successes < 0 || successes > trials || z <= 0) throw new RangeError("invalid counts or z");
  if (trials === 0) return null;
  const p = successes / trials, zz = z * z, denominator = 1 + zz / trials;
  const center = (p + zz / (2 * trials)) / denominator;
  const half = z * Math.sqrt((p * (1 - p) + zz / (4 * trials)) / trials) / denominator;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

/**
 * Benchmark-relative probabilistic forecast quality: a Brier skill score.
 * The reference forecast must be fixed before outcome resolution (prevent
 * hindsight leakage). Negative values mean worse than reference; no lower bound.
 * This is NOT a general person-level prediction ability score.
 */
export interface ResolvedBenchmarkForecast {
  probability:number;
  referenceProbability:number;
  outcome:0|1;
  issuedAtMs:number;
  referenceRecordedAtMs:number;
  resolvedAtMs:number;
}
export function brierSkillAgainstReference(
  forecasts:readonly ResolvedBenchmarkForecast[],
  referencePolicyVersion:string
): {status:"descriptive";sampleSize:number;forecastBrier:number;referenceBrier:number;skillScore:number|null;referencePolicyVersion:string} {
  if (!referencePolicyVersion.trim() || referencePolicyVersion.length>100 ||
      !forecasts.length || forecasts.length>100000) throw new RangeError("invalid reference policy or sample");
  let loss=0,refLoss=0;
  for(const f of forecasts){
    unit(f.probability,"forecast probability");
    unit(f.referenceProbability,"reference probability");
    if((f.outcome!==0 && f.outcome!==1) ||
       ![f.issuedAtMs,f.referenceRecordedAtMs,f.resolvedAtMs].every(Number.isFinite) ||
       f.referenceRecordedAtMs>f.issuedAtMs || f.issuedAtMs>=f.resolvedAtMs){
      throw new RangeError("invalid outcome timing; reference must precede forecast and resolution");
    }
    loss+=(f.probability-f.outcome)**2;
    refLoss+=(f.referenceProbability-f.outcome)**2;
  }
  const forecastBrier=loss/forecasts.length,referenceBrier=refLoss/forecasts.length;
  return {status:"descriptive",sampleSize:forecasts.length,forecastBrier,referenceBrier,
    skillScore:referenceBrier>0?1-forecastBrier/referenceBrier:null,referencePolicyVersion};
}
