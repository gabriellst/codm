---
name: query
description: "Create UI query use cases (BFF pattern). Use when the frontend needs data for a route or section — personalized read queries using direct Drizzle access instead of orchestrating domain DTOs. Use this skill for any read-only data fetching that serves a specific UI view. Dispatch hub — routes to typescript/go variants by file extension."
---

# Query

Read-side use case shaped for a specific UI or consumer (the BFF pattern). Per the polyglot ownership matrix (§3), UI-shaped queries are owned by **api-typescript**; Go exposes only domain-local reads (lookups serving other use cases or handlers).

The shape and idioms of this primitive differ per backend language; the lang-specific playbooks below carry the concrete rules, code, and bad practices.

## Language variants

| Backend | Playbook | Registry |
|---|---|---|
| TypeScript — `packages/api/typescript/` | [`typescript/SKILL.md`](./typescript/SKILL.md) | [`typescript/registry.yaml`](./typescript/registry.yaml) |
| Go — `packages/api/go/` | [`go/SKILL.md`](./go/SKILL.md) | [`go/registry.yaml`](./go/registry.yaml) |

## How dispatch works

`scripts/review.ts` infers the language from the file extension (`.ts` / `.go`) and loads the matching `<lang>/registry.yaml`. The CLI scaffolder takes a `--lang` flag (`--lang=typescript` / `--lang=go`) or infers it from cwd. When editing or reviewing code, open the lang playbook matching the file you're touching — patterns and bad practices are coded per-language (e.g. `Q-GO-01`).
