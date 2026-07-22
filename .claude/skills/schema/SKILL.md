---
name: schema
description: "Create Zod DTO schemas for use cases and controllers. Use when defining input/output schemas, shared validation schemas, or context-specific reusable schemas. Use this skill for schema composition patterns, refinements, transforms, and shared schema extraction. Dispatch hub — routes to typescript/go variants by file extension."
---

# Schema

Runtime structural validation. The shared vocabulary that controllers, use cases, entities, and forms all consume. Each language encodes it differently: TS uses Zod, Go uses struct tags + `validator/v10`.

The shape and idioms of this primitive differ per backend language; the lang-specific playbooks below carry the concrete rules, code, and bad practices.

## Language variants

| Backend | Playbook | Registry |
|---|---|---|
| TypeScript — `packages/api/typescript/` | [`typescript/SKILL.md`](./typescript/SKILL.md) | [`typescript/registry.yaml`](./typescript/registry.yaml) |
| Go — `packages/api/go/` | [`go/SKILL.md`](./go/SKILL.md) | [`go/registry.yaml`](./go/registry.yaml) |

## How dispatch works

`scripts/review.ts` infers the language from the file extension (`.ts` / `.go`) and loads the matching `<lang>/registry.yaml`. The CLI scaffolder takes a `--lang` flag (`--lang=typescript` / `--lang=go`) or infers it from cwd. When editing or reviewing code, open the lang playbook matching the file you're touching — patterns and bad practices are coded per-language (e.g. `SCH-GO-01`).
