# StepMark deployment blueprint: Alibaba Cloud ECS + Cloudflare DNS

**Status: deployable code and Compose blueprint, not a completed live deployment.** No server,
database, DNS record, certificate, live deployment or payment is created by these files.
Production start now checks actual database connectivity and required tables, and
Compose includes an automatic expired-auth-metadata cleanup service.

This path deliberately preserves the existing **Next.js 16 / Node.js 22 /
Prisma 7 / PostgreSQL** stack. A full Cloudflare Workers deployment would
require a separate vinext/OpenNext and Postgres compatibility audit. Cloudflare
here supplies DNS and (optionally) the CDN/WAF, **not** the application runtime.

## Select the region before buying anything

- For an early release without mainland ICP filing, consider Alibaba Cloud
  Hong Kong or Singapore **if the audience and latency tests justify it**.
  China mainland ECS/CDN requires the appropriate ICP filing/approval before
  public operation; a mainland rollout also needs separate compliance review.
- Start with one ECS instance for the Node web/proxy and an Alibaba Cloud
  managed PostgreSQL instance in the **same region/private network**.
  Do not expose port 5432. Confirm available PostgreSQL versions, backup
  retention, restore test, TLS support, and costs in the selected region.
- ECS sizing is a starting hypothesis, not a benchmark: a modest Linux VM
  with 2 vCPU and 4 GiB RAM may suffice for a small alpha. Benchmark the
  actual Next.js build/runtime and database workloads before paying for
  long commitments. Keep image build in CI or on a separate machine if needed.
- Configure the security group: public TCP 80/443 only, SSH only from an
  explicitly controlled administrator IP or a secure management channel.
  Do not expose TCP 3000 or PostgreSQL to the internet.

## Deploy after the user purchases and provisions infrastructure

1. Clone the repository onto the trusted ECS host. Install Docker Engine
   and the Docker Compose plugin from the vendor's verified repositories.
2. Copy production.env.example to **production.env** in this directory.
   Restrict permissions (e.g. chmod 600), replace all placeholder secrets,
   use the managed PostgreSQL private hostname and require provider-supported
   TLS. The example is intentionally not a runnable production secret set.
   Configure at least one sign-in channel: verified transactional email
   (required for web/desktop account onboarding) or real WeChat credentials
   (mini-program only). Neither configured will fail the production preflight.
   A syntactically valid key does not prove external provider delivery.
   Generate RATE_LIMIT_SECRET with Node.js, then paste the output into
   production.env (never commit the result):

       node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))'

   Before starting Docker Compose, from the repository root run:

       NODE_ENV=production APP_ORIGIN=https://stepmark.xin \
       STEPMARK_INGRESS_MODE=caddy-direct TRUSTED_CLIENT_IP_HEADER=x-real-ip \
       node --env-file=deploy/production.env apps/web/scripts/production-preflight.mjs

   Compose runs the same offline configuration check before starting Next.js.
   Missing/placeholder secrets, disabled database TLS, a wrong origin or an
   unverified ingress mode stop startup. This is not a database connectivity,
   backup, certificate, email-delivery or real-world latency test.
3. Back up the database and apply versioned Prisma migrations with a
   **separate privileged migrator** using the checked-out source and
   npm ci / npm run db:generate /
   npm run db:deploy --workspace @stepmark/web. Run these commands from the
   repository root with DIRECT_URL set to the private migration account,
   after confirming a verified backup; do not pass the migration credential
   into the web Compose environment. The public website image has its
   development Prisma CLI pruned and is NOT the migration environment.
   Confirm the runtime database user can SELECT/INSERT/UPDATE/DELETE its
   user tables, but cannot CREATE/ALTER schema. Test restore before production.
4. Set Cloudflare's A/AAAA record for stepmark.xin to the **real ECS IP**.
   During the initial Caddy certificate issuance, use **DNS only** (grey
   cloud), ensure port 80/443 are reachable and wait for a valid HTTPS
   certificate. Do not point DNS at an invented IP.
5. First verify database readiness against the **runtime** credentials:
   DATABASE_URL from production.env must reach the migrated database with
   proper TLS and SELECT privileges. Compose checks this before serving.
   From this directory, run:
   docker compose -f compose.yml up -d --build
   docker compose -f compose.yml ps
   docker compose -f compose.yml logs --tail=100 web proxy maintenance
   Confirm https://stepmark.xin/ works and the unauthenticated API probe
   returns 401 JSON. Keep Cloudflare DNS-only at this stage.
   The maintenance container runs only fixed, parameterized deletes for expired
   rate-limit buckets, login codes, verification tokens, revoked/expired sessions
   and 30-day-old AI command replay receipts. It runs after startup and once
   every 24 hours, retrying errors after 15 minutes. It never deletes habits,
   task attempts or user notes. Check its logs and restart alerts as part of
   production operations. The optional AI diary analysis worker remains a
   separately configured job; it is NOT started by this Compose template.
6. **Do not enable Cloudflare proxy (orange cloud) with this template.**
   Caddy currently overwrites X-Real-IP with the direct TCP peer; with
   orange-cloud enabled that peer is a Cloudflare edge, so unrelated users
   would share rate-limit buckets. A separate verified Cloudflare CIDR trust
   chain, origin-bypass protection and real-client-IP regression test are
   required first. Once that is implemented, use SSL/TLS **Full (strict)**,
   never Flexible TLS; never cache private API/login/dashboard responses.
7. From a separate machine run:
   node apps/desktop/scripts/check-deployment.mjs
   Then verify real browser login, cookie/CSRF behavior, registration email,
   password reset, WeChat (after registering the request domain in its
   administration console), desktop loopback PKCE, backup restoration and
   independent account isolation. Only then consider a public alpha.

## Security and release gates

- Do not commit deploy/production.env, database URLs, tokens or AI keys.
  Secrets live on the trusted server. Docker image is built without them.
- Caddy binds 80/443; the Next.js container only exposes port 3000 on a
  private Docker network. PostgreSQL is managed externally and private.
- Direct-to-Caddy ingress overwrites X-Real-IP from the TCP peer and
  strips unverified Cloudflare headers. Node port 3000 must remain private.
  The current sourceKey rate-limiter is **not** suitable for public traffic
  behind Cloudflare orange-cloud without verified CDN IP forwarding.
- The production startup preflight rejects obvious unsafe configuration and
  placeholder secrets, and requires an actual login channel. A separate
  one-shot database readiness check verifies connection, core tables and
  read privileges before starting. These cannot prove true entropy, network
  isolation, certificate identity, provider email delivery, or disaster recovery.
- The maintenance service inherits the same production.env file because it
  accesses the same private database. Protect this file and restrict who can
  inspect Docker container environment variables. Keep the application DB
  credential limited to data access, not schema changes.
- The existing experimental ability assessment is not a validated
  population-scale ability score. Hosting must not change the scientific
  release gate or publish private item banks.
- Do not publish an unsigned Windows preview as a signed stable installer.
  Run the documented Windows E2E and security acceptance first.

## Observed baseline (2026-11-18)

DNS for stepmark.xin resolved, but the API probe received HTTP 530 instead
of StepMark's expected unauthenticated 401 JSON. This means the public API
was **not ready**. It does not identify which provider setting is at fault;
the origin/server has not yet been provisioned by the project owner.
