# Counterbalanced A/B study-audit prototype (2026-11-16)

**Research-only**, deliberately NOT exported through `packages/core/src/index.ts`; no API, migration, data collection or user-level claims.

Study rationale: the StepMark production original `logic-a-v1` → `logic-b-v1` path is single-order with a seven-day delay. Its raw 6-item difference cannot separate form difficulty, practice effects, genuine skill change or dropout; the existing production observations must **never** be passed off as a fully randomized crossover experiment.

For a future, separately consented and preregistered research study, define two groups assigned randomly to A then B (`A_B`) or B then A (`B_A`) with identical prespecified interval, language, content versions and administration. Given paired raw proportions:

- `dAB = mean(B - A | A_B)`; if a common second-session effect exists, it adds to B-A.
- `dBA = mean(B - A | B_A)`; the same effect subtracts from B-A.
- **Descriptive form contrast** `(dAB + dBA)/2`; **descriptive second-session contrast** `(dAB - dBA)/2`.

`auditCounterbalancedCrossover` checks subject uniqueness, recorded order/dates, item counts and consistent form versions, and stratifies by assigned order. It reports both mean B-A results separately, explicit incomplete pairs and the observed interval. Only groups with at least 30 complete pairs *each* and at most 20% attrition are eligible for **descriptive** contrast and a deterministic 2,000-draw within-sequence respondent bootstrap. These are research engineering safety gates, not powered study thresholds. Unexpected order, duplicate assessment or content-version drift cause errors.

**Limitations:** observational data can imitate randomized assignments; code cannot certify actual randomization, no carryover or no period-specific confounding. Attrition may be informative; a 20% cutoff does not solve selection bias. This is **not** IRT linking, formal score equating, population norms, reliable change, or an estimate of causal training benefit. Future real validation requires prospective assignment logs, preregistration, blinded analysis, independent holdout and StepMark's own consenting research cohort.

Tests live at `packages/core/test/research-form-crossover.test.ts`. The live API and current form sequence remain unchanged. Useful references: MaRs-IB item-clone non-equivalence (https://doi.org/10.3758/s13428-023-02067-8) and published work on practice effects and repeated cognitive testing.
