# StepMark deployment blueprint: Alibaba Cloud ECS + Cloudflare DNS

**Status: infrastructure blueprint only.** No server, database, DNS record,
certificate, live deployment, or payment is created by these files.

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
   Configure verified transactional email before public registration.
3. Back up the database and apply versioned Prisma migrations with a
   **separate privileged migrator** using the checked-out source and
   npm ci / npm run db:generate /
   npm run db:deploy --workspace @stepmark/web. Do not give the web runtime
   schema-change privileges. Test rollback/restore before production.
4. Set Cloudflare's A/AAAA record for stepmark.xin to the **real ECS IP**.
   During the initial Caddy certificate issuance, use **DNS only** (grey
   cloud), ensure port 80/443 are reachable and wait for a valid HTTPS
   certificate. Do not point DNS at an invented IP.
5. From this directory, run:
   docker compose -f compose.yml up -d --build
   docker compose -f compose.yml ps
   docker compose -f compose.yml logs --tail=100 web proxy
   Confirm https://stepmark.xin/ works and the unauthenticated API probe
   returns 401 JSON before enabling Cloudflare proxy.
6. Optionally turn on Cloudflare proxy (orange cloud) and set SSL/TLS to
   **Full (strict)**. Never use Flexible TLS. Avoid "Cache Everything" for
   /api/, login, dashboard, assessment, or any user-specific responses.
   Lock down direct origin bypass, preserve HTTPS and verify certificate
   renewal. The initial template intentionally does not trust incoming
   client-IP headers; before public traffic, implement authenticated ingress
   IP forwarding and per-user/IP abuse protection.
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
- The current sourceKey rate-limiter deliberately treats untrusted proxy
  headers as a shared bucket. This is **not** sufficient for public traffic
  behind Cloudflare: implement and test a trusted ingress address strategy
  before removing the alpha restriction.
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
