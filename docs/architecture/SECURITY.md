# Security baseline and production launch checklist

**Do not interpret this scaffold as ready for exposure to real users.** Public preview has no login, no private data and no active writes. POST submission handlers fail closed with HTTP 501.

## P0 blockers before public beta (all mandatory)
- [ ] Update and pin vetted dependency versions; commit a lockfile; review npm audit and relevant upstream advisories; run CI dependency scans.
- [ ] Enforce HTTPS/TLS through trusted reverse proxy; HSTS once TLS is correct; secure deployment secrets; no secret in Git, JS bundle, wx mini-program or logs.
- [ ] Implement authenticated sessions: server-side signed/hashed opaque tokens in HttpOnly Secure SameSite cookies for web; CSRF origin + token checks for state-changing cookie-auth requests.
- [ ] WeChat `wx.login` code must be exchanged server-to-server via official code2Session; never treat a client-submitted OpenID as authentic. AppSecret stays server-side. Limit replay and verify AppID.
- [ ] Subject binding and authorization per operation, with ownership checks at database query level; include tests: user A cannot read/write user B's data; IDOR prevention for UUIDs too.
- [ ] Per-user + per-IP rate limits and abuse controls at the trusted edge and application; avoid trusting spoofed X-Forwarded-For.
- [ ] Strict request size/content type validation, Zod schema, HTML sanitization for any rich text, parameterized ORM queries. Never execute task/AI output as JS or SQL.
- [ ] AI tool access disabled by default. Isolate prompts from untrusted content, reject tool calls not permitted by a scope policy, schema-validate outputs, enforce budget/token/timeouts and user quotas.
- [ ] Safe CORS allowlist for explicitly cross-origin clients if needed; no wildcard credentialed origins. Mini-program requests must use registered legal HTTPS domains.
- [ ] Per-user data export and deletion, consent and age-appropriate privacy policy; retention periods for voice, task responses, analytics and AI provider processing; separate consent for identifiable recordings.
- [ ] Logs: record actor/action/timestamp/correlation ID, NOT raw passwords, tokens, chat text, audio or full task answers.
- [ ] Automated backups, encrypted at rest and in transit, recovery rehearsal, key rotation and rollback plan.
- [ ] Follow OWASP ASVS 5.0 and API Security Top 10; perform threat model, SAST, dependency scanning, pen testing before launch.
- [ ] Prevent accidental publishing of Prisma Studio/database admin, metrics, debug endpoints and internal services.
- [ ] Public research-preview disclaimer remains visible until user flows are verified; do not expose unpublished questions via public catalog.

## Current implemented controls
- Only health and static catalog exposed without authorization.
- Authenticated observation and assessment write handlers return HTTP 501.
- No AppSecret, AI token, DB URL or private user data checked into repository.
- Next.js uses security response headers; CSP currently contains `unsafe-inline` to preserve Next.js compatibility in development. **Tighten to a tested nonce/hash-based CSP before P0 launch**.
- Zod strict, bounded schemas prepared for future authenticated handlers. They are **not** wired into an active write endpoint yet.

## Operational deployment
- Put app behind a managed reverse proxy/WAF, secure DNS and HTTPS; expose only 443.
- Do not run Prisma migrations automatically on request, nor use the database superuser for the app connection.
- Restrict private database access to backend network only, separate DB roles for migrations/runtime.
- Configure alerts for auth anomalies, sudden AI usage and 5xx, but minimize personal data in telemetry.
- Evaluate China-region privacy/security and WeChat review requirements with current official documentation before publication.

References:
- https://owasp.org/www-project-application-security-verification-standard/
- https://owasp.org/API-Security/
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
