---
name: enum
description: "Create a domain enum (status, type, category). Use when defining fixed sets of values like OrderStatus, PaymentType, DayOfWeek. Use this skill whenever you need to model a finite set of named constants that represent domain concepts. Dispatch hub — routes to typescript/go variants by file extension."
---

# Enum

Closed vocabulary of named constants (statuses, types, categories). The wire-stable identifier set that crosses HTTP, DB, and integration events. Cross-boundary enums live in the contracts package; per-context enums live in their owning bounded context.

The shape and idioms of this primitive differ per backend language; the lang-specific playbooks below carry the concrete rules, code, and bad practices.

## Language variants

| Backend | Playbook | Registry |
|---|---|---|
| TypeScript — `packages/api/typescript/` | [`typescript/SKILL.md`](./typescript/SKILL.md) | [`typescript/registry.yaml`](./typescript/registry.yaml) |
| Go — `packages/api/go/` | [`go/SKILL.md`](./go/SKILL.md) | [`go/registry.yaml`](./go/registry.yaml) |

## How dispatch works

`scripts/review.ts` infers the language from the file extension (`.ts` / `.go`) and loads the matching `<lang>/registry.yaml`. The CLI scaffolder takes a `--lang` flag (`--lang=typescript` / `--lang=go`) or infers it from cwd. When editing or reviewing code, open the lang playbook matching the file you're touching — patterns and bad practices are coded per-language (e.g. `ENUM-GO-01`).
