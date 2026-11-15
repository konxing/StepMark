# Habit progress v2 — only explicit personal ratings can affect growth (2026-11-14)

The deployed v1 blended human-reported ratings and confidence-filtered AI inferred initiation labels into its subjective progress score. An LLM self-assigned confidence is not a calibrated psychological reliability estimate. It could displace a direct same-day rating, inflate the 0–100 heuristic, and delay a review.

## Implemented safeguards
- v2 strictly validates all annotations, counts AI-coded entries separately as `aiAnnotationCount`, and excludes them from `automaticitySignal`, `evidenceCount`, stage stability and review scheduling regardless of confidence, including 1.0.
- Due-review queries now read only direct self-ratings. The progress endpoint still returns a bounded provisional AI count. Browser and WeChat interfaces explain the difference.
- Unit tests assert that adding AI annotations does not alter a person's score or review date. An integrated PostgreSQL multiuser test checks that AI-only data cannot suppress due reviews and cross-user evidence does not leak.
- `policyVersion=habit-progress-v2`; historical data are preserved, no migration or new outbound AI call. AI-heavy histories may show lower progress than v1: a scoring-policy correction **not personal regression**.
- The 0–100 curve still has unvalidated heuristic weights and is not a habit formation probability or mental-health diagnosis.

Research: Gardner, Lally & Rebar (2024), https://doi.org/10.1111/aphw.12600, evaluated *self-reported* one-item automaticity measurement against a fuller index on 16 datasets (16,838 participants). This does **not** validate AI diary classification as self-report, nor the StepMark curve.


## v2.1 bounded-query evidence isolation (2026-11-15)

A subsequent audit found a subtle selection failure: the progress endpoint fetched 80 recent reflections before filtering to explicit self-reports. Large amounts of AI-coded or plain unrated diary entries could crowd out older valid direct ratings, producing a false "no evidence" status. The due-review endpoint likewise applied `take:60` before the self-rating check.

- Both routes now filter `initiationLevel IS NOT NULL` in the database *before* limiting results (120 recent direct ratings); both use a stable descending timestamp/ID order.
- In the progress endpoint, the total historical count of **AI-only completed annotations without a direct rating** is computed in a separate owner-scoped aggregate. It remains excluded from scoring and review decisions. The additive response field `aiAnnotationCountScope="historical_unconfirmed_ai_only"` explains this exact denominator.
- Added PostgreSQL multiuser integration regression for 105 newer AI records, one 65-day-old self-rating, equal progress between dashboard and due-review API, and no cross-user count leakage.
- No schema migration; the existing `(habitId,createdAt)` index supports owner-scoped time ordering. Both queries are bounded by a published product cap; if an individual has >120 direct ratings on the same day or concentrated period, longer-range day coverage still needs a dedicated deduplication query. Avoid claiming exhaustive lifetime evidence.
- The historical score may increase relative to the previous flawed selection if direct evidence is newly visible. This is evidence retrieval correction, not a psychological effect.

## v2.2 conversational parity (2026-11-15)

`executeAssistantCommand(check_progress)` was still using a `take:80` mixed-reflection query after the dashboard correction. AI-only notes could cause the conversational answer to disagree with the dashboard. It now uses the same owner-scoped database-side self-report filter and deterministic 120-row ordering. Added a real PostgreSQL test with 95 newer AI annotations, an old direct rating, a second tenant and a read-only AI check-progress command. No new AI request or DB migration.
