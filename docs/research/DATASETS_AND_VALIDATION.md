# StepMark external datasets: provenance, suitability and reproduction

Date: 2026-11-11. **No external participant-level data is bundled into StepMark.** All model validity claims below are provisional.

## 1. Directly executed public-data benchmark

**Gera, R., Barak, S., & Schonberg, T.** (2024). *A novel free-operant framework enables experimental habit induction in humans*. Behavior Research Methods, 56, 3937–3958.
https://doi.org/10.3758/s13428-023-02263-6
Source: https://github.com/ranigera/HabitApp
Repository license: MIT; research article open access under CC BY 4.0. The repository distributes experimental data, but downstream use of any subject-level data should still respect its study ethics and relevant law. We do not redistribute it.

Pinned source commit: `fa3166af37f9344be59c499480ada8c28c194ace`.
File: `Analysis/data/extracted_data/core_table.csv`.
Expected Git blob SHA-1: `66f46ddb154b58c5115c4ef4d803fbce1b9bdb50`.
The benchmark *fails closed* when a downloaded file's Git blob hash differs. HTTPS source URL is hard-coded to the pinned commit; redirects disallowed, maximum size one megabyte. Only non-identifying group summary results are printed.

```bash
node --test packages/core/scripts/validate-habitapp.test.mjs
node packages/core/scripts/validate-habitapp.mjs
```

An independent, 8-minute GitHub Actions workflow runs the same benchmark for changes to the validator. External network outages only affect this separate research workflow; they do not break the application/database CI.

**Observed output on 2026-11-11**, reproducibility run:
https://github.com/konxing/StepMark/actions/runs/43033393514

- 1,056 condition/phase rows, 133 unique people, all 133 matched between valued and devalued post-manipulation conditions.
- Short training: 45 people; 95.56% had more entries in valued than devalued condition; mean within-person log(1+valued) – log(1+devalued) = 2.046319.
- Long training: 45 people; corresponding fraction 95.56%, mean contrast 1.760377.
- Long training with parallel manipulations: 43 people; corresponding fraction 79.07%, mean contrast 1.162632.

**Interpretation limits:** These are descriptive counts from an experimental task, NOT a replication of the paper's preregistered mixed-model analysis, NOT evidence that a group developed more/less habit, NOT an SRBAI/automaticity dataset, and NOT evidence that StepMark 0–100 habit progress, review interval or skill score is correct. Group differences can reflect other features; use the authors' specified model for inference.

## 2. Higher-priority longitudinal automaticity dataset (not downloaded here)

**Edgren, R., Baretta, D., & Inauen, J.** (2025).
*The temporal trajectories of habit decay in daily life: An intensive longitudinal study on four health-risk behaviors*.
https://doi.org/10.1111/aphw.12612
Study data and core R scripts: https://osf.io/sngu4/

91-day study including daily e-diaries and cue-related behavior; article reports N=194 participants and models habit strength trajectories. This is much closer to validating heterogeneity, temporal change and review cadence than HabitApp's event-count CSV.

**Updated 2026-11-12:** Direct access from the chat environment failed, but an isolated GitHub Actions research runner accessed OSF, verified the original CSV checksum and ran descriptive time-forward decay validation. The individual-level data were not committed or uploaded. See §11 for sample sizes and actual metrics. **OSF project-specific reuse license remains unverified.** Before use inspect data dictionaries, licensing, missingness and the **exact formulation** of the automaticity instrument; habit *decay* should not be fitted using a monotone *formation* curve as if it were growth.

## 3. Behavior formation external data (not downloaded)

**Buyalskaya, A., Ho, H., Milkman, K. L., et al.** (2023), *What can machine learning teach us about habit formation? Evidence from exercise and hygiene*. PNAS. Study data and reproducibility code: https://osf.io/m8gdp/ .
Source: https://knowledge.uchicago.edu/records/pydeh-0tx89

Contains de-identified gym and hospital handwashing records and a reproducibility package (the source reports over 12 million gym attendance observations and over 40 million handwashing observations). Useful for behavior regularity, predictors of cue-linked repetition, and heterogeneity, **not** direct introspective automaticity without a separate ground truth.

## 4. ESM repository for candidate longitudinal cohorts (not downloaded)

openESM: https://openesmdata.org/
Paper: Siepe et al. (2026), *Introducing openESM: A database of openly available experience sampling datasets*. https://doi.org/10.3758/s13428-026-03112-y

At publication: 60 datasets, 16,354 people, >740,000 observations. Individual studies have different licenses (some CC BY-NC) and variable definitions. Using the open-source access package's MIT license **does not grant unrestricted reuse of the underlying data**. Check per-dataset variables and licenses; no indication that all of these contain true habit automaticity.

## 5. Ability assessment data, separately scoped

OECD PISA 2022 public use datasets:
https://www.oecd.org/en/data/datasets/pisa-2022-database.html

OECD PIAAC public use cognitive log data:
https://www.oecd.org/en/data/datasets/piaac-1st-cycle-database.html

These are for **item-response modeling and task calibration research**, not habit diaries. Official codebooks, sampling design, survey weights, plausible values, item restrictions, and scale linking must govern use. They must not be plugged directly into StepMark's personal ability scores.

## 6. Generic local-only longitudinal evaluation

```bash
npm ci
node --import tsx packages/core/scripts/evaluate-longitudinal.mjs \
  --input /private/path/to/normalized-study.csv \
  --manifest /private/path/to/rights-and-source.json
```

CSV header (exact):
```csv
participant_id,day,effective_repetitions,automaticity_0_100
```

- One row per participant and relative day; `effective_repetitions` is nondecreasing cumulative completed cue opportunities.
- `automaticity_0_100` comes from a separate, properly documented and reusable validated measure, not inferred from completed counts. Blank = missing, not zero.
- Manifest requires citation, valid source version, per-dataset license and explicit permission confirmation, independent target-measure declaration, and matching SHA-256 of the raw input. Example file `docs/research/datasets/longitudinal-manifest.example.json` is **synthetic**, intentionally not eligible.
- The CLI never uploads observations, only prints aggregated performance and provenance, and refuses fewer than 10 eligible participant trajectories.
- For each eligible participant, first 70% observed timepoints train, later 30% test. Compare the monotone formation model with constant training mean and last observed score; evaluate matched-person held-out RMSE and MAE, equal weight per participant.
- If the curve fails to fit or dataset is decay/non-monotone, do **not** force a curve or claim a positive validation result. If missingness is high, estimates are not automatically generalizable.
- This is a reproducible **method for future actual validation**; until real comparable external data is supplied and tested, StepMark's habit-progress percentage remains **an illustrative heuristic**.

## 7. Research gates

A model only advances from illustrative to evidence-supported after:
1. Directly verifiable license and instrument construct, population, permissions and version;
2. Missingness, duplicates, cue eligibility and possible correlated daily reports audit;
3. Time-forward holdout with person-level baselines and uncertainty intervals;
4. Explicit assessment of model improvements vs the naive baseline, with publication of failure cases;
5. Privacy/fairness and external-validity analysis, especially cultural and language differences;
6. Pre-specified claims and decision thresholds **before** inspecting the holdout set;
7. Long-run StepMark user consent and genuinely independent assessment of **ability** if testing skill improvement.

Do not publish raw personal records from third-party experiments or StepMark users, do not place any research dataset in a production database, and do not convert correlation or a retrospective curve into causal conclusions.

## 8. Reuse the research benchmark correctly for reasoning retests (2026-11-12)

The prior HabitApp benchmark is **actual verified public experimental response-count data** (133 participants, 1,056 condition/phase records), but contains **no scored logic task answers**. It can validate behavioral CSV ingestion, integrity checks and within-subject contrasts, **not** cognitive ability or StepMark A/B item difficulty. This incompatibility is now an explicit automated negative-control test.

OECD PISA 2022 publishes cognitive item response files and codebooks:
https://www.oecd.org/en/data/datasets/pisa-2022-database.html
PIAAC publishes public-use cognitive and process files:
https://www.oecd.org/en/data/datasets/piaac-1st-cycle-database.html

Neither dataset has been downloaded, inspected at item level, score-mapped or authorized for incorporation into StepMark here. OECD test takers did not answer StepMark's original A/B items. Such files may inform **separate psychometric methods research after codebook/rights review**, but **cannot serve as ground truth for these specific A/B form scores**. Public-use access is not blanket permission to redistribute or republish test items.

### Offline consented StepMark item-response audit (new)

`packages/core/scripts/evaluate-reasoning.mjs` reuses the previous research pipeline's *methods* rather than misusing its behavioral records. It never connects to a production DB or external server; it requires a locally supplied **explicitly consented, pseudonymous**, SHA256-pinned StepMark A/B item-response file and verified rights manifest. Do not export other users' responses to this format without lawful basis and their explicit research consent.

Exact CSV fields:

```csv
participant_id,form_code,task_order,skill_code,correct,study_day
```

- Participant IDs must be pseudonymous `p_`-prefixed tokens, not emails/usernames; `study_day` is an integer day relative to a common, non-identifying study origin. Six scored binary responses per form, with the published 2+2+2 domain blueprint.
- Require at least **10 distinct fully matched people** who completed B at least seven days after A. Exclude partial forms and too-early retests, reporting exclusions. No result should be interpreted as population inference with 10 participants.
- Inspect rights manifest properties `datasetKind`, `purpose`, `participantIdsPseudonymous`, `explicitResearchConsentConfirmed`, `rightsReviewed`, `citation`, `sourceUrl`, `sourceVersion`, `sha256`. Missing or mismatched claims abort.
- Report **descriptive** paired raw score differences overall and by domain; never estimate ability, fit IRT, claim form equivalence, infer causality or modify a real user's score. No subject-level rows printed.
- Tests use synthetic respondent records, including an intentionally easier follow-up form, and an actual HabitApp *schema* fixture as a negative control. CI tests do **not** contain real StepMark personal data or claim the A/B forms are empirically calibrated.

Run a permitted dataset **only when it actually exists**:

```bash
node packages/core/scripts/evaluate-reasoning.mjs --input /private/consented-responses.csv --manifest /private/verified-rights.json
```

**Remaining scientific blocker:** StepMark has no independently consented, sufficiently broad response cohort or linked anchor items; OECD files have not been mapped. A/B raw rates remain exploratory. 

## 9. Open psychology survey reliability benchmark (2026-11-12)

**Confirmed source:** William Revelle's R `psych` package includes 2,800 anonymized SAPA personality respondents with 25 IPIP Big Five items in `psych::bfi`. Upstream docs: https://cran.r-project.org/web/packages/psych/refman/psych.html . IPIP item texts themselves are public domain (https://www.ipip.ori.org/) but the fact that *item texts* are public domain does **not** automatically authorize any use of individual response datasets beyond the terms on their own source.

Mirror used for reproducibility only: https://github.com/vincentarelbundock/Rdatasets
Commit: `1dcc2bf5f955cc1224a3e1307256e1fe86b68dae`
Relative path: `csv/psych/bfi.csv`
Verified Git blob SHA1: `8bc0e5ed94c7e399acfec48b1ebc50f16054b4af`.

The research-only CLI `node packages/core/scripts/validate-bfi.mjs` downloads this immutable source into memory (max 200 kB), refuses changed checksum and schema, and outputs only *aggregate* five-scale diagnostic values. It does **not** store participant rows in Git, the user's PostgreSQL or UI. The matching unit test uses synthetic rows.

**Calculation:** for k=5 reverse-scored items within each of five scales, raw Cronbach alpha is
`alpha = k/(k-1) * [1 - sum_j Var(item_j) / Var(sum_j item_j)]`.
For each scale, only complete cases for that scale enter the variance calculation; missing is **not** zero. Reverse items `A1,C4,C5,E1,E2,O2,O5` use `7 - response`, for the source's 1..6 response coding. The report also includes the minimum *corrected item–total* correlation (item vs the sum of other items). It does not infer participant traits.

**Scientific limits:** Alpha presumes a defensible reflective construct and has strong assumptions (including tau-equivalence); multidimensionality, reverse wording artifacts, missing data and scale length can distort it. Alpha is not proof of construct validity or causal improvement and may be negative. Report omega and factor structure after proper analysis rather than silently inferring them. Evidence: Revelle & Condon (2019), https://doi.org/10.1037/pas0000754.

**Use in StepMark:** a regression benchmark for independent, classical measurement computations only. BFI personality answers **cannot** calibrate the StepMark logic A/B forms or determine which users have better thinking skills.

### Highest-priority cognitive dataset identified separately

**Condon & Revelle / ICAR, Harvard Dataverse v3:** https://doi.org/10.7910/DVN/AD9RVY
Dataverse lists **CC0 1.0 response data** (about 97,000 respondents administered subsets of 60 cognitive items: 9 letter/number, 11 matrices, 16 verbal reasoning, 24 spatial rotation). The sample was collected online and is not nationally representative; responses are not longitudinal StepMark training results. Source **metadata and license have been reviewed**, but the 19.7MB archive has **not yet been imported, mapped or benchmarked** in this repository.

**Critically: cognitive ITEM MATERIALS are governed by separate official Scientific Use License, not the Dataverse response-data CC0 label.** The ICAR team states that deploying ICAR test items on a commercial or ordinary noncommercial website is not permitted without an academic research context. https://sms.statistik.tu-dortmund.de/en/research/projects/completed-research-projects/international-cognitive-ability-resource-icar/ . Do not bundle test item text, scoring keys or generated questions in StepMark. Use response data only after validating their specific files, codebook and permissible analysis. The ICAR data **cannot** calibrate StepMark's original unrelated A/B items.

### Other sources and controls

- IPIP official item bank https://www.ipip.ori.org/ : public-domain item text, useful for future research on descriptive self-report constructs only. Do not treat personality, self-report or a generic scale as objective thinking ability, or turn a brief personality survey into a clinical diagnosis.
- Prior HabitApp 133-person experimental count table: already checked by the separate research workflow; behavior counts are not independent automaticity ratings.
- Dunlosky et al. (2013), https://doi.org/10.1177/1529100612453266 : retrieval practice and distributed practice received high utility ratings across studied educational contexts. This supports a *training design principle*, not a universal numerical spaced-retrieval interval.
- Cepeda et al. (2006), https://doi.org/10.1037/0033-2909.132.3.354 : meta-analysis of 317 experiments, with optimal interval depending on retention horizon. No fixed schedule can be claimed universally optimal.
- Simons et al. (2016), https://doi.org/10.1177/1529100616661983 : trained-task gains do not establish broad cognitive far transfer. Every capability-improvement claim must be separately justified.

## 10. Practice retrieval schedule and contamination control (2026-11-12)

**Evidence:** Dunlosky et al. (2013) high-utility ratings for practice tests and distributed practice (https://doi.org/10.1177/1529100612453266); Cepeda et al. (2006) 317-experiment meta-analysis of spacing versus retention interval (https://doi.org/10.1037/0033-2909.132.3.354); Roediger & Karpicke (2006) delayed retrieval benefit (https://doi.org/10.1111/j.1467-9280.2006.01693.x). These studies DO NOT supply one universal human forgetting parameter nor validate StepMark's 1/3/7/14/28 day schedule.

Implementation: `getPracticeSchedule(skill, ownerHistory, todayUtc)` first selects a **due previously seen** item, otherwise introduces an unseen item. After a correct, unassisted retrieval, successive spacing intervals follow `[1,3,7,14,28]` days; incorrect, hint-assisted or legacy hint-unknown responses schedule next-day review. Not-yet-due items are withheld; there is no punitive absence penalty. Exact UTC date calculation prevents accidental local-day ambiguity.

In the privacy model `PracticeAttempt.hintUsed` is **nullable**, so historical rows cannot falsely be asserted as independently recalled. Current Web and WeChat clients only send `hintUsed=true` if the user opened the optional hint. This client flag is self-reported/observable only within that client; it is *not* tamperproof research evidence. The empirical task response remains separately recorded and is excluded from official A/B scores regardless of assistance. Reviewed practice items inevitably contaminate subsequent answers to that same item; use **novel independent A/B tasks** for the limited cross-time evidence.

**Caution:** spacing is an educational design default, not a fitted memory decay model; neither the schedule nor repeat-practice gains demonstrate domain-general reasoning improvement (Simons et al. 2016, https://doi.org/10.1177/1529100616661983). Avoid manufacturing user ability or habit-formation probability from practice history.

### Executed research benchmark results (2026-11-12)

The GitHub Actions research run
https://github.com/konxing/StepMark/actions/runs/43064070164
successfully fetched and validated the exact pinned CSV (2,800 respondents). Descriptive **raw** alpha and scale-specific complete-case count:

| IPIP dimension | Complete respondents | Raw Cronbach alpha | Min corrected item-total |
|---|---:|---:|---:|
| A | 2,709 | 0.7038 | 0.3114 |
| C | 2,707 | 0.7293 | 0.4553 |
| E | 2,713 | 0.7609 | 0.4546 |
| N | 2,694 | 0.8133 | 0.4867 |
| O | 2,726 | 0.6025 | 0.2199 |

The separate test `verifyPinnedBfiRegression` now refuses changed complete-case N, raw alpha or min corrected item-total coefficient on **future real-data reruns**. This is a reproducibility check of measurement arithmetic, not proof of a five-factor model, population representativeness, diagnostic validity, or effects of StepMark training. This is an online SAPA convenience cohort, not a probability sample of the general population.

## 11. Verified OSF longitudinal datasets and executed benchmarks (2026-11-12)

**Status: actual observational data were downloaded to isolated GitHub Actions runners, checked against pinned SHA-256 values, analyzed without printing individual-level rows, and discarded after the jobs.** This replaces the earlier "OSF 403" access note, which only described the chat environment. External-study source code and data are not installed in the production Web or WeChat app, and no third-party study participant data were stored in StepMark PostgreSQL.

### A. Fiorella 2026: formation / 175 participants / 9,416 diary observations

- Fiorella, L. (2026), *From Intention to Automaticity: Daily Evidence of Habit Formation in Students' Everyday Lives*, https://doi.org/10.1007/s10648-026-10235-3 .
- OSF project: https://osf.io/zty5s/ .
- Public deidentified ZIP: `OSF_review_package.zip`, **27,830,816 bytes**, pinned SHA-256 `4eb4b87fd50390fe095f4119add927ec7fe8195b5e05b091a30123058cbe4e09`.
- Verified ZIP includes raw-derived deidentified `data/habit_daily_analysis_public.csv` and model-ready `model_outputs/manuscript_mixed_models/automaticity_growth_model.csv`; it does **not** include confidential original surveys or names. Package README states revision 2 dated 2026-10-26. Three independent rating conventions must not be merged as if psychometrically equivalent: 4-item mean (76 people/4,494 records), decide + perform 2-item mean (52/2,468), and decide single-item (47/2,454).
- The `automaticity_score` field is 1–7. For **research-only numerical comparison** it is linearly transformed to a 0–100 reporting range, `(score-1)/6*100`; no equating, reliability or population calibration is implied.
- `cumulative_prior_behavior_count` is the recorded repetition count at each diary entry. For each participant, use earlier 70% of observed diaries to fit; evaluate later 30% for held-out forecasting; equal weight per participant.
- Independent runnable research workflow: https://github.com/konxing/StepMark/actions/runs/43216575378 . Source `packages/core/scripts/validate-fiorella.mjs`, implemented models: last observed, participant training mean, linear, square-root, logarithmic, increasing asymptote; `packages/core/src/trend-benchmarks.ts` plus `src/validation.ts`.

**Actual holdout RMSE (normalized 0–100; lower = better):**

| Automaticity measurement | People / test records | Last observation | Linear | Square root | Logarithmic | Asymptote (eligible-only) | Matched last observation |
|---|---:|---:|---:|---:|---:|---:|---:|
| Four-item average | 76 / 1,384 | 13.537 | 16.043 | 15.949 | 17.545 | 13.857 (66) | **13.688** (66) |
| Decide/perform average | 52 / 765 | 14.607 | 14.894 | 13.163 | 14.610 | **11.377** (41) | 13.808 (41) |
| Decide single item | 47 / 759 | **16.180** | 17.192 | 17.958 | 19.742 | 16.561 (37) | **14.548** (37) |

Curves fail to fit for some persons. **Only compare the asymptote with the matched-last column** for those same people; never rank asymptote vs full-group models on different subsets. These are a preliminary prediction benchmark, not the authors' hierarchical mixed-effects analysis or a confirmatory cross-study test. A best candidate chosen on these holdouts still needs an untouched independent validation set. These scores do not establish the meaning or calibration of StepMark's separate `habit-progress-v1` indicator.

### B. Edgren et al. 2025: decay / 194 participants / 16,490 study-day records

- Edgren et al., *The temporal trajectories of habit decay in daily life: An intensive longitudinal study on four health-risk behaviors*, https://doi.org/10.1111/aphw.12612 .
- OSF https://osf.io/sngu4/ ; `SRBAI_TS_141223.csv`, pinned SHA-256 `a18c12c2d4208e6d5aa43f0e7f32617bfe92efffdb3016b1cbfa3f091fb36808` (327,671 bytes).
- Official data dictionary: 5 columns (pseudonymous respondent ID, behavior group, study day 7–91, 0–4 SRBAI composite, rescaled day). 11,767 observed scores, 4,723 NA (**28.64% missing; not zero**). Groups: SED (46), SNA (57), ALC (52), TOB (39).
- This is an intervention context tracking **decay of harmful habits**, NOT growth from zero. Time-based linear and decreasing exponential research models use **study days**, not inferred completed repetitions; fitting an increasing habit-formation curve directly would be invalid.
- Run: https://github.com/konxing/StepMark/actions/runs/43217109227 . Source `packages/core/scripts/validate-edgren.mjs`.

**Matched-subgroup holdout RMSE, same participants for last-observation vs decay model:**

| Harmful behavior group | Fitted persons | Last observation | Exponential decay |
|---|---:|---:|---:|
| Sedentary | 44 | 14.067 | **11.775** |
| Unhealthy snacking | 49 | **10.813** | 11.810 |
| Alcohol use | 47 | 11.852 | **11.428** |
| Tobacco use | 33 | **16.070** | 17.528 |

The opposite results across behavior groups demonstrate heterogeneity. They **do not** prove a personally optimized StepMark review interval, a clinically validated habit-decay model, or that the study intervention caused any particular improvement. Missingness and selected-fit subsets require sensitivity analysis.

### C. Edgren follow-up: cue-exposure semantics (schema verified; further analysis pending)

- OSF https://osf.io/b69gp/ , archive metadata and `Readme_QUANTI_DATA_INFO.txt` were verified in independent Actions run https://github.com/konxing/StepMark/actions/runs/43215701896 .
- Official dictionary describes four SRBAI items (0–4), `D2CEXP` cue encounter (0=no, 1=once, 2=several times), conditional behavior-performance questions, context stability, intention, reward and stress. Main quantitative data CSV has 16,490 study-day rows and was listed as 1,981,957 bytes; its row-level model analysis and exact checksum are **not yet completed**.
- This supports the *need to distinguish* no cue, cue without performance, and cue with performance in StepMark, but does not empirically validate the current UI thresholds.

### Data protection and licensing

OSF project metadata returned `license:null` for the above nodes. An openly downloadable file is **not** proof of permission to redistribute it or use the data to train a commercial AI. The workflows are research-only and ephemeral; do not add raw participant CSV/ZIP files, IDs, diary texts, passwords or service tokens to the main source tree, application database or public logs. The browser/mobile application never fetches OSF. Before any non-research reuse: verify study-specific rights, ethics and measurement permissions.

### Mathematical consequence

Keep `habit-progress-v1` and maintenance reminders as *unvalidated visual heuristics*. Do not silently tune `N/55`, evidence caps, or review day thresholds to match the validation test set. The prospective benchmark suggests model **selection by individually measured predictive performance** may help, but calibration requires separate nested validation or an untouched cohort, uncertainty analysis, and a construct-valid link to user-rated *habitual initiation*. Ability scores require wholly separate performance evidence.
