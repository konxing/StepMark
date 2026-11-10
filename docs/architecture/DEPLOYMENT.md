# Deployment gates
This project is a read-only preview and **not production ready for personal user data**.
Verify Node 22+ support; install dependencies with `npm install`; run `npm run test`, `npm run typecheck`, `npm run build`, and `npm run audit:prod`.
The repository currently lacks a dependency lockfile: before production, generate and commit `package-lock.json`, pin vetted patches and switch CI to `npm ci`.
Use HTTPS reverse proxy, separate DB runtime and migrator users, private network for PostgreSQL, secure secret manager, backup/recovery rehearsal and provider privacy reviews.
To test WeChat mini-program, import `apps/wechat-miniapp` in Developer Tools; replace tourist AppID with a verified AppID. No user-login or writes are available yet.
Do not open protected endpoints to anonymous traffic. All P0 SECURITY.md gates are mandatory.
