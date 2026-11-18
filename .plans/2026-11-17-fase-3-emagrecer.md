# Fase 3 — emagrecer o grupo — Implementation Plan

> **For agentic workers:** cada slice é um commit (ou poucos) independentemente testável, com RED→GREEN por comportamento. Slices `parallel-*` só saem para subagente com o handoff do slice colado inteiro.

**Goal:** a issue deixa de falar direto no grupo; uma política por grupo decide destino e formato por nível (§6.1); decisões e perguntas viram stops com código (`APP-12 · D1`), respondíveis por citação, código, "sim" solto ou pelo painel; pergunta segue sozinha com o padrão após 15 min; `relatorio` é consulta sem modelo; resultado de tarefa não acorda mais o orquestrador.

**Spec:** `.specs/2026-11-17-emagrecer-o-grupo-design.md` (revisado; ler inteiro antes de qualquer slice).
**Branch:** `feat/fase-3-emagrecer` (a partir de `feat/fase-2-falar`; PR empilhado).
**Slices:** 10 (S0–S9), cada um com ≤ 7 entregáveis.

**Ambiente para todo comando `bun`:** `env -u NODE_ENV -u CODM_MIGRATIONS_DIR -u CODM_PARENT_PID`. Testes de backend a partir de `packages/api/typescript`. Type-check autoritativo: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`.

**Gates de todo slice:** `bun tsc`, `bun lint`, testes do slice + `bun run test` no fim do slice, `bun run detect` (0 erros), varredura de privacidade do `git diff --cached` (sem nomes de cliente, telefones, grupos, textos de conversa). Contrato alterado ⇒ `bun contracts` + `bun sdk` commitados. Migração ⇒ `bun migrate:create` + `db:sync-go` + `db:check-go`.

**Perguntas ao dono que travam slices:** a matriz nível × modo e o modo padrão (S1 grava o DEFAULT da coluna; S2 grava `ROUTING_BY_MODE`) — implementar com a proposta do spec e trocar só a tabela/DEFAULT se o dono mudar; a régua de quem responde (S3) — idem, é uma tabela; trava dura e modo legado — fora deste plano até resposta.

---

## Wave Plan (task-breakdown)

**Feature Type:** 1 — comportamento novo em entidade existente (`Thread`/`Stop`), controllers e ferramentas MCP novas, telas no console e no painel.
**Contextos:** contracts, `thread`, `agent`, `issue`, `artifact` (só escopo MCP), `panel` (nuvem), app-react.
**Caminho crítico:** `S0 → S1 → S2 → S3 → S6 → S9` (S6 só depois de S2+S3+S5: o resultado não pode deixar de acordar o orquestrador antes de os pedidos chegarem ao grupo pela política).

| Slice | Fase | Depende de | Classificação |
|---|---|---|---|
| S0 Contrato | 0 | — | serial |
| S1 Persistência + idempotência | 0/2 | S0 | serial |
| S2 Política + stops no grupo | 2.W1 | S1 | serial (núcleo) |
| S3 Responder | 2.W2 | S2 | parallel-after-wave-1 |
| S4 Padrão de 15 min | 2.W2 | S2 | parallel-after-wave-1 |
| S5 Feedback, progresso, resumo | 2.W2 | S2 | parallel-after-wave-1 |
| S7 `relatorio` | 2.W1 | S1 | parallel-after-contract |
| S6 Resultado sem orquestrador | 2.W3 | S2, S3, S5 | parallel-after-wave-2 |
| S8 Superfícies (console, painel) | 1 | S0 (SDK), S3 | parallel-after-wave-2 |
| S9 Aceite + medição | 3 | todos | serial |

```mermaid
graph TD
  S0[S0 contrato] --> S1[S1 persistência]
  S1 --> S2[S2 política + stops]
  S1 --> S7[S7 relatorio]
  S2 --> S3[S3 responder]
  S2 --> S4[S4 padrão 15 min]
  S2 --> S5[S5 feedback/progresso/resumo]
  S3 --> S6[S6 resultado sem orquestrador]
  S5 --> S6
  S3 --> S8[S8 console + painel]
  S4 --> S9[S9 aceite]
  S6 --> S9
  S7 --> S9
  S8 --> S9
```

---

## S0 — Contrato (Phase 0, serial)

**Comportamento:** o contrato conhece níveis, modos, efeitos, causas, os kinds/resoluções novos e o sinal de issue; tudo compila com as tabelas totais preenchidas.

Entregáveis:
1. Enums TypeSpec novos em `packages/contracts/src/wire/enums/`: `issue-signal-level.tsp` (`IssueSignalLevel`), `group-output-mode.tsp` (`GroupOutputMode`), `output-routing.tsp` (`OutputRouting`), `ask-effect.tsp` (`AskEffect`), `block-cause.tsp` (`BlockCause`).
2. `stop-kind.tsp` += `DECISION_REQUESTED`, `QUESTION_ASKED`, `STALLED`; `stop-resolution.tsp` += `ANSWER`, `DEFAULT_APPLIED`; `panel-action-kind.tsp` += `ANSWER_ASK`; docs de `issue-timeline-item-kind.tsp` atualizados (sem kind novo).
3. Eventos: `events/thread-issue-signal.tsp` (`integration.thread.issue_signal`, `level` restrito a FEEDBACK/PROGRESS por doc + schema), `thread-stop-raised.tsp` += `ask?`; `index.tsp`.
4. `shared/schemas`: `StopAskSchema`, `AskDefaultSchema`, `AskAnswerSchema`, `StopAnswerSchema` (uniões discriminadas por `kind`); `StopAsk`/`AskAnswer` em `registerSchemas`; `IssueSignalSchema` fora.
5. Tabelas totais que o compilador exige: `RESOLUTIONS_BY_KIND`, `RESUMES_WITH_RESOLVER_POSTURE`, `OFFERED_ON_PANEL` (`thread/utils/StopResolutions.ts`), `NOTIFIES_ON_CHANNEL` (provisório: kinds novos `false`, substituído em S2), `STOP_TITLES_PT/EN` (`thread/i18n/messages.ts`), `POLICY_KEY` (`RaiseStop.ts`), `KIND_GATE`/`PanelActionBodySchema` placeholders compiláveis.
6. `bun contracts` + `bun sdk` (TS/Go/Rust) commitados; `cargo check` verde.

Testes: tabelas de `StopResolutions.test.ts` com os valores novos; snapshot de enums gerados.
Gate extra: `bun run --cwd packages/contracts db:check-go` ainda verde (sem migração aqui).

## S1 — Persistência e "a primeira resolução ganha" (serial)

**Comportamento:** stops guardam pergunta/resposta/prazo; conversa guarda o modo; resolver duas vezes o mesmo stop nunca sobrescreve.

Entregáveis:
1. Drizzle (`packages/contracts/src/db/sqlite/thread.ts`): `thread_threads.output_mode` (NOT NULL, DEFAULT `DECISIONS_AND_LIVE` — proposta; trocar se o dono decidir), `thread_transcript_entries.{level, routing, stop_id, digest_entry_id, addressee_id}` + índice `(thread_id, routing, digest_entry_id)`, `issue_stops` reconstruída com CHECKs novos + `{ask, answer, answered_by, seq, due_at, ask_entry_id}` + único `(issue_id, seq)` + índice `due_at`.
2. Migração `0036` (`bun migrate:create`), `db:sync-go`, `db:check-go`.
3. `thread/entities/Thread.ts`: `StopSchema` com `ask?`/`answer?`/`answeredBy?`; objeto de valor `thread/objects/StopAsk.ts` (deriva kind por `effects`, valida `default` presente em pergunta); `resolveStop` aceita `ANSWER`/`DEFAULT_APPLIED` com erros `ASK_OPTION_UNKNOWN`, `ASK_NOT_DUE`, `ASK_ANSWER_REQUIRED` (`thread/errors`); `outputMode` + `configureOutputMode`; `TranscriptEntry` com `level`/`routing`/`stopId`.
4. `LibSqlThreadRepository`: mapeamento dos campos; resolução `UPDATE … WHERE id = ? AND resolved_at IS NULL` com conferência de linhas → `STOP_ALREADY_RESOLVED`; `nextAskSeq(issueId, tx)`; `markAskDelivered(entryId, at, tx)` condicional (`WHERE due_at IS NULL`); `findDueAsks(now)`.
5. `thread/usecases/ResolveStop.ts`: lê o stop dentro da transação.
6. Testes: `LibSqlThreadRepository.test.ts` (corrida de resolução, `due_at` uma vez, `seq` único), `Thread.test.ts` (ask/answer/erros), teste da migração preservando linhas existentes.

## S2 — Política de saída e stops no grupo (núcleo, serial)

**Comportamento:** decisões, perguntas e avisos de bloqueio saem no grupo no formato do nível, com código, segundo o modo; um aviso por causa; a parada do reconciliador é `STALLED`.

Entregáveis:
1. `thread/utils/OutputPolicy.ts`: `ROUTING_BY_MODE`, `LEVEL_OF_STOP`, `CAUSE_OF_STOP` (totais) + `OutputPolicy.test.ts`.
2. `thread/usecases/DeliverIssueSignal.ts` (grava entrada com `level`/`routing`, entrega GROUP; DIGEST fica para S5 — aqui cai em GROUP) + formatos `THREAD_MESSAGES.signalFormat` pt/en (DECISION, QUESTION, BLOCK_NOTICE, CLOSING) com link `PanelPublisher.linkOf`.
3. `thread/usecases/RaiseStop.ts`: troca `NOTIFIES_ON_CHANNEL` pela política; para stop com `ask`: `seq`, entrada com `stop_id`, `askEntryId`; um aviso por causa (`CAUSE_OF_STOP` + stops abertos da mesma causa no grupo). `RunIssueTurn.ts` deixa de importar `NOTIFIES_ON_CHANNEL`; a tabela some.
4. `agent/usecases/ReconcileStalledIssues.ts`: parada depois do lembrete grava `StopKind.STALLED`; `IssueLifeState`/`MarkIssueNeedsInputFromStop` aceitam o kind.
5. `NotifyProviderPaused.ts` consulta `ROUTING_BY_MODE[mode][BLOCK_NOTICE]`.
6. `tests/architecture/channel-producers.test.ts` (lista declarada dos 7 produtores + fixture negativa).
7. Testes: `RaiseStop.test.ts` (decisão com código no grupo; pergunta com "sigo com X em 15 min"; segundo `SERVER_ERROR` da mesma causa só no painel; causa fechada reabre; stop da conversa sem issue inalterado), `ReconcileStalledIssues.test.ts` (STALLED → aviso no grupo).

Nota: S2 ainda não cria as ferramentas — testa com stops levantados direto (`given`) com `ask`.

## S3 — Responder (parallel-after-wave-1)

**Comportamento:** citação, código, "sim" solto (uma pendente) ou pelo console resolvem a pergunta certa; duas pendentes ⇒ uma pergunta de desambiguação; resposta atrasada vira steer; a sessão recebe a resposta.

Handoff:
- frozenInputs: `StopResolution.ANSWER`, `AskAnswerSchema` (`OPTION`/`TEXT`), `StopKind.DECISION_REQUESTED|QUESTION_ASKED`, `Thread.resolveStop`, `ThreadRepository` (`stop_id` nas entradas, `STOP_ALREADY_RESOLVED`), `RuleRouter`, `Thread.mayAct`, `Thread.postureOf`, `CONTROL_WORDS`.
- deliverables:
  1. `thread/utils/askAnswer.ts` (`parseAskAnswer`, `BARE_ANSWERS`; teste de disjunção com `CONTROL_WORDS`);
  2. `RuleRouter` + `IngestChannelMessage`: regras 1–4 do spec ANTES de `control()`; régua de quem responde como tabela (`ANSWER_GATE: Record<'WITH_EFFECT'|'NO_EFFECT', …>`); sem janela de frescor;
  3. fato `thread.answer_disambiguation_asked` + mensagem de desambiguação (pt/en);
  4. `thread/handlers/ResumeIssueOnStopResolved.ts`: texto com pergunta/código/resposta; sempre enfileira para `ANSWER`/`DEFAULT_APPLIED` (`dedupKey resume:<stopId>`);
  5. controller `POST /stops/:stopId/answer` (`AnswerStop`, input `AskAnswerSchema`, CloudSessionMiddleware) → `ResolveStop`;
  6. testes `IngestChannelMessage.answer.test.ts`, `ResumeIssueOnStopResolved.test.ts`.
- scopeFences: DONE S0–S2 (não redefinir schemas/tabelas); LEFT esta resolução; OUT painel (S8), padrão (S4).
- gates: `bun test src/thread`, tsc autoritativo, `bun sdk` (controller novo), `bun run detect`.
- discretion: palavras exatas de `BARE_ANSWERS`; texto da desambiguação.

## S4 — Padrão de 15 minutos (parallel-after-wave-1)

**Comportamento:** a pergunta entregue ao grupo segue sozinha com o padrão 15 min depois; não vence sem entrega, segurada ou na carência após boot/conexão.

Handoff:
- frozenInputs: `ThreadRepository.markAskDelivered/findDueAsks`, `StopResolution.DEFAULT_APPLIED`, `StopAnswerSchema.DEFAULT`, `IssueHold`, `ChannelConnectivity`, `DeliverChannelMessage.recordOutbound`.
- deliverables:
  1. `DeliverChannelMessage.recordOutbound`: marca `due_at` pelo `replyEntryId` (entrada própria ou resumo) na transação existente;
  2. `ChannelConnectivity.connectedSince(channelId)` (porta + implementações por ambiente, alimentada por `channel.connected`);
  3. `thread/usecases/ApplyDueQuestionDefaults.ts` (`repeat.every = 30 s`, `now` de entrada, `QUESTION_DEFAULT_MS`, `DEFAULT_GRACE_AFTER_CONNECT`) registrado em `thread/jobs.ts`;
  4. linha do tempo: "seguiu com o padrão" (+ "o codm estava desligado" quando atrasado > 5 min);
  5. testes `ApplyDueQuestionDefaults.test.ts` (casos do spec).
- scopeFences: DONE resolução idempotente (S1), retomada com resposta (S3 — se S3 não entrou ainda, testar só a resolução); OUT lembretes 2h/6h.
- gates: `bun test src/thread`, tsc, detect.
- discretion: onde guardar o instante do boot.

## S5 — Feedback, progresso e resumo por pessoa (parallel-after-wave-1)

**Comportamento:** a issue tem ferramentas próprias para pedir decisão/pergunta/feedback e relatar progresso; perde `SendDirectMessage`/`SendArtifact`; perguntas e feedbacks para a mesma pessoa em 60 s saem numa mensagem.

Handoff:
- frozenInputs: `integration.thread.issue_signal`, `StopAskSchema`, `AskEffect`, `IssueSignalLevel`, `OutputRouting.DIGEST`, `DeliverIssueSignal`, `thread/services/ArtifactDelivery`, `McpScope.ISSUE_HANDLING`.
- deliverables:
  1. controllers + use cases `agent/{controllers,usecases}/{AskDecision,AskQuestion,RequestFeedback,ReportProgress}.ts` (`static mcpScopes = [ISSUE_HANDLING]`); `DeclareStop`/`AskOperator` levam `ask`; `RequestFeedback` confere o artefato como `SendArtifact.ts:48`;
  2. fato `agent.issue_spoke` + ponte em `agent/handlers/PublishAgentIntegrationEvents.ts`;
  3. `thread/handlers/RouteIssueSignal.ts` → `DeliverIssueSignal` (FEEDBACK com artefato principal via `ArtifactDelivery`, lido por `reads.artifact`);
  4. resumo: `routing = DIGEST`, comando `flush_signal_digest` (`jobId digest:<thread>:<pessoa>:<janela>`, `delay 60 s`), `thread/usecases/FlushSignalDigest.ts`;
  5. escopo MCP: `SendDirectMessage`/`SendArtifact` sem `ISSUE_HANDLING`; snapshot `exposure.test.ts.snap` atualizado;
  6. prompt `IssueWorkAgent` (quando usar cada ferramenta, `effects`, texto do turno vai ao painel, sem segredos) + `prompt.test.ts`;
  7. testes: contrato de cada ferramenta, pergunta com efeito vira decisão, feedback não trava, resumo (2 → 1 mensagem; 1 → formato normal; decisão nunca agrupa).
- scopeFences: DONE política (S2); LEFT ferramentas/resumo; OUT fim de turno e fechamento (S6).
- gates: `bun test src/agent src/thread`, tsc, `bun sdk`, detect.
- discretion: limites de tamanho de `question`/`text`; texto do prompt.

## S6 — Resultado de tarefa sem orquestrador (parallel-after-wave-2; SÓ depois de S2, S3, S5)

**Comportamento:** fim de turno vira PROGRESS no painel; conclusão vira fechamento no grupo; nenhum `ISSUE_RESULT` novo; turno mudo termina em aviso visível.

Handoff:
- frozenInputs: `integration.issue.completed` (`summary`), `agent.issue_spoke`, `DeliverIssueSignal`, `IssueSignalLevel.CLOSING|PROGRESS`, `StopKind.STALLED`.
- deliverables:
  1. `RunIssueTurn.persistOutcome`: sem `enqueueResult`; salva `agent.issue_spoke` PROGRESS com o texto do turno;
  2. `thread/handlers/CloseIssueOnChannel.ts` (`integration.issue.completed` → CLOSING, cita a mensagem de origem; inferida ⇒ "concluída");
  3. `TransitionIssueStatus`/`DeclareIssueComplete`: `finalArtifactId?` (summary inalterado);
  4. `LibSqlMailboxDispatcher.runThreadTurn`: repassa `issueId` ao `RunOrchestratorTurn` (itens drenados);
  5. testes `RunIssueTurn.test.ts` (sem ISSUE_RESULT; texto vira PROGRESS; turno mudo → lembrete → STALLED → aviso no grupo), `CloseIssueOnChannel.test.ts`, `LibSqlMailboxDispatcher` (issueId repassado).
- scopeFences: OUT mudar o orquestrador em conversa geral; `MailboxItemKind.ISSUE_RESULT` continua no contrato.
- gates: `bun test src/agent src/thread`, fluxos de `tests/flows` (os 29 testes de fluxo do `RunIssueTurn` precisam passar ou ser ajustados com motivo), tsc, detect.
- discretion: corte do resumo no fechamento.

## S7 — `relatorio` como consulta (parallel-after-contract, depois de S1)

**Comportamento:** `relatorio` (mensagem inteira) responde com o boletim do grupo e o link, sem turno de modelo.

Handoff:
- frozenInputs: `IssueRepository`, `lifeStateOf` (via serviço novo), stops abertos do `Thread` (`ask`/`seq`), `PanelPublisher.linkOf`, `Thread.canCommand`.
- deliverables:
  1. `thread/enums/ThreadCommand.ts` + `thread/utils/threadCommand.ts` (`THREAD_COMMANDS` com `match: WHOLE_MESSAGE`);
  2. `issue/services/IssueBoardReader.ts` (+ `why` da aresta em `thread/context.ts`);
  3. `thread/services/BoardBulletin.ts` (seções Esperando decisão / Paradas / Fazendo / Concluídas 24 h, máx. 8 por seção, link) + textos pt/en;
  4. despacho em `IngestChannelMessage` (depois das respostas, antes do controle), fato `thread.bulletin_sent`;
  5. testes `IngestChannelMessage.report.test.ts` (sem item THREAD; seções; link só logado; frase longa não é comando).
- scopeFences: OUT boletim periódico; OUT "relatório APP-12".
- gates: `bun test src/thread src/issue`, tsc, detect, `tests/architecture` (context map).
- discretion: ordem dentro das seções.

## S8 — Superfícies: console e painel (parallel-after-wave-2)

**Comportamento:** o operador escolhe o modo do grupo no console; vê e responde perguntas no detalhe da issue; o painel na nuvem mostra perguntas com botões por opção e responde com `ANSWER_ASK`.

Handoff:
- frozenInputs: `GroupOutputMode`, `AskAnswerSchema`, `StopAskSchema`, `PanelActionKind.ANSWER_ASK`, hooks gerados `useConfigureOutputMode`, `useAnswerStop`, `getThreadSettingsQueryKey`.
- deliverables:
  1. `ConfigureOutputMode` (use case em `ConfigureThreadSettings.ts`, controller `PUT /threads/:threadId/output-mode`, leitura em `GetThreadSettings`) + `bun sdk`;
  2. console: seletor no `ThreadSettingsDialog` (`bun cli` para o bloco), textos pt/en;
  3. console: perguntas abertas no detalhe da issue (código, opções, prazo) respondendo por `useAnswerStop`; entradas só-painel esmaecidas no chat;
  4. timeline: `assembleIssueTimeline` com `level`/`routing`/`code`/`answer` + `IssueTimelineItemSchema`;
  5. painel (nuvem): variante `ANSWER_ASK` em `PanelActionBodySchema`/`KIND_GATE` (régua de quem responde), `open_stops` com código/pergunta/opções, página com botões por opção; daemon `ExecutePanelAction` → `ResolveStop` + eco `PanelActionEcho.ANSWERED`;
  6. testes: `PanelAction.test.ts` (nuvem), `ExecutePanelAction.test.ts`, stories (`*.stories.tsx`) e e2e Playwright (modo + resposta pelo console).
- scopeFences: OUT quadro novo; OUT reabrir decisões da fase 2 (identificação).
- gates: `bun tsc`, `bun lint`, `cd packages/app/react && bun tsr generate` se rota mudar, testes da nuvem, e2e relevante, detect. Deploy: nuvem antes do daemon (anotar no PR).
- discretion: layout do seletor e do cartão de pergunta (seguir `design-system`).

## S9 — Aceite e medição (serial)

Entregáveis:
1. `packages/api/typescript/tests/flows/fase3-typical-task.test.ts` (modo `integration`, runner roteirizado): pedido → issue → `RequestFeedback` → `AskDecision` (efeito PUBLISH) → resposta citada → conclusão; o grupo recebe só recibo, feedback, decisão, fechamento; nenhum PROGRESS no grupo; pergunta de nível 2 segue com o padrão (job com `now` +15 min); `relatorio` sem item THREAD.
2. Dev manual com `bun dev` (`CODM_DATA_DIR` próprio): um grupo de teste, uma tarefa típica; contar mensagens no grupo.
3. "Como medi" no PR: comandos do spec (antes) + os mesmos sobre o banco de dev (depois); repetir sobre cópia do banco real quando o dono instalar.
4. Atualizar `~/Desktop/Projetos/codm-goal-progresso.md` (fora do repo).
5. Gates completos (`bun tsc`, `bun lint`, `bun run test`, e2e, detect, privacidade) e PR em rascunho empilhado sobre a fase 2.

---

## Riscos de execução

- S6 muda o fluxo que ~29 testes de fluxo cobrem (`RunIssueTurn`): ajustar com motivo, nunca apagar a assertiva.
- S1 reconstrói `issue_stops`: rodar a migração sobre uma cópia do banco real (só leitura, em diretório temporário) antes do PR para medir tempo e conferir linhas.
- S8 tem deploy da nuvem primeiro; sem ele, o daemon novo tem o snapshot recusado.
