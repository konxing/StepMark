# Habit progress v2 — only explicit personal ratings can affect growth (2026-11-14)

The deployed v1 blended human-reported ratings and confidence-filtered AI inferred initiation labels into its subjective progress score. An LLM self-assigned confidence is not a calibrated psychological reliability estimate. It could displace a direct same-day rating, inflate the 0–100 heuristic, and delay a review.

## Implemented safeguards
- v2 strictly validates all annotations, counts AI-coded entries separately as `aiAnnotationCount`, and excludes them from `automaticitySignal`, `evidenceCount`, stage stability and review scheduling regardless of confidence, including 1.0.
- Due-review queries now read only direct self-ratings. The progress endpoint still returns a bounded provisional AI count. Browser and WeChat interfaces explain the difference.
- Unit tests assert that adding AI annotations does not alter a person's score or review date. An integrated PostgreSQL multiuser test checks that AI-only data cannot suppress due reviews and cross-user evidence does not leak.
- `policyVersion=habit-progress-v2`; historical data are preserved, no migration or new outbound AI call. AI-heavy histories may show lower progress than v1: a scoring-policy correction **not personal regression**.
- The 0–100 curve still has unvalidated heuristic weights and is not a habit formation probability or mental-health diagnosis.

Research: Gardner, Lally & Rebar (2024), https://doi.org/10.1111/aphw.12600, evaluated *self-reported* one-item automaticity measurement against a fuller index on 16 datasets (16,838 participants). This does **not** validate AI diary classification as self-report, nor the StepMark curve.
