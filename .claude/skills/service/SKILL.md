---
name: service
description: "Create a domain or application service. Use when business logic doesn't fit in an entity or spans multiple entities. Use this skill for cross-entity calculations, external API integrations, or complex business rules that coordinate multiple aggregates. Dispatch hub — routes to typescript/go variants by file extension."
---

# Service

Logic that doesn't fit inside a single entity — cross-entity calculations, external SDK integrations, profanity checks, transcoder stubs, storage adapters. Use cases compose services + entities; entities never depend on services.

The shape and idioms of this primitive differ per backend language; the lang-specific playbooks below carry the concrete rules, code, and bad practices.

## Language variants

| Backend | Playbook | Registry |
|---|---|---|
| TypeScript — `packages/api/typescript/` | [`typescript/SKILL.md`](./typescript/SKILL.md) | [`typescript/registry.yaml`](./typescript/registry.yaml) |
| Go — `packages/api/go/` | [`go/SKILL.md`](./go/SKILL.md) | [`go/registry.yaml`](./go/registry.yaml) |

## How dispatch works

`scripts/review.ts` infers the language from the file extension (`.ts` / `.go`) and loads the matching `<lang>/registry.yaml`. The CLI scaffolder takes a `--lang` flag (`--lang=typescript` / `--lang=go`) or infers it from cwd. When editing or reviewing code, open the lang playbook matching the file you're touching — patterns and bad practices are coded per-language (e.g. `SVC-GO-01`).
