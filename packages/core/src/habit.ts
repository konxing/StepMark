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
};
/**
 * Coarse deterministic grid search; outputs an exploratory estimate only.
 * Do not certify 'habit formed' from this fit. Uneven opportunity/missingness
 * require an explicit observation model and longitudinal calibration later.
 */
export function fitHabitCurve(observations: readonly AutomaticityObservation[]): HabitFit | null {
  const sorted = [...observations].sort((a, b) => a.effectiveRepetitions - b.effectiveRepetitions);
  if (sorted.length < 6) return null;
  if (sorted.some(o => !validNumber(o.effectiveRepetitions) || o.effectiveRepetitions < 0 ||
      !validNumber(o.automaticity) || o.automaticity < 0 || o.automaticity > 100)) {
    throw new RangeError("invalid automaticity observation");
  }
  if (sorted[sorted.length - 1]!.effectiveRepetitions - sorted[0]!.effectiveRepetitions < 12) return null;
  const baseline = sorted[0]!.automaticity;
  const maxObserved = Math.max(...sorted.map(o => o.automaticity));
  if (maxObserved - baseline < 3) return null;
  let best: HabitFit | null = null;
  const minAsymptote = Math.min(100, Math.max(baseline, maxObserved));
  for (let asymptote = minAsymptote; asymptote <= 100.001; asymptote += 2) {
    const top = Math.min(asymptote, 100);
    for (let j = 0; j <= 90; j++) {
      const rate = Math.exp(Math.log(0.002) + j / 90 * Math.log(0.25 / 0.002));
      const candidate = { baseline, asymptote: top, rate };
      const error = sorted.reduce((sum, o) => {
        const relativeN = o.effectiveRepetitions - sorted[0]!.effectiveRepetitions;
        return sum + (habitCurve(relativeN, candidate) - o.automaticity) ** 2;
      }, 0);
      const rmse = Math.sqrt(error / sorted.length);
      if (!best || rmse < best.rmse) {
        best = { status: "exploratory", parameters: candidate, rmse, observations: sorted.length };
      }
    }
  }
  return best;
}
