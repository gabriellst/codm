# codm

**codm** is a desktop-first product: AI agents you operate through your messaging channels — **WhatsApp today**, more channels coming soon. You pair a channel, attach a conversation to a workspace, and drive real work (issues, artifacts, code) by talking to your agent from your phone.

The desktop app is a **Tauri v2** shell hosting a React console and supervising two local sidecars — a **TypeScript daemon** (Bun) and a **Go gateway** (whatsmeow) — that share a **single SQLite file** on the user's machine. Identity is the one thing that is not local: a small **cloud profile** (auth + owner) is the authoritative source of who you are and which tenancy you belong to; the daemon mirrors the session and works offline from there. The decisions behind that split live in `docs/adr/`.

## How it works

```
WhatsApp ──► Go gateway (whatsmeow) ──► SQLite (shared file, outbox) ──► TS daemon
                                                                          │
             Tauri shell ◄── React console (BFF `ui` context) ◄───────────┘
                                          cloud profile (auth + owner) ──► identity
```

- **channel** (Go) — the WhatsApp bridge: pairing via QR, message ingest, receipts, presence, sync.
- **thread / agent / issue / workspace / artifact** (TS) — the product core: conversations attached to workspaces, agents that pick up issues and produce artifacts.
- **auth + owner** — identity mirrored from the cloud profile; the machine never invents an `ownerId`.
- **ui** — the BFF context serving the console's read models.

## Architecture

Polyglot fullstack descending from the `template-fullstack` architecture: **DDD + Clean Architecture + CQRS + Event-Driven**, with **TypeSpec-sourced contracts** generating cross-language bindings (TS / Go / Rust) and a wire-first SDK (controller Zod → OpenAPI → Kubb) shared by backend and frontend.

| Package | Stack | Role |
|---|---|---|
| `packages/contracts` | TypeSpec + Drizzle | Source of truth: cross-boundary enums, integration events, DB schema |
| `packages/api/typescript` | Bun · Drizzle · tsyringe | Daemon: product core contexts + `ui` BFF; cloud profile (auth + owner) |
| `packages/api/go` | Go · fx · net/http | Gateway: WhatsApp channel, projectors, schedulers |
| `packages/app/react` | React 19 · TanStack Router/Start · Vite | Console (served under `/app`) |
| `packages/app/astro` | Astro 5 · MDX · Tailwind 4 | Landing + blog + SEO (served at `/`) |
| `packages/app/tauri` | Tauri v2 (Rust) | Desktop shell + sidecar supervision + auto-update |
| `packages/app/ui` | React · CSS | UI primitives + design tokens shared by react + astro |
| `packages/client` | Kubb / oapi-codegen / progenitor | Generated SDKs (TS committed at `packages/client/dist/typescript`) |
| `packages/e2e` | Playwright | Cross-stack flows |

Both sidecars open the **same SQLite file** under `$CODM_DATA_DIR` and apply the same Drizzle-authored migrations idempotently at boot — there is no external database and no manual migrate step. Cross-context and cross-service facts travel through a **transactional outbox**; Redis streams back the external mediator in dev.

## Quick start

```bash
cp .env.example .env             # fill JWT_SECRET, BETTER_AUTH_SECRET, INTERNAL_SERVICE_KEY
bun install
bun docker:compose               # redis + LGTM observability (no Postgres — one SQLite file)
bun sdk                          # generate the typed client from OpenAPI
bun dev                          # api-ts:3030 + api-go:3032 + app-react:5173 + app-astro:4321
```

Prereqs: `bun >= 1.0`, `docker`, `go`, `cargo` (the contracts codegen builds a Rust crate). Full setup notes live in `CLAUDE.md` ("Environment Setup"); desktop packaging and the two release signatures are in `docs/RELEASE.md`.

## Documentation

- **`CLAUDE.md`** — project orientation: first-class citizens, commands, non-negotiables.
- **`docs/BACKEND.md`** / **`docs/FRONTEND.md`** — architecture deep dives per side.
- **`docs/CLI.md`** — frontend scaffolder (`bun cli`).
- **`docs/RELEASE.md`** — stable/beta tracks, auto-update, desktop signing.
- **`docs/ECOSYSTEM.md`** — the template family this repo descends from and syncs with.
- **`.claude/skills/`** — per-artifact playbooks used by the agentic workflow.

## License

MIT (`LICENSE`), with one exception: the WhatsApp gateway in `packages/api/go` is **GPL-3.0-or-later** (`packages/api/go/LICENSE`), because it statically links `whatsmeow` → `libsignal` (GPL-3.0). The gateway is a separate program (own binary, HTTP + shared SQLite), so the daemon, shell, console and landing stay MIT. Third-party licenses: `THIRD_PARTY_NOTICES.md`.
