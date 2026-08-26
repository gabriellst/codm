---
name: event
description: "Create a domain or integration event. Use when something significant happens that other parts of the system need to know about. Use this skill for domain events (same context, InternalMediator) and integration events (cross-context, ExternalMediator). Dispatch hub — routes to typescript/go variants by file extension."
---

# Event

A past-tense fact. **Domain events** stay inside one bounded context and trigger same-context handlers. **Integration events** cross context or service boundaries and are published via the outbox. Both carry a typed payload.

The shape and idioms of this primitive differ per backend language; the lang-specific playbooks below carry the concrete rules, code, and bad practices.

## Ativação — qual mecanismo (decisão do founder, 29-jul-2026)

| Precisa de… | Mecanismo | Garantia | Quem entrega |
|---|---|---|---|
| "isto aconteceu, quem quiser reage" (fato, auditoria, event sourcing) | **outbox** — domain event no contexto; integration event pelo publisher nomeado | durável, at-least-once, fan-out | dispatcher/poller do outbox |
| "isto precisa acontecer, com retry, e alguém é o único executor" | **CommandQueue** — `enqueueCommand(nome, input, opts, tx)` na transação do fato | durável, retry+backoff, lease, dead-letter | o worker que registrou o comando |
| "turnos serializados por target" | **Mailbox** — produtores só ENFILEIRAM, sempre na transação do fato | durável, um turno por target de cada vez | o MailboxDispatcher (consumidor único) |
| "síncrono, nesta request" | **use case chamado direto** | a transação da própria request | o chamador |

**A regra de intenção:** evento existe para fins reativos, auditoria ou event sourcing — **nunca para
comandar**. Se a existência do evento é só para um handler executar algo que poderia ser um
comando/use case direto, está errado. Nomes `*Requested` não são proibidos por si; a intenção é o
critério. Enforcement: `cc-bp-26` (cross-cutting, warning), `handler` bp-09 / bp-GO-HDL-07,
`EVT-C11` / `EVT-GO-09`, `UC-P16`.

## Language variants

| Backend | Playbook | Registry |
|---|---|---|
| TypeScript — `packages/api/typescript/` | [`typescript/SKILL.md`](./typescript/SKILL.md) | [`typescript/registry.yaml`](./typescript/registry.yaml) |
| Go — `packages/api/go/` | [`go/SKILL.md`](./go/SKILL.md) | [`go/registry.yaml`](./go/registry.yaml) |

## How dispatch works

`scripts/review.ts` infers the language from the file extension (`.ts` / `.go`) and loads the matching `<lang>/registry.yaml`. The CLI scaffolder takes a `--lang` flag (`--lang=typescript` / `--lang=go`) or infers it from cwd. When editing or reviewing code, open the lang playbook matching the file you're touching — patterns and bad practices are coded per-language (e.g. `EVT-GO-01`).
