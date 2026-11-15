# Research-only binary item quality diagnostics and source candidates

Created 2026-11-15. This is a research capability and cannot calibrate the current six-item StepMark A/B reasoning forms.

## Why

In the present StepMark `logic-a-v1` and `logic-b-v1` each contain only six original items, with no independent calibration sample or equivalent-form validation. The correct 0–100 raw percentage is task performance, **not** latent cognitive ability, population rank or proof of learning. Recent COSMIN measurement guidelines emphasize content validity, structural validity, reliability, measurement error, invariance and responsiveness as separate requirements.

Zorowitz et al. (2023/2024), https://doi.org/10.3758/s13428-023-02067-8, calibrated MaRs-IB in **1,501** adults and tested independent new forms in **600** more. Item clones were not psychometrically interchangeable. This justifies measuring item quality rather than assuming StepMark form equivalence.

## Implemented in this commit

- `packages/core/src/item-quality-audit.ts`: deterministic binary-response cohort audit. For *explicitly recorded* person/form/item rows: known-answer rate, observed p-correct, adjusted item-rest Pearson r (computed only against other observed items in the same person's form), and median recorded response time.
- Reject duplicate person/form/item, fabricated nonbinary answer, invalid timing, or impossible IDs. Recorded NA is not zero; unadministered combinations are not manufactured. If there are fewer than 30 valid item/rest pairs or no variability, correlation is `null`, not a reassuring zero.
- Descriptive-only review flags: fewer than 100 observed answers, extreme p-correct at 0.1/0.9, negative item-rest r with >=100 paired cases, and >20% recorded missing. **These thresholds are code review triggers, not validated item acceptance criteria.** The function cannot output theta, norms, person scores or habit progress. Includes deterministic synthetic negative tests.
- `packages/core/scripts/validate-mars-item-quality.mjs`: pinned public MaRs-IB *short-form validation* CSV, with full git commit and Git blob checksum; computes SHA-256, audits aggregate results in an ephemeral GitHub Actions job, and never publishes participant identifiers or imports rows into StepMark's production database.
- Source is https://github.com/ndawlab/mars-irt (repository MIT). The article is open access, but individual data and stimulus permissions are **not** assumed to grant unlimited commercial redistribution. Treat this tool as research-only pending independent permission review.

## Data sources newly audited for future work

| Resource | Available public material | Main scientific value | Limits and permissions |
| --- | --- | --- | --- |
| [MaRs-IB 2023 validation](https://github.com/ndawlab/mars-irt) | Calibration/short-form/long-form files, code and item parameters; repository MIT | Empirical item difficulty, r(item/rest), form assembly, held-out validation | Published observations are not StepMark data; stimuli stored separately on OSF; research-only experiment here, no original participant rows committed |
| [OMIB 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9326670/) | 220 figural matrices, published empirical validation; item bank GPLv3 | Future independent non-verbal reasoning form designs | GPLv3 obligations apply to reusable materials; cannot silently bundle into proprietary web/mobile client |
| [OECD PIAAC Cycle 2](https://www.oecd.org/en/data/datasets/piaac-2nd-cycle-database.html) | Adult literacy, numeracy, adaptive problem solving public use files | Broader construct map and survey-weighted subgroup comparisons | Complex survey weights, plausible values and restricted variables; item-by-item training or cross-population ranking not automatically authorized; Israel/Korea PUF revised 2026-01-29 |
| [OECD PISA 2022](https://www.oecd.org/en/data/datasets/pisa-2022-database.html) | Student cognitive item and questionnaire response PUFs | Response omission and item-score methodological tests | Ages/purpose not comparable to adult StepMark users, many original items not publicly released, plausible values require multiple-imputation-aware analysis |
| [Item Response Warehouse](https://itemresponsewarehouse.org/data.html) | Standardized response tables, including ICAR already analyzed separately | External DIF, CTT/IRT and missingness stress tests | IRW transformations can remove nonresponses; upstream original license and IRW extract license differ for some tables — both must be checked |
| [COSMIN 2024 guideline](https://pmc.ncbi.nlm.nih.gov/articles/PMC11541334/) | Outcome-measurement review methods | Validity-first study design; invariance and measurement error before a single growth score | Framework is mainly for outcome instruments, not a direct validation of StepMark |
| [Basner et al. 2020](https://scispace.com/papers/cognition-test-battery-adjusting-for-practice-and-stimulus-51p8yhm2oe?utm_source=chatgpt&utm_medium=tool) | Repeated computerized cognition, practice/stimulus effects | Model practice effects before interpreting test score increase | Population/instruments differ; cannot import published coefficients into StepMark |

## Next scientific gates

1. Independently collect item-level responses to **StepMark's own** form items from a consented, representative cohort, with stable content fingerprints and defined inclusion rules; then apply diagnostics on the **actual items** without exposing personal records.
2. Pre-register dimensionality and local-independence assumptions, try IRT only after adequate subjects/item exposures, and test parameter recovery, out-of-sample item correctness, and measurement invariance. A high alpha is insufficient to establish construct validity.
3. Link equivalent A/B forms with anchor items or a defensible common-person design and quantify **practice effects** plus **reliable change**; do not use unsupervised model-generated test items as ground truth.
4. Keep response-time analysis stratified by verified device/browser and administration protocol; online latency is not a device-invariant proxy for neural reaction speed.
5. Do not push a change to live StepMark `abilityEstimate` or `habit-progress-v2` on the basis of this unrelated MaRs-IB experiment.

**Validation status:** Source pinned and audit code added; new workflow result must be checked before claiming real-data execution was successful.
