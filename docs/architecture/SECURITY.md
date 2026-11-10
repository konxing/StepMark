# StepMark security gates and threat model

**Status: implemented multiuser security core, but NOT production cleared.**
This document distinguishes controls verified by tests from controls still required at deployment. Last updated 2026-11-10.

## Implemented, tested on ephemeral PostgreSQL

- Email register -> verification -> password session; server-side scrypt hash with per-account random salt, generic login failures, one-hour and 15-minute DB-backed limits, email verification and reset (Resend provider must be configured).
- Web sessions: random opaque token, SHA-256 hash stored in database, HttpOnly/SameSite=Lax/production Secure cookies, 14-day expiry, revocation. Session revocation tested.
- WeChat: official code2Session exchanged against a fixed HTTPS upstream on the server, app secret server-only, consumed code hashes prevent reuse, OpenID maps to canonical local identity. 24-hour random bearer token, hashed in DB. **Do not claim this links existing email and WeChat accounts**.
- API-owned habit/attempt queries use authenticated server principal and userId. PostgreSQL integration tests show A cannot access B's habits or event records. URLs and UUIDs are not authorization.
- Mutation CSRF origin check and Fetch Metadata check on web-cookie endpoints; bearer tokens use Authorization headers. Strict bounded JSON, schema validation, size limits, restricted task forms.
- Owner-scoped paginated export and explicit password reauthentication for destructive web account deletion; reset invalidates sessions.
- Single-use task submissions per user+task (DB unique constraint) and idempotent habit opportunity events (DB unique constraint), avoiding race-based duplicates.
- Rate-limiting persisted in indexed database buckets (atomic upserts); cleanup CLI is provided.
- Public catalog cached without private fields; private responses no-store. AI judgment cannot directly alter latent ability.
- Dependency lockfile, committed SQL migrations, CI tests/build/audit and actual PostgreSQL integration tests.

## Production release blockers (all must be resolved)
- [ ] Deploy HTTPS with controlled reverse proxy and verified `APP_ORIGIN`, ensure HSTS only after TLS validated; configure domain-specific access logging without personal payloads.
- [ ] Harden CSP to a vetted nonce/hash-based policy (current Next.js header still allows `unsafe-inline` for script/style) and run browser regression tests.
- [ ] Review registration abuse/bot defense under real traffic, apply WAF and trusted-edge IP control; never trust unstripped `x-real-ip` or `cf-connecting-ip`.
- [ ] Verify Resend sender identity, delivery failure recovery and anti-enumeration tests; limit mail provider cost and abuse. Check password reset UX.
- [ ] Complete production-accurate WeChat mini-program compliance, official domain verification, token storage/rotation threat review and API quota protection.
- [ ] Review retention, encryption at rest/backups, deletion and user data export with real policy/processor documentation; privacy page currently a **draft**.
- [ ] Adopt minimum-privilege DB role, distinguish migration vs runtime permissions. Consider PostgreSQL RLS as defense-in-depth after thoroughly testing per-user security context, rather than weakening existing server ownership checks.
- [ ] Perform independent threat modeling, SAST/dependency scans, manual pentest and tests for SSRF, reflected/stored XSS, SQL injection, cross-user data access, parameter pollution and credential abuse.
- [ ] Tighten operational observability: performance/error dashboards, least-privilege logging, backups/restore rehearsal, key rotation, session limits and storage alarms.
- [ ] Test concurrent traffic and p95 latency in staging on target hardware; current benchmark is local only and **does not establish public-service response time**.
- [ ] For AI modules, enforce explicit user consent, vendor DPA, short retentions, prompt-injection isolation, output schema, budgets, no arbitrary tool execution.

## Configuration rules
- `APP_ORIGIN`: exact browser origin, HTTPS in production; never infer it from attacker-controlled Host/X-Forwarded headers.
- `RATE_LIMIT_SECRET`: long independent random key shared across app replicas; never use CI example in production.
- `TRUSTED_CLIENT_IP_HEADER`: set only when a trusted proxy overwrites the chosen header; otherwise a shared fallback bucket limits abuse but can impede users.
- `DATABASE_URL`: not public; use server runtime role, pool limit and network firewall.
- `WECHAT_APP_SECRET` and `RESEND_API_KEY`: server-only secrets with periodic rotation.
- Raw mobile bearer tokens must not appear in logs; client should clear them on logout/expiry. Never expose session or password hashes via export.

## References
https://owasp.org/www-project-application-security-verification-standard/
https://owasp.org/API-Security/
https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
