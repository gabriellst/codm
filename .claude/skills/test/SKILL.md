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

## Um timeout não é diagnóstico — é a recusa de dar um

**Toda espera que pode estourar deve, ao estourar, dizer POR QUE.** `"<label> nunca aconteceu"` é a
mesma frase para os dois casos que pedem correções OPOSTAS — *está lento* e *nunca vai acontecer* — e
essa ambiguidade custa investigações inteiras.

`packages/app/react/tests/support/mountRouter.tsx` é o exemplar: ao desistir, ele reporta quantas
requisições estão **em voo** e há quantos ms (o dado que separa pendura de lentidão), quais
**terminaram mal** — que a sondagem do DOM engole, porque ninguém aguarda essas promessas — e um
recorte do DOM. Instrumenta `globalThis.fetch` uma vez por processo, passthrough puro.

**Separe pendura de lentidão pela DISTRIBUIÇÃO, não pela intuição.** Medido em 2026-08-27: as
execuções que passam levam 996–1291 ms; a que falha bate exatamente no teto de 30 s. Três ordens de
grandeza de distância não é lentidão — é travamento, e travamento não tem cauda, tem infinito.
Detalhe que fechou o caso: o cliente da SDK é `ky`, cujo timeout PADRÃO é 30 s — o mesmo número do
deadline, então uma requisição pendurada e uma espera vazia morriam no mesmo instante com a mesma
mensagem.

**Nunca "conserte" subindo o prazo.** A régua desse helper já foi 1 s → 5 s → 30 s. Um botão que
precisa crescer de novo é prova de que o modelo está errado, não de que faltava folga. O conserto
legítimo do mesmo formato está em `scripts/test-cross-service.ts`: lá o prazo era **menor que a
tarefa** (hook de 5 s contra um boot que se dá 30 s), e declarar 60 s foi corrigir a medida, não
afrouxá-la. A pergunta que distingue os dois: *o prazo é menor que o trabalho, ou o trabalho é
infinito?*

**Espere a CAUSA, não o efeito.** Sondar o DOM (`a tile apareceu?`) engole o erro da operação que
produziria a tile. Numa execução VERDE de `app-react` aparecem 8 `socket connection was closed
unexpectedly` que não reprovam nada, porque ninguém aguarda essas promessas.

**Verde local pode não significar "rodou".** `packages/app/react/bunfig.toml` exclui
`**/*.services.test.tsx` da suíte padrão (cada uma boota o gateway Go num processo próprio). Em
27/08 uma investigação rodou `bun test`, viu `302 pass, 0 fail` e concluiu que não reproduzia o
vermelho da CI — o arquivo vermelho nunca tinha rodado. `tests/setup.ts` agora avisa em voz alta
quantas suítes ficaram de fora e qual comando as roda (`bun run test:cross-service`), e o runner
declara `CODM_CROSS_SERVICE=1` para o aviso não poluir a invocação que de fato as executa.

**Re-executar esconde a taxa.** Um rerun manual transforma um vermelho recorrente em "às vezes
falha". Se o teste precisa de repetição, que ela seja registrada e contada — nunca um clique que
apaga a evidência.

## How dispatch works

`scripts/review.ts` infers the language from the file extension (`.ts` / `.go`) and loads the matching `<lang>/registry.yaml`. The CLI scaffolder takes a `--lang` flag (`--lang=typescript` / `--lang=go`) or infers it from cwd. When editing or reviewing code, open the lang playbook matching the file you're touching — patterns and bad practices are coded per-language (e.g. `TEST-GO-01`).
