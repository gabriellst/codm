# Permission Posture por Participante — Design Spec

**Date:** 2026-10-08
**Status:** Approved (o usuário autorizou seguir sem novas perguntas, 2026-10-08)
**Bounded Context:** cross-context: contracts, thread, agent, app-react (console)
**Kind:** feature
**Story Points:** 13 — novo enum de contrato + novo membro de `StopKind` (migração SQLite com rebuild de tabela por CHECK, espelhada no Go embed) + backfill do roster JSON das threads existentes + postura atravessando dispatcher → run token → 3 controllers MCP → runner (2 CLIs) + toggle no console; toca ≥3 contextos.

## Context

Toda execução de agente nasce no `ClaudeAgentRunner`, que monta o argv em `ClaudeAgentRunner.buildArgs` (`packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.ts:249-281`) e termina, incondicionalmente, em `args.push('--permission-mode', 'auto')` (`:279`). O `CodexAgentRunner` (`.../CodexAgentRunner/CodexAgentRunner.ts:178-209`) não passa flag de permissão nenhum. Não existe configuração de autonomia por thread, workspace ou pessoa.

Quem pode falar com o agente é decidido por participante: o VO `Participant` (`packages/api/typescript/src/thread/entities/Thread.ts:35-40`) carrega `canInvoke`, persistido no JSON `thread_threads.participants` (`packages/contracts/src/db/sqlite/thread.ts:27-31`), semeado por `AttachThread` (`thread/usecases/AttachThread.ts:113-138`: operador `true`, membros `false`) e alternado no console pelo `ThreadSettingsDialog` (`packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx`) via `SetParticipantInvocation` (`thread/controllers/SetParticipantInvocation.ts`, `thread/usecases/ConfigureThreadSettings.ts`).

O trabalho flui pela fila `agent_mailbox`: `IngestChannelMessage` enfileira `OPERATOR_MESSAGE` (`thread/usecases/IngestChannelMessage.ts:136-183`), o orquestrador abre issues com `ForkIssue` (`agent/usecases/ForkIssue.ts:110-130`, item `WORK`), direciona com `SteerIssueTurn` (`agent/usecases/SteerIssueTurn.ts:62-75`, item `STEER`) e resolve paradas com `ResolveStop` (`thread/controllers/ResolveStop.ts`), cuja retomada é enfileirada por `ResumeIssueOnStopResolved` (`thread/handlers/ResumeIssueOnStopResolved.ts:50-105`) como um `STEER` de texto. O `LibSqlMailboxDispatcher` (`agent/services/MailboxDispatcher/LibSqlMailboxDispatcher.ts`) drena por alvo. Cada turno recebe um run token MCP cuja identidade já carrega claims lidos pelos controllers via `ctx.agentIdentity` — `entryId` é o precedente (`agent/types/Agent.ts:179-185`: "the reason `ForkIssue` does not take it as an argument").

Paradas: `StopKind` (`packages/contracts/src/wire/enums/stop-kind.tsp`) é particionado em TRANSPORT (inferido pelo runner: `AUTH_REQUIRED`, `SERVER_ERROR` — `agent/enums/TransportStopKind.ts`) e DOMAIN (declarado por tool: `APPROVAL_NEEDED`, `HUMAN_REQUESTED`, `BLOCKED_BY_CLASSIFICATION`). As resoluções aplicáveis vivem em `thread/utils/StopResolutions.ts`. O desfecho do turno é dobrado por `TerminalOutputAccumulator.outcome()` (`agent/services/TerminalOutputAccumulator/TerminalOutputAccumulator.ts:71-87`) a partir do frame `result` do stream-json; `permission_denials` desse frame não é lido hoje (só citado em comentário, `ClaudeAgentRunner.ts:242`).

## Problem

1. **Autorização verbal não tem efeito.** No modo `auto` o classificador do Claude Code barra por categoria (gravar em recurso compartilhado/produção, credencial no comando, alterar as próprias permissões) independentemente de regras `allow` e do que o operador disse no chat. Na thread "BK DASH BOT" em 2026-10-08 houve 17 paradas `APPROVAL_NEEDED`, 5 resolvidas com APPROVE, e as gravações autorizadas continuaram barradas.
2. **APPROVE é só texto.** `ResumeIssueOnStopResolved.resumeText` enfileira "The operator resolved the stop… they answered APPROVE" e o turno seguinte sobe com a mesma postura `auto` — a mesma ação é barrada de novo.
3. **Não há como dar autonomia a pessoas específicas.** `canInvoke` decide quem aciona; não existe o conceito de quem pode autorizar ação sem filtro. Na thread "BK DASH BOT" os 6 participantes têm `canInvoke: true`.
4. **Negação de permissão é invisível ao sistema.** O runner não lê `permission_denials`; o agente improvisa instruções inaplicáveis a uma execução headless (shift+tab, `/permissions`, `export` no Terminal).

## Goal

O operador escolhe, por pessoa e por thread, quem pode liberar ações sem filtro. Uma ordem ou um "pode seguir" de quem tem essa permissão faz o turno seguinte rodar em bypass, sem passos manuais no computador; pedidos de quem não tem continuam no modo `auto`, e quando o filtro barra algo o sistema para e pede aprovação no chat, de onde quem pode liberar destrava respondendo.

## Decisions

1. **Postura é contrato.** Novo enum TypeSpec `PermissionPosture { AUTO, BYPASS }` em `packages/contracts`, gerado para ts/go/rust. Nenhuma camada decide postura por `if` sobre convenção; cada runner declara um mapa tipado `Record<PermissionPosture, string[]>` de argv.
2. **`canElevate` por participante**, irmão de `canInvoke`, no VO `Participant` e no JSON `participants`. Default: `operator` = `true`, demais = `false` — em `AttachThread`, em `admitParticipant` (membro novo entra `false`) e numa migração que faz backfill do JSON das threads existentes com a mesma regra. `canElevate` é independente de `canInvoke` (não há invariante "último elevador").
3. **Configurável no console**: `Thread.setParticipantElevation(participantId, canElevate)`, use case + controller no molde de `SetParticipantInvocation` (admitindo membro vivo ainda fora do roster, como aquele faz), SDK regenerada, e um segundo toggle por participante no `ThreadSettingsDialog`.
4. **A postura nasce de quem disparou, nunca do LLM.** Todo item de mailbox carrega `posture`:
   - `OPERATOR_MESSAGE` digitada no canal → `BYPASS` se o remetente tem `canElevate`, senão `AUTO`;
   - sussurro do console (operador autenticado) → `BYPASS` se o `operator` tem `canElevate`, senão `AUTO`;
   - disparo de loop agendado e `ISSUE_RESULT` → `AUTO`;
   - `STEER` enfileirado pelo `SteerThread` (fora de turno): sussurro do console → `canElevate` do `operator`; disparo de loop (`firedByLoop`) → `AUTO`;
   - `WORK` / `STEER` enfileirados de dentro de um turno → a postura do turno (Decisão 6).
   O remetente-sentinela do operador (`OPERATOR_PARTICIPANT_ID`) resolve para o participante `operator`, nunca para o JID do dono no roster. Item legado sem `posture` (enfileirado antes do deploy) é lido como `AUTO`.
5. **Postura por item.** O dispatcher reivindica UM item por turno (`claimNext` + `.limit(1)`), então a postura do turno é a do item reivindicado — não existe dreno de N itens a combinar. Risco aceito e registrado: a janela de conversa do orquestrador contém linhas de outros participantes, que um turno `BYPASS` lê como contexto (a ordem que dispara o turno continua sendo do remetente elevado).
6. **Postura viaja no run token** como claim de identidade (ao lado de `entryId`), em `AgentRunIdentitySchema` **e** em `AgentRunIdentityCtxSchema` (que remove chaves desconhecidas). `ForkIssue`, `SteerIssueTurn` e `ResolveStop` (quando chamados via MCP) leem a postura de `ctx.agentIdentity` e a gravam no item que enfileiram. Nenhum argumento de tool influencia a postura.
7. **APPROVE eleva.** O item de retomada enfileirado por `ResumeIssueOnStopResolved` carrega a postura de quem resolveu: `ResolveStop` sem `ctx.agentIdentity` (console, dono autenticado) → `BYPASS` se o `operator` tem `canElevate`; com `ctx.agentIdentity` (MCP) → postura do token; resolução `DENY` → sempre `AUTO`. O evento `ThreadStopResolvedEvent` passa a carregar a postura resolvida. Quando já há item pendente para a issue (o `hasPending` atual pula a retomada), vale a postura do item pendente — tipicamente o steer do mesmo turno elevado que resolveu.
8. **Runner recebe postura obrigatória.** `AgentRunRequest.posture: PermissionPosture` é campo obrigatório. Claude: `AUTO` → `--permission-mode auto`, `BYPASS` → `--permission-mode bypassPermissions`. Codex: `AUTO` → nenhum flag (comportamento atual), `BYPASS` → o flag de bypass total do binário (`--dangerously-bypass-approvals-and-sandbox`, confirmado contra `codex exec --help` antes de codar). A postura é por spawn — cada turno é um processo novo com `--resume`.
9. **Negação vira parada de transporte.** Novo membro `PERMISSION_DENIED` em `StopKind`, na metade TRANSPORT (`TRANSPORT_STOP_KINDS`), resoluções `[APPROVE, DENY, TAKE_OVER]`. Quando o frame `result` do Claude traz `permission_denials` não vazio **ou** `safety_stops > 0` (sinal medido na Decisão 10), o runner fecha o turno com `stop = PERMISSION_DENIED` e `detail` = texto final do agente + lista do negado quando `permission_denials` a trouxer (nome da tool + resumo do input, sem segredos). Paradas de transporte hoje são re-tentadas (`RunIssueTurn.persistOutcome` retorna cedo; o dispatcher requeue até `MAX_ATTEMPTS` e só então levanta `SERVER_ERROR`): `PERMISSION_DENIED` NÃO pode re-tentar — repetir em `AUTO` só repete a negação. Isso vira dado declarado por membro de transporte (mapa tipado `Record<TransportStopKind, …>` dizendo re-tentar vs. registrar já), nunca um `if` pelo nome; `PERMISSION_DENIED` é registrado imediatamente como parada da issue (issue → `NEEDS_INPUT`), igual em turnos de issue e do orquestrador. Ganha chave própria na política de paradas (`StopPolicy.permissionDenied`, default `true`, coluna nova em `issue_stop_policy_config`, exposta no settings e no `POLICY_KEY` do `RaiseStop`). O CHECK de `issue_stops.kind` muda → migração SQLite com rebuild de tabela, espelhada no `//go:embed` do gateway (`db:sync-go` / `db:check-go`). `PERMISSION_DENIED` notifica o canal como as outras paradas de transporte (`StopChannelNotice`).
10. **Verificação medida (feita em 2026-10-09, claude 2.1.295).** Probe headless real em `--permission-mode auto`: (a) sem confirmação o modelo recusa sozinho, sem tool call → `safety_stops: 0`, `permission_denials: []`; (b) com confirmação explícita o modelo tenta a tool, o classificador barra → `safety_stops: 2`, `permission_denials: []`, `num_turns: 2`. Conclusão: o bloqueio do classificador do auto mode NÃO aparece em `permission_denials`; aparece em `safety_stops`. Os dois frames terminais viram fixtures de teste.
11. **Prompts pedem aprovação na conversa.** Os prompts do `IssueWorkAgent` (`agent/agents/IssueWorkAgent/prompt.ts`) e do orquestrador (`agent/agents/OrchestratorAgent/prompt.ts`) não sugerem hoje shift+tab/`/permissions`/`export` — essas instruções foram improvisadas pelo modelo. Os prompts ganham a instrução explícita: ação barrada pelo filtro → parar e pedir aprovação nesta conversa, nunca orientar passos manuais no computador (atalhos, editar settings, variáveis de ambiente); quem pode liberar responde aqui.
12. **Fora de escopo:** isentar o operador do mention gate; não persistir texto de sussurro no transcript (spec própria); credencial de escrita em produção (ambiental).

## User Stories

- **Story 1 (AC-1, AC-2, AC-3):** Como operador, quero marcar no console quais pessoas de uma thread podem liberar ações sem filtro, para dar autonomia só a quem confio.
  - Given uma thread de grupo recém-anexada, when abro as configurações, then o operador aparece com "pode liberar" ligado e os membros desligado.
  - Given um membro com "pode liberar" desligado, when ligo o toggle, then a mudança persiste e aparece ao reabrir.
- **Story 2 (AC-4, AC-5, AC-6, AC-8):** Como operador, quero que uma ordem minha no chat rode sem filtro, para não precisar de passos manuais no computador.
  - Given eu tenho `canElevate`, when mando "@bk troca a moeda da Loja 01", then o turno do orquestrador e a issue aberta por ele sobem com `bypassPermissions`.
  - Given um membro sem `canElevate`, when ele manda "@bk libera a conta X", then o turno dele e a issue que ele originar sobem com `auto`.
- **Story 3 (AC-7):** Como operador, quero que meu APPROVE destrave de verdade a ação parada.
  - Given uma issue parada em `APPROVAL_NEEDED` ou `PERMISSION_DENIED`, when respondo "pode seguir" no chat (ou clico APPROVE no console), then o turno de retomada sobe em `bypassPermissions`.
  - Given a mesma parada, when um membro sem `canElevate` responde "pode", then a retomada sobe em `auto`.
- **Story 4 (AC-9, AC-10):** Como operador, quero saber quando o filtro barrou algo, para decidir na hora.
  - Given uma issue em `auto`, when o CLI nega uma ação, then a issue para com `PERMISSION_DENIED` listando o que foi negado e eu sou avisado no canal.

## Acceptance Criteria

- [ ] AC-1: `PermissionPosture { AUTO, BYPASS }` existe no TypeSpec e nos bindings gerados (ts/go/rust); `StopKind` ganha `PERMISSION_DENIED`; `bun contracts` e `bun sdk` limpos.
- [ ] AC-2: `Participant` tem `canElevate`; `AttachThread` semeia `operator=true` / membros `false`; `admitParticipant` admite com `false`; migração faz backfill das threads existentes (operator `true`, demais `false`) e é idempotente.
- [ ] AC-3: `PUT`/`PATCH` de elevação por participante (molde de `SetParticipantInvocation`) persiste `canElevate`, rejeita participante inexistente com `PARTICIPANT_NOT_FOUND`, e o `ThreadSettingsDialog` mostra e alterna o toggle (story + teste de comportamento).
- [ ] AC-4: `IngestChannelMessage` grava `posture` no item `OPERATOR_MESSAGE` segundo o `canElevate` do remetente; sussurro do console segundo o `canElevate` do `operator`; loop e `ISSUE_RESULT` gravam `AUTO`.
- [ ] AC-5: o dispatcher passa ao agente (orquestrador e issue) a postura do item reivindicado; item sem `posture` (legado) roda `AUTO`; `SteerThread` grava `canElevate` do `operator` para sussurro e `AUTO` para loop.
- [ ] AC-6: o run token carrega o claim `posture`; `ForkIssue` e `SteerIssueTurn` gravam no item `WORK`/`STEER` a postura lida de `ctx.agentIdentity`, e um argumento de tool não altera o resultado.
- [ ] AC-7: `ResolveStop` com `APPROVE` enfileira retomada `BYPASS` quando vem do console (operator com `canElevate`) ou de um turno MCP `BYPASS`, e `AUTO` quando vem de turno `AUTO`; `DENY` sempre `AUTO`; `ThreadStopResolvedEvent` carrega a postura.
- [ ] AC-8: `AgentRunRequest.posture` é obrigatório; `ClaudeAgentRunner.buildArgs` emite `--permission-mode auto` para `AUTO` e `--permission-mode bypassPermissions` para `BYPASS`; `CodexAgentRunner.buildArgs` emite nenhum flag para `AUTO` e o flag de bypass verificado para `BYPASS` (testes de argv nos dois).
- [ ] AC-9: os dois frames terminais do probe (Decisão 10) são fixtures de teste; o `ClaudeAgentRunner` fecha o turno com `stop = PERMISSION_DENIED` para o frame com `safety_stops > 0` e para um frame com `permission_denials` não vazio (detail com texto do agente + tools negadas), e não para stop no frame `safety_stops: 0` / `permission_denials: []`; `TerminalOutputAccumulator.outcome()` devolve `STOPPED(PERMISSION_DENIED)`.
- [ ] AC-10: `PERMISSION_DENIED` é parada de transporte (`TRANSPORT_STOP_KINDS`), aceita `APPROVE`/`DENY`/`TAKE_OVER`, notifica o canal, NÃO é re-tentada (turno de issue negado vira parada da issue na primeira ocorrência, sem requeue), respeita `StopPolicy.permissionDenied`, e as migrações (CHECK de `issue_stops.kind` + coluna da política) aplicam no TS e no Go (`db:check-go` verde).
- [ ] AC-11: os prompts do `IssueWorkAgent` e do orquestrador contêm a instrução "ação barrada → parar e pedir aprovação nesta conversa, sem passos manuais no computador" e não contêm shift+tab, `/permissions` nem orientação de `export`; um teste de prompt garante as duas coisas.
- [ ] AC-12: `bun tsc`, `bun lint`, `bun run test` verdes.

## Risks & Migration

- **Mudança de comportamento imediata:** após o deploy, toda mensagem do operador em qualquer thread roda em `bypassPermissions` (operator `canElevate=true` por default, conforme acordado). O operador pode desligar por thread no console.
- **Membros com `canInvoke` + bypass:** um participante com `canElevate` dirige um turno com superfície total de ferramentas. Default `false` para membros mitiga; ligar é decisão explícita do operador.
- **Rebuild de `issue_stops`:** migração de CHECK em SQLite recria a tabela; precisa preservar linhas e índices (`stops_issue_id_idx`, `stops_thread_id_idx`) e ser byte-idêntica no embed do Go.
- **Formato de `permission_denials` não verificado** — mitigado pela Decisão 10.

## Revisões de coerência (passo 0, 2026-10-09)

Divergências spec×código encontradas pelo verificador e resolvidas pelo caminho mais fiel às Decisions (registradas também no PR):
- **Dreno de N itens não existe** → Decisão 5 e AC-5 viram postura por item (o mínimo é trivial com 1 item).
- **Paradas de transporte re-tentam até virar `SERVER_ERROR`** → Decisão 9 declara re-tentar vs. registrar por membro de transporte; `PERMISSION_DENIED` registra já.
- **`STEER` fora de turno (`SteerThread`) e retomada com `hasPending`** → regras explícitas nas Decisões 4 e 7.
- **`AgentRunIdentityCtxSchema` remove chaves desconhecidas** → o claim `posture` entra nele também (Decisão 6).
- **Política de paradas** → `PERMISSION_DENIED` ganha `StopPolicy.permissionDenied` (Decisão 9).
- **Premissa da Decisão 11 era falsa** (os prompts não mandavam shift+tab) → vira instrução explícita de pedir aprovação na conversa.
- **Probe da Decisão 10** → o classificador sinaliza em `safety_stops`, não em `permission_denials`; a Decisão 9 lê os dois.
- **Arquivos além do Context**: `RaiseStop.ts` (`POLICY_KEY`), `thread/i18n/messages.ts`, `AgentRunIdentity.ts`, `GetThreadSettings.ts` (read model do toggle), `SteerThread.ts`, repositórios/controller/settings da `StopPolicy`, `ThreadStopResolvedEvent.ts`, locales do react.

## Unforeseen Angles

- O texto de sussurros é gravado em `thread_transcript_entries` (uma senha enviada por sussurro está em texto puro no banco). Fora desta spec; merece spec própria.
