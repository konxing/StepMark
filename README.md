# StepMark

Evidence-first personal capability assessment, habit automaticity tracking, and individualized learning. 
**Status: research preview — not a validated psychometric instrument or a public account service.**

StepMark intentionally separates:
1. **Capability evidence**: objective task outcomes, structured rubric evaluations, measurement uncertainty.
2. **Habit evidence**: opportunities, eligible completions, context cues, automaticity self-reports.
3. **Intervention evidence**: hypothesis linking a habit to a capability, separate pre/post measures and transfer checks.

A logged habit event **must not automatically increase a capability score**.

## Monorepo

```
apps/web                  Next.js public read-only preview; API v1 shell; Prisma schema
apps/wechat-miniapp       Native WeChat mini-program preview (no AppSecret, no auth yet)
packages/core             Versioned deterministic measurement / habit functions
packages/contracts        Versioned Zod wire schemas
docs/research             Source notes and explicit formula assumptions
docs/architecture         Integration boundaries, security, persistence
docs/agent                Work packages and acceptance criteria
```

## Local development

Requirements: Node.js 22+, npm, optional PostgreSQL for the **future** authenticated implementation.

```bash
npm install
npm run test
npm run typecheck
npm run dev
```

Open http://localhost:3000. The public catalog endpoint is `GET /api/v1/catalog`, the health endpoint is `GET /api/health`. 
**No writable business endpoint is active**, and the database is not connected to the UI yet.
`npm run db:generate` generates Prisma Client after installing dependencies. Do not run database migrations against production until the auth/storage implementation has been reviewed.

For a WeChat developer-tools preview, import `apps/wechat-miniapp` and provide your own verified mini-program AppID. 
Do not put AppSecret or model-provider keys in the mini-program.

## Security status

Current public pages are read-only, and submissions intentionally return 501. 
This is a **safe default**, not proof of production readiness; see [security checklist](docs/architecture/SECURITY.md).
Do not enable public user accounts or deploy private personal data until all P0 gates are met.

## Docs

- [Research and formulas](docs/research/RESEARCH_AND_FORMULAS.md)
- [Architecture and AI Chat Web compatibility](docs/architecture/ARCHITECTURE.md)
- [Security release gate](docs/architecture/SECURITY.md)
- [Agent implementation backlog](docs/agent/IMPLEMENTATION_PLAN.md)

## License

Apache-2.0; verify each third-party assessment instrument and task license separately.
