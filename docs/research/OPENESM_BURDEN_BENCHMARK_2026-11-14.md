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
4. The CI run uses only Python standard library in a disposable runner, prints aggregate counts and SHA-256, never commits any real participant records or prints identifiers.
5. Any missingness label/scale ambiguity makes the run fail rather than silently reverse-code data.

The existence of this source does not establish that users benefit from 3 versus 9 prompts, an optimal interval, habit formation speed or a valid StepMark automaticity score. For UX decisions, separately pre-register randomized prompt-load tests and account for explicit eligibility, scheduled prompts and nonresponse.

Real run: https://github.com/konxing/StepMark/actions/workflows/research-openesm-burden.yml (inspect outcome; if source download fails the research gate remains **not validated**).
