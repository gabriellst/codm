# Go exemplars — harvested from the medscall channel service

> **CONTEXT-ORIGIN:** `medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b` (2026-07-20) — **static verbatim snapshots, not live code.**
> Nothing here compiles in this repo (the files keep their original `monorepo/api/...` import
> paths and build only inside the source monorepo). They are reference material for the Go
> variants of the backend skills (`.claude/skills/<skill>/go/`).

## What this set is

One directory per citizen, 1–4 exemplary files each, copied **verbatim** from the medscall
channel service — a production Go + `net/http` + event-driven bounded context (WhatsApp
messaging gateway) that follows the same architecture this template teaches: entities raise
domain events, use cases orchestrate through a UnitOfWork + outbox, handlers republish
integration events, projectors maintain read-model tables, and an SSE controller streams the
event union to the frontend.

Identifiers, comments, and even formatting quirks are preserved exactly as they exist at the
pinned commit. The point is to show **real** instances of each citizen, not idealized ones.

## Provenance convention

Every file starts with a 3-line header:

```go
// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@<commit> (<commit date>)
// Source path: packages/channel/<repo-relative path>
// Harvested verbatim for the <citizen> skill exemplar set — do not edit; re-harvest instead.
```

- `CONTEXT-ORIGIN` pins the exact source commit; `Source path` is relative to the source
  monorepo root, so `git show <commit>:<source path>` reproduces the body exactly.
- The product-residue architecture rail scans `examples/` like live code. Only the
  `CONTEXT-ORIGIN` **line** is exempt — body text is never exempt, so residue cannot hide here.

## Re-harvest rule

**Never edit these files in place** — no renames, no "improvements", no partial fixes. If an
exemplar goes stale or a better instance appears in the source:

1. Pull the latest source and note `git rev-parse HEAD` + commit date.
2. Re-copy the file(s) verbatim and update the 3-line header to the new commit.
3. If a file stops being exemplary, replace it with a different source file — don't patch it.

A hand-edited "verbatim" file is worse than a stale one: it silently teaches a shape the
source never had.

## The set

| Citizen | Files | Why these |
|---|---|---|
| `entity/` | `channel.go`, `remote.go`, `base_entity.go` | Aggregate root with lifecycle methods that raise domain events + an `Apply` event-replay switch (`channel.go`); a rich aggregate with many invariant-guarded transitions (`remote.go`); the shared `BaseEntity` (ID/Version/domainEvents pull) they embed. |
| `value-object/` | `money.go`, `phone.go`, `id.go` | Self-validating immutable VOs: currency-guarded arithmetic, parse-vs-construct duality (`ParsePhone`), and the UUID wrapper with deterministic `HashedID` for idempotent business keys. |
| `enum/` | `message_type.go`, `channel_status.go`, `platform.go` | Closed string sets with the `// Values:` doc convention the OpenAPI emitter reads; `platform.go` adds the `IsValid()` method shape for cross-context enums. |
| `errors/` | `app_error.go`, `codes.go`, `errors.go` | The unified `AppError` type, the shared code → HTTP-status registry (`init()` + `RegisterErrorCodes`), and a bounded context's own code block layered on top. |
| `schema/` | `controller.go`, `events.go`, `validation.go` | Go's "schema" citizens: the declarative `ControllerMetadata` contract the OpenAPI emitter walks, the generic `DomainEvent[T]`/`IntegrationEvent[T]` envelopes with typed unmarshal helpers, and the validator/v10 wrapper that turns struct tags into `AppError`s. |
| `usecase/` | `send_text.go`, `connect_channel.go`, `create_channel.go` | Input/Output structs + handler shape: gateway orchestration with typed error mapping (`send_text`), stateful connect flow with non-fatal persistence (`connect_channel`), and the canonical UoW transaction saving entity + pulled domain events atomically (`create_channel`). |
| `controller/` | `send_text.go`, `connect_channel.go`, `list_channels.go` | Thin HTTP ports over use cases: body request (`from:"body"` + validate tags), path-param request, and query/header request (`X-Owner-Id` from session middleware). All declare `Metadata()` for route registration + spec emission. |
| `repository/` | `channel_repository.go`, `pg_channel_repository.go`, `message_projection_repository.go`, `pg_message_projection_repository.go` | Two interface + Postgres-impl pairs: the write-side aggregate repository (strict `(nil, nil)` not-found semantics) and a ProjectionRepository with the atomic-op vocabulary (`InsertIfNew`, `UpsertAllIfNew`, forward-only `UpdateDelivered`/`UpdateSeen`). |
| `service/` | `registry_service.go`, `registry_service_impl.go`, `gateway.go` | Interface + impl for an in-process stateful service (mutex-guarded live-connection registry) and the platform-gateway **port** file (types + `Channel`/`ChannelFactory` interfaces) that the WhatsApp adapter implements. |
| `event/` | `message_received.go`, `channel_connected.go` (domain) · `channel_message_received.go`, `channel_event.go` (integration) | **Domain events**: the payload + `EventName` const + `DomainEvent[T]` alias + constructor pattern — `message_received.go` also carries `@union`/`@variant` annotations for discriminated payloads. **Integration events**: the cross-service wrapper reusing the domain payload, and the `ChannelEvent` discriminated-union envelope over every channel event name. |
| `handler/` | `channel_connected_handler.go`, `message_received_handler.go`, `remote_created_integration_handler.go` | **Internal handler** doing transactional work (UoW + entity method + domain-event persistence, integration publish only after commit); **internal → integration republish** with payload enrichment; and the minimal pure-republish shape. See "what the source lacks" below for the missing inbound-external variant. |
| `projection/` | `message.go`, `remote.go`, `channel.go` | Free read-model records (`db` tags, no base class, no invariants) with forward-only `Apply*` mutation methods (`message.go`, `remote.go`) and the degenerate no-methods record (`channel.go`). |
| `projector/` | `message_projector.go`, `remote_projector.go` | One small projector struct per event (Go's shape for the Projector citizen): idempotent `InsertIfNew` creation paths, `find → Apply* → Save` mutation paths, and atomic-op edge cases, each documented inline. |
| `middleware/` | `session.go`, `apikey.go`, `logging.go` | Session-cookie → `X-Owner-Id` header resolution, global API-key guard, and a status-recording logger whose `Flush`/`Unwrap` passthrough keeps SSE streaming working through the chain. |
| `sse/` | `listen_events.go` | The SSE streaming controller: broadcaster over both mediators, per-client channels, ping keepalive, and the `EventPayloads` doc-type that drives the **oneOf/union response** in the emitted OpenAPI spec. This file is also the exemplar for a union-response controller. |

## Labels and gaps (recorded, not padded)

- **Union-response controller**: lives in `sse/listen_events.go` — in this source, the
  discriminated-union response surface *is* the SSE event stream (`EventPayloads` +
  `@union`-annotated payload types). No plain JSON endpoint in the source returns a oneOf
  body, so the SSE controller carries both roles rather than padding with a mediocre file.
- **External (inbound integration) handler**: the source genuinely lacks one. The Go channel
  service is a **producer** of integration events — `Register(IntegrationEventHandler)` is a
  no-op on both external mediators (`redis_mediator.go`, `log_mediator.go`), and consumers
  live in the TypeScript backend. The `handler/` set therefore shows internal handlers and
  internal→integration republishers, labeled above; do not treat the republishers as inbound
  external handlers.
- **Query use case**: not in the target citizen list for this harvest; the source's
  list/get use cases (`list_channels.go`, `get_channel.go`) partially cover the shape via
  `usecase/` + `controller/` if needed later.
