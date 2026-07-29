# Pivot: sessão-orquestrador por thread, issues como subagents

**Status:** DESIGN v2 — pós-grill adversarial (3 críticos, 6 bloqueantes incorporados), pronto para ratificação
**Data:** 2026-07-28
**Decisor:** founder (D1–D8 ratificadas em conversa nesta data)
**Base:** branch `agent-abstraction` @ `c13f8080`

> v1 → v2: o grill derrubou a mailbox ingênua (sem wakeup, sem boot sweep, corrida
> check-then-act entre produtores), expôs que subagents rodariam INLINE no dispatcher do
> outbox (sequencial por owner — matando a concorrência e o ack), e que
> `RequestAgentReplyDelivery` fora do inventário faria cada conclusão gerar DUAS mensagens
> no grupo. A resposta estrutural às três coisas é uma só: o **MailboxDispatcher** (§7.4),
> um scheduler durável que é o único consumidor de turnos. Produtores só inserem.

---

## 1. O pivot em uma frase

**A conversa é o primário; a issue é um fork explícito.** Cada thread tem UM agente
orquestrador residente, com sessão persistente, que conversa com o operador. Criar uma
issue é ato declarado do operador — nunca inferido — e cada issue roda como subagent
concorrente. Quando o subagent conclui, o resultado entra como turno do orquestrador, que
**compõe a resposta com a voz da conversa** e a entrega citando a mensagem de origem.

```
Operador: @agente pode me tirar uma dúvida?
Agente:   sim, claro
Operador: @agente o código está da maneira tal?
Agente:   está dessa forma: xxxxxxxxx
Operador: @agente crie uma issue específica para isso e vamos resolver
Agente:   criei a issue dark-mode-toggle — te aviso quando tiver resultado
          … (subagent roda concorrente; a conversa continua livre) …
Agente:   [reply citando "crie uma issue específica…"] resolvido: …
```

## 2. Decisões ratificadas

| # | Decisão | Nota |
|---|---|---|
| D1 | Subagents spawnados pelo **runtime** (`RunIssueTurn` regatilhado), nunca Task nativo do CLI | Task bloqueia o turno; issues são objetos duráveis do produto |
| D2 | O **orquestrador compõe** a resposta a partir do resultado da tarefa | "o orquestrador faria a resposta baseado no resultado da tarefa" |
| D3 | Mensagem sem `@<tag>` é só contexto — transcrita, nunca respondida | o mention gate shipado é o mecanismo |
| D4 | Ack de criação de issue imediato, em conversa | é o próprio turno em que o tool foi chamado |
| D5 | Classificação por mensagem **morre no mesmo PR** que ativa o substituto | nunca dormência; duas fontes de decisão é o anti-padrão |
| D6 | Resposta conversacional **pode** citar a mensagem que responde | permissão, não mandato — ver §7.6: o retorno de issue SEMPRE cita; na conversa o orquestrador decide (o exemplo canônico mostra conversa sem quote e retorno com quote) |
| D7 | **Steer de subagent entra** | "o steer de subagent entra" — via mailbox da issue (§7.7); nota: `thread.steered` hoje tem ZERO consumidores — o steer atual é meia-aresta morta e ganha aqui seu primeiro consumidor real |
| D8 | Recorte de sessão por **compaction**: análise de threshold + prompt de compactação | §7.8; o `usage` do frame terminal já dá o tamanho do contexto de graça |

## 3. O modelo de concorrência (a analogia Go, formalizada)

```
orquestrador  = goroutine principal da thread — UMA por conversa, turnos SERIALIZADOS
subagents     = goroutines por issue — concorrentes ENTRE THREADS (v1: 1 ativo por thread, ver R6)
channels      = agent_mailbox, com DOIS tipos de alvo: thread (orquestrador) e issue (subagent)
select {}     = o MailboxDispatcher: único consumidor, lease por alvo, ordem por alvo
shared memory = transcript + issue rows + workspace
mutex         = lease por alvo no dispatcher (primário) + AgentStreamRegistry (defesa em prof.)
```

Invariantes com dentes:

- **Turno único por alvo.** O dispatcher toma lease por `(targetKind, targetId)`; nunca dois
  turnos do mesmo alvo em voo. Perdedor não existe: quem não tem lease não tenta.
- **Produtor nunca dispara turno.** Elimina a corrida check-then-act entre as duas lanes de
  outbox (achado do grill): produtores só INSEREM; só o dispatcher consome.
- **Resultado não fura fila.** Ordem por alvo = ordem de inserção (seq da tabela; a escrita
  serializa no TxGate da conexão única de escrita — vale registrar, é o que torna o seq
  atômico sem contador).
- **O orquestrador nunca executa trabalho de issue.** Conversa, cria, consulta, steera,
  compõe. Quem trabalha é o subagent.

## 4. O que sobrevive (verificado em runtime 28-jul 19:02)

Mention gate; own-message hearing (`fromMe`/`author`, atribuição ao `operator`); reply-quote
ledger nos dois sentidos; delivery leg com `quotedMessageId` plumbed até o
`waE2E.ContextInfo`; trava do laço (claim de SYSTEM); `AgentRunnerFactory`; porta MCP + run
tokens; in-process union; máquina de resume (`resumeDecision`) — reapontada.

Sobrevive também, e o grill mandou dizer em voz alta: `OpenIssuesReader` (alimenta
`issue/list`), `transcript.recentByThread` + `thread.bufferSize` (a janela de contexto do
orquestrador — provenance em §7.5), e a coluna `classification` do transcript (histórico).

## 5. O que morre

Morte é deleção no PR que ativa o substituto (D5). O inventário v2, corrigido pelo grill:

| Artefato | Fase | Nota |
|---|---|---|
| `ClassifyMessage` (C17) | F2 | chamador único: ramo invocável do `ConsumeInboundMessage` |
| `IssueRouter`/`Default`/`Mock` + `slug.ts` | F2 | `uniqueSlugKey` migra para o tool `issue/create` |
| `ClassifyIssueAgent` + prompt + `LlmDecisionSchema` | F2 | some do registry §4.8 |
| Fluxo CLARIFY: `ClarificationRepository`, `thread_clarifications`, `ClarificationRequestedEvent` | F2 | zero consumidores em console e BFF (verificado) |
| `MessageClassifiedEvent` — **os DOIS**: domain `thread.message_classified` E wire `integration.message.classified` | F2 | o v1 listava só o wire |
| `RunIssueTurnOnClassification` | F3 | morre sem rename: o spawn vem da mailbox, não de evento (§7.4) |
| **`RequestAgentReplyDelivery` + `integration.agent.reply_drafted`** | F4 | **o buraco que os 3 críticos acharam**: vivo, entregaria a voz crua do worker direto no canal, em corrida com a composição — duas mensagens por conclusão. O texto do draft vira o carrier do `issue_result` (§7.4) e o wire event morre |
| Bindings/barrels/registries dos mortos | F2/F4 | `thread/registry.ts`, `agent/registry.ts`, barrels de usecases/handlers, edges prosa do `context-map` |

Órfãos a declarar (não deletar): `TranscriptKind.ACTION` perde o único produtor
(`ClassifyMessage.ts:162` — as linhas `classified:` viram história); `ClassificationMethod`
fica no contrato enquanto a coluna existir; `StopKind.BLOCKED_BY_CLASSIFICATION` é wire
congelado e fica; `phase3-smoke.ts` (artefato FROZEN) menciona a cadeia morta — anotar, não
"consertar".

## 6. O que muta

### 6.1 `AgentSession` — dois kinds + telemetria de contexto

```
issueId            → nullable (null = sessão do ORQUESTRADOR)
UNIQUE(issue_id)   → parcial WHERE issue_id IS NOT NULL      [drizzle 0.45.2 suporta .where();
UNIQUE(thread_id)  → parcial WHERE issue_id IS NULL           precedente em infrastructure.ts]
lastContextTokens  → integer nullable (D8: inputTokens + cacheCreation + cacheRead do último
                     frame terminal — o tamanho do contexto chega de graça a cada turno)
cursor do orquestrador = id do último item de mailbox consumido (a tabela ganha id por item)
```

### 6.2 `Issue` — origem, goal e resultado

```
originEntryId  text NULLABLE  — NOT NULL quebraria DeclareIssueOpen (trabalho separável
                                mid-run) e a criação via console/SDK (achado do grill).
                                Obrigatório apenas na criação via orquestrador.
goal           text NULLABLE  — o prompt do subagent ("dado pelo operador via orquestrador");
                                não existia coluna (o v1 assumiu que sim)
```

`DeclareIssueComplete` hoje **descarta** o `summary` declarado no ramo COMPLETED — passa a
persisti-lo (o caminho declarado também precisa alimentar a composição).

Reconciliação das duas vias de nascimento (achado do grill): o tool `issue/create` persiste
a row; `RunIssueTurn` continua levantando `AgentRunStartedEvent` → `integration.issue.opened`
→ `MaterializeIssueFromExecution.OpenIssue`, que já é idempotente — ganha o cuidado de NÃO
clobberar `originEntryId`/`goal` da row pré-existente. `CreateIssueController` (SDK/console)
continua existindo com seu contrato atual.

### 6.3 `RunIssueTurn` — gatilho e saída mudam, corpo fica

- Entrada: item `WORK` da mailbox da issue (não mais evento de classificação). O prompt vem
  de `issue.goal`.
- Saída: `persistOutcome` passa a inserir, **na mesma transação** dos eventos de outcome, o
  item `ISSUE_RESULT` na mailbox da thread — com `outcome`, `replyText` (o texto que hoje só
  vivia no `reply_drafted`) e `originEntryId`. Transacional ⇒ exactly-once ⇒ os problemas de
  idempotência e de "summary sem fonte" do grill não existem por construção.

### 6.4 `ChannelDeliveryRequestedEvent` — dois campos novos (contrato, F1)

```
quotedMessageId  string?  — o id de plataforma a citar (waE2E.ContextInfo)
replyEntryId     string?  — a entrada SYSTEM desta resposta; DeliverChannelMessage passa a
                            fazer claim COM linkEntry, senão o reply de humano sobre a
                            resposta citada acha uma linha de ledger sem entryId e o
                            fluxo 3 do §8 nunca resolve (achado do grill)
```

`ConsumedMessageRepository` ganha `findPlatformId(entryId)` (o sentido inverso; índice em
`entry_id`).

## 7. O que nasce

### 7.1 `OrchestratorAgent` (`agent/agents/OrchestratorAgent/`)

Base `Agent` (§4.5), `AgentName.ORCHESTRATOR` (enum de src, não de contrato), sem
`outputSchema`, `mcpScope: 'orchestration'`. Input: threadId, cwd, o item de mailbox
discriminado, janela de contexto (§7.5).

### 7.2 Escopo MCP `orchestration`

MCP tools SÃO controllers HTTP neste repo (manifest → openapi → kubb) — o escopo custa
controllers novos + manifest + `bun emit-openapi` + `bun sdk` (inventariado em F3):

- `issue/create { goal }` → row (WORKING, `originEntryId`, `goal`, slug) + item `WORK` na
  mailbox da issue (mesma tx) + `integration.issue.created` (para console/SSE). Retorna
  `{ issueId, key }` no próprio turno — o ack é D4.
  **`originEntryId` NÃO é argumento**: o router injeta das claims do run token (o token do
  turno de orquestrador ganha claim `entryId` do item consumido) — identidade nunca na mão
  do modelo, mesmo desenho AC-6.6 que já valida `ownerId/issueId/threadId`.
- `issue/list {}` / `issue/status { issueId }` — leitura thread-scoped (claims), via
  `OpenIssuesReader` + issue repo.
- `issue/steer { issueId, text }` (D7) → item `STEER` na mailbox da issue.

### 7.3 `RunOrchestratorTurn` (`agent/usecases/`)

Resolve provider e sessão thread-keyed, checa D8 (§7.8), drena o CLI, persiste
`OrchestratorRepliedEvent { threadId, text, replyToEntryId? }` — **domain event do contexto
agent**, como manda EVT-01. v1: turnos de orquestrador NÃO streamam SSE (a conversa aparece
no WhatsApp e no transcript; os frame schemas do SSE são issue-keyed e ganhariam superfície
nova — fora do v1, achado do grill).

### 7.4 `agent_mailbox` + `MailboxDispatcher` — o coração da v2

Tabela (contexto **agent** — quem agenda turnos é o runtime de agentes):

```
agent_mailbox (
  id uuid PK, ownerId,
  targetKind  THREAD | ISSUE,   targetId,
  kind        OPERATOR_MESSAGE | ISSUE_RESULT | WORK | STEER,
  payload     json,
  dedupKey    UNIQUE            -- entryId | issueId:runSeq | steer id
  claimedBy, leaseUntil, attempts, consumedAt, lastError,
  createdAt                     -- ordem por alvo
)
```

Produtores (só INSERT, sempre transacional com o fato que os motiva):
- `ConsumeInboundMessage` → `OPERATOR_MESSAGE` **na mesma tx do ingest** (dedup `entryId`;
  fecha também a janela claim→enqueue que o grill apontou como swallow-hole)
- `issue/create` tool → `WORK` (tx da criação)
- `RunIssueTurn.persistOutcome` → `ISSUE_RESULT` (tx do outcome)
- `issue/steer` tool (e `SteerThread` repontado — primeiro consumidor real do steer) → `STEER`

Consumidor (ÚNICO): `MailboxDispatcher`, modelado no `SqliteCommandQueue` (o precedente
in-repo de fila durável — poller + lease + attempts + poison):
- loop de poll + **sweep no boot** (itens órfãos de crash acordam sozinhos);
- lease por ALVO (`UPDATE ... WHERE` atômico): um turno em voo por alvo, N alvos em
  paralelo (pool limitado; v1: 1 orquestrador por thread + 1 subagent por thread — R6);
- ao fim de um turno, **re-poll imediato do mesmo alvo** (o wakeup que faltava);
- falha de turno: attempts++, backoff, poison após N (vocabulário que a v1 não tinha);
- item `THREAD` → `RunOrchestratorTurn`; item `ISSUE` → `RunIssueTurn`.

Isto responde os dois bloqueantes de concorrência de uma vez: **turnos saem do dispatcher
do outbox** (que é sequencial por owner e hoje já serializa TODAS as runs — o pivot conserta
um bug atual de graça), e stranding/corrida/boot-loss deixam de ser possíveis por desenho.
Nota honesta: turnos são at-least-once (lease expira → re-run); o dedup fica na PONTA
(claim do id de saída na entrega), como já é no resto do sistema.

### 7.5 A resposta atravessa para o canal (o caminho que a v1 não fechava)

`OrchestratorRepliedEvent` (agent, domain) → `PublishAgentIntegrationEvents` mapeia →
`integration.orchestrator.replied { threadId, text, replyToEntryId? }` (contrato novo, F1)
→ handler external no **thread** (`DeliverOrchestratorReply`, o herdeiro estrutural do
`RequestAgentReplyDelivery` que morre): carrega a Thread (envelope: channelId + contactRef
— o que o grill mostrou que faltava), grava a entrada **SYSTEM** no transcript (primeiro
produtor do valor), resolve `quotedMessageId = findPlatformId(replyToEntryId)` quando há
citação, publica `ChannelDeliveryRequestedEvent { …, quotedMessageId, replyEntryId }`.
`DeliverChannelMessage` envia e faz claim **com linkEntry** (§6.4).

Janela de contexto (provenance, que a v1 não dava): o prompt builder do orquestrador herda
`recentByThread(threadId, bufferLimit(thread.bufferSize))` — o mecanismo que morreria órfão
com `ClassifyMessage`. Interação com resume: sessão RESUMIDA recebe só o item novo + as
mensagens não-mencionadas desde o cursor (D3: contexto sem resposta); sessão FRESCA (nova ou
pós-compaction) é semeada com a janela completa.

### 7.6 Política de citação (D6 + achado do grill)

O retorno de issue **sempre** cita `originEntryId`. Na conversa, citar é capacidade
permitida (D6) e decisão do orquestrador via prompt — orientação: cite quando responder
mensagem específica depois de outras terem entrado; não empilhe quote em ping-pong imediato
(o exemplo canônico mostra "sim, claro" sem quote). Mecânica: o modelo sinaliza citação
reutilizando o entryId do item consumido; `contactKind` (GROUP|USER) viaja no input do
orquestrador para a política 1:1 vs grupo.

### 7.7 Steer (D7)

`issue/steer { issueId, text }` → `STEER` na mailbox da issue → o dispatcher agenda um turno
do subagent com o texto como prompt (resume mantém o contexto do trabalho). Se o subagent
está em voo, o item espera o lease — sem corrida, sem retry-throw. `SteerThread` (console)
é repontado para enfileirar `STEER` nas issues ativas da thread — `thread.steered` ganha seu
primeiro consumidor de fato, e o WHISPER continua no transcript como registro.

### 7.8 Compaction (D8)

Antes de cada turno, o dispatcher compara `AgentSession.lastContextTokens` com o threshold
(config; default proposto 150k). Acima: roda primeiro um turno de **compactação** —
`CompactionPromptBuilder`, prompt dedicado que produz um resumo-handoff (decisões, estado
das issues, tom da conversa, pendências) — então minta sessão NOVA semeada com o resumo e
roda o turno real nela. Depois de cada turno, `lastContextTokens` é atualizado do frame
terminal. Genérico no `AgentSession` ⇒ vale para orquestrador e subagents.

## 8. Fluxos-alvo

**Conversa:** inbound → gates → mailbox `OPERATOR_MESSAGE` (tx do ingest) → dispatcher →
turno → `OrchestratorRepliedEvent` → §7.5 → WhatsApp (com ou sem quote, §7.6).

**Fork:** turno chama `issue/create` (tx: row + `WORK` + `issue.created`) → ack no mesmo
turno → dispatcher agenda o subagent EM PARALELO ao resto da conversa → `persistOutcome`
insere `ISSUE_RESULT` (tx) → dispatcher → turno de composição → resposta citando
`originEntryId`.

**Reply de humano sobre resposta citada:** inbound com `stanzaId` → `findEntry` → entryId
(agora existe, via linkEntry da saída) → issueId da entrada SYSTEM → item
`OPERATOR_MESSAGE { quotedIssueId }` → o orquestrador decide: responder, `issue/steer`, ou
follow-up.

## 9. Sequenciamento (cada fase shippa verde; prova de aceite é RUNTIME no grupo real)

- **F1 — chão.** Migrações (§6.1, §6.2, `agent_mailbox`), contratos
  (`integration.issue.created`, `integration.orchestrator.replied`, campos novos do
  `delivery_requested` §6.4) + regen (contracts → sdk → react tsc), `findPlatformId`.
  Nada ativa. Custo Go: regen barato (decode union ganha os cases; goldens cobrem só
  eventos emitidos pelo gateway — verificado pelo grill).
- **F2 — o orquestrador conversa.** `OrchestratorAgent` + `RunOrchestratorTurn` +
  `MailboxDispatcher` + §7.5 + reaponte do ramo invocável. **Morte F2 da tabela §5 no mesmo
  PR.** e2e 04/07 reescrevem aqui: o `E2eStubAgentRunner` passa a fingir um turno de
  orquestrador que chama `issue/create` via MCP real (hoje ele discrimina por
  `outputSchema`, que deixa de existir — achado do grill). Prova: conversa de ida e volta
  no grupo real, sem issue.
- **F3 — o fork.** Escopo `orchestration` (controllers + manifest + emit-openapi + sdk) com
  claims `entryId`. Prova: "crie uma issue" → ack imediato ENQUANTO o subagent roda (isso
  testa o desacoplamento do outbox), conversa segue livre.
- **F4 — a volta + steer.** `DeliverOrchestratorReply`; **morte de
  `RequestAgentReplyDelivery` + `integration.agent.reply_drafted` aqui**; `issue/steer` +
  `SteerThread` repontado. Prova: o exemplo canônico literal, incluindo reply de humano
  sobre a resposta citada e um steer no meio do trabalho.
- **F5 — compaction + luto.** §7.8 com prova de gate (forçar threshold baixo e ver a
  compactação rodar e a sessão renascer semeada); varredura de mortos, contrato encolhido,
  flow-map e docs atualizados.

## 10. Riscos

- **R1 — latência serializada por thread.** Mitigação futura já cabível na mailbox:
  coalescer `OPERATOR_MESSAGE` consecutivos num turno.
- **R2 → resolvido por D8** (compaction).
- **R3 — janela de corrida da trava do laço** (herdada, documentada): claim pós-send;
  pre-mint do id no gateway fica mais urgente com o volume de fala do orquestrador.
- **R4 — contrato:** morrem `integration.message.classified` e `integration.agent.reply_drafted`;
  nascem `issue.created` e `orchestrator.replied`; confirmar no PR de F2/F4 que só o SSE
  os encaminhava (console não os lê — pré-verificado para o primeiro).
- **R5 — custo por turno:** medir em F2 tokens por mensagem (conversa > classificação).
- **R6 — cwd compartilhado.** N subagents + orquestrador no MESMO diretório era
  inalcançável (tudo serializava no outbox — bug que o pivot conserta) e vira real.
  v1: **1 subagent ativo por thread** (lease do dispatcher) + orientação de prompt para o
  orquestrador não editar arquivos. Estrutural (F5+): worktree por issue — o mesmo
  isolamento que este repo usa para si.
- **R7 — turnos at-least-once.** Lease expirado re-roda o turno; o dedup é na ponta
  (claim/linkEntry da entrega). Igual ao resto do sistema; dito em voz alta.

## 11. Questões abertas

- **Q2':** coalescing de mensagens em rajada (R1) — v1 ou follow-up? Proposto: follow-up.
- **Q3':** threshold de compaction default (150k?) e se subagents compactam no v1 ou só o
  orquestrador. Proposto: genérico desde já (mora no dispatcher), threshold único.
