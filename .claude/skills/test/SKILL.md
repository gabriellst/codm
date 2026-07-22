---
name: test
description: "Write and update backend tests with bun:test using colocated unit/use case/handler specs in src, process-level flows in packages/api/tests/flows, and the TestBed/DrizzleDatabaseDriver integration harness in packages/api/tests/support. Dispatch hub — routes to typescript/go variants by file extension."
---

# Test

First-class artifact, not an afterthought. Tests substitute for living documentation. Red/green/refactor; colocated next to source. Unit tests for entities and value objects; integration tests with a real DB for use cases, handlers, and repositories; flow tests with mocks for cross-use-case sagas.

The shape and idioms of this primitive differ per backend language; the lang-specific playbooks below carry the concrete rules, code, and bad practices.

## Language variants

| Backend | Playbook | Registry |
|---|---|---|
| TypeScript — `packages/api/typescript/` | [`typescript/SKILL.md`](./typescript/SKILL.md) | [`typescript/registry.yaml`](./typescript/registry.yaml) |
| Go — `packages/api/go/` | [`go/SKILL.md`](./go/SKILL.md) | [`go/registry.yaml`](./go/registry.yaml) |

## How dispatch works

`scripts/review.ts` infers the language from the file extension (`.ts` / `.go`) and loads the matching `<lang>/registry.yaml`. The CLI scaffolder takes a `--lang` flag (`--lang=typescript` / `--lang=go`) or infers it from cwd. When editing or reviewing code, open the lang playbook matching the file you're touching — patterns and bad practices are coded per-language (e.g. `TEST-GO-01`).
