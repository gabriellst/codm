# SPEC-17: Remove the video domain (Rust service, Go video workers, TS `/ui` + schemas)

**Wave:** 0   **Depends on:** (none — runs first)   **Status:** done

## Motivation

The repo's video-streaming surface is a showcase carried over from another project. The real domain is the e-commerce dashboard (`sales`, `catalog`, `billing`, `marketing`, `finance`, `analytics`/goals, `integration`, `tenancy`, `identity`). The video domain is **cleanly isolated** — no e-commerce context imports `video`/`channel`/`engagement`/`ui`, and the only inbound coupling is a nullable `videoId` column on `notifications.pushLog` plus one notifications handler. So the whole video domain can be removed without touching e-commerce.

Removing it **first** shrinks the surface for the rest of the batch: SPEC-02 no longer verifies a Rust emitter, and SPEC-10 no longer carries the `VideoFeedProjection` / `GetVideoFeed` rewrite (this spec deletes them outright).

> Largest spec in the batch (~21 pts). Stream **A** (Rust) is independent of **B–G** (Go + TS + contracts + frontend) and MAY land as two commits/PRs; kept as one spec per the request.

## Scope

### A. Rust service

- Delete crates: `packages/api/rust/`, `packages/client/dist/rust/`, `packages/client/generators/rust/`, `packages/contracts/generated/rust/`, `scripts/cli/backend/rust/`, `scripts/graph/adapters/rust/`; delete root `Cargo.toml` + `Cargo.lock`.
- Build: drop `api-rust` from root `package.json` `dev`/`dev:api`; delete `dev:api:rust` + `sdk:rust`; remove the rust step from `packages/client/package.json` `generate` + `packages/client/project.json`; delete `packages/api/rust/project.json`.
- Contracts: delete `codegen/emit-wire-rs.ts` (+ `.test.ts`); drop `codegen:wire:rust` + the `&& … rust` from `codegen:wire` in `packages/contracts/package.json`.
- Client SDK: delete `packages/client/lib/render/rust.ts`; drop the `rust:` key from `configureClient(...)` (`packages/e2e/utils/given/user.ts`).
- Env: remove `API_RUST_PORT` / `API_RUST_URL` / `API_RUST_EVENT_GROUP_ID` from `.env.example`; rust patterns from `.gitignore`.
- Skills/CLI: remove `rs → rust` alias + rust branch from `scripts/cli.ts` (+ `scripts/cli/backend/index.ts`); delete the 16 `.claude/skills/*/rust/` variant dirs.
- Docs: `CLAUDE.md` (workspace table, "Cargo workspace" line, `dev:api:rust`, skill-dispatch table) + `docs/BACKEND.md`.

### B. Go video worker contexts

- Delete `packages/api/go/internal/{analytics,search,transcoding}/` (entire trees + tests).
- `packages/api/go/cmd/api/main.go`: remove the three imports + `analytics.Module` / `search.Module` / `transcoding.Module` registrations.
- `go build ./... && go test ./...` green.

### C. TS `/ui` context (entirely video) — remove wholesale

- Delete the whole `packages/api/typescript/src/ui/` context (~37 files: all 5 controllers + 5 usecases, `VideoFeedProjection` + projector + `VideoFeedProjectionRepository`, registry, empty barrels).
- Wiring: `src/index.ts` — drop the `UIRouter` import + its entry in the routers array. `src/shared/registry.ts` — drop the `uiRegistry` import + the `...uiRegistry.{mock,integration,real}` spreads in `ALL_REGISTRIES`.

### D. `notifications` video parts (keep the rest)

- Delete `src/notifications/handlers/NotifySubscribersHandler.ts` (+ test) and drop its registration from `notifications/handlers/external.ts`.
- Delete the entire `src/notifications/repositories/SubscriptionReadRepository/` (video-only: queries `channel.subscriptions`).
- **Keep** everything else in `notifications` (order/integration handlers, push delivery, inbox, digest).

### E. Contracts DB schemas + migration

- Delete `packages/contracts/db/schema/{video,channel,engagement}.ts` and their exports in `db/schema/index.ts`.
- `analytics.ts`: remove the `videoWatchAnalytics` + `videoDailyStats` tables (and the `import { videos }`). **Keep** the e-commerce goal tables — the `analytics` schema stays.
- `search.ts`: remove the `searchIndex` table (whole file/schema goes if nothing else lives in `search`).
- `notifications.ts`: drop the `videoId` column from `pushLog` + the `push_log_user_video_kind_idx` index (keep the table; reindex on `(userId, kind)` if needed).
- Generate a migration dropping the `video`, `channel`, `engagement`, `search` Postgres schemas + the two analytics video tables + the `pushLog.videoId` column. `transcoding.transcoding_jobs` was never migrated.

### F. Wire events

- Delete the 9 video/engagement/channel `.tsp` events: `video-{uploaded,transcoded,published,archived}`, `reaction-added`, `comment-posted`, `view-recorded`, `channel-{subscribed,unsubscribed}`; remove their imports from `wire/events/index.tsp`.
- `bun emit-openapi && bun sdk` to regenerate contracts + SDK without them.

### G. Frontend

- `packages/app/react/src/lib/config.ts`: remove the unused `channelBaseUrl` constant. (No video routes/components/hooks/stores/i18n exist in react/expo/astro — confirmed.) Astro landing copy is already domain-agnostic — no change.

## Affected files

- **Rust:** Scope A dirs/files (exhaustive enumeration during `/plan`).
- **Go:** `internal/{analytics,search,transcoding}/**`, `cmd/api/main.go`.
- **TS:** all of `src/ui/**`; `src/index.ts`; `src/shared/registry.ts`; `src/notifications/handlers/NotifySubscribersHandler.*`; `src/notifications/repositories/SubscriptionReadRepository/**`.
- **Contracts:** `db/schema/{video,channel,engagement}.ts`, edits to `analytics.ts`/`search.ts`/`notifications.ts`/`index.ts`; `wire/events/{9 files}.tsp` + `index.tsp`; a drop migration; regenerated `generated/**` + SDK.
- **Frontend:** `packages/app/react/src/lib/config.ts`.
- **Docs:** `CLAUDE.md`, `docs/BACKEND.md`.

## Acceptance criteria

- [ ] No Rust remains: no root `Cargo.*`, no `packages/api/rust`, no rust nx target / `dev:api:rust` / `sdk:rust` / `emit-wire-rs.ts` / rust client SDK; `bun dev` starts only TS + Go.
- [ ] `packages/api/go/internal/{analytics,search,transcoding}` gone; `go build ./... && go test ./...` green.
- [ ] `src/ui/` is gone; `src/index.ts` + `src/shared/registry.ts` no longer reference it; the app boots (DI resolves) with no missing-provider errors.
- [ ] `notifications` keeps its non-video handlers; `NotifySubscribersHandler` + `SubscriptionReadRepository` are gone (no dead `VideoPublishedEvent` import).
- [ ] `video` / `channel` / `engagement` / `search` schemas dropped; the two analytics video tables dropped; `pushLog.videoId` removed — migration applies clean on a fresh DB.
- [ ] The 9 video/engagement/channel wire events are gone; `bun emit-openapi && bun sdk` regenerate cleanly.
- [ ] Frontend `channelBaseUrl` removed; `packages/app` type-checks.
- [ ] `bun tsc` clean; `bun run test` clean.

## Out of scope

- Every e-commerce context (`sales`, `catalog`, `billing`, `marketing`, `finance`, `analytics`/goals, `integration`, `tenancy`, `identity`) — untouched.
- The `analytics` Postgres schema and its goal tables (only the two video tables are dropped).
- Non-video `notifications` (push delivery, order/integration notifications, inbox, digest).
- Astro landing/blog content (already generic, not video-themed).
- Go `sync` / `webhooks` / `integrations` contexts.

## Notes

- Template repo, no production data → destructive drop migrations are fine; no backfill.
- **Run first.** After it lands, re-baseline `bun tsc` / `go build` / `bun run test` as Wave 1's clean starting point.
- **SPEC-10 reconciliation:** this spec deletes `VideoFeedProjection`/`VideoFeedProjector`/repo and the `/ui` feed, so SPEC-10 is left with only the sales projections (`OrderProjection`, `CartProjectionRepository`). SPEC-10 has been trimmed accordingly.
- **SPEC-02 reconciliation:** the Rust wire emitter is deleted here, so SPEC-02 only updates the Go emitter.
- The `.claude/skills/*/rust/` deletion is recommended (CLI no longer dispatches to rust) but cosmetic — split into a follow-up commit if it bloats the diff.
- Clean isolation confirmed during design: no e-commerce TS module imports `video`/`channel`/`engagement`/`ui`; the only inbound coupling was `notifications` (handled in D) and `pushLog.videoId` (handled in E).
