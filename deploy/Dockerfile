# StepMark's existing Next.js/Prisma Node runtime, not a Cloudflare Worker.
# Build locally/CI; never bake secrets or production DATABASE_URL into an image.
FROM node:22-bookworm-slim AS builder
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN npm ci --ignore-scripts
COPY . .
RUN npm run db:generate && npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /workspace
COPY --from=builder --chown=node:node /workspace/package.json ./package.json
COPY --from=builder --chown=node:node /workspace/node_modules ./node_modules
COPY --from=builder --chown=node:node /workspace/packages ./packages
COPY --from=builder --chown=node:node /workspace/apps/web ./apps/web
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@stepmark/web", "--", "--hostname", "0.0.0.0"]
