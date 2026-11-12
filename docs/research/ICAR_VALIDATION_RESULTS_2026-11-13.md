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
