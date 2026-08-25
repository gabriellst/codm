# Loops por intervalo — Implementation Plan

> **For agentic workers:** Execute via `/build`. Cada Task embrulha um
> comportamento observável num ciclo RED→GREEN.

**Goal:** O operador agenda um loop "a cada X minutos" com a mesma naturalidade com que agenda "toda segunda às 09:00", e o produto inteiro (varredura, pausa, edição, console) trata as duas formas igual.

**Architecture:** `LoopSchedule` deixa de ser um objeto de três campos e passa a ser uma **união discriminada** por `LoopScheduleKind` (`DAILY` | `INTERVAL`), materializada como duas classes de VO sobre uma base abstrata (`BaseLoopSchedule`) que declara as duas perguntas polimórficas: `nextRunAfter(from)` e `isRunStale(scheduledFor, now)`. A fábrica `loopScheduleOf` despacha por `kind` com checagem de exaustividade. `Loop`, `FireDueLoops`, o repositório e o console passam a falar com a base — nenhum deles ganha um `if` sobre forma de agenda que não seja o despacho canônico por mapa/switch exaustivo.

**Tech Stack:** TypeSpec, TypeScript, Bun, Drizzle/SQLite, tsyringe, Zod, TanStack Form/Query, Tailwind

**Spec:** .specs/2026-08-04-loops-por-intervalo-design.md
**Tasks:** 6
**Estimated minutes:** 180

---

## Task T1 — Contract Lock: o discriminante existe no fio e na tabela

**Files to write:**
- Create: `packages/contracts/wire/enums/loop-schedule-kind.tsp`
- Modify: `packages/contracts/wire/main.tsp` — importa o enum novo
- Modify: `packages/contracts/db/schema/thread.ts` — `kind` (+ `enumCheck`), `every_minutes`, colunas do membro diário anuláveis, docblock da união
- Create: `packages/api/go/core/db/sqlite/migrations/00XX_*.sql` (via `bun migrate:create`) + espelho em `packages/contracts/db/schema/migrations`
- Gate: `bun contracts` (TS/Go/Rust + `cargo check`), `bun run --cwd packages/contracts db:sync-go`, `db:check-go`

**Contrato congelado a partir daqui:**
```
LoopScheduleKind { DAILY, INTERVAL }
DAILY    → { kind, timeOfDay: 'HH:MM', weekdays: DayOfWeek[≥1], timezone: IANA }
INTERVAL → { kind, everyMinutes: int [1,1440] }
```

**Scope fence:** OUT — domínio (T2), persistência/use cases (T3), SDK (T4), console (T5). Backfill: toda linha existente vira `kind='DAILY'`; o SQL gerado tem que ser LIDO (SQLite recria a tabela para afrouxar `NOT NULL`).

---

## Task T2 — O VO responde "quando?" nas duas formas

**Files to write:**
- Modify: `packages/api/typescript/src/thread/objects/LoopSchedule.ts` — `BaseLoopSchedule` abstrata, `DailyLoopSchedule`, `IntervalLoopSchedule`, `loopScheduleOf`, `LoopScheduleInputSchema` (união), `LoopScheduleFieldSchema` (o campo da entidade)
- Modify: `packages/api/typescript/src/thread/objects/index.ts`
- Modify: `packages/api/typescript/src/thread/errors/index.ts` — `INVALID_LOOP_INTERVAL`
- Modify: `packages/api/typescript/src/thread/entities/Loop.ts` — `schedule` passa a ser o campo polimórfico; `skipRun`/`markFired` inalterados
- Test: `packages/api/typescript/src/thread/objects/LoopSchedule.test.ts` — as asserções diárias sobrevivem intactas + bloco novo de intervalo (`+15min`, limites, `isRunStale`)
- Test: `packages/api/typescript/src/thread/entities/Loop.test.ts` — criar/editar/pausar/disparar com agenda de intervalo

**Regras:**
- `nextRunAfter` de `INTERVAL` = `from + everyMinutes*60_000` (estritamente depois, por construção).
- `isRunStale`: `DAILY` → `now - scheduledFor > MISSED_RUN_GRACE_MS` (1h, valor atual); `INTERVAL` → sempre `false`.
- `loopScheduleOf` despacha com `switch (input.kind)` + `default: const _exhaustive: never = input`.

**Gate:** `cd packages/api/typescript && bun test src/thread/objects src/thread/entities`

---

## Task T3 — A varredura, o banco e as portas falam a união

**Files to write:**
- Modify: `.../thread/repositories/LoopRepository/DrizzleLoopRepository.ts` — `toDomain`/`toPersistence` por variante
- Modify: `.../thread/usecases/ManageThreadLoops.ts` — `schedule: LoopScheduleInputSchema` (união) em create/update
- Modify: `.../thread/usecases/ListThreadLoops.ts` — DTO com `schedule` união (sai o achatamento)
- Modify: `.../thread/usecases/FireDueLoops.ts` — a tolerância vira `loop.schedule.isRunStale(...)`; `MISSED_RUN_GRACE_MS` sai daqui
- Modify: `.../thread/controllers/ThreadLoops.ts` — exemplos OpenAPI das duas variantes
- Test: `.../thread/usecases/ThreadLoops.test.ts` — criar/listar/editar por intervalo, troca de forma, e persistência ida-e-volta
- Test: `.../thread/usecases/FireDueLoops.test.ts` — intervalo atrasado dispara; diário atrasado pula

**Gate:** `cd packages/api/typescript && bun test src/thread && bun x tsc -p tsconfig.build.json --noEmit`

---

## Task T4 — SDK

`bun emit-openapi` + `bun sdk`. Verifica que `listThreadLoops` devolve `schedule` discriminado e que `createThreadLoopMutationRequestSchema` é uma união navegável por `pickUnionVariantField`.

---

## Task T5 — O console tem duas formas e nenhum campo opcional inventado

**Files to write:**
- Modify: `packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/LoopsSection.tsx` — seletor de `kind`, um componente de campos por variante despachado por mapa, badges da linha por mapa
- Modify: `packages/app/react/src/locales/{pt,en}.json` — rótulos das formas, do intervalo, e `INVALID_LOOP_INTERVAL`
- Modify: `.../ThreadSettingsDialog/index.stories.tsx` — as duas formas nos dublês
- Modify: `.../ThreadSettingsDialog/index.test.tsx` — fixture da nova forma do DTO

**Regras:** `CMP-P18` (despacho por mapa) + `FRM-P43` (cada variante valida contra seu membro concreto; nada de formulário achatado tudo-opcional).

**Gate:** `bun lint && bun tsc && bun run test`

---

## Task T6 — Portões e PR

`bun lint`, `bun tsc`, `bun run test` verdes no repo inteiro; commits por Task; PR com plano de teste derivado dos ACs da spec.
