# Agent execution plan (implementation backlog)

## Mission
Turn StepMark's research foundation into a secure web + WeChat mini-program product. Maintain rigorous separation of objective ability evidence, habit automaticity and AI-generated hypotheses. Work only in StepMark; do not modify AI Chat Web.

## Mandatory operating procedure
1. Inspect current repository before editing. Read README, SECURITY, RESEARCH_AND_FORMULAS and package contracts.
2. For each phase, write an ADR for significant decisions, implement a minimal end-to-end vertical slice, add tests and a migration plan.
3. Never invent empirical validation, psychometric norms, habit-completion thresholds, or causality. Make research assumptions visible in UI and stored metadata.
4. Never request a private token in chat, commit a secret, or turn on unauthenticated write endpoints.
5. Run typecheck, core tests, build, dependency audit, and security tests in CI. If dependency installation is impossible, report unverified steps, do not claim a passing build.
6. All AI-related features must have provider-independent interfaces and offline/deterministic fixtures in tests.
7. User experience in Chinese, accessible keyboard/touch UI. Avoid burdensome daily survey demands; choose minimal measurements based on uncertainty reduction.
8. At end of each phase, summarize code paths, tests, known limitations and remaining risks.

## P0: deployment foundations and identity (required before private features)
- Pin compatible patch releases of Next.js, React, Prisma; create npm lockfile; CI with install, test, typecheck, build, audit.
- Add production-ready reverse-proxy settings, HTTPS, secure cookie sessions, CSRF protections, rate limiting, account lockout/abuse defenses and tracing without personal payloads.
- Add database migrations, immutable audit trail, consent/retention, data export, delete-account flow.
- Implement local email login with verified email OR secure OIDC identity provider. Never use insecure demo login on publicly reachable instances.
- Implement WeChat official login code exchange on server with idempotency/replay protection; map provider subjects to canonical local user, do not put secret in clients.
- Verify multiuser isolation in integration tests, concurrent writes, request limits, malformed JSON, xss, CSRF, unauthorized and revoked-token tests.
Acceptance: anonymous user cannot read/write personal records; every access is ownership scoped; no secrets in client bundle; rate limit, CSRF, login replay and deletion tests pass.

## P1: ability assessment vertical slice
- Define task specification format: immutable item ID+version, construct ID, difficulty metadata, duration/device constraints, rubric anchors, scoring function and source/license.
- Create at least 2 independent logical reasoning task forms, and 2 anchored expression tasks; keep calibration claims disabled.
- Persist attempts, raw objective correctness, task versions, response evidence and device metadata. Explicit invalid/excluded attempt handling.
- Deterministic scoring service; UI displays task scores and attempt history, not population-normalized scores.
- Use an independent retest form and quantify practice effects. Validate human agreement for expressions before enabling AI judge.
Acceptance: repeatable scorer and API with authorization tests, reproducible scores and visible uncertainty/limits.

## P2: habit evidence and individualized training
- Full habit CRUD, context-linked opportunities (not daily streak assumptions), deduplication and user ownership.
- Low-burden automaticity questionnaire with validated localized SRBAI-like instrument only if licensed/validated; otherwise label as experimental product measure.
- Plot completion/eligible opportunity ratio independently from habit automaticity and skill.
- Fit asymptotic curves only after sufficient observations with uncertainty; never display "100% habit formed" from count alone.
- Personalized micro-habit plan connected to construct via evidence-grade hypothesis, including if-then cue and optional reminders.
Acceptance: no eligible opportunity => missing value not zero; fit requires observations; user can revoke prompts; missing days handled separately.

## P3: AI judge and coach
- `AIJudge` port implemented with vendor adapters (model, prompt/rubric versions, structured output schema, limited retries, quota, timeout, circuit breaker).
- Offline gold corpus and >=2 independent human annotators, disagreement resolution. Calculate reliability, reproducibility, subgroup checks; define acceptance thresholds before live scoring.
- Prompt-injection resistance: uploaded text never carries instructions to tools or auth. No model direct write to ability estimates.
- AI recommends training; server applies policy, consent and cost limits; log provenance and allow score-review requests.
Acceptance: judge output provisional until calibrated, errors bounded, replay fixtures deterministic, no score improvement fabricated by model.

## P4: longitudinal models and user-specific effectiveness
- Introduce calibrated IRT only when enough item-response data support stable item parameter estimation; otherwise defer.
- Measurement invariance, form equating, holdouts, reliability, uncertainty and retest contamination analysis.
- N-of-1 randomized or carefully balanced interventions when possible, exposure/outcome metadata and confounder tracking. No causal claims from correlation.
- Measure near/far transfer on novel tasks and the retention of improvements.
Acceptance: clearly distinguish task practice gains from generalized transfer.

## P5: future AI Chat Web interop (NO edits to AI Chat Web now)
- Publish versioned `/api/v1/integration/capability-summary` contract with scoped OAuth/OIDC or trusted broker, user consent and restrictive read-only access.
- Keep StepMark canonical user IDs; map external AICHAT subject in `ExternalIdentity`.
- Integration tests with mock token issuer (audience, issuer, expiry, replay, revoked consent, identity mismatch).
- Do not share raw cookies, APP_SECRET or MASTER_KEY.
Acceptance: StepMark remains deployable independently; AI Chat Web never receives private task raw data without separate, explicit authorization.

## P6: launch hardening
- Threat modeling and penetration test, dependency/license audit, privacy compliance, WeChat policy review, backup/restore and monitoring runbook.
- No blanket claim that ability scores diagnose medical conditions or aptitude. Clearly provide reviewable evidence, estimates and uncertainty.
- Production cutover only when P0 security checks are complete.

## Suggested issue titles
1. [P0] Build reproducible CI and production security gate
2. [P0] Add authenticated user / ownership-scoped persistence
3. [P0] Implement WeChat server-side login exchange
4. [P1] Versioned assessment task registry and scoring API
5. [P1] Independent reasoning and expression retest forms
6. [P2] Context-linked habit tracking and automaticity checks
7. [P3] Versioned AI scoring adapters and human-calibration dataset
8. [P4] Longitudinal change and transfer validation
9. [P5] AI Chat Web federation adapter and consented capability summary
