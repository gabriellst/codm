---
name: handler
description: "Create an event handler. Use when you need to react to domain events like sending notifications or updating related data. Use this skill for both internal handlers (same context) and external handlers (cross-context integration). Dispatch hub — routes to typescript/go variants by file extension."
---

# Handler

Reactor to events. **Internal handlers** react to domain events of the owning context (same-context side effects, publishing integration events). **External handlers** react to integration events emitted by other contexts or services. Handlers are how cross-cutting effects propagate.

The shape and idioms of this primitive differ per backend language; the lang-specific playbooks below carry the concrete rules, code, and bad practices.

## Language variants

| Backend | Playbook | Registry |
|---|---|---|
| TypeScript — `packages/api/typescript/` | [`typescript/SKILL.md`](./typescript/SKILL.md) | [`typescript/registry.yaml`](./typescript/registry.yaml) |
| Go — `packages/api/go/` | [`go/SKILL.md`](./go/SKILL.md) | [`go/registry.yaml`](./go/registry.yaml) |

## How dispatch works

`scripts/review.ts` infers the language from the file extension (`.ts` / `.go`) and loads the matching `<lang>/registry.yaml`. The CLI scaffolder takes a `--lang` flag (`--lang=typescript` / `--lang=go`) or infers it from cwd. When editing or reviewing code, open the lang playbook matching the file you're touching — patterns and bad practices are coded per-language (e.g. `HDL-GO-01`).
