---
name: repository
description: "Create a repository interface and implementation. Use when adding data persistence for entities. Use this skill whenever you need to define how domain entities are stored, retrieved, and queried from the database using Drizzle ORM. Dispatch hub — routes to typescript/go variants by file extension."
---

# Repository

Persistence boundary for one entity. Bridges domain ↔ database. Surface is `findById` / `save` / `delete` plus identifier queries (`findByEmail`, `findBySlug`). Rehydrates rows back into entities through the entity's schema.

The shape and idioms of this primitive differ per backend language; the lang-specific playbooks below carry the concrete rules, code, and bad practices.

## Language variants

| Backend | Playbook | Registry |
|---|---|---|
| TypeScript — `packages/api/typescript/` | [`typescript/SKILL.md`](./typescript/SKILL.md) | [`typescript/registry.yaml`](./typescript/registry.yaml) |
| Go — `packages/api/go/` | [`go/SKILL.md`](./go/SKILL.md) | [`go/registry.yaml`](./go/registry.yaml) |

## How dispatch works

`scripts/review.ts` infers the language from the file extension (`.ts` / `.go`) and loads the matching `<lang>/registry.yaml`. The CLI scaffolder takes a `--lang` flag (`--lang=typescript` / `--lang=go`) or infers it from cwd. When editing or reviewing code, open the lang playbook matching the file you're touching — patterns and bad practices are coded per-language (e.g. `REPO-GO-01`).
