/**
 * Beta-Binomial posterior predictive estimate of opportunity completion.
 * ASSUMES exchangeable independent Bernoulli opportunities. Repeated days can
 * violate that assumption; never equate this probability with habit automaticity.
 */
export interface AdherencePosterior {
  status: "descriptive";
  observedRate: number;
  posteriorMean: number;
  posteriorSD: number;
  alpha: number;
  beta: number;
  trials: number;
  successes: number;
}
export function adherencePosterior(
  successes: number,
  trials: number,
  prior: Readonly<{alpha: number; beta: number}> = {alpha:1,beta:1}
): AdherencePosterior | null {
  if (!Number.isSafeInteger(successes) || !Number.isSafeInteger(trials) ||
      trials < 0 || successes < 0 || successes > trials ||
      !Number.isFinite(prior.alpha) || !Number.isFinite(prior.beta) ||
      prior.alpha <= 0 || prior.beta <= 0) {
    throw new RangeError("invalid counts or beta prior");
  }
  if (trials === 0) return null; // Do not show prior-only estimates as user data
  const alpha = prior.alpha + successes;
  const beta = prior.beta + trials - successes;
  const sum = alpha + beta;
  return { status:"descriptive", observedRate:successes / trials,
    posteriorMean:alpha / sum,
    posteriorSD:Math.sqrt(alpha * beta / (sum * sum * (sum + 1))),
    alpha,beta,trials,successes };
}
