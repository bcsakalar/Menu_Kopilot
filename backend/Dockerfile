# syntax=docker/dockerfile:1
# Build context: the repository root (`docker build -f backend/Dockerfile .`). One image serves the site and the API.
# Build this image on a dev machine or in CI — never on the 1 GB droplet (tsc + pnpm install would OOM).

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Exact version = package.json devEngines (corepack rejects ranges there).
RUN corepack enable && corepack prepare pnpm@11.27.0 --activate
WORKDIR /app

FROM base AS web
WORKDIR /web
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY web ./
RUN pnpm run build

FROM base AS deps
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/src ./src
RUN pnpm run build

FROM base AS prod-deps
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=256
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=web --chown=app:app /web/dist ./public
COPY --chown=app:app backend/drizzle ./drizzle
COPY --chown=app:app backend/package.json ./
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health > /dev/null || exit 1
# server.ts applies pending migrations (and the idempotent seed when SEED_ON_START=true) before listening.
CMD ["node", "dist/server.js"]
