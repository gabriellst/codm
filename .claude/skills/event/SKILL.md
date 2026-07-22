---
name: event
description: "Create a domain or integration event. Use when something significant happens that other parts of the system need to know about. Use this skill for domain events (same context, InternalMediator) and integration events (cross-context, ExternalMediator). Dispatch hub — routes to typescript/go variants by file extension."
---

# Event

A past-tense fact. **Domain events** stay inside one bounded context and trigger same-context handlers. **Integration events** cross context or service boundaries and are published via the outbox. Both carry a typed payload.

The shape and idioms of this primitive differ per backend language; the lang-specific playbooks below carry the concrete rules, code, and bad practices.

## Language variants

| Backend | Playbook | Registry |
|---|---|---|
| TypeScript — `packages/api/typescript/` | [`typescript/SKILL.md`](./typescript/SKILL.md) | [`typescript/registry.yaml`](./typescript/registry.yaml) |
| Go — `packages/api/go/` | [`go/SKILL.md`](./go/SKILL.md) | [`go/registry.yaml`](./go/registry.yaml) |

## How dispatch works

`scripts/review.ts` infers the language from the file extension (`.ts` / `.go`) and loads the matching `<lang>/registry.yaml`. The CLI scaffolder takes a `--lang` flag (`--lang=typescript` / `--lang=go`) or infers it from cwd. When editing or reviewing code, open the lang playbook matching the file you're touching — patterns and bad practices are coded per-language (e.g. `EVT-GO-01`).
