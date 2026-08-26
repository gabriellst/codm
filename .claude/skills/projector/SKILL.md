---
name: projector
description: "Create a Projector — the read-side counterpart of EventHandler. One per Projection. Subscribes to a union of events and dispatches via a plain switch (event.name). Async via outbox by default; opt-in inline within a use case for read-after-write. Canonical mutation flow is find → applyEvent → save. Dispatch hub — routes to typescript/go variants by file extension."
---

# Projector

Read-side handler. Subscribes to events and drives one projection. Canonical flow is `find → applyEvent → save`; atomic ops on the projection repository are edge cases for hot-row contention, bulk writes, monotonic constraints, or cache-mirror semantics.

The shape and idioms of this primitive differ per backend language; the lang-specific playbooks below carry the concrete rules, code, and bad practices.

## Language variants

| Backend | Playbook | Registry |
|---|---|---|
| TypeScript — `packages/api/typescript/` | [`typescript/SKILL.md`](./typescript/SKILL.md) | [`typescript/registry.yaml`](./typescript/registry.yaml) |
| Go — `packages/api/go/` | [`go/SKILL.md`](./go/SKILL.md) | [`go/registry.yaml`](./go/registry.yaml) |

## How dispatch works

`scripts/review.ts` infers the language from the file extension (`.ts` / `.go`) and loads the matching `<lang>/registry.yaml`. The CLI scaffolder takes a `--lang` flag (`--lang=typescript` / `--lang=go`) or infers it from cwd. When editing or reviewing code, open the lang playbook matching the file you're touching — patterns and bad practices are coded per-language (e.g. `PRJTR-GO-01`).
