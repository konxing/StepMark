# Independent-person item prediction benchmark and rights gate (2026-11-16)

This is an **external research benchmark**, not an IRT calibration, new population norm, or new StepMark user score.

## Purpose and protocol

Source: MaRs-IB (Zorowitz et al.), pinned Git revision `04eecdaf77d0ee657c65351eab5ed9e744b1ce14`, validation CSV `04_Validation/data/shortform/mars.csv`, Git blob `9742d6f7c13a44d146821d8c91b7fbb706a3efa6`, SHA-256 `eb22235965b5e331e7376f113edbb0bd09be6ddc3bc03f75460e691684cbf6d5`. Repository URL: https://github.com/ndawlab/mars-irt .

The new `evaluateHeldoutItemRates` works independently per source form. Respondents are deterministically assigned to train or test **by person key, never by response row**, before training. Training uses Laplace-smoothed observed per-item correct rates or a pooled **within-form** baseline. It evaluates both baselines on the SAME untouched held-out people with equally weighted person-level Brier and log loss. The reported Brier improvement is (within-form baseline minus per-item baseline); a fixed 2,000-resample **person-cluster** paired percentile interval describes uncertainty. An item with missing training support fails the descriptive gate. Unknown responses are not marked incorrect and are not part of scored comparisons.

The gate requires 20 scored held-out respondents, 60 training respondents, >=30 training responses per item, >=6 distinct items per form. These are **provisional engineering thresholds**, not calibration or reliability certification. Each source form is evaluated separately; pooled 341-person claims would be inappropriate. A public repeated holdout can guide exploratory decisions but is not confirmatory after model tuning.

## Rights and production separation

The ephemeral workflow validates the **exact** source SHA, invokes the existing offline `research-dataset-rights` permission gate, and blocks analysis and aggregate reporting unless byte provenance matches. Its declared permission is scoped to local noncommercial analysis of the repository validation CSV; **commercial product usage and raw redistribution are explicitly not authorized**. The repository's MIT notice must not be misinterpreted as permission to ship external copyrighted item illustrations/stimuli.

This module is intentionally not exported from `packages/core/src/index.ts`. All outputs remain aggregate; no respondent IDs, raw responses, original items, item images or subject data are added to StepMark's application database.

## Interpretation

An empirical improvement over a pooled item rate only demonstrates that source-item difficulty contains information about source responses. It does NOT show that six StepMark originals are valid or equivalent. Failure or instability in a small source form must remain a visible negative/uncertain result. Research CI must run and be inspected before publishing any exact external-data figures.
