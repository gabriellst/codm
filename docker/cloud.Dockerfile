# syntax=docker/dockerfile:1
# =============================================================================
# cloud profile image — CODM_PROFILE=cloud boots the SAME api-typescript daemon
# (packages/api/typescript/src/index.ts), restricted at runtime to auth+owner+shared
# (see packages/api/typescript/src/shared/cloud-profile.ts) — better-auth
# (GitHub/Google) + owner tenancy, no agent runtime, no channel gateway.
#
# One Dockerfile serves BOTH `docker compose -f docker/cloud.compose.yml up` today
# and a Railway deploy tomorrow (AC-1, .specs/2026-08-06-sp2-conta-oauth-design.md)
# — Railway builds this exact file, unmodified; CODM_PROFILE/CODM_DATA_DIR below are
# the only product-specific choices baked in, and Railway's own env var UI can still
# override anything from the outside.
#
# Structurally mirrors docker/Dockerfile.api (same bundle, same distroless runner —
# see its comments for the libsql/migrations staging rationale). The delta is:
#   - ENV CODM_PROFILE=cloud / CODM_DATA_DIR=/data + a declared /data VOLUME.
#   - `bun install --frozen-lockfile` (reproducible builds for a deploy image).
# Keep the two Dockerfiles in lockstep if the build stage itself changes.
# =============================================================================

# --- Stage 1: Build the API bundle with Bun ---
FROM oven/bun:latest AS builder

WORKDIR /app

# No database build args. The daemon owns an EMBEDDED SQLite file under CODM_DATA_DIR (a named
# volume in the cloud profile too — see the runner stage below) and applies the migrations itself,
# idempotently, on boot — there is no external database to point a build at.

COPY package.json bun.lock tsconfig.json tsconfig.base.json ./

# Full source for the backend and everything it imports at build time.
#   packages/contracts            → @codm/contracts + generated @codm/contracts-typescript
#   packages/api/typescript       → @codm/api-typescript + nested @codm/core-typescript
#   packages/client/dist/typescript → committed SDK @codm/client-typescript (ky is its only runtime dep)
COPY ./packages/contracts ./packages/contracts
COPY ./packages/api/typescript ./packages/api/typescript
COPY ./packages/client/dist/typescript ./packages/client/dist/typescript

# Manifest-only stubs for the remaining workspaces so `bun install` can resolve
# the full workspace graph (source lives in their own images / is unused here).
COPY ./packages/client/package.json ./packages/client/package.json
COPY ./packages/app/react/package.json ./packages/app/react/package.json
COPY ./packages/app/astro/package.json ./packages/app/astro/package.json
COPY ./packages/app/styles/package.json ./packages/app/styles/package.json
# app/tauri is a root package.json workspace member (desktop shell, unused by this image) — its
# manifest must be staged too, or `bun install` fails resolving the workspace graph (found while
# validating this Dockerfile — docker/Dockerfile.api predates this workspace and has the same gap).
COPY ./packages/app/tauri/package.json ./packages/app/tauri/package.json
COPY ./packages/e2e/package.json ./packages/e2e/package.json

RUN bun install --frozen-lockfile

ENV NODE_ENV=production

# Bundle the API to a single Node-runnable file (packages/api/typescript/dist/server.js) — the
# SAME build script the e2e node-boot smoke uses.
#
# `bun run --cwd <path> <script>` — NOT `bun --cwd <path> run <script>` (docker/Dockerfile.api uses
# the latter). Verified (bun 1.3.14): the latter silently prints `bun run`'s help/usage and exits
# 0 WITHOUT running the script — no dist/ is produced, and the COPY below would ship an empty/
# missing bundle with no build failure to catch it. Found validating this Dockerfile; flagged as a
# pre-existing defect in docker/Dockerfile.api (out of this task's scope to fix there).
RUN bun run --cwd packages/api/typescript build

# Pre-create the data dir HERE (root, shell available) so the runner stage below can COPY it in
# with correct ownership — distroless has no shell to `mkdir`/`chown` in the final stage, and a
# Docker named volume mounted over an unowned dir would be root-owned, which the non-root USER
# below cannot write to.
RUN mkdir -p /data

# --- Stage 2: Run on Node ---
FROM gcr.io/distroless/nodejs22-debian12 AS runner

WORKDIR /app

# The bundle keeps native/runtime deps (libsql, OpenTelemetry, BullMQ) external, so
# the installed node_modules travels with it for runtime resolution.
#
# Ship the WHOLE dist/ (not just server.js): the node build stages assets the bundle cannot inline —
# dist/schema/migrations (the drizzle-kit output the rewritten import.meta.url resolves to)
# and dist/node_modules/{libsql,@libsql/*} (the SQLite driver closure, including the host-triple
# native prebuild that no bundler can inline).
# Node's walk-up from /app/server.js finds dist/node_modules first, then /app/node_modules.
#
# NOTE: the distroless runner is `nodejs22-debian12` — a glibc image, which is what the staged
# `@libsql/linux-*-gnu` prebuild needs. Moving the runner to a musl/alpine base would need the
# musl prebuild staged instead.
COPY --from=builder /app/packages/api/typescript/dist ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder --chown=1000:1000 /data /data

ENV NODE_ENV=production

# CLOUD PROFILE — src/shared/cloud-profile.ts reads this as a raw process.env flag (not through
# core Config.ts — see that file's own docblock). Only the LITERAL string 'cloud' arms the filter;
# this is the ONE line that makes this image a cloud image instead of the desktop daemon build.
ENV CODM_PROFILE=cloud
# Embedded SQLite lives on a volume, not the image's writable layer — the container is disposable,
# the data is not. Mirrors the Go gateway's co-tenancy on the same file (see CODM_DATA_DIR doc in
# template.config.ts REPO.env) — nothing gateway-specific runs in this profile, but the SAME
# codm.db shape/migrations apply, so a future gateway sidecar could share this volume unmodified.
ENV CODM_DATA_DIR=/data
VOLUME /data

# The server binds Config.env.API_PORT (see packages/api/typescript/src/index.ts).
ARG API_PORT=3030
ENV API_PORT=$API_PORT

USER 1000:1000

EXPOSE ${API_PORT}

CMD ["./server.js"]
