# ICAR SAPA: real public-data IRT predictive benchmark (2026-11-13)

**Status:** real-data pipeline executed successfully in isolated GitHub Actions. Reproducible runs:

- Original publisher-sourced benchmark: https://github.com/konxing/StepMark/actions/runs/43263699981
- Rerun with paired **2PL vs 1PL** comparison: https://github.com/konxing/StepMark/actions/runs/43263952096

## Source and protection

Condon & Revelle, *Selected ICAR Data from the SAPA-Project*, Harvard Dataverse V3, https://doi.org/10.7910/DVN/AD9RVY . Original public scored-response CSV only, `sapaICARData18aug2010thru20may2013.csv`, 18,796,756 bytes, exact SHA-256 `27b22368434e94278d4cfee238770339f8e90da6229ef9ffd95900c4972426e5`. **This checksum was actually verified at download and again before model fitting.**

The raw CSV has **96,958 participant rows**, 60 scored cognitive items, and **1,199,896 non-missing scored responses**. The original source contains other variables, but the benchmark discards them and uses only 60 already-scored binary cognitive responses. It prints no individual-level responses or respondent identifiers, stores no third-party data in the app, commits no datasets, and deletes the temporary file when the job finishes.

**Usage rights:** source response data are described as CC0. ICAR **question texts/materials and item keys** are separately licensed; no ICAR items are bundled into StepMark or made available as an application exam.

## Deterministic sample and holdout design

- SHA-derived one-in-eight *respondent-row* sampling from a checksum-pinned source: 11,799 sampled respondents with responses.
- 8,822 sampled people were used for item calibration; 2,977 held-out people were never used to estimate calibration parameters.
- Of held-out people, 2,949 had enough responses for the conditional prediction audit; **9,405** target item responses were hidden from model posteriors. Their other answered items formed the ability-context evidence.
- Simple baseline: item-wise response rate estimated on training respondents only, smoothed. Candidates: regularized unidimensional 1PL (fixed discrimination) and 2PL (estimated discrimination); Gaussian quadrature EM MML.
- Participant-equal-weight Brier and log loss. Uncertainty is calculated by 1,500 participant-cluster bootstrap resamples of **matched** per-person prediction errors, with fixed deterministic seed; the interval is exploratory and unadjusted for multiple comparisons.

## Observed real-data predictive results

| Model | Brier (lower better) | Log loss (lower better) | Brier improvement vs item-rate baseline | Paired 95% bootstrap interval |
|---|---:|---:|---:|---|
| Training item-rate baseline | 0.204781 | 0.594251 | 0 | n/a |
| 1PL | 0.181209 | 0.538239 | **+0.023572** | [0.020844, 0.026483] |
| 2PL | **0.179188** | **0.533921** | **+0.025594** | [0.022606, 0.028682] |

**Direct matched comparison: 2PL vs 1PL**: Brier improvement **+0.002021**, participant-bootstrap 95% interval **[0.001172, 0.002855]**. On these already-held-out respondents and this source, 2PL was more accurate; the effect was much smaller than each IRT model's advantage over the item-rate baseline. This interval is *not* an independent preregistered replication or a general assurance about future languages and populations.

The EM program reported numerical tolerance reached after 4 iterations (1PL) and 9 iterations (2PL). Estimated 2PL discrimination values ranged from 0.3839 to 1.8227 under the chosen prior, bounds and regularization; these **are not StepMark item parameters or person-level norms**.

## What this means and what it does not

**Supported:** the project can run a version-pinned, reproducible, fully ephemeral real-data benchmark in which 1PL and 2PL predict unseen participants' unseen item responses better than a simple item-frequency baseline. 2PL yielded a modest additional improvement in this one exploratory holdout.

**Not supported:** psychometric equivalence between four ICAR item families; invariance across demographics/languages/devices; generalized training benefits; accurate ability ranks for Chinese StepMark users; equating or calibrating `logic-a-v1` and `logic-b-v1`; causality or habit automaticity predictions. The sample was recruited online and item responses were sparse, so the latent unidimensional assumptions, selection bias and distribution shift remain open questions.

**Next acceptance gate:** hold out an entirely independent cohort or comparable dataset, run DIF/measurement invariance and 1PL/2PL calibration stability assessments, and separately collect calibration evidence for StepMark's own original logic items. Do not import ICAR item stems or downstream item parameters into the product.

Prior attempts to retrieve an IRW transformation failed because its historical version endpoints were unavailable; the successful benchmark uses the original Harvard Dataverse V3 CSV, not IRW service versions. Source: [ICAR_RESEARCH_BENCHMARK.md](./ICAR_RESEARCH_BENCHMARK.md).

## 2026-11-17: prespecified target-partition sensitivity (research-only)

New analysis in `validate-icar.py`: three predetermined item-target hash partitions on the **same pinned source and same held-out respondent set**, holding the fitted 1PL/2PL item parameters fixed. Each partition reveals target-item-prediction differences, the direct 2PL-vs-1PL Brier contrast and respondent-clustered exploratory uncertainty. Within each partition, LN/MR/VR/R3D task-family diagnostics are reported separately with the number of people actually contributing to that family; these are **not multiple-comparison-corrected** and cannot establish construct invariance, DIF, or transfer to StepMark's original questions.

Critical scope: This is **sensitivity to the withheld-item selection**, NOT refitting on new calibration samples or validation in an independent new cohort. Reusing the same individuals, estimated parameters and source prohibits calling these three runs independent replications. The existing primary benchmark and its immutable source hash remain unchanged. All results must be taken from the successful new GitHub Actions run, not predicted. Models are not automatically selected and no production scoring rules change.

## Executed target-partition sensitivity 2026-11-17

Successfully executed with the same pinned and byte-verified Harvard Dataverse ICAR 60-item scored-response cohort. [Research CI run 43908803829](https://github.com/konxing/StepMark/actions/runs/43908803829). The original baseline had 2,949 evaluable held-out respondents and 9,405 hidden target item responses. All three sensitivity partitions use exactly the SAME trained 1PL/2PL item parameters and the SAME held-out respondent set, but different prespecified target-versus-context item hashes.

| Prespecified within-person target allocation | 2PL advantage vs 1PL, participant-mean Brier |
| --- | ---: |
| original | +0.002021 |
| robust-a | +0.001718 |
| robust-b | +0.001757 |

The direction is positive in all three, but these are highly dependent splits, **not** three independent replication cohorts. It is inappropriate to treat the apparent consistency as three separate statistical tests, to combine their bootstrap intervals as independent, or to pick the best variant after inspecting target outcomes.

In the **original partition only**, illustrative unadjusted item-family Brier improvements were LN +0.002410, MR +0.001835, R3D +0.005212, VR +0.000909. The VR exploratory participant-bootstrap interval included zero (−0.000361 to +0.002242). These are different subsets of answered items with different contributors, not proof of cognitive domain differentiation or subgroup fairness. No measurement invariance, item bank transfer, StepMark Chinese adult norms, or online scoring update has occurred.

**Next substantive gate:** a genuinely independent calibration cohort, refitting 1PL/2PL parameters under several *training-respondent* perturbations (this experiment changed only test item selection), followed by content-validity / test-retest evidence on StepMark's actual original items.
