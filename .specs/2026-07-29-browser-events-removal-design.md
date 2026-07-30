# Remover `browser.*` + BrowserFrameEnricher

**Date:** 2026-07-29
**Status:** Approved
**Bounded Context:** ui + thread + contracts + app-react
**Kind:** refactor
**Story Points:** 5 — cross-contexto (contracts + thread + ui + app-react) com um contrato novo (`thread-message-ingested.tsp`) e remoção líquida de código; a mexida no contrato de stop foi absorvida pela frente B4 (rename `thread.stop_*` + `threadId`), da qual esta depende.

## Context

`ListenEventsController` (`packages/api/typescript/src/ui/controllers/ListenEvents.ts`) expõe um único SSE (`GET /ui/events`) cujo union de saída compõe duas famílias de frame:

- todo o surface `integration.*` (o envelope cru, re-emitido sem transformação — "founder ratification 23-jul: no allowlist");
- três frames `browser.*`, sintetizados pelo `BrowserFrameEnricher` (`packages/api/typescript/src/ui/services/BrowserFrameEnricher/BrowserFrameEnricher.ts`) a partir de 5 integration events: `IssueStopRaisedEvent`, `IssueOpenedEvent`, `IssueCompletedEvent`, `IssueStopResolvedEvent`, `ChannelMessageReceivedEvent`.

Os 3 frames são: `browser.thread_status_changed` (status derivado + `agentsRunningNow`), `browser.stop_raised` (`threadDisplayName` + `issueKey`), `browser.thread_message_ingested` (`threadId` resolvido por JOIN de `(channelId, remoteId)`).

No frontend, os três únicos consumidores desses frames — `useThreadRealtime` (`packages/app/react/src/routes/(app)/threads/$threadId/-hooks/useThreadRealtime.ts`), `AgentsRunningPill` (`packages/app/react/src/components/console/AgentsRunningPill.tsx`) e `HomeDashboard` (`packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx`) — usam os campos enriquecidos **apenas como gatilho de `invalidateQueries`**: nenhum lê `status`, `agentsRunningNow`, `threadDisplayName` ou `issueKey` do próprio frame — o dado real vem da query REST (`useGetHomeDashboard`, `getSessionChatQueryKey`, etc.) refeita após a invalidação.

Ou seja: os 3 frames existem só para escopar um evento a uma thread ou fornecer um "algo mudou" — trabalho que os eventos crus já fazem, exceto em duas lacunas reais:

1. `integration.channel_message.received` (`packages/contracts/wire/events/channel-message-received.tsp`) não carrega `threadId` — é endereçado por `(channelId, remoteId)`, uma JID do WhatsApp. É o motivo de existir do `browser.thread_message_ingested`.
2. `issue-stop-resolved.tsp` também não carrega `threadId` — apesar do emissor TS (`ResolveStop.ts`) já ter o dado em mãos: `stop.threadId` está disponível e é usado para popular o **domain event** `IssueStopResolvedEvent` (`payload: { stopId, issueId, threadId: stop.threadId, resolution }`), mas o handler-ponte `PublishIssueIntegrationEvents.ts` descarta esse campo ao montar o integration event (`payload: { stopId, issueId, resolution }`, sem `threadId`).

Todas as outras 3 fontes do enricher (`integration.issue.stop_raised`, `integration.issue.opened`, `integration.issue.completed`) **já carregam `threadId` no wire hoje** — o enricher as usa apenas para recalcular `status`/`agentsRunningNow`, que ninguém lê.

`browser.terminal_action_detected` não faz parte dessa família: vive num SSE separado (`StreamTerminalSession`, `packages/api/typescript/src/agent/controllers/StreamTerminalSession.ts`) e não deriva de integration event nenhum — fora de escopo.

## Problem

`BrowserFrameEnricher` faz leituras de banco (`stops`, `issues`, `threads`) a cada fato broadcast, para produzir campos que nenhum consumidor lê, e mantém uma segunda declaração de "o que aconteceu com essa thread" paralela ao contrato — sempre em risco de divergir do wire real (como já divergiu: o enricher resolve `threadId` para `stop_resolved`/`channel_message.received` via JOIN, quando o dado deveria simplesmente estar no wire). Isso é peso de manutenção (BC `ui` lendo diretamente das tabelas de `issue`/`thread` para um DTO que ninguém consome) sem ganho: a invalidação cirúrgica que os consumidores realmente precisam já está disponível — ou fica disponível — nos eventos crus.

## Goal

Fechar as 2 lacunas reais de `threadId` no contrato (novo evento para o ingest de mensagem; campo adicionado no `stop_resolved`), migrar os 3 consumidores frontend para escutar só eventos crus, e remover `BrowserFrameEnricher` + os 3 frames `browser.*` + seus testes.

## Decisions

1. Novo integration event `integration.thread.message_ingested { threadId: string }`, definido em `packages/contracts/wire/events/thread-message-ingested.tsp` (mesmo padrão de `thread-attached.tsp`: `extends IntegrationEvent`). Publicado pelo bridge write-side do BC `thread` — `PublishThreadIntegrationEvents.ts` (`packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.ts`) passa a assinar também o domain event `MessageIngestedEvent` (`packages/api/typescript/src/thread/events/MessageIngestedEvent.ts`, já levantado por `IngestChannelMessage.ts` com `threadId` no payload, mas hoje sem handler que o republique) e publica `new ThreadMessageIngestedEvent({ ownerId, payload: { threadId: event.payload.threadId } })` via `ExternalMediator` — o mesmo caminho bridge→lane que os outros dois casos do handler já usam. Substitui `browser.thread_message_ingested`: a invalidação passa a ser cirúrgica direto do evento cru, sem o JOIN `threadIdForContact` que o enricher fazia.
2. A mexida no contrato de stop é **dona da frente B4** (decisão do founder, 29-jul): os contratos renomeiam para `thread-stop-raised.tsp`/`thread-stop-resolved.tsp` (`integration.thread.stop_raised`/`stop_resolved`), com `issueId` opcional e `threadId` presente nos dois. Esta spec **consome** o contrato renomeado: o publisher do contexto deixa de descartar o `threadId` que o domain event já carrega, e os listeners do front escutam os nomes novos. Dependência dura: B4 mergeado antes.
3. Remoção: `BrowserFrameEnricher.ts` + `BrowserFrameEnricher.test.ts` (`packages/api/typescript/src/ui/services/BrowserFrameEnricher/`) morrem, junto com as 3 declarações `Browser*FrameSchema` e a composição `BrowserSseFrameSchema` no `ListenEventsControllerOutputSchema`. `ListenEventsController` (`ListenEvents.ts`) para de injetar/chamar `enricher.enrich(event)` no `ensureBroadcaster` — o broadcaster volta a só re-emitir `rawFrame`. `THREAD_REALTIME_EVENTS` (`useThreadRealtime.ts`), `AgentsRunningPill` e `HomeDashboard` passam a escutar só eventos crus: os 4 que já carregavam `threadId` (`integration.issue.opened`, `integration.issue.completed`, `integration.thread.stop_raised`, e `integration.thread.stop_resolved` após a Decisão 2) mais o novo `integration.thread.message_ingested` (Decisão 1) no lugar dos 3 `browser.*`. Pause/resume seguem sem frame SSE dedicado — quem pausa já é o próprio cliente que disparou a ação (desktop single-window), e isso já era verdade hoje (nenhum caso do enricher reage a `ThreadPausedEvent`/`ThreadResumedEvent`). `browser.terminal_action_detected`/`StreamTerminalSession` ficam fora de escopo.
4. `bun sdk` regenerado após a mudança de contrato + controller. Gate obrigatório: `cd packages/app/react && bun x tsc` (mudança de SDK/enum union exige verificação do tsc do react, não só do api-ts), além do `tsc` do `api-ts`.

## User Stories

**US-1** — Como operador com o console de threads aberto, quando uma mensagem inbound chega numa thread que estou vendo, quero que o chat atualize sem depender de um frame `browser.*` intermediário.
- Given o operador está na rota `/threads/$threadId` com `useThreadRealtime` montado,
- When o backend publica `integration.thread.message_ingested { threadId }` para essa thread,
- Then `getSessionChatQueryKey(threadId)` é invalidada — sem o backend precisar sintetizar `browser.thread_message_ingested`.

**US-2** — Como operador, quando resolvo um stop (`ResolveStop`), quero que a UI da thread invalide corretamente sem que o backend precise fazer um JOIN issue→thread para descobrir a thread.
- Given um stop com `threadId` conhecido é resolvido via `ResolveStop`,
- When o publisher do contexto publica `integration.thread.stop_resolved`,
- Then o payload já carrega `threadId` (sem lookup adicional) e os consumidores frontend (`useThreadRealtime`) conseguem escopar a invalidação a essa thread.

**US-3** — Como engenheiro mantendo o BC `ui`, quero que o SSE não dependa de uma segunda camada de leitura de banco (`BrowserFrameEnricher`) para campos que ninguém no frontend lê.
- Given o `ListenEventsController` broadcast de um integration event,
- When o evento é entregue aos clientes SSE,
- Then apenas o `rawFrame` é enviado — nenhuma chamada a `enricher.enrich(event)` ocorre, porque o serviço não existe mais.

## Acceptance Criteria

- [ ] AC-1: `packages/contracts/wire/events/thread-message-ingested.tsp` define `ThreadMessageIngestedEvent extends IntegrationEvent` com `name: "integration.thread.message_ingested"` e `threadId: string`.
- [ ] AC-2: `packages/contracts/wire/events/thread-stop-resolved.tsp` (renomeado pela B4) carrega `threadId: string`, e o publisher do contexto o popula a partir do domain event (sem lookup).
- [ ] AC-3: `PublishThreadIntegrationEvents` (`packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.ts`) assina `MessageIngestedEvent` e publica `ThreadMessageIngestedEvent` com `payload.threadId` igual ao `threadId` do domain event — coberto por teste de handler que dispara `IngestChannelMessage` e assere o integration event publicado.
- [ ] AC-4: `PublishIssueIntegrationEvents` (`packages/api/typescript/src/issue/handlers/PublishIssueIntegrationEvents.ts`) inclui `threadId: event.payload.threadId` ao montar `IssueStopResolvedIntegrationEvent` — coberto por teste de handler que dispara `ResolveStop` e assere `threadId` no payload publicado.
- [ ] AC-5: `packages/api/typescript/src/ui/services/BrowserFrameEnricher/` (arquivo `.ts` + `.test.ts`) não existe mais no repo.
- [ ] AC-6: `ListenEventsControllerOutputSchema` (`ListenEvents.ts`) não referencia `BrowserSseFrameSchema`; o union de saída é só `materializedIntegrationEventSchemas`.
- [ ] AC-7: `ensureBroadcaster` em `ListenEvents.ts` não injeta nem chama `BrowserFrameEnricher` — envia apenas `rawFrame` por evento broadcastável.
- [ ] AC-8: `THREAD_REALTIME_EVENTS` (`useThreadRealtime.ts`) não contém nenhum nome `browser.*`; contém `integration.thread.message_ingested` e `integration.thread.stop_resolved` além dos eventos crus já presentes (`integration.issue.opened`, `integration.issue.completed`, `integration.thread.stop_raised`, `integration.orchestrator.replied`, `integration.issue.created`, `integration.issue.archived`, `integration.artifact.recorded`), e `threadInvalidations` trata cada um com um `case` (exhaustiveness check `never` intacto).
- [ ] AC-9: `AgentsRunningPill.tsx` e `HomeDashboard/index.tsx` não escutam nenhum `browser.*`; escutam a mesma lista de eventos crus (`integration.issue.opened`, `integration.issue.completed`, `integration.thread.stop_raised`, `integration.thread.stop_resolved`) para invalidar `getHomeDashboardQueryKey()`.
- [ ] AC-10: `bun sdk` regenerado; `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` e `cd packages/app/react && bun x tsc` passam limpos.
- [ ] AC-11: `bun test` (api-ts) passa sem nenhum teste referenciando `BrowserFrameEnricher` ou os 3 nomes `browser.*`.

## O que sobe pro template

Nenhuma skill/registry/rail/core é tocado por este refactor: a mudança é inteiramente dentro de bounded contexts de produto (`thread`, `issue`, `ui`) e do contrato TypeSpec do próprio produto — não introduz um padrão novo de citizen, nem generaliza um mecanismo cross-produto. O padrão "bridge write-side republica domain event como integration event" (`PublishThreadIntegrationEvents`, `PublishIssueIntegrationEvents`) já é o canônico documentado; esta spec só aplica esse padrão a mais um caso (`MessageIngestedEvent`) e corrige um campo faltante num evento já congelado. T3 (founder): sem upstream.

## Open Questions

- Nenhuma dúvida em aberto — as decisões cobrem as 2 lacunas de `threadId` e a remoção completa do enricher; escopo de `browser.terminal_action_detected` explicitamente fora.
