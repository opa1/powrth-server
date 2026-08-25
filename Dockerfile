# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS builder

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Generate Prisma client before compiling TypeScript (types are needed for tsc)
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN pnpm prisma generate

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm run build

# ─── Stage 2: Production ─────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS production

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable

# Install production dependencies only. `prisma` (the CLI) is a real
# dependency — not just carried over from the builder — because deploy.sh
# runs `prisma migrate deploy` via a one-off container using this image.
# pnpm's node_modules is symlink-based (no top-level path per transitive
# package), so cherry-picking node_modules paths across build stages isn't
# reliable; installing it directly here is what actually works.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ── Application ───────────────────────────────────────────────────────────────
COPY --from=builder /app/dist ./dist

# ── Prisma runtime files ──────────────────────────────────────────────────────
# schema.prisma + prisma.config.ts are needed by migrate deploy at runtime.
# The generated client path must match the `output` field in the generator
# block set during Phase 1 (default: src/generated/prisma).
COPY --from=builder /app/prisma          ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/src/generated   ./src/generated

# main.ts and prisma.config.ts both call process.loadEnvFile() at startup.
# In Docker, env vars are injected directly by the runtime — an empty .env
# satisfies the call without throwing and without overriding injected vars.
RUN touch .env

EXPOSE 3001 8765

CMD ["node", "dist/main.js"]
