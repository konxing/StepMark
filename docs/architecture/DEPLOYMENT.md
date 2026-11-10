# Environment and deployment notes

This is a **preview scaffold**. Running `npm run dev` starts only the Next.js local web preview; it does not activate accounts or database writes.

## Platform prerequisites
- Node.js >=22
- npm with dependency installation access
- Public production: TLS reverse proxy, domain, controlled backend, secure PostgreSQL network, verified WeChat AppID + request domains
- Check up-to-date Next.js/React/Prisma security advisories before deployment and lock patch releases.

## Development verification
```bash
npm install
npm run test
npm run typecheck
npm run build
npm run audit:prod
npm run dev
```

## Intended safe production checklist
1. Adopt secure authentication, owner checks and per-user rate limits before enabling writes.
2. Configure real PostgreSQL DB URL in secret manager (never public env or git). Use dedicated runtime and migrator roles.
3. Test migrations in staging and rehearse restore.
4. Review CSP and implement nonce/hash approach for production as needed; verify app router scripts.
5. Deploy read-only preview at a staging domain, do not solicit or store real private personal assessments yet.
6. For mini-program developer tools: import `apps/wechat-miniapp`, replace tourist AppID with approved AppID; use registered HTTPS request domain and official code2Session exchange **only after implementing backend auth**.
7. CI currently performs `npm install` because repository lockfile has not yet been generated. **P0 must generate and commit a lockfile; change CI to `npm ci` before production readiness.**
8. Security gates in SECURITY.md are mandatory before public beta.

## No default credentials
There are no demo users, no sample administrator passwords, no anonymous write APIs, and no hard-coded provider secrets.
