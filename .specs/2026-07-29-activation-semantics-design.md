# Frente B3 — semântica de ativação (eventos-comando, publicação transacional, Mailbox)

**Date:** 2026-07-29
**Status:** Approved
**Bounded Context:** cross-context (thread, agent, issue, shared/core)
**Kind:** chore/refactor
**Story Points:** 8 — contrato removido (`ChannelDeliveryRequestedEvent` sai do `.tsp`), migração da entrega para `CommandQueue` (thread + agent) e correção do transporte TS→TS concentrada em um lugar (`SqlExternalMediator.publish()` passa a persistir); os publishers por contexto quase não mudam de forma

## Context

O ponto de partida é um bug de confiabilidade real, não hipotético. `packages/api/typescript/core/src/services/Mediator/SqlExternalMediator.ts` implementa `publish()` como um alias síncrono de `dispatch()` — fan-out em memória, sem nenhuma escrita em tabela (linhas 94-128, docblock explícito: "WHAT IT DOES NOT DO: it never INSERTs into the outbox"). O único evento-comando do sistema, `ChannelDeliveryRequestedEvent` (`packages/contracts/wire/events/channel-delivery-requested.tsp`), é emitido por dois produtores — `PublishThreadIntegrationEvents.ts:37` (message do operador) e `DeliverOrchestratorReply.ts:69` (resposta do orquestrador) — e consumido só por `DeliverChannelMessage.ts`, que chama `GatewayChannelSender.send()` (POST HTTP síncrono para o gateway Go). O comentário em `GatewayChannelSender.ts:36` — "a dead gateway is not a bug in the thread context — it is the same GATEWAY_UNAVAILABLE the proxy already surfaces, and the outbox will retry it" — é falso: não há outbox nesse caminho, o `publish()` que carrega o evento nunca persiste nada, e se o processo cair ou o `POST` falhar, a mensagem simplesmente não sai e não há retry.

O outbox real (`saveIntegrationEvent` em `DrizzleDomainEventRepository.ts:130-137`) existe, mas não tem nenhum call site de produção — só é chamado pelos próprios repositórios mock/`OutboxAwareMockDomainEventRepository` e pelo teste do repositório. Nenhum handler de negócio o usa hoje.

A tabela `outbox` é compartilhada com o Go: o Go publica integration events nela com `source = 'integration'`, e o `SqlExternalMediator` TS faz polling/claim dessa lane (`LANE = 'integration'`, `claimBatch`/`drainOnce` em `SqlExternalMediator.ts`) — esse é o caminho Go→TS, que já funciona via outbox de verdade. O caminho TS→TS (handler publica, outro handler consome) é o que está quebrado: `publish()` nunca grava, então nada persiste, nada sobrevive a um crash, e "the outbox will retry it" nunca foi verdade para esse lado.

Os cinco handlers `Publish*IntegrationEvents` (`thread`, `workspace`, `agent`, `issue`, `artifact`) seguem o mesmo padrão: um `EventHandler` multi-evento com `if (event instanceof X)` / branches por classe, cada branch chamando `this.mediator.publish(new SomeIntegrationEvent(...))`. `PublishAgentIntegrationEvents` é o maior, com 5 branches (`AgentRunStartedEvent`, `OrchestratorRepliedEvent`, `IssueForkedEvent`, `AgentRunCompletedEvent`, `AgentRunStopRaisedEvent`).

`DirectMessageSentEvent` (`thread.direct_message_sent`, `packages/api/typescript/src/thread/events/DirectMessageSentEvent.ts`) é levantado por `SendDirectMessage.ts` (use case, já dentro de `this.withTransaction(tx, ...)` junto com o `transcript.append`) e hoje tem exatamente um consumidor: a branch de `PublishThreadIntegrationEvents` que o traduz em `ChannelDeliveryRequestedEvent`.

`DrizzleOutboxDispatcher.ts` (fase de processamento, comentário na linha 227: "Phase 2: Process — Dispatch events OUTSIDE any database transaction") confirma que hoje `EventHandler.handle(event, tx?)` roda **sem** transação — o parâmetro `tx?` existe na assinatura mas nenhum handler atual o usa para abrir uma tx própria. Isso é relevante para a Decisão 2: hoje `DeliverOrchestratorReply.handle()` faz `transcript.append(...)` sem `tx` e depois `mediator.publish(...)` sem nenhuma atomicidade entre as duas — são duas operações independentes, uma delas (o publish) sem persistência nenhuma.

Infra que já existe e é reaproveitada por esta frente, sem mudança de forma:
- `CommandQueue` (`packages/api/typescript/core/src/services/CommandQueue/CommandQueue.ts`), com implementação real `SqliteCommandQueue` — `enqueueCommand(name, input, opts?, tx?)` já aceita uma transação do chamador (linha 133, `INSERT` em `shared_scheduled_commands` dentro da tx do caller), retry com backoff exponencial (`MAX_ATTEMPTS = 3`, `BACKOFF_BASE_MS = 1_000`) e lease por linha (`LEASE_MS = 60_000`).
- Mailbox (`agent_mailbox`): `MailboxRepository.ts` (fila de turnos por target, dedup via `dedupKey` único, "producers only ENQUEUE, always inside the transaction of the fact that motivates the item") + `DrizzleMailboxDispatcher.ts` (consumidor único, lease por target, `MAX_ATTEMPTS = 3`, poll 250ms–2s).

## Problem

O único evento-comando do sistema (`ChannelDeliveryRequestedEvent`) modela "entregue esta mensagem" como um fato reativo, mas o handler que o consome (`DeliverChannelMessage`) não reage a um fato — ele **executa um comando**: chama o gateway e é a única coisa que qualquer coisa faz com esse "evento". A intenção real é comandar, não notificar, e o transporte que ele usa (`SqlExternalMediator.publish`) não persiste nada — então a garantia que o nome do padrão (evento no outbox) sugere ("o outbox vai reentregar") nunca existiu para esse caminho, e o comentário em `GatewayChannelSender.ts:36` afirma uma garantia que não existe. Uma queda do processo, ou uma falha de rede no `POST` ao gateway, entre o `transcript.append` e a entrega bem-sucedida perde a mensagem sem qualquer sinal de erro visível além do log.

Separadamente, os bridges de integração (os 5 handlers `Publish*IntegrationEvents`) usam `switch`/`instanceof` para republicar múltiplos domain events como integration events, e o transporte por baixo (`publish()`) é o mesmo `dispatch()` em memória — ou seja, mesmo os eventos que são genuinamente reativos (fatos que atravessam bounded context, sem a intenção de comandar) hoje não sobrevivem a um crash entre o handler rodar e o consumidor do outro lado processar.

## Goal

Dar à "ativação" (fazer algo acontecer do lado de fora do processo/de outro bounded context) três formas nomeadas, cada uma com uma garantia de entrega explícita e verificável, e migrar o caminho de entrega de mensagens (o único caso concreto onde a forma errada causa perda real) para a forma correta:

1. Comando durável (`CommandQueue`) para "isto precisa acontecer, com retry, e alguém é o único executor" — usado pela entrega de mensagem.
2. Integration event persistido no outbox para "isto aconteceu, quem quiser reage" — usado pelos bridges cross-contexto.
3. Mailbox para "turnos serializados por target" — sem mudança, só documentado no lugar certo.

## Decisions

1. **Regra de intenção** (formulação do founder): evento existe para fins reativos, auditoria ou event sourcing — nunca para comandar. Se a existência do evento é só para um handler executar algo que poderia ser um comando/use case direto, está errado. Nomes `*Requested` não são proibidos por si; a intenção é o critério.

2. **Delivery de mensagens vira `CommandQueue`.** `SendDirectMessage` (use case) e o handler `DeliverOrchestratorReply` passam a enfileirar o comando de entrega **na mesma transação** em que gravam o transcript — `SendDirectMessage` já abre essa transação via `this.withTransaction(tx, ...)` e passa o `tx` para `transcript.append` e `domainEventRepository.save`; o `enqueueCommand(..., tx)` do `CommandQueue` entra nesse mesmo bloco. `DeliverOrchestratorReply` (hoje um `EventHandler` que roda fora de transação, conforme `DrizzleOutboxDispatcher.ts:227`) resolve a atomicidade pelo mecanismo canônico da casa — **handler invoca use case**: o corpo transacional (gravar transcript + `enqueueCommand`) vira um use case com `UnitOfWork` próprio, e o handler fica fino, só delegando. Um worker (o consumidor já existente do `CommandQueue`) executa o use case `DeliverChannelMessage` com o retry padrão do `CommandQueue` (`MAX_ATTEMPTS = 3`, backoff exponencial, lease de 60s). `ChannelDeliveryRequestedEvent` morre: o contrato `.tsp` (`packages/contracts/wire/events/channel-delivery-requested.tsp`) é removido, junto com a classe gerada e os três call sites de produção (`PublishThreadIntegrationEvents.ts`, `DeliverOrchestratorReply.ts`, `DeliverChannelMessage.ts` deixa de ser `EventHandler` e passa a ser o executor do comando).

3. **`thread.direct_message_sent` permanece** como domain event (fato) — descreve "o operador falou no canal" — sem nenhum consumidor. A branch de `PublishThreadIntegrationEvents` que hoje o traduz em `ChannelDeliveryRequestedEvent` é removida (a tradução vira o `enqueueCommand` direto dentro de `SendDirectMessage`, decisão 2), então o evento fica só como registro auditável.

4. **Um publisher por CONTEXTO, e a durabilidade mora no `publish()`** (revisão do founder sobre o desenho 1-por-evento). Duas metades:
   - **`ExternalMediator.publish()` muda de semântica**: deixa de ser alias de `dispatch()` em memória e passa a **persistir** o integration event na lane de integração do outbox (reutilizando `saveIntegrationEvent`, que ganha call site de produção pela primeira vez) — e nada mais. A entrega é sempre do poller (decisão 5). A correção de durabilidade acontece **num único arquivo**, e o docblock aspiracional do `SqlExternalMediator` vira verdade.
   - **`Publish<Ctx>IntegrationEvents` é a exceção nomeada de handler interno** — um por contexto, com switch/união sobre os fatos do contexto, **o único código autorizado a chamar `ExternalMediator.publish()`**. Todo outro handler é domínio puro (reage, invoca use cases, mas não publica integração). Os 5 publishers atuais quase não mudam: perdem a branch do delivery (decisão 2) e mantêm as traduções de fato. Enrichment, quando um dia for necessário, é um service injetado no publisher do contexto — com a escada de decisão documentada na skill: 1º o dado pertence ao fato? (o domain event carrega desde o raise) → 2º o consumidor consegue reler? (evento thin) → 3º só então enrichment no publisher.

5. **Entrega TS→TS via polling uniforme, na MESMA lane `integration`** (decisão do founder: o docblock que trata a lane como exclusiva Go→TS era restrição histórica e é atualizado — um poller, um claim/lease, o consumidor não sabe quem produziu, e o Go pode consumir eventos TS no futuro pela mesma via). Consumidores fazem dedup própria (entrega at-least-once; usar o `IdempotencyGuard` existente no core). O SSE broadcaster continua sendo um callback registrado no mediator (`registerCallback`/`notifyCallbacks`) e passa a disparar a partir do poller, não do `dispatch()` síncrono.

6. **Mailbox mantém como está** — nenhuma mudança de código. A skill de arquitetura ganha uma tabela de decisão: outbox = fatos/fan-out · `CommandQueue` = comando durável de único consumidor · Mailbox = turnos serializados por target · use case direto = síncrono na própria request.

7. **Os ~20 integration events do Go sem consumidor TS ficam fora do escopo desta frente** — inventariados, zero trabalho de código sobre eles.

8. **Enforcement**: bad practice de "intenção" adicionada ao `.claude/registry.yaml` (cross-cutting) e às skills `event`, `handler`, `usecase` (variantes `typescript` e `go`, já que a regra de intenção é lang-agnostic). Complementado por um probe heurístico de severidade WARN (não `mechanical: true`) que sinaliza evento com consumidor único cujo handler só executa uma ação — sem teste mecânico de persistência (decisão explícita do founder: a regra de intenção é de julgamento, não de forma sintática verificável por grep).

9. **Rodada de pesquisa pré-implementação, TS E GO (obrigatória — founder, 29-jul).** O censo que fundamenta esta spec varreu só o TS. Antes do `/plan` fechar tarefas, uma varredura enumera TODAS as instâncias do padrão nas duas codebases: (a) **TS** — re-verificar os candidatos a evento-comando (consumidor único que só executa ação), todos os callers de `ExternalMediator.publish` fora da convenção `Publish*IntegrationEvents`, handlers com side-effect imperativo que deveriam ser `CommandQueue`/use case; (b) **Go** (`packages/api/go`) — mesma lente, nunca aplicada lá: handlers que publicam integração fora de uma convenção equivalente, eventos do wire com intenção imperativa, side-effects que deveriam ser comandos. O inventário resultante entra no plano: cada item é corrigido nesta frente ou registrado como fora-de-escopo consciente com justificativa. A regra Go da exceção nomeada (equivalente ao `Publish*IntegrationEvents` — nome idiomático Go a definir na varredura) entra na skill `handler/go` junto com a de TS.

## User Stories

**US-1 — Operador, mensagem sobrevive a crash do processo**
- Given o operador envia uma mensagem direta pelo `SendDirectMessage` e o transcript foi gravado com sucesso na mesma transação que enfileirou o comando de entrega
- When o processo cai (ou o `POST` ao gateway falha) antes da entrega HTTP completar
- Then o comando de entrega permanece na fila (`shared_scheduled_commands`) e é reclaimado e reexecutado pelo worker do `CommandQueue` até `MAX_ATTEMPTS`, sem intervenção manual e sem exigir reenvio pelo operador.

**US-2 — Desenvolvedor, a regra de intenção impede um novo evento-comando**
- Given um desenvolvedor está modelando um novo fluxo onde um handler só existe para chamar um serviço externo em resposta a um único evento
- When ele roda `/review` (ou `bun review`) sobre o diff
- Then o checklist da skill `event`/`handler` aponta a violação de intenção (evento sendo usado para comandar) como WARN, orientando para `CommandQueue` ou use case direto em vez de um evento novo.

## Acceptance Criteria

- [ ] AC-1: `packages/contracts/wire/events/channel-delivery-requested.tsp` não existe mais no repo, e o tipo gerado `ChannelDeliveryRequestedEvent` não é importado por nenhum arquivo de produção em `packages/api/typescript/src`.
- [ ] AC-2: `SendDirectMessage` grava o transcript entry e enfileira o comando de entrega de mensagem na mesma transação (mesmo `tx` passado a `transcript.append` e a `enqueueCommand`); um teste de use case cobre que, se a transação for revertida, nenhuma linha aparece nem no transcript nem em `shared_scheduled_commands`.
- [ ] AC-3: `DeliverOrchestratorReply` grava o transcript entry e enfileira o comando de entrega dentro da mesma transação que abre para si mesmo; mesmo teste de atomicidade do AC-2 aplicado a este handler.
- [ ] AC-4: existe um use case/handler `DeliverChannelMessage` registrado como executor do `CommandQueue` (não mais como `EventHandler` de `ChannelDeliveryRequestedEvent`), e um teste de integração confirma que uma falha simulada do `ChannelSender` faz o comando ser reclaimado e reexecutado (respeitando `MAX_ATTEMPTS`/backoff do `CommandQueue`), sem perder o comando.
- [ ] AC-5: `DirectMessageSentEvent` (`thread.direct_message_sent`) continua sendo salvo pelo `DomainEventRepository` em `SendDirectMessage`, e nenhum handler registrado no `thread/registry.ts` o consome.
- [ ] AC-6: `SqlExternalMediator.publish()` persiste o integration event na lane `integration` do outbox (via `saveIntegrationEvent`) e NÃO despacha em memória — um teste prova que após `publish()` a linha existe no outbox e nenhum handler rodou sincronamente na mesma call stack.
- [ ] AC-7: `SqlExternalMediator.drainOnce` entrega tanto linhas produzidas pelo Go quanto as persistidas via `publish()` TS (mesma lane `integration`) — um teste de integração publica um integration event por um `Publish*IntegrationEvents` e confirma que o consumidor recebe via poll; o docblock da classe é atualizado (a lane deixa de ser descrita como exclusiva Go→TS).
- [ ] AC-8: `.claude/registry.yaml` e as skills `event`/`handler`/`usecase` (`typescript` e `go`) ganham a bad practice de "intenção de comando disfarçada de evento", com severidade WARN e sem `mechanical: true`.
- [ ] AC-9: os 5 `Publish*IntegrationEvents` permanecem como a exceção nomeada (um por contexto); a branch de delivery sai do de thread; nenhum outro arquivo de produção em `packages/api/typescript/src` referencia `ExternalMediator.publish` — registrado como bad practice no registry (handlers fora da convenção `Publish*IntegrationEvents` não publicam integração).
- [ ] AC-10: a rodada de pesquisa da decisão 9 está registrada no plano com o inventário completo (TS e Go), e um grep final citado nesta conversa prova zero instâncias do padrão fora do inventário nas duas linguagens; as skills `event/go` e `handler/go` carregam as mesmas entradas das variantes TS (regra sem par Go não conta como entregue).

## O que sobe pro template

- **`.claude/registry.yaml`** (cross-cutting): nova entrada de bad practice — evento com consumidor único cujo handler só executa uma ação em vez de reagir a um fato — severidade WARN, heurística (não mecânica).
- **`.claude/skills/event/typescript/registry.yaml`** e **`.claude/skills/event/go/registry.yaml`**: pattern novo documentando a distinção domain event (outbox, fato) vs integration event persistido (outbox, cross-context) vs comando (`CommandQueue`) — a regra de intenção do founder citada literalmente — mais a escada de payload: dado-no-fato → evento thin (consumidor relê) → enrichment no publisher (exceção justificada, service via DI).
- **`.claude/skills/handler/typescript/registry.yaml`** e **`.claude/skills/handler/go/registry.yaml`**: (a) bad practice "handler que só executa uma ação de único consumidor deveria ser `CommandQueue` ou use case direto, não handler de evento"; (b) pattern da exceção nomeada — `Publish<Ctx>IntegrationEvents`, um por contexto, único chamador de `ExternalMediator.publish()`; todo outro handler é domínio puro.
- **`.claude/skills/usecase/typescript/registry.yaml`**: pattern "comando durável cross-processo via `CommandQueue.enqueueCommand(..., tx)` na mesma transação do fato que o motiva" (canonical snippet baseado em `SendDirectMessage.ts`).
- **Tabela de decisão outbox/CommandQueue/Mailbox/use-case-direto** entra na skill mais alta de arquitetura de eventos consultada por `/review` e `/plan` para este tipo de escolha (mesmo texto da decisão 6).
- Nenhuma mudança em `.claude/skills/projection`, `projector`, `middleware` — fora do escopo desta frente.

## Risks & Migration

**Ordem de migração obrigatória** (a decisão 2 e a decisão 4/5 não são independentes — a segunda muda o transporte que a primeira deixa de usar):

1. Primeiro o `CommandQueue` do delivery (decisão 2): trocar `SendDirectMessage` e `DeliverOrchestratorReply` para enfileirar via `CommandQueue`, e `DeliverChannelMessage` para rodar como executor de comando. Só depois disso remover `ChannelDeliveryRequestedEvent` do `.tsp` — removê-lo antes quebra o build (contrato ainda referenciado).
2. Só então a correção do transporte: `SqlExternalMediator.publish()` passa a persistir na lane `integration` (e o poller a entregar as linhas TS junto das do Go). Os `Publish*IntegrationEvents` não mudam de chamada — mudam de garantia. Fazer isso antes do passo 1 não quebra nada, mas mistura dois refactors na mesma janela sem necessidade.
3. **Eventos em voo durante o deploy**: qualquer `ChannelDeliveryRequestedEvent` que já esteja "em trânsito" no `SqlExternalMediator` em memória (isto é, uma chamada a `publish()` que ainda não retornou) no momento do deploy é perdida de qualquer forma hoje — não há persistência nesse caminho, então não há nada a migrar/drenar antes do corte; o risco pré-existe esta frente e não piora com o corte. Não há linhas de outbox do lane antigo a esvaziar porque o lane antigo nunca gravou nada.
