# Ciclo de vida no kernel — `start`/`shutdown` por contexto e a coleta de falhas

**Status:** Approved (2026-08-15 — decisão 8 do gate de coerência, escolhida pelo founder)
**Frente:** DC0 da W1 · `.plans/2026-08-15-declaracao-de-contexto.md` §2 (Decisão 8) e §4 (T1.0)
**Natureza:** porte downstream do `template-fullstack`, não desenho novo.

---

## Context

O kernel do codm expõe **um** hook de ciclo de vida: `setup?`, em `core/src/types/BoundedContext.ts:48`, executado dentro do `create` (`:102`). O único usuário é `src/shared/index.ts:86`, e o que ele faz é registro de OpenAPI — o docblock ali registra que aquelas linhas moraram no topo do módulo até virarem efeito colateral de import.

Tudo que é **pump** (poller, consumer, transporte) sobe fora do kernel, na raiz de composição: `src/server.ts:164` faz `resolve(container, MailboxDispatcher).bind(container).start()`, guardado por `mounted.includes('agent')`. A devolução espelha isso à mão em `:193-200`, com um helper `step()` local que envolve cada recurso em try/catch e coleta falhas.

O `template-fullstack` já passou por essa reforma. O kernel de lá tem **quatro** membros que aqui não existem — `start?`, `shutdown?`, `BoundedContext.startAll` (FIFO) e `BoundedContext.shutdownAll` (LIFO, devolvendo `ShutdownFailure[]`) — e os docblocks de lá registram as duas medições que os produziram: o `OutboxDispatcher` pollando antes do schema existir quando o start era `setup` em import-time, e o recurso adquirido por um contexto vazando no encerramento porque quem o devolvia era outro arquivo.

O repo daqui **já sabe da lacuna**: `src/shared/descriptor.ts:22-24` diz, em prosa, *"o tipo do kernel daqui tem 12 campos e NÃO tem `start`/`shutdown` (o do template tem 13 e tem)"*. O comentário nunca virou tarefa.

## Problem

Sem slot de ciclo de vida no descritor, o que um contexto acende e apaga **não pode morar com o contexto**. A consequência é medível no código de hoje:

1. `src/server.ts:164` e `:192` perguntam `mounted.includes('agent')` — a raiz precisa **saber** o que o contexto `agent` liga. O comentário em `:161-163` registra que isto já é a *segunda* iteração do mesmo conserto (antes era `!isCloudProfile()`), *"uma segunda cópia da mesma decisão, que só concordava com a composição enquanto ninguém mexesse em nenhuma das duas"*.
2. O helper `step()` (`:177-186`) reimplementa, por recurso, exatamente o mecanismo que um `shutdownAll` por contexto ofereceria: try/catch isolado, coleta, throw no fim.
3. `src/compose.ts:198-199` cria cada contexto e guarda **só** `.router`, devolvendo `{ mounted, routers }` (`:202`). Não existe coleção de instâncias — logo, mesmo que o kernel ganhasse `shutdownAll`, não haveria o que passar a ele.

O terceiro item é o que torna isto pré-requisito e não detalhe: as frentes DC2 (migração) e DC3 (ciclo de vida) da W1 assumem um kernel que este repo não tem.

## Goal

Dar ao kernel do codm o mesmo contrato de ciclo de vida que o template já tem, e fazer a composição devolver as instâncias — de modo que a DC3 possa mover `start`/`shutdown` para dentro dos contextos sem inventar mecanismo novo.

Fora de escopo: mover qualquer lifecycle de contexto (é DC3), apagar os `mounted.includes('agent')` (é DC3), e mexer no `setup` existente do `shared`.

## Decisions

**D1 — Porte, não invenção.** As assinaturas vêm do `template-fullstack/packages/api/typescript/core/src/types/BoundedContext.ts` verbatim, incluindo a assimetria declarada nos docblocks de lá: **ligar FALHA RÁPIDO** (um boot com pump quebrado não pode meio-subir) e **desligar DRENA TUDO e coleciona falhas** (`ShutdownFailure[]`, e quem decide o exit code é a raiz). Os docblocks portam junto — eles carregam as medições que justificam a forma.

**D2 — `startAll` entra, mesmo sem consumidor imediato.** Ele é o par simétrico do `shutdownAll` e é o que a DC3 vai chamar. Entrar agora evita que a DC3 tenha de mexer no kernel de novo. O `start` de contexto continua opcional e nenhum contexto o declara nesta frente.

**D3 — `composeContexts` passa a devolver as instâncias.** A assinatura vira `{ mounted, routers, contexts }`. `routers` permanece para não quebrar `server.ts:137`; `contexts` é aditivo. É a mudança que destrava o `shutdownAll` ter o que receber.

**D4 — `JobDefinition` passa a aceitar cadência declarada no próprio job.** Hoje é `{ handler, repeat }` (`BoundedContext.ts:20-23`), lido em `registerJobs` (`:158-174`). Passa a aceitar também `static repeat` na classe do handler, com o campo explícito do `JobDefinition` vencendo quando ambos existirem. Nenhum job muda nesta frente — a migração é da DC2. Isto entra aqui porque é mudança de kernel, e o kernel muda uma vez só.

**D5 — `setup` fica.** Não é depreciado nem migrado. O `shared` continua usando-o para registro de OpenAPI, que é trabalho de composição e não pump.

**D6 — `registerJobs` NÃO muda de fase nesta frente. Emenda da Fase 1 de exploração.** No template, `registerJobs` roda na fase de **start**, e o docblock de lá justifica: *"registrar um job liga o poller da fila e ENQUEUE no banco — I/O que import não pode fazer"*. Aqui ele roda dentro do `create` (`BoundedContext.ts:99`), e essa diferença **não é descuido**: o `compose.ts:138-150` documenta o incidente que a produziu — *"Se as migrações rodassem depois da composição, o primeiro contexto com `jobs` morreria com* no such table *— foi exatamente o que aconteceu quando tentei essa ordem"*. A ordem migrar-antes-de-compor existe por causa dela.

Mover a fase tornaria o `create` puro (ganho real, e é a forma alvo), **mas**: (a) a DC3 não precisa disso — ela precisa de `start`/`shutdown`/`shutdownAll`; (b) se `registerJobs` sair do `create` sem que alguém chame `startAll`, o `PruneOutbox` **para de ser agendado em silêncio**; (c) é mudança de ordenação de boot com incidente medido atrás. Fazer as duas coisas na mesma frente mistura um porte aditivo com uma mudança de comportamento, e a DC0 perderia falseador limpo.

→ **Fica como follow-up nomeado:** *"`registerJobs` migra para a fase de start, e o `startAll` passa a ser chamado no `server.ts` depois do migrate"*. É pré-requisito da simetria com o template que a **W2** vai precisar, não da W1. Consequência aceita e registrada: até lá, `start()` significa coisas ligeiramente diferentes nos dois repos — aqui roda só o hook, lá roda hook + jobs.

## User Stories

- **US-1** — Como autor de um contexto, quero declarar `start`/`shutdown` no meu descritor, para que o que eu acendo e apago viva comigo e não na raiz de composição.
- **US-2** — Como dono do boot, quero que um contexto com pump quebrado **aborte** o boot com o nome do contexto, em vez de meio-subir.
- **US-3** — Como dono do encerramento, quero que uma falha ao desligar um contexto **não impeça** a drenagem dos outros, e que a lista de falhas volte para eu decidir o exit code.
- **US-4** — Como autor de um job, quero declarar a cadência na própria classe do job, para que o barril de jobs volte a ser mecânico.

## Acceptance Criteria

- **AC-1** — `BoundedContextOptions` aceita `start?: (container: DependencyContainer) => void | Promise<void>`, executado na **fase de start** e nunca dentro do `create`.
- **AC-2** — `BoundedContextOptions` aceita `shutdown?: (container: DependencyContainer) => void | Promise<void>`.
- **AC-3** — `BoundedContext.startAll(contexts)` executa os `start` em **FIFO** e, se um lançar, **aborta** com erro que nomeia o contexto — os seguintes não rodam.
- **AC-4** — `BoundedContext.shutdownAll(contexts)` executa os `shutdown` em **LIFO**, isola cada um em try/catch, **não interrompe** a drenagem e devolve `ShutdownFailure[]` com `{ context, error }`.
- **AC-5** — `start()` é idempotente: a segunda chamada é no-op e não re-executa o hook. (Jobs continuam registrados no `create` — D6.)
- **AC-6** — Um contexto sem `start`/`shutdown` declarado passa por `startAll`/`shutdownAll` como no-op, sem erro.
- **AC-7** — `composeContexts` devolve `contexts` junto de `mounted` e `routers`, e `src/server.ts` continua compilando sem mudança de comportamento.
- **AC-8** — `registerJobs` usa `static repeat` da classe do handler quando o `JobDefinition` não traz `repeat`; quando ambos existem, o do `JobDefinition` vence.

**Falseadores obrigatórios** (vermelho com a implementação desligada, verde ligada):
- **F-1 (AC-3)** — um contexto cujo `start` lança faz `startAll` abortar, e um contexto posterior na lista **não** roda. Testemunha: contador que fica em 1, não 2.
- **F-2 (AC-4)** — um contexto cujo `shutdown` lança **não** impede o seguinte; a lista devolvida tem exatamente 1 falha e o contador do outro chegou a 1.
- **F-3 (AC-5)** — chamar `start()` duas vezes executa o hook uma vez só. Testemunha: contador em 1, não 2.
- **F-4 (AC-8)** — remover o `static repeat` do handler de teste faz o job perder a cadência; devolvê-lo, recupera.
