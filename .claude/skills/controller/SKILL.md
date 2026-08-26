---
name: controller
description: "Create an HTTP controller (API endpoint) with Zod schemas and validation. Use when adding endpoints like POST /products, GET /users/:id. Use this skill whenever implementing REST API routes, defining request/response schemas, or adding new HTTP endpoints to any bounded context. Dispatch hub — routes to typescript/go variants by file extension."
---

# Controller

HTTP endpoint. Thin shell: validate request via schema, call a use case, return the response. Never thinks, never touches repositories, never owns business rules.

The shape and idioms of this primitive differ per backend language; the lang-specific playbooks below carry the concrete rules, code, and bad practices.

## Cross-language principle — query/list filters live on the controller, not in `contracts`

A filter/toggle/`sortBy`/`groupBy` literal set that only narrows **one list endpoint** is a UI concern of that controller. Define it **inline on the controller's `query` schema** (the SDK still generates a type-safe enum from this endpoint's OpenAPI). Promote a value to `packages/contracts` **only** when another service (Go ↔ TS) or a persisted DB column must agree on it — that is the sole reason the cross-language source of truth exists. A single-screen filter never qualifies. See each lang playbook ("Query/List Filters Are Controller-Local") for the worked example.

## Language variants

| Backend | Playbook | Registry |
|---|---|---|
| TypeScript — `packages/api/typescript/` | [`typescript/SKILL.md`](./typescript/SKILL.md) | [`typescript/registry.yaml`](./typescript/registry.yaml) |
| Go — `packages/api/go/` | [`go/SKILL.md`](./go/SKILL.md) | [`go/registry.yaml`](./go/registry.yaml) |

## How dispatch works

`scripts/review.ts` infers the language from the file extension (`.ts` / `.go`) and loads the matching `<lang>/registry.yaml`. The CLI scaffolder takes a `--lang` flag (`--lang=typescript` / `--lang=go`) or infers it from cwd. When editing or reviewing code, open the lang playbook matching the file you're touching — patterns and bad practices are coded per-language (e.g. `CTRL-GO-01`).
