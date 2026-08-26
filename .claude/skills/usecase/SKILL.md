---
name: usecase
description: "Create an application use case. Use when implementing business operations like CreateOrder, ProcessPayment, CancelBooking. Use this skill for any command/mutation that orchestrates domain logic, whether simple CRUD or complex multi-step transactions with sagas. Dispatch hub — routes to typescript/go variants by file extension."
---

# Use Case

A single business operation (command) wrapped in a transaction + outbox. Orchestrates entities, repositories, and services; raises domain events; commits atomically. Never validates field formats imperatively inside the operation body — format validation is declarative, and **where the declaration lives differs by language, intentionally** (see below).

The shape and idioms of this primitive differ per backend language; the lang-specific playbooks below carry the concrete rules, code, and bad practices.

## TS ↔ Go divergence (intentional) — format-validation placement

- **TypeScript**: the controller is the **sole** format-validation site. Use-case `InputSchema`s describe shape only and carry no format refinements — TS use cases are reachable only through HTTP controllers (and the typed SDK), so the controller gate always runs first.
- **Go**: `validate` tags live on **both** the controller request struct **and** the use-case Input struct. Go use cases ingest from non-HTTP paths — webhook choreography, Kafka/integration-event handlers, sync workers calling use cases directly — where no controller sits in front; the Input struct's tags are the only format gate on those paths.

This is not drift — it mirrors the entity hub's documented event-birth divergence: same primitive, deliberately different placement per backend. Atlas axis: `VALIDATION-PLACEMENT`.

## Language variants

| Backend | Playbook | Registry |
|---|---|---|
| TypeScript — `packages/api/typescript/` | [`typescript/SKILL.md`](./typescript/SKILL.md) | [`typescript/registry.yaml`](./typescript/registry.yaml) |
| Go — `packages/api/go/` | [`go/SKILL.md`](./go/SKILL.md) | [`go/registry.yaml`](./go/registry.yaml) |

## How dispatch works

`scripts/review.ts` infers the language from the file extension (`.ts` / `.go`) and loads the matching `<lang>/registry.yaml`. The CLI scaffolder takes a `--lang` flag (`--lang=typescript` / `--lang=go`) or infers it from cwd. When editing or reviewing code, open the lang playbook matching the file you're touching — patterns and bad practices are coded per-language (e.g. `UC-GO-01`).
