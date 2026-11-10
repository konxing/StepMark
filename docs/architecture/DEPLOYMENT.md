# StepMark deployment and verification

## Current state
Multiuser Alpha. Development branch contains working authenticated account/WeChat endpoints, owner-scoped habits, experimental reasoning tasks, and PostgreSQL integration tests. **Not production cleared**. No modification to AI Chat Web.

## Windows + PostgreSQL local setup
1. Install Node.js 22+, PostgreSQL 16+ and Git. Create a database and least-privilege test user.
2. Check out `feat/research-backed-foundation`.
3. Run `npm ci`, then copy `apps/web/.env.example` to `apps/web/.env`.
4. Set `DATABASE_URL`, `APP_ORIGIN=http://localhost:3000`, a new `RATE_LIMIT_SECRET`. To enable email account sign-up, configure an authenticated Resend sender with `RESEND_API_KEY` and `AUTH_FROM_EMAIL`.
5. Run `npm run db:generate`, `npm run db:deploy --workspace @stepmark/web`, `npm run db:seed --workspace @stepmark/web`.
6. Run `npm run dev`. Visit /register, /dashboard, /assess.

## WeChat
- Obtain a legitimate mini-program AppID through WeChat; set server-only WECHAT_APP_ID and WECHAT_APP_SECRET.
- Register the HTTPS request domain in official mini-program backend. Put only PUBLIC API base URL in `apps/wechat-miniapp/config.js`.
- Import native project into WeChat developer tools. HTTPS, code2Session and token revocation must be validated with official accounts.
- The first verified WeChat OpenID creates a distinct StepMark User. Linking to web/email accounts requires future explicit ownership verification.

## Production tasks
- Provision DB and runtime credentials separately, backups with restore testing, migration rollback strategy.
- Check security gate list in SECURITY.md; especially CSP, WAF, sender verification, domain/TLS, legal documents and pen test.
- Deploy migrations via `npm run db:deploy --workspace @stepmark/web` with a migrator role, not by allowing runtime to create schema.
- Run `npm run db:prune --workspace @stepmark/web` as a trusted daily scheduled server task to remove expired rate buckets and session artefacts.
- Keep Next.js server and PostgreSQL in a trusted network; no direct database port exposed publicly.
- Benchmark on target hardware with real CDN and DB network; public/local only read-only Node smoke test: `node apps/web/scripts/perf-http.mjs`.

## Safety warnings
- Demo reasoning items are not psychometrically calibrated. Raw task score should never be sold as a human skill percentile.
- Behavior completion cannot directly add ability points.
- The Resend/email integration is synchronous for registration/recovery; it can take multiple seconds if provider is slow and deserves a queued outbox if traffic grows.
- Registering public users requires production rollout of all security and privacy blockers, even if CI is green.
