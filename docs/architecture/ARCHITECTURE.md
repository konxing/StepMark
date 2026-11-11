# Architecture decision record (ADR-001): modular monolith, evidence-first

## Goals
- Native WeChat mini-program + responsive public website sharing versioned JSON API contracts.
- New assessment constructs and rubrics without modifying core persistence or auth code.
- Historical scores reproducible using task, instrument, model and rubric version stamps.
- Future integration with AI Chat Web **without modifying it now**, and without copying its secrets or relying on shared session cookies.
- Fail closed: the current repo exposes only public read-only endpoints.

## Boundaries
- `packages/core`: pure deterministic formulas, registry, ports; no HTTP, database, provider SDK, or I/O.
- `packages/contracts`: Zod versioned API payload definitions, size limits, strict unknown-key rejection.
- `apps/web`: public UI, transport, later server-side auth and application services.
- `apps/wechat-miniapp`: app UX shell; wx.login code exchange to a backend **only in a future authenticated release**.
- `apps/web/prisma`: future relational persistence schema; migration not yet run.
- Later optional packages: `assessment-engine`, `habit-engine`, `ai-judge`, `insight-engine`, `identity-adapter`. Start with modular directories, not network microservices.

## Key invariants
1. Every persisted user-owned object is scoped by **server-authenticated** StepMark userId. Never trust userId in user body or path for access control.
2. Capability estimates must cite evidence records, estimator version, calibration version, and uncertainty status. They are not modified by habit events alone.
3. Immutability or append-only event log for raw task attempts, automaticity checks, and scoring versions. Corrections use superseding records and audit trails.
4. Prompts and model outputs are data; the model has no rights to write directly into ability estimates or account records.
5. API routes check authentication, authorization and input schema, rate limits, replay protection and retention policies before being switched on.
6. User-visible percentages are **not** automatically population percentiles.
7. Deleted accounts must trigger derived-data deletion / cryptographic erasure strategy and provider storage expiry.

## Persistence notes
The Prisma schema defines users, external identity mappings, sessions (hashed tokens, not raw tokens), abilities, immutable task attempts, provisional AI judgments, habits, event opportunities, automaticity checks, associations, audit logs.
Current schema is a draft. Before production, add migrations, verified tenant-level service repository methods, row-level protections where appropriate, retention policy, deletion/export workflow and concurrency tests.

## Future AI Chat Web integration
- Recommended: identity federation using OpenID Connect if AI Chat Web can operate as a conformant identity provider, or a separate server-to-server identity broker with signed, audience-bound short-lived tokens and subject mappings.
- Keep a canonical StepMark `User.id` and link external subjects in `ExternalIdentity(provider, providerSubject)`.
- Do not share a password database, APP_SECRET, MASTER_KEY, browser localStorage or raw session cookies.
- AI Chat Web may embed StepMark as a protected navigation surface or call capability-summary API with explicit user consent. A dedicated scoped token (e.g. `capability:read`) authorizes read-only summaries; training records require distinct permission.
- Never assume the two products share an origin, cookie scope or data-retention policy.
- Independent deployment remains functional if AI Chat Web is down.

## API contract plan
- GET /api/health — public, no PII
- GET /api/v1/catalog — public constructs (implemented)
- POST /api/v1/auth/wechat — not implemented; server exchanges single-use wx.login code with WeChat; must bind OpenID to StepMark identity, enforce anti-replay
- GET/POST /api/v1/habits — auth required; not implemented
- POST /api/v1/observations — auth required; intentionally returns 501
- POST /api/v1/assessments — auth required; intentionally returns 501
- GET /api/v1/ability-estimates — auth required; not implemented
- GET /api/v1/data-export, DELETE /api/v1/account — auth required; not implemented
- GET /api/v1/integration/capability-summary — scope-specific, no direct chat access without explicit consent; not implemented

Use `application/problem+json` / consistent error codes after transport layer is established. Pagination, idempotency keys, clock tolerance and quotas before exposing POST APIs.

## Scoring engine flow (planned)
Task attempt -> validate/scoped store -> deterministic objective checker OR bounded AI rubric judge -> provisional judgment -> calibrated aggregation -> versioned ability estimate -> new independent follow-up task.
Every step can be revised or replaced independently.

## Why not add microservices now?
Under 10 users / early exploration, a modular monolith reduces complexity and security attack surface. Extract services only when proven operational isolation or scaling needs justify it.
