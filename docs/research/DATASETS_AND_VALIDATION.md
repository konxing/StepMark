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

**Access status:** The OSF landing page/API returned HTTP 403 or inaccessible in our current research environment; neither participant-level schema nor dataset-specific reuse license was inspected or verified, and no analysis has been run on these files. Do not imply validation completed. Before use inspect data dictionaries, licensing, missingness and the **exact formulation** of the automaticity instrument; habit *decay* should not be fitted using a monotone *formation* curve as if it were growth.

## 3. Behavior formation external data (not downloaded)

**Klein et al.** (2023), *What can machine learning teach us about habit formation? Evidence from exercise and hygiene*. PNAS. Study data and reproducibility code: https://osf.io/m8gdp/ .
Source: https://knowledge.uchicago.edu/records/pydeh-0tx89

Contains de-identified gym and hospital handwashing records and a reproducibility package. Useful for behavior regularity, predictors of cue-linked repetition, and heterogeneity, **not** direct introspective automaticity without a separate ground truth.

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
