# Fronteiras de agregado — Thread absorve o transcript, Stop migra para Thread, ThreadStatusDeriver

**Date:** 2026-07-29
**Status:** Approved
**Bounded Context:** thread + issue
**Kind:** refactor
**Story Points:** 8 — multi-contexto (thread ↔ issue) com migração de tabela cruzando bounded context (`issue_stops`) e extração de serviço; sem contrato de integração novo.

## Context

Três repositórios/serviços do BC4 (thread) e BC5 (issue) têm hoje uma forma que não bate com o que a docstring promete.

**`TranscriptRepository`** (`packages/api/typescript/src/thread/repositories/TranscriptRepository/TranscriptRepository.ts:31-45`) tem a docstring "A distinct entity within BC4 — queried per thread... and per issue" — mas não existe nenhuma entidade `TranscriptEntry`. É uma `abstract class` solta com `append/findById/recentByThread/listByThread/listByIssue/setIssueId` que devolve `TranscriptEntryRow` plano. `DrizzleTranscriptRepository.append()` (`DrizzleTranscriptRepository.ts:16-35`) minta o id via `crypto.randomUUID()` direto no repo — não há agregado por trás para mintar identidade ou validar nada antes do insert. `Thread.ts` já documenta essa separação e a lamenta: "The transcript + pending clarifications are separate entities/records, not embedded here" (`Thread.ts:59`).

Os 4 call sites de escrita (`append`) confirmados no código:
- `SteerThread.ts:47` — kind `WHISPER`, sem sender.
- `SendDirectMessage.ts:42` — kind `DIRECT`, sem sender.
- `IngestChannelMessage.ts:50-59` — kind `CONTACT`, com `senderExternalId` + `quotedEntryId`.
- `DeliverOrchestratorReply.ts:56-61` — kind `SYSTEM`, com `quotedEntryId`, **sem** `tx` (esse handler não usa `withTransaction` — é o único dos quatro que grava a entry fora de qualquer transação).

`listByThread`, `listByIssue` e `setIssueId` não têm nenhum call site de produção (só existem na interface/mock/drizzle). `recentByThread` tem um 5º consumidor, só-leitura: `RunOrchestratorTurn.ts:241`, a janela de contexto que o agente lê — isso fica fora do agregado por design (decisão 3).

**`StopRepository`** (`packages/api/typescript/src/issue/repositories/StopRepository/StopRepository.ts:27-34`) tem o mesmo padrão: docstring "The Stop entity store (raise → resolve)" sem nenhuma entidade `Stop`. Vive em `issue/`, e a tabela `issue_stops` (`packages/contracts/db/schema-sqlite/issue.ts:72-99`, export `stops`) tem `issueId: text('issue_id').notNull()` — **obrigatório**. Os dois únicos escritores são `RaiseStop.ts:58` (`this.stops.raise(...)`, dentro de `withTransaction`) e `ResolveStop.ts:29-36` (`findById` → `resolve` → publica `IssueStopResolvedEvent`). Como `RaiseStopInputSchema` e `AskOperatorInputSchema` (`agent/usecases/AskOperator.ts:9-13`) exigem `issueId: z.uuid()`, hoje **não existe caminho para levantar um stop sem issue** — é exatamente o buraco do "needs-approval do orquestrador" que a decisão 4 fecha por modelagem.

`TerminalLineRepository` (`issue/repositories/TerminalLineRepository/TerminalLineRepository.ts`) tem a mesma forma (tabela-filha sem entidade), mas com justificativa explícita na docstring do agregado pai: `Issue.ts:44` — *"Stops + the terminal log are separate tables (own lifecycles/scale)."* Essa é a única linha do código que hoje justifica esse padrão — e ela cita "Stops" como parte do que fica de fora, o que a decisão 5/2 desta spec invalida para Stop especificamente (Stop deixa de ser tabela-filha independente e passa a ser sub-registro do agregado `Thread`); `TerminalLineRepository` continua justificado (T12 replay, log de transporte, escala própria) e não é tocado aqui.

**`deriveThreadStatus`** (`packages/api/typescript/src/shared/services/threadStatus.ts:35-40`) é uma função pura: recebe `{ paused, hasOpenStop, hasWorkingIssue }` já calculados e aplica a precedência (pause > stop aberto > issue rodando > idle). Ela não faz nenhuma leitura — quem faz as 3 leituras é cada chamador, duplicando a mesma query shape:
- `GetHomeDashboard.ts:94-98` (`ui/usecases/`).
- `GetSessionChat.ts:123-127` (`thread/usecases/`).
- `BrowserFrameEnricher.ts:209` (`ui/services/`) — este 3º call site morre na frente B5 (fora de escopo aqui, só coordenação de ordem).

## Problem

1. `TranscriptRepository` é uma tabela-filha travestida de "entity store" — os 4 call sites de escrita chamam `append()` direto, sem nenhum agregado no meio para validar. Não há hoje nenhuma checagem de que `quotedEntryId` pertence à mesma thread, nem de que o `kind` da entry é compatível com ter ou não `senderExternalId`.
2. `Stop` vive permanentemente amarrado a `issueId` obrigatório dentro do contexto `issue`, o que impede levantar um stop de nível-thread (aprovação do orquestrador antes de qualquer issue existir).
3. A regra de status derivado do thread está corretamente centralizada como função pura, mas as 3 leituras que a alimentam são reescritas em cada um dos 3 call sites — sem um dono único do "como eu leio isso".

## Goal

Fazer `Thread` ser o dono real das invariantes de transcript (quem pode citar o quê, quem precisa de sender) e de stop (raise/resolve), com a persistência das duas sub-tabelas passando pelo agregado — e extrair a leitura de status derivado para um serviço único, sem mudar a semântica de precedência já existente.

## Decisions

1. **`Thread.recordEntry(...)`** é criado como método de domínio. Valida as invariantes (2) abaixo e acumula a entry pendente no agregado (não grava sozinho). `ThreadRepository.save()` passa a persistir `thread` + as entries pendentes acumuladas na **mesma transação**. `save()` **não** re-hidrata o histórico no `findById` — o load do agregado continua com zero entries, exatamente como hoje `DrizzleThreadRepository.toDomain()` não toca `transcript_entries`. `TranscriptRepository` (interface + `DrizzleTranscriptRepository` + `MockTranscriptRepository`) morre. Os 4 call sites de escrita (`SteerThread.ts:47`, `SendDirectMessage.ts:42`, `IngestChannelMessage.ts:50`, `DeliverOrchestratorReply.ts:56`) passam a chamar `thread.recordEntry(...)` seguido de `threads.save(thread, tx)`.
2. Invariantes de `recordEntry`:
   - (a) `quotedEntryId`, quando presente, só pode referenciar uma entry **da própria thread** (nunca de outra).
   - (b) matriz kind×sender: `CONTACT` exige `senderExternalId`; `SYSTEM` e `WHISPER` não podem carregar sender de contato.
3. Leituras continuam **fora** do agregado: os query use cases (BFF) seguem lendo Drizzle direto — inclusive `recentByThread`, cuja única sobrevivente é a janela de contexto do agente (`RunOrchestratorTurn.ts:241`), que passa a viver como leitura direta (fora de `TranscriptRepository`, que deixou de existir) — padrão Query Use Case do projeto.
4. `Stop` é re-modelado como **child de `Thread`**, com `issueId` opcional. `Thread` ganha `raiseStop` / `resolveStop`. A tabela `issue_stops` (`packages/contracts/db/schema-sqlite/issue.ts:72-99`) migra: dona passa a ser `thread`, `issue_id` deixa de ser `.notNull()`. Isso resolve por modelagem a frente pendente "stop sem issue" (needs-approval do orquestrador) — hoje impossível porque `RaiseStopInputSchema`/`AskOperatorInputSchema` exigem `issueId`. Consumidores a ajustar, confirmados no código:
   - `GetIssueDetail.ts` (`issue/usecases/`) — filtra por `issueId` específico; não quebra com a coluna nullable, só deixa de ver stops sem issue (esperado, eles pertencem à tela de thread).
   - `GetNeedsYouPanel.ts:37-48` — hoje faz `.innerJoin(issues, eq(stops.issueId, issues.id))` e o schema de saída exige `issueId`/`issueKey` (`z.uuid()`/`z.string()` obrigatórios). Com `issueId` nullable, o `innerJoin` **descarta silenciosamente** stops sem issue — o inverso do que a decisão pretende habilitar. Precisa virar `leftJoin` + campos opcionais.
   - `GetSessionChat.ts` (`activeStops`, linhas ~123-127) — já filtra só por `threadId`, não quebra.
   - `GetHomeDashboard.ts` (`needsYou`) — já filtra só por `ownerId`, não quebra.
   - `ResolveStop.ts` — hoje resolve via `StopRepository` isolado; passa a resolver via `thread.resolveStop(...)` + `threads.save(...)`.
   - contratos de stop **renomeiam junto com o dono** (decisão do founder, 29-jul): `issue-stop-raised.tsp`/`issue-stop-resolved.tsp` viram `thread-stop-raised.tsp`/`thread-stop-resolved.tsp` (`integration.thread.stop_raised`/`integration.thread.stop_resolved`); `issueId` vira **opcional** nos dois; `stop_resolved` ganha **`threadId`** (que `stop_raised` já carrega) — é a mesma mexida de contrato que a frente B5 precisa, feita uma vez só aqui; B5 apenas re-aponta os listeners do front. `bun sdk` regenerado; consumidores TS (`MaterializeIssueFromExecution`, `PublishAgentIntegrationEvents`/publisher do contexto) atualizados.
   - `StopPolicyConfigRepository` (hoje em `issue/repositories/`) **migra para `thread/repositories/`** (decisão do founder): a policy acompanha o dono novo, e os critérios de parada passarão a valer também para o orquestrador (needs-approval thread-level).
   - os **domain events** de stop (`IssueStopRaisedEvent`/`IssueStopResolvedEvent`, hoje em `issue/events/`) **migram para `thread/events/`** — passam a ser levantados pelos métodos do agregado (`Thread.raiseStop`/`resolveStop`), e sua publicação sai de `PublishIssueIntegrationEvents` para `PublishThreadIntegrationEvents`. Implicação direta das convenções já decididas (eventos vivem no contexto dono; publisher por contexto — B3), apontada pela verificação de coerência; B5 consome do publisher de thread.
   - links do front `/threads/$threadId/issues/$issueId` — a rota existe em `packages/app/react/src/routes/(app)/threads/$threadId/issues/$issueId/index.tsx`; qualquer navegação que hoje assume "todo stop tem uma issue" (ex.: link construído a partir de `issueId` do stop) deixa de valer para stops sem issue.
   - `RaiseStop.ts:58` — não citado explicitamente pelo founder, mas é implicado pela própria decisão ("Thread.raiseStop/resolveStop no agregado"): passa a chamar `thread.raiseStop(...)` + `threads.save(...)` em vez de `IssueRepository` + `StopRepository`.
5. Nova bad practice de template: *"repositório de tabela-filha só é legítimo com justificativa explícita de lifecycle/escala documentada no agregado pai; senão, a tabela é parte do agregado e a escrita passa por método dele."* `TerminalLineRepository` fica (justificado em `Issue.ts:44`: "own lifecycles/scale"). `ConsumedMessageRepository` fica (infra de idempotência, não é modelo de domínio).
6b. **Rodada de pesquisa pré-implementação, TS E GO (obrigatória — founder, 29-jul).** O censo achou `TranscriptRepository`/`StopRepository` (corrigidos aqui) e `TerminalLineRepository`/`ConsumedMessageRepository` (justificados). Antes do `/plan` fechar tarefas, a varredura é re-executada no TS (o código muda) e **estendida ao Go** (`packages/api/go` — repositórios de tabela-filha sem agregado dono, ex.: os repositories do gateway em `internal/channel/repositories/`), que nunca foi varrido com a lente da decisão 5. Cada achado é classificado contra a regra: ou ganha justificativa de lifecycle/escala documentada no agregado pai, ou entra no inventário de migração (nesta frente se for `thread`/`issue`; como follow-up registrado se for outro contexto). A skill `repository/go` recebe a mesma bad practice com exemplos reais do lado Go encontrados na varredura.

7. `deriveThreadStatus` vira **`ThreadStatusDeriver`** (nome exato) — classe DI em `thread/services/`, seguindo o padrão já existente de `ChannelConnectivity` (`thread/services/ChannelConnectivity/`: abstract class + `Drizzle*`/`Mock*`). Encapsula as 3 leituras (`paused`, stop aberto, issue em `WORKING`) **e** a função pura de precedência — hoje espalhada como responsabilidade de cada chamador. Sai de `shared/services/threadStatus.ts`. Callers ajustados: `GetHomeDashboard.ts` (ui) e `GetSessionChat.ts` (thread). `BrowserFrameEnricher.ts:14,209` (3º call site) tem o **import trocado mecanicamente** para `ThreadStatusDeriver` nesta spec — o que permite apagar `shared/services/threadStatus.ts` aqui, sem re-export temporário; o arquivo inteiro do enricher morre logo depois, na frente B5.

## User Stories

**US-1 — recordEntry rejeita citação cruzada de thread**
Given uma `Thread` A com uma entry `e1`, e uma `Thread` B qualquer
When `threadB.recordEntry({ kind: CONTACT, quotedEntryId: e1.id, ... })` é chamado
Then o método lança um erro de domínio e nenhuma entry é acumulada no agregado.

**US-2 — recordEntry aplica a matriz kind×sender**
Given uma `Thread` válida
When `recordEntry({ kind: CONTACT, ... })` é chamado sem `senderExternalId`
Then lança erro de domínio.
And when `recordEntry({ kind: SYSTEM, senderExternalId: 'x', ... })` ou `recordEntry({ kind: WHISPER, senderExternalId: 'x', ... })` é chamado
Then lança erro de domínio.

**US-3 — thread + entries persistidas na mesma transação**
Given uma `Thread` carregada
When `thread.recordEntry(...)` acumula uma entry pendente e `threadRepository.save(thread, tx)` é chamado
Then a linha em `threads` e a nova linha em `transcript_entries` existem ambas ao final da transação, e nenhuma delas existe se a transação for revertida.

**US-4 — os 4 call sites de escrita passam pelo agregado**
Given `SteerThread`, `SendDirectMessage`, `IngestChannelMessage` e `DeliverOrchestratorReply`
When cada um processa sua operação
Then nenhum deles importa `TranscriptRepository` (que não existe mais) — todos chamam `thread.recordEntry(...)` + `threadRepository.save(...)`.

**US-5 — stop sem issue pode ser levantado**
Given uma `Thread` sem nenhuma issue aberta
When `thread.raiseStop({ issueId: undefined, kind: HUMAN_REQUESTED, ... })` é chamado
Then o stop é criado com `issueId` nulo e aparece nas leituras thread-level (`GetSessionChat.activeStops`, `GetHomeDashboard.needsYou`).

**US-6 — GetNeedsYouPanel não descarta stop sem issue**
Given um stop aberto sem `issueId` numa thread
When `GetNeedsYouPanel` é chamado para essa thread
Then o stop aparece na resposta (join deixou de excluir linhas sem issue correspondente).

**US-7 — ThreadStatusDeriver centraliza as 3 leituras**
Given uma thread com um stop aberto e nenhuma issue em `WORKING`
When `GetHomeDashboard` e `GetSessionChat` resolvem o status dessa thread via `ThreadStatusDeriver`
Then ambos retornam `NEEDS_ATTENTION`, e nenhum dos dois usecases contém sua própria query de "tem stop aberto" / "tem issue working" — a leitura vive só em `ThreadStatusDeriver`.

## Acceptance Criteria

- [ ] AC-1: `Thread.recordEntry` lança um erro de domínio quando `quotedEntryId` referencia uma entry de outra thread (teste de entidade, sem DB).
- [ ] AC-2: `Thread.recordEntry` lança erro de domínio para `kind: CONTACT` sem `senderExternalId`, e para `kind: SYSTEM` ou `kind: WHISPER` com `senderExternalId` presente.
- [ ] AC-3: `ThreadRepository.save(thread, tx)`, após uma ou mais chamadas a `recordEntry`, persiste `threads` + as novas linhas de `transcript_entries` atomicamente (teste de repositório com PGlite/sqlite in-process: rollback do `tx` não deixa nem thread nem entry gravadas).
- [ ] AC-4: `find`/`grep` por `TranscriptRepository` em `packages/api/typescript/src` não retorna nenhum resultado fora de histórico/testes removidos — a classe e seus dois implementadores (`Drizzle*`, `Mock*`) não existem mais.
- [ ] AC-5: `SteerThread`, `SendDirectMessage`, `IngestChannelMessage`, `DeliverOrchestratorReply` não importam `TranscriptRepository`; cada um chama `thread.recordEntry` + `threadRepository.save`.
- [ ] AC-6: `RunOrchestratorTurn.ts` continua lendo a janela de contexto (equivalente a `recentByThread`) via leitura direta fora do agregado — sem regressão de comportamento (mesmo limite, mesma ordenação cronológica).
- [ ] AC-7: `thread.raiseStop({ issueId: undefined, ... })` cria um stop com `issueId` nulo no banco (coluna `issue_stops.issue_id` aceita `NULL`); `thread.resolveStop(stopId, resolution)` resolve independentemente de o stop ter `issueId`.
- [ ] AC-8: `RaiseStop` e `ResolveStop` não importam mais `StopRepository` isolado do contexto `issue` — orquestram via `ThreadRepository` + os métodos do agregado.
- [ ] AC-9: `GetNeedsYouPanel` retorna stops sem `issueId` (join alterado para não excluir linhas sem issue correspondente); campos `issueId`/`issueKey` da resposta tornam-se opcionais no schema.
- [ ] AC-10: `GetSessionChat.activeStops` e `GetHomeDashboard.needsYou` continuam retornando corretamente stops COM issue (sem regressão) e passam a retornar também stops SEM issue.
- [ ] AC-11: `.claude/skills/repository/typescript/registry.yaml` ganha a bad practice descrita na decisão 5 (repositório de tabela-filha exige justificativa de lifecycle/escala no agregado pai); `TerminalLineRepository` e `ConsumedMessageRepository` seguem existindo sem violar a nova regra.
- [ ] AC-12: `ThreadStatusDeriver` existe em `thread/services/ThreadStatusDeriver/` (abstract class + implementação), encapsula as 3 leituras + a precedência hoje em `deriveThreadStatus`; `shared/services/threadStatus.ts` deixa de exportar essa função.
- [ ] AC-13: `GetHomeDashboard` e `GetSessionChat` resolvem o status via `ThreadStatusDeriver` — nenhum dos dois monta manualmente `{ paused, hasOpenStop, hasWorkingIssue }` a partir de queries próprias.
- [ ] AC-14: `bun tsc` e `bun test` (workspace `packages/api/typescript`) passam limpos após a migração.
- [ ] AC-15: os contratos existem como `thread-stop-raised.tsp`/`thread-stop-resolved.tsp` com nomes `integration.thread.stop_raised`/`integration.thread.stop_resolved`, `issueId` opcional nos dois e `threadId` presente em ambos; `bun sdk` regenerado e nenhuma referência a `integration.issue.stop_*` sobra em código de produção do api.
- [ ] AC-16: `StopPolicyConfigRepository` vive em `thread/repositories/` e o caminho de raise lê a policy de lá; nenhum import cross-context de `issue/repositories/StopPolicyConfigRepository` resta.
- [ ] AC-17: a rodada de pesquisa da decisão 6b está registrada no plano com o inventário completo (TS e Go), cada repositório de tabela-filha classificado (justificado × migrar × follow-up); `.claude/skills/repository/go/registry.yaml` carrega a mesma bad practice da variante TS com exemplo real do lado Go.

## O que sobe pro template

- **`.claude/skills/repository/typescript/registry.yaml`** — nova entrada de `bad_practices` (decisão 5): "repositório de tabela-filha sem entidade correspondente só é legítimo com justificativa explícita de lifecycle/escala documentada no agregado pai; caso contrário a tabela é parte do agregado e a escrita passa por um método dele." Exemplo positivo (`TerminalLineRepository` + a linha de justificativa em `Issue.ts:44`) e exemplo negativo (o `TranscriptRepository`/`StopRepository` que esta spec elimina).
- **`.claude/skills/repository/go/registry.yaml`** — mesma regra é um princípio de DDD, não uma particularidade de linguagem; como a decisão do founder rotula a bad practice como "de template" (não "de TS"), o par Go do skill `repository` deveria carregar a mesma entrada para os dois variants não divergirem. Sinalizado aqui; não há código Go afetado por esta spec para validar o exemplo do lado Go.
- **`thread/services/ThreadStatusDeriver/`** — novo padrão de serviço DI (abstract class + `Drizzle*`/`Mock*`) que replica a forma já usada por `ChannelConnectivity` — não é um padrão novo, é reaplicação do padrão existente, então não exige mudança de skill/registry além do que já existe para `service`.

## Risks & Migration

- **Ordem vs B5**: resolvido pela decisão 6 — B4 migra também o import do `BrowserFrameEnricher` para `ThreadStatusDeriver` (troca mecânica) e apaga `shared/services/threadStatus.ts` nesta spec; B5 depois deleta o enricher inteiro. Sem re-export temporário.
- **Ordem vs B2**: a tool de stop do orchestration (B2) vai usar `Thread.raiseStop` — B4 precisa estar mergeado (ou o método já existir na aggregate) antes de B2 depender dele.
- **`DeliverOrchestratorReply.ts` não é transacional hoje**: é o único dos 4 call sites de `append` que chama sem `tx` (não usa `withTransaction`). Ao migrar para `thread.recordEntry` + `threads.save`, esse handler passa a precisar de uma transação (mesmo que criada localmente pelo `save`) para manter thread+entry atômicos — é uma correção de comportamento, não uma regressão, mas muda a forma do handler.
- **`RaiseStop.ts` hoje deriva `ownerId` de `issue.ownerId`** (`this.policy.get(issue.ownerId)`, linha ~53) — com `issueId` opcional, um raise sem issue não tem `Issue` para tirar o `ownerId`; a versão migrada tira de `Thread`, e a policy passa a ser lida do `StopPolicyConfigRepository` já morando em `thread/` (decisão 4).
- **Migração de dado de `issue_stops`**: relaxar `issue_id` de `.notNull()` para nullable é uma migração aditiva (sem backfill — linhas existentes já têm `issue_id` preenchido). O risco real não é de dado, é de código: qualquer leitura que faça `innerJoin`/assuma `issueId` presente (o caso já mapeado de `GetNeedsYouPanel.ts`) precisa ser auditada, não só a citada.

