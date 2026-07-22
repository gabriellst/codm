# template-fullstack

Polyglot fullstack **SaaS template** built with **DDD**, **Clean Architecture**, **CQRS**, and **Event-Driven Architecture** — paired with an opinionated agentic-coding workspace (skills, agents, slash commands).

It is not an empty scaffold: single-`ownerId` tenancy (**owner** context), **billing** (subscriptions, invoices, multi-gateway with an offline sandbox provider), **quota** (plan limits + resource governors), **notifications** (fan-out + inbox), and **auth** (BetterAuth user + UserProfile + FCM tokens) ship implemented end-to-end, with a `ui` BFF context serving the frontends. Repo identity (npm scope `@template`, Go module prefix, brand) lives in `template.config.ts` — rebranding a fork is editing that file and regenerating, never a codemod.

## Stack

| Package | Stack | Role |
|---|---|---|
| `packages/contracts` | TypeSpec + Drizzle | Source of truth: cross-boundary enums, integration events, DB schema (single squashed baseline migration) |
| `packages/contracts/generated/{typescript,go}` | codegen output | Per-language wire bindings consumed by services |
| `packages/api/typescript` | Bun · Drizzle · tsyringe-neo | Core domain: `auth`, `owner`, `billing`, `quota`, `notifications`, `shared`, `ui` (BFF) |
| `packages/api/go` | Go · fx · pgx · net/http | Worker service (module `template/api-go`; framework core at `packages/api/go/core`) |
| `packages/app/react` | React 19 · TanStack Router/Start · Vite | App (served under `/app`) — auth, dashboards, mutations |
| `packages/app/astro` | Astro 5 · MDX · Tailwind 4 | Landing pages + blog + SEO (served at `/`) |
| `packages/app/expo` | React Native · Expo Router · Uniwind | Native mobile (iOS + Android) |
| `packages/app/styles` | CSS design tokens | Shared tokens for `app-react` + `app-astro` |
| `packages/client` | Kubb / oapi-codegen | Generated SDKs; TS output committed at `packages/client/dist/typescript` (`@template/client-typescript`) |
| `packages/e2e` | Playwright | 5 canonical cross-stack flows (`packages/e2e/tests/README.md`) |

Build is orchestrated by **Nx** for TS targets + **Go modules** for Go. Both backends share a **single Postgres** (Drizzle owns migrations) and talk to each other through a **transactional outbox + Redis streams `ExternalMediator`** — no Kafka.

## Quick start

```bash
cp .env.example .env             # fill JWT_SECRET, BETTER_AUTH_SECRET; keep BILLING_SANDBOX=true
bun install
bun docker:compose               # postgres + redis + LGTM observability
bun migrate:dev                  # apply the Drizzle baseline migration
bun sdk                          # generate the typed client from OpenAPI
bun dev                          # api-ts:3030 + api-go:3032 + app-react:5173 + app-astro:4321
```

## Sample walkthrough — the owner context

The **owner** context is the tenancy axis every other context hangs off. It demonstrates the architecture end-to-end:

- **Use case** `CreateOwner` (`packages/api/typescript/src/owner/usecases/CreateOwner.ts`) — validates input with Zod, builds the `Owner` entity (invariants at construction), saves entity + `OwnerCreatedEvent` in one transaction (outbox).
- **Controllers** (`owner/controllers/`) — `CreateOwner`, `SetActiveOwner` (stamps `session.ownerId`), `Enable/DisableOwner`, `UpdateOwnerSettings` — all surfaced to the frontends via the SDK.
- **Middleware** `RequireOwner` (`owner/middlewares/RequireOwner.ts`) — the single-tenant authorization gate: parses the session, loads the `Owner`, asserts the authenticated user is its `responsibleUserId`, stamps `ctx.ownerId` for downstream controllers.
- **Consumed by billing** — `billing/controllers/CreateSubscription.ts` composes `AuthAccountMiddleware` + `RequireOwner`; the subscription is keyed by `ownerId`, and **quota** derives entitlements from the active plan.
- **E2E** — `packages/e2e/tests/03-owner-create.spec.ts` and `04-billing-subscribe-cancel-quota.spec.ts` exercise the flow cross-stack.

Multi-user tenancy (members, roles, invites) is deliberately **not** in the base — graft the exemplar under `examples/tenant-membership/` when a product needs it.

## Agentic-coding template

The repo ships with a complete `.claude/` workspace:

- `.claude/skills/` — Playbooks per artefact (`entity`, `usecase`, `controller`, `route`, `component`, …). Each has a `SKILL.md` plus `registry.yaml` capturing bad practices.
- `.claude/agents/` — Subagent definitions (`backend-developer`, `frontend-developer`, `database-architect`, `code-reviewer`, …).
- `.claude/commands/` — Slash commands (`/brainstorm`, `/plan`, `/build`, …) for the end-to-end pipeline.

Read `docs/AGENTIC_CODING.md` for the full overview.

## Documentation

- **`CLAUDE.md`** — Project orientation: first-class citizens, architecture summary, commands.
- **`docs/BACKEND.md`** — Backend deep dive.
- **`docs/FRONTEND.md`** — Frontend deep dive.
- **`docs/CLI.md`** — Frontend scaffolder reference (`bun cli`).
- **`docs/COMPONENTS.md`** — UI primitives.
- **`docs/ECOSYSTEM.md`** — Repo family, ownership tiers, sync model.
- **`docs/CORRECTNESS.md`** — The optimization system behind the patterns.
- **`.claude/skills/<name>/SKILL.md`** — Per-artefact playbook.

## License

MIT.
