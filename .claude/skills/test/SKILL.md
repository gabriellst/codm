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

## The environment is part of the harness contract — pin it, do not inherit it

**Any nx `test` target that runs `bun test` MUST declare `"env": { "NODE_ENV": "test" }` in its
options.** Gated by `packages/api/typescript/tests/architecture/test-env-pinning.test.ts` (ENV-01).

`bun test` sets `NODE_ENV=test` by itself, but an **inherited** value beats that default — and nx is
launched from the repo root, where bun loads the root `.env` (`NODE_ENV=development`). Without the pin
the same suite means two different things depending on the directory you launched it from. Measured
2026-08-18 on `app-react`:

| launched from | NODE_ENV | result |
|---|---|---|
| `packages/app/react` (`bun test`) | `test` | 270 pass, 6.95s |
| repo root (`bun run test` → nx) | `development` | 267 pass / **3 fail**, 15.9s |

Bisected: `VITE_API_URL` alone changes nothing; `NODE_ENV=development` alone reproduces every failure
and the 2.3× slowdown. React, Storybook's `composeStories` and msw each branch on it, so a dev-mode
module graph is a **different program under test**.

**The diagnostic trap, worth internalising.** One of those three failures missed a 5000 ms timeout by
2–4 ms, so the whole thing first read as a *load-sensitive flake* and nearly earned a raised timeout —
a band-aid that would have left the other two failures unexplained and the cause intact. Under
`NODE_ENV=test` that file's 5 cases run in **1219 ms total**; under `development` that single case took
**5604 ms**. When a test fails by single-digit milliseconds, suspect the environment before the clock.

A suite that only passes under one environment should also **say so where it runs**:
`packages/app/react/tests/setup.ts` throws with a one-sentence explanation if `NODE_ENV !== 'test'`,
so a violation names itself instead of surfacing as three unrelated-looking story failures.

## How dispatch works

`scripts/review.ts` infers the language from the file extension (`.ts` / `.go`) and loads the matching `<lang>/registry.yaml`. The CLI scaffolder takes a `--lang` flag (`--lang=typescript` / `--lang=go`) or infers it from cwd. When editing or reviewing code, open the lang playbook matching the file you're touching — patterns and bad practices are coded per-language (e.g. `TEST-GO-01`).
