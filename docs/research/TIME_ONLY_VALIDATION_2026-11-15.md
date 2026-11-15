# Day-only, out-of-time automaticity benchmark: prevent future-exposure leakage

Created 2026-11-15. Scientific purpose is *evaluation methodology*, not StepMark scoring recalibration.

## Why add a second benchmark

The existing Fiorella study benchmark's asymptotic/repetition-trend functions learn model parameters on early observations but evaluate them at **observed future cumulative behavior counts**. Those exposure counts are generally unknown at the time one would issue a genuine forecast. Therefore its "time-forward holdout" outputs are **conditional-on-realized-exposure retrospective comparisons**, not an unconditional prospective forecast. They remain useful for modeling associations conditional on repetition but must not be promoted as predictive product validation.

The new `evaluateTimeOnlyAutomaticityHoldout` explicitly reads only `participantId`, study `day` and `automaticity`. It never reads `effectiveRepetitions` at training or testing. Predictions are based on a known future day index and the user's own earlier recorded ratings: three frozen baselines are (a) last observed rating, (b) historical mean, (c) bounded ordinary least-squares straight line through training observations. These are intentionally simple, inspectable baselines.

Per-person first 70% **observed** scores train each model; the remaining observed scores are held out. The participant is the resampling cluster for a paired deterministic 2000-draw RMSE percentile interval; the 0–100 scale is clamped for the linear prediction before scoring. Exclusions, missing recorded rows and held-out event totals are always reported.

**Limitations.** We still know which dates have a future *observed* rating; silent nonresponse dates are not included, and dates may be informatively selected. It is a retrospective temporal benchmark, not a genuinely pre-registered prospective study or a scientifically validated habit-growth model. This is not evidence for optimal prompts or clinical diagnosis.

## Reproducibility

- Pure module: `packages/core/src/time-only-holdout.ts`
- Tests: `packages/core/test/time-only-holdout.test.ts`
- The existing pinned, research-only Fiorella OSF pipeline `.github/workflows/research-fiorella.yml` prints **separate** results by independent measure version; its original conditional-exposure outputs remain unchanged for historical comparability.
- No real participant-level data are committed or logged. Source redistribution rights are not established; research-only CI is isolated.
- Model weights, thresholds and live StepMark `habit-progress-v2` are deliberately not modified.

Source: Fiorella (2026), https://doi.org/10.1007/s10648-026-10235-3 and source OSF https://osf.io/zty5s/ . The source was already hash-pinned and verified by prior research workflows. Distinguishing conditioning on post-baseline variables is necessary to avoid look-ahead bias.
