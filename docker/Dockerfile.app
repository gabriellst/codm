# syntax=docker/dockerfile:1
# =============================================================================
# STUB — the web-frontend image is product-plug territory, intentionally not
# built here. Wire it up per your deployment target before shipping.
#
# Why a stub and not a faithful build: the web front end is no longer a single
# static SPA. It is a multi-process topology (see packages/app/react/nginx.conf):
#
#   • packages/app/react  — TanStack Start, built with the Nitro `node-server`
#     preset (vite.config.ts). `vite build` emits a Node SSR server under
#     `.output/` (entry `.output/server/index.mjs`) plus hashed client assets
#     under `.output/public/app/assets/*` (base: '/app/'). Served at /app/.
#   • packages/app/astro  — static landing + blog, `astro build` → `dist/`.
#     Served at / (locale prefixes, blog, sitemap/robots).
#   • nginx               — reverse proxy: proxies /app/ to the Start Node
#     server, serves Astro static at /, and the hashed assets directly.
#
# Running the Start Node server AND nginx AND the static Astro output together
# needs a process supervisor and a runtime layout that is deployment-specific
# (single container w/ supervisord, or split react-ssr + nginx services, or a
# platform like Railway/Vercel that hosts each separately). That orchestration
# is a product decision, so the template does not commit a build it cannot
# verify. The build steps themselves are stable and listed below.
#
# To make this real (single-container reference — adapt to your target):
#
#   Builder (oven/bun:latest):
#     COPY package.json bun.lock tsconfig.json tsconfig.base.json ./
#     COPY ./packages/contracts ./packages/contracts
#     COPY ./packages/client/dist/typescript ./packages/client/dist/typescript
#     COPY ./packages/app/react  ./packages/app/react
#     COPY ./packages/app/astro  ./packages/app/astro
#     COPY ./packages/app/styles ./packages/app/styles
#     # manifest-only stubs for the rest of the workspace graph:
#     COPY ./packages/api/typescript/package.json ./packages/api/typescript/package.json
#     COPY ./packages/api/typescript/core/package.json ./packages/api/typescript/core/package.json
#     COPY ./packages/client/package.json ./packages/client/package.json
#     COPY ./packages/e2e/package.json ./packages/e2e/package.json
#     RUN  bun install
#     ARG  VITE_API_URL
#     ENV  VITE_API_URL=$VITE_API_URL NODE_ENV=production
#     RUN  bun --cwd packages/app/react  run build   # → packages/app/react/.output
#     RUN  bun --cwd packages/app/astro  run build   # → packages/app/astro/dist
#
#   Runner: a Node base to run `.output/server/index.mjs`, nginx fronting it
#   with packages/app/react/nginx.conf, and the Astro `dist/` mounted at the web
#   root — glued by a supervisor (e.g. supervisord). Left to the product.
# =============================================================================

FROM busybox:stable AS stub

RUN echo "Dockerfile.app is a stub — configure the web-frontend image for your deployment target." > /USAGE.txt

CMD ["sh", "-c", "cat /USAGE.txt; exit 1"]
