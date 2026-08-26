---
name: entity
description: "Create a domain entity with business logic. Use when modeling core business objects like Product, Order, User. Use this skill whenever creating aggregate roots or entities with identity, validation schemas, behavior methods, and domain invariants. Dispatch hub — routes to typescript/go variants by file extension."
---

# Entity

Domain object with identity and lifecycle. Owns business invariants and encapsulates rules through behavior methods. Receives primitives, constructs value objects internally. State transitions trigger domain events — **where the event is born differs by language, intentionally**: in TypeScript the entity carries no event API (the use case builds the event after `repo.save()` and persists it to the outbox via `domainEventRepository.save(event, tx)`); in Go the entity raises it (`AddDomainEvent`) and the use case drains via `PullDomainEvents`.

The shape and idioms of this primitive differ per backend language; the lang-specific playbooks below carry the concrete rules, code, and bad practices.

## Language variants

| Backend | Playbook | Registry |
|---|---|---|
| TypeScript — `packages/api/typescript/` | [`typescript/SKILL.md`](./typescript/SKILL.md) | [`typescript/registry.yaml`](./typescript/registry.yaml) |
| Go — `packages/api/go/` | [`go/SKILL.md`](./go/SKILL.md) | [`go/registry.yaml`](./go/registry.yaml) |

## How dispatch works

`scripts/review.ts` infers the language from the file extension (`.ts` / `.go`) and loads the matching `<lang>/registry.yaml`. The CLI scaffolder takes a `--lang` flag (`--lang=typescript` / `--lang=go`) or infers it from cwd. When editing or reviewing code, open the lang playbook matching the file you're touching — patterns and bad practices are coded per-language (e.g. `ENT-GO-01`).
