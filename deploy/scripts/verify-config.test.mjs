import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const read=(path)=>readFileSync(resolve(root,path),"utf8");

test("production image builds existing Node Next.js/Prisma app without secrets",()=>{
  const docker=read("deploy/Dockerfile");
  const ignore=read(".dockerignore");
  assert.match(docker,/FROM node:22-bookworm-slim AS builder/);
  assert.match(docker,/npm run db:generate && npm run build/);
  assert.match(docker,/npm prune --omit=dev/);
  assert.match(docker,/USER node/);
  assert.match(docker,/--hostname", "0\.0\.0\.0"/);
  assert.doesNotMatch(docker,/ARG (DATABASE_URL|RATE_LIMIT_SECRET)|ENV DATABASE_URL=/);
  for(const rule of ["**/.env","**/.env.*","deploy/production.env",
    "private-banks","**/private-banks","apps/web/src/generated"]){
    assert.ok(ignore.split("\n").includes(rule),"missing Docker context exclusion "+rule);
  }
});
test("single-server preview keeps Node and database ports off the public interface",()=>{
  const compose=read("deploy/compose.yml");
  const caddy=read("deploy/Caddyfile");
  assert.match(compose,/APP_ORIGIN: https:\/\/stepmark\.xin/);
  assert.match(compose,/TRUSTED_CLIENT_IP_HEADER: x-real-ip/);
  assert.match(compose,/STEPMARK_INGRESS_MODE: caddy-direct/);
  assert.match(compose,/production-preflight\.mjs && node \/workspace\/apps\/web\/scripts\/check-database\.mjs && exec npm run start/);
  assert.match(compose,/maintenance:\s*\n/);
  assert.match(compose,/prune-expired\.mjs", "--loop"/);
  assert.match(compose,/image: stepmark-web:local/);
  assert.match(compose,/\/api\/health/);
  assert.match(compose,/env_file:/);
  assert.match(compose,/\.\/production\.env/);
  assert.match(compose,/expose:\s*\n\s*- "3000"/);
  assert.doesNotMatch(compose,/- "3000:3000"|- "5432:5432"/);
  assert.match(compose,/- "443:443"/);
  assert.match(caddy,/stepmark\.xin\s*\{/);
  assert.match(caddy,/reverse_proxy web:3000/);
  assert.match(caddy,/header_up X-Real-IP \{remote_host\}/);
  assert.match(caddy,/header_up -CF-Connecting-IP/);
  assert.match(caddy,/max_size 64KB/);
  assert.doesNotMatch(caddy,/tls\s+internal|https:\/\/\*|^\s*:3000\s*\{/m);
});
test("public deployment requires a private DB, strong secrets and explicit TLS",()=>{
  const env=read("deploy/production.env.example");
  assert.match(env,/DATABASE_URL=postgresql:\/\//);
  assert.match(env,/sslmode=require/);
  assert.match(env,/RATE_LIMIT_SECRET=/);
  assert.doesNotMatch(env,/TRUSTED_CLIENT_IP_HEADER=(x-real-ip|cf-connecting-ip)/);
  assert.match(read("deploy/README.md"),/ICP/);
  assert.match(read("deploy/README.md"),/Full \(strict\)/);
});
