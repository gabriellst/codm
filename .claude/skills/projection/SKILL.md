---
name: projection
description: "Create a read-side projection — a free record class that materializes a domain view for a specific UI/query need. Schema-driven, no base class, no invariants. Pairs with a Projector that drives it from events via the canonical find → applyEvent → save flow. Dispatch hub — routes to typescript/go variants by file extension."
---

# Projection

Read-side materialized view. A schema-driven free record (no base class, no invariants) that exists when the read model diverges from the write model — denormalization, aggregation, cross-context joins. Cross-aggregate projections that span contexts live in `ui/` (api-typescript).

The shape and idioms of this primitive differ per backend language; the lang-specific playbooks below carry the concrete rules, code, and bad practices.

## Language variants

| Backend | Playbook | Registry |
|---|---|---|
| TypeScript — `packages/api/typescript/` | [`typescript/SKILL.md`](./typescript/SKILL.md) | [`typescript/registry.yaml`](./typescript/registry.yaml) |
| Go — `packages/api/go/` | [`go/SKILL.md`](./go/SKILL.md) | [`go/registry.yaml`](./go/registry.yaml) |

## How dispatch works

`scripts/review.ts` infers the language from the file extension (`.ts` / `.go`) and loads the matching `<lang>/registry.yaml`. The CLI scaffolder takes a `--lang` flag (`--lang=typescript` / `--lang=go`) or infers it from cwd. When editing or reviewing code, open the lang playbook matching the file you're touching — patterns and bad practices are coded per-language (e.g. `PROJ-GO-01`).
