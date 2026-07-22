---
name: value-object
description: "Create an immutable value object. Use when modeling concepts without identity like Money, Email, Address. Use this skill for any domain concept defined by its attributes rather than identity — CPF, CRM, phone numbers, date ranges, or any value requiring validation and formatting. Dispatch hub — routes to typescript/go variants by file extension."
---

# Value Object

Immutable concept defined by its value rather than identity (Email, Money, CPF, CRM, DateRange). Self-validating on construction — an invalid VO never exists. Lives inside entities.

The shape and idioms of this primitive differ per backend language; the lang-specific playbooks below carry the concrete rules, code, and bad practices.

## Language variants

| Backend | Playbook | Registry |
|---|---|---|
| TypeScript — `packages/api/typescript/` | [`typescript/SKILL.md`](./typescript/SKILL.md) | [`typescript/registry.yaml`](./typescript/registry.yaml) |
| Go — `packages/api/go/` | [`go/SKILL.md`](./go/SKILL.md) | [`go/registry.yaml`](./go/registry.yaml) |

## How dispatch works

`scripts/review.ts` infers the language from the file extension (`.ts` / `.go`) and loads the matching `<lang>/registry.yaml`. The CLI scaffolder takes a `--lang` flag (`--lang=typescript` / `--lang=go`) or infers it from cwd. When editing or reviewing code, open the lang playbook matching the file you're touching — patterns and bad practices are coded per-language (e.g. `VO-GO-01`).
