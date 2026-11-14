# openESM Hasselhorn 2022: questionnaire burden benchmark (2026-11-14)

**Research only. CC BY-NC 4.0.** The dataset is not used by the StepMark web server, app database, AI provider, or commercial model training. This adds an isolated, reproducible public dataset check; it does not create a scientifically validated prompt scheduler.

## Immutable source version
- Study: Hasselhorn, Ottenstein & Lischetzke (2022), https://doi.org/10.3758/s13428-021-01683-6
- openESM record: https://openesmdata.org/datasets/0025_hasselhorn/
- Individual versioned Zenodo **2.0.0** record: https://zenodo.org/records/22953033 (do not substitute a concept DOI's latest release without reapproval).
- File: `0025_hasselhorn_ts.tsv`, Zenodo-published MD5 `87c1fd9570dc694a8c537ea6c35e7e26`. This is the upstream deposit's fixity check (MD5 not suitable for malicious tampering resistance); the script reports a computed SHA-256 for secondary provenance.
- OpenESM separately documents 282 university students, a 14-day repeated-measure schedule and **implicit missingness**. It also warns that some variables and the original English mood codebook have unclear or inconsistent coding. This benchmark intentionally **does not** derive latent mood/psychological traits.

## Locked hypothesis / calculations
1. Read only a pinned, complete versioned file from Zenodo. Parse named `id`, `day`, `compliance`, `study_burden` columns; reject unexpected schema, invalid numeric categories and changed upstream checksum.
2. Count `compliance=1`, `0` and `NA` separately. Report the observed compliance fraction only over rows whose coding is explicitly 0/1. The existence of a scheduled but **unrecorded** beep is not assumed and cannot be counted as a negative response.
3. Split early/late at 7 study days, with an explicit 0- or 1-indexed global day origin validated from the data; report study-day groups and response burden summaries. Within-person contrasts require at least one known value in both groups. These comparisons are descriptive and do not estimate the effect of questionnaire length or sampling frequency.
4. The CI run uses only Python standard library in a disposable runner, prints aggregate counts and SHA-256, never commits any real participant records or prints identifiers. A frozen 2,000-draw subject-cluster percentile bootstrap gives an exploratory interval on the **within-person** first-to-last difference. All 14 days for a person remain in the same resample unit; it is not evidence of causation.
5. Any missingness label/scale ambiguity makes the run fail rather than silently reverse-code data. The terms `codedComplianceYes/No` identify values from the harmonized released dataset, **not** independently verified device receipts. Many schedules might already be represented by harmonizer-created rows; we cannot infer other silent calendar omissions.

The existence of this source does not establish that users benefit from 3 versus 9 prompts, an optimal interval, habit formation speed or a valid StepMark automaticity score. For UX decisions, separately pre-register randomized prompt-load tests and account for explicit eligibility, scheduled prompts and nonresponse.

## First executed external benchmark (2026-11-14)

Actual successful source download and checksum audit: https://github.com/konxing/StepMark/actions/runs/43604378283

- SHA-256 of pinned TSV: `00be9005c3b0361c16a0506f96da3c1245f3564fd6c748eeaf6db4a24dc5a041`.
- 282 participants, **11,844 harmonized rows** (42 per participant).
- Day 1–7: coded compliance 1 on 4,430 / 5,922 records = **74.8058%**; 1,492 coded zero.
- Day 8–14: coded compliance 1 on 4,181 / 5,922 = **70.6011%**; 1,741 coded zero.
- 282 participants contributed paired early/late counts, with the unweighted mean within-person rate difference (second minus first) of **−0.042047** (−4.20 percentage points). Different ratio/averaging methods should not be silently combined, even though here each participant has the same nominal number of records.
- Burden item observed 1,487 early vs 1,420 late entries; conditional means 2.228648 vs 2.371127 (1–5 scale). **Do not treat 1,487/5,922 as the rate at which participants answered burden questions** before verifying which questionnaire forms actually contained that item.

No assignment-based causal effect has been estimated. These figures do not prove that reduced question frequency improves adherence or that StepMark must change its reminder cadence. ## Subsequent paired-cluster validation (completed)

The second independent Actions research run finished successfully: https://github.com/konxing/StepMark/actions/runs/43604631018

Each of 282 participants contributes a single early-to-late fraction difference. A deterministic 2,000-draw **participant-level paired percentile bootstrap** (seed 20261114) produced an interval of **[−0.060626, −0.022792]** around the unweighted within-person change **−0.042047**. Repeated observations from the same participant stay together. This describes sampling variation of the observed individuals under the bootstrap assumptions; it is *not* a randomized treatment contrast, an age-adjusted population inference or a causal burden effect. Do not infer an optimal reminder interval for StepMark from it.

**Critical data semantics:** the 11,844 rows are the *harmonized* scheduled study rows, not independently verified individual notifications. A `compliance=0` code follows the release's coding; it is not necessarily a directly observed phone-beep failure. The `study_burden` item is absent on many rows and may not be asked on each questionnaire variant; do not divide burden ratings by 5,922 and call it a survey response fraction. To compare study arms or questionnaire versions, the original assignment and form codebooks must be linked and prespecified.

Research pipeline: https://github.com/konxing/StepMark/actions/workflows/research-openesm-burden.yml
