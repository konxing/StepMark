# StepMark research measurement platform v1 — evidence-first upgrade

Date: 2026-11-15. Scope: **research-only mathematical infrastructure**, not production scoring. This is a substantial internal research upgrade, **not a newly validated version of human capability measurement**. The production A/B forms, habits, user history, Prisma schema, online APIs, mini-program, AI consent and capability scores remain unchanged.

## Decision from the Deep Research report

The report identifies ICAR-SAPA, MaRs-IB, OMIB, PISA, PIAAC, DLBS, CCAB and open cognitive task batteries as valuable *methodological* sources, with important differences in rights, task domain and longitudinal design. MaRs independently calibrated N=1,501 and validated new short/long forms with another N=600. StepMark currently has original six-item `logic-a-v1` and `logic-b-v1` without its own independent calibration, test-retest, item linking, or measurement invariance. Published estimates cannot be transplanted into those tests.

This implementation prioritizes **executable scientific guardrails** over an unvalidated “better accuracy” claim:

1. `packages/core/src/research-dataset-rights.ts` implements a fail-closed, versioned dataset permission and provenance gate. It demands upstream rights verification, explicit source version, source URL, license, exact SHA-256 and isolated analysis before accepting a local external dataset. Unknown rights, terms not accepted and byte mismatch block analysis. Raw redistribution and commercial-product use require separate explicit permissions. For aggregate publication, it rejects participant rows and cells smaller than ten; this is only an initial suppression rule, not a complete disclosure review (e.g. complementary cells still require human scrutiny). Included catalogue entries are **metadata-only**; no claim that the external ZIPs were downloaded or item files independently analyzed in this upgrade.
2. `packages/core/src/research-psychometrics.ts` adds deterministic **synthetic 2PL oracle** experiments with person-level holdout; fixed-slope Rasch and 2PL per-item logistic fits; holdout Brier/log loss; parameter recovery RMSE; and tests of duplicate records/data leakage. Its `knownTheta` exists only in simulation. On real people, latent theta is *not known*, so this benchmark demonstrates implementation behavior only. It is **not** a 2PL calibration of real StepMark items.
3. A **prespecified-anchor, complete-case Mantel–Haenszel exploratory odds-ratio** compares two simulated groups while excluding the tested item from matching. It does not automatically call an item “biased”, calculate an unadjusted significance label, or hide insufficient effective sample sizes; anchor invariance, multiple testing, missingness, sample power and person-level external validity require separate assessment. Group attributes are not persisted in the library.
4. **Paired A/B descriptive evidence** is stratified by randomized order A→B and B→A. The result is explicitly **unlinked** and cannot be treated as equating, reliable growth or a causal treatment effect.
5. A practice-adjusted **exploratory RCI formula** requires reliability, scale SD and expected practice gain from an **independent retest study**. Without those quantities from the same population/instrument, no individual “reliable improvement” is justified. Current StepMark six-item forms do not meet this requirement.

`packages/core/test/research-dataset-rights.test.ts` and `research-psychometrics.test.ts` are collected by existing `npm run test` / project CI. The synthetic demonstration script is optional and should be invoked only in developer research environments:

```bash
npm ci
npm run test
npm run typecheck
node --import tsx packages/core/scripts/run-oracle-research.mjs
```

The research-only source modules are deliberately **not exported by `packages/core/src/index.ts`** and no new API endpoint or database migration has been created. Results are only aggregates, and no personal data has been copied into the repository.

## Research source access matrix (candidates, not ingested here)

| Source | Best current research use | Restriction / next gate |
|---|---|---|
| [ICAR-SAPA via IRW](https://itemresponsewarehouse.org/data.html) | high-N sparse item responses, person-level split, model comparisons | Confirm upstream version and CC0 metadata, pin exact data bytes |
| [MaRs-IB](https://github.com/ndawlab/mars-irt) | multidimensional item/clone structure, accuracy and RT, independent forms | Repository MIT does not automatically license OSF stimulus files; maintain exact pin |
| [OMIB](https://pmc.ncbi.nlm.nih.gov/articles/PMC9326670/) | 2PL item-property replication and anchor simulations | GPLv3 and item-image rights review before any shipping |
| [PISA 2022](https://www.oecd.org/en/data/datasets/pisa-2022-database.html) | weighted DIF and missingness studies | PUF terms/no redistributing; 15-year-old population mismatch |
| [PIAAC Cycle 2](https://www.oecd.org/en/data/datasets/piaac-2nd-cycle-database.html) | adult skill structure and cross-group methodology | PUF download terms, restricted RUF, not assumed raw item trials |
| [DLBS](https://openneuro.org/) | long-range retest/practice and attrition | Dataset licensing does not waive third-party test copyright |
| [CCAB](https://osf.io/) | short/long interval practice-adjusted change | Dataset license/file details not yet independently established |
| [openESM Beck](https://zenodo.org/) | irregular sampling and adherence research | CC BY-NC 4.0, do not use in commercial product training |
| [Attention Control 2026](https://doi.org/10.5281/zenodo.22224365) | trial-level attention/WM future research | large data, license and internal file structure unverified; block |

## Quality gates to move beyond v1

**Next independent benchmarks:** use the existing pinned MaRs research CI; then implement ICAR large-sample person-held-out 1PL/2PL model comparison without private records in Git history. Use OMIB only when item-material rights are reviewed. More complex DIF tests should add FDR correction, effect size, group-size power simulations, and anchoring/anchor purification. A/B must be formally linked with a pre-registered common-person randomized crossover, balanced intervals and/or vetted common-item anchors before claiming score comparability. Repeat test sessions must include item exposure, device/browser, focus interruptions, response time and skipped/declined state rather than treating missing as incorrect.

**Study recruitment gates:** require explicit, revocable informed consent and separate research dataset; define the Chinese adult target population and test construct; preregister endpoints, inclusion/exclusion, missingness, and clean holdout. N around 500 for feasibility and up to 1000+ for calibration are *planning scenarios*, not validity thresholds. Simulate per-item exposures, 2PL parameter errors and DIF detection power before fixing actual N. Reserve independent holdout for final tests, with person/group-level partitioning to avoid leakage. Stop productization if negative item discrimination, serious unexplained DIF, unstable split parameters, unacceptable linking error or unreliable change false positives appear; predeclare exact numerical bounds before collecting participants.

**Product gates (NOT satisfied):** instrument content validity, dimensionality/local independence, independent calibration, linking, test–retest, practice adjustment, device/language fairness, measurement error and data/consent governance. Until then the live UI may display honest descriptive performance and provenance, not IQ, population percentile, diagnostic skills or objectively proven ability gain. The present implementation does not assert any psychometric validity or measured improvement in StepMark users.

**No data transfer:** dataset manifest candidates are citations only; external participants' rows, IDs, item images, answer keys and licensed PUF files are not bundled. No new telemetry is collected. Research runs must avoid printing person-level records.
