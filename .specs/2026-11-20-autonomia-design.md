# Fase 5 — autonomia

Status: Draft (fase 5 do plano "tarefas visíveis, controláveis e que não se perdem")
Data: 2026-11-20
Depende de: `2026-11-12-fase-0-tarefas-visiveis-design.md` (lembrete de declaração, `ReconcileStalledIssues`), `2026-11-12-pausa-por-pista-e-adiamento-liberavel-design.md` (adiamento, sonda, soltura no boot), `2026-11-16-falar-e-parar-na-hora-design.md` (pausa, "agora", janela de arrependimento, triagem no modelo pequeno), `2026-11-17-emagrecer-o-grupo-design.md` (política de saída, `STALLED`, um aviso por causa, `DEFAULT_APPLIED` escrito só por job), `2026-11-19-vazao-design.md` (`claim_class`, orçamento em observação, `RESERVED_ROLES`, troca de sessão com notas).

## Problema

### Medido antes (instalação real, 14 dias até 12/11 — anterior à fase 0, não remedido)

Números do diagnóstico que abriu o plano; só agregados. Foram medidos **antes** do lembrete de declaração (fase 0) e do `STALLED` (fase 3), então servem de termo de comparação, não de retrato de hoje.

| Métrica | Valor |
|---|---|
| Paradas "a execução terminou sem conclusão" | 150 em 14 dias (~75/semana) |
| …resolvidas respondendo | 62, média ~3 h até a resposta |
| …resolvidas só com alguém assumindo | 81, média ~7 h |
| `SERVER_ERROR` (item envenenado depois de 3 tentativas) | 114 em 14 dias; 82 só resolvidos por alguém assumindo, média ~17 h depois |
| "continue/retome/cadê" escritos por pessoas | ~28/semana |
| Horas paradas por limite do provedor (fase 4, cópia de 18/11) | ≥ 37 h/semana (73,5 h em 13,9 dias, limite inferior) |

### Medido agora — **PENDENTE (sem espaço em disco)**

O volume de dados está com 3,4 GiB livres (`df -h`, 20/11); a regra desta fase é só copiar o banco com ≥ 5 GiB livres. Nenhuma cópia foi feita. As consultas exatas estão em "Como medi (antes)"; rodar assim que houver espaço, **antes do S2**, e registrar aqui. A versão instalada é a 0.9.0 (fases 0–2): paradas silenciosas aparecem como `HUMAN_REQUESTED` com o texto fixo do reconciliador (o `STALLED` é da fase 3), e as consultas cobrem as duas formas.

### Lido no código (20/11, `feat/fase-4-vazao` 08b7bbe0)

1. **Um empurrão só.** `ReconcileStalledIssues` manda **um** lembrete (steer `REMINDER`, postura AUTO) ao turno que se calou; se o lembrete também se cala, levanta `STALLED` (aviso de bloqueio no grupo, `LEVEL_OF_STOP`). O objetivo pede até **dois**. A contagem hoje é inferida — "o último item consumido tem `declarationReminder: true` no payload" (`LibSqlStalledIssueReader`) —, não declarada.
2. **Pedido de feedback é incomodado.** `RequestFeedback` "não segura a issue" (não é stop). Um turno que termina depois dele deixa a issue `WORKING` sem nada em voo: o reconciliador manda o lembrete, e um segundo turno calado vira `STALLED` — embora o próprio texto do lembrete liste "pedir feedback" como declaração válida. Viola "quem declarou espera não é incomodado". As outras esperas declaradas já estão fora: todo stop (decisão, pergunta, aprovação, permissão) leva a issue a `NEEDS_INPUT` (`MarkIssueNeedsInputFromStop`), pausa e item em voo (adiado, rodando, na fila, comando de publicação, janela de arrependimento — todos com lease) tiram a issue do predicado.
3. **"Nova tentativa" é imediata.** Uma falha de transporte que pede retry (`TRANSPORT_STOP_RETRIES`: `SERVER_ERROR`, `AUTH_REQUIRED`), uma exceção ou o teto de 1 h chamam `MailboxRepository.fail`, que solta o lease **agora** — o item volta no próximo poll (250 ms). Três tentativas em segundos e o item morre (`MAX_ATTEMPTS = 3`) com `SERVER_ERROR`. Um provedor sobrecarregado por um minuto gasta as três.
4. **Envenenamento sempre vira `SERVER_ERROR`.** `raiseStopForPoisoned` usa `SERVER_ERROR` até quando a causa foi `AUTH_REQUIRED` — o grupo lê "erro do provedor" quando o que falta é login (`BlockCause.CLI_LOGIN` existe e nunca é usado por essa via).
5. **"Adiado" é uma forma de linha, não um fato declarado.** "Lease no futuro e sem dono" é escrito pela pausa do provedor (`waitForProvider`) **e** pela pausa da issue (`holdItem`); quem lê distingue os dois por junção com `paused` (`providerWaitByIssue`, `lifeStateOf`). Uma terceira causa (espera de nova tentativa) nessa mesma forma apareceria como "esperando cota" e seria solta pela sonda, pelo boot e pelo `creditAcceptedTurn`. Non-Negotiable 5: a causa tem de ser coluna.
6. **Não há supervisor.** Uma issue que já virou `STALLED` ou `SERVER_ERROR` espera alguém (médias de 7 h e 17 h acima). Nada olha de novo para ela.

## Decisões do dono que se aplicam (não reabrir)

- Objetivo, fase 5: **empurrão automático só para "parada sem motivo", até 2 vezes, depois bloqueio visível; quem declarou espera não é incomodado**; **nova tentativa com espera crescente para erro do provedor antes de pedir alguém**; **supervisor com modelo pequeno a cada 15–30 min, só sobre tarefas suspeitas, decidindo empurrar, reiniciar com as notas de passagem ou escalar**; **levar ao dono os números de segunda conta/API, sem decidir**.
- Grupo enxuto, um aviso por causa, `STALLED` não agrupa (fase 3). Resposta a quem falou continua no grupo.
- Orçamento observa antes de agir: uma semana em observação, ligar é configuração desligada por padrão (fase 4, 19/11). Esta fase segue a mesma postura para o que é novo e arriscado (supervisor).
- Reserva do orquestrador `max(5%, medido)` (fase 4); o gasto do supervisor entra nela.
- Postura de permissão: o que ninguém pediu roda em AUTO e nunca eleva (participant-permission-posture; `RESUMES_WITH_RESOLVER_POSTURE`).

**Critério de aceite (objetivo):** tarefa parada sem motivo recebe empurrão e, sem reação, vira bloqueio visível; tarefa esperando pessoa não é empurrada.

## Desenho

### Quem é dono

- **`agent`** é dono dos três itens: já é dono da fila (`agent_mailbox`, `fail`, `defer`), do reconciliador, da sessão (`AgentSession`, troca com notas), da triagem no modelo pequeno, dos fatos de uso e do `RESERVED_ROLES`. O supervisor é um job do `agent` que **só produz pelas portas que já existem** (enfileirar o empurrão, resolver um stop, pedir troca de sessão) — nenhum fato novo de parada, nenhum segundo produtor de `STALLED` (o docblock do reconciliador exige um produtor só).
- **`thread`** continua dono do stop, da resolução e do aviso no grupo. Ganha uma resolução escrita só por job (`AUTO_RETRY`), como o `DEFAULT_APPLIED` da fase 3.
- **`issue`** continua dono do estado de vida e da linha do tempo (leituras); ganha a projeção "pediu feedback em" por um handler do evento de integração que já existe.
- **`ui`/`panel`** só mostram (estado novo, itens novos da linha do tempo).
- Arestas: `agent → thread` (usecases: `ApplySupervisorRetry`, ao lado do `NotifyBudgetHeld` que já consome), `agent → issue` (`reads`: tabela de issues, já declarada), `issue → agent` (lê `agent_mailbox`, já declarada). As notas das arestas crescem; nenhuma aresta nova (`tests/architecture/context-map.test.ts`).

### Contrato primeiro

TypeSpec (`packages/contracts/src/wire/enums/`), importados no `main.tsp`:
- **Novo** `MailboxDeferCause` — `PROVIDER_LIMIT`, `HOLD`, `RETRY`. Por que um item está adiado. Enum de fio pelo mesmo motivo do `MailboxClaimClass`: tipa uma coluna da tabela compartilhada que o gateway Go também abre.
- **Novo** `NudgeSource` — `RECONCILER`, `SUPERVISOR`. Quem empurrou (linha do tempo).
- **Novo** `SuspicionReason` — `STALLED_OPEN` (um `STALLED` aberto há ≥ `SUSPECT_STOP_AGE_MS`), `PROVIDER_ERROR_OPEN` (um `SERVER_ERROR` de item envenenado aberto há ≥ `SUSPECT_STOP_AGE_MS`), `NUDGE_LOOP` (≥ `NUDGE_LOOP_EPISODES` episódios de empurrão em 24 h), `SILENT_TURN` (turno com lease vivo há ≥ `SILENT_TURN_MIN_MS` e nenhuma linha de terminal há ≥ `SILENT_TURN_QUIET_MS`).
- **Novo** `SupervisorVerdict` — `NUDGE`, `RESTART_WITH_NOTES`, `ESCALATE`, `LEAVE`.
- Crescem: `IssueLifeState += WAITING_RETRY`; `StopResolution += AUTO_RETRY` (escrita só pelo supervisor; aplicável a `STALLED` e `SERVER_ERROR`); `UsageRole += SUPERVISOR`; `IssueTimelineItemKind += NUDGED, RETRY_SCHEDULED, SUPERVISOR_REVIEWED`.
- **Tabelas totais tocadas** (o compilador acusa os `Record`, não a união da linha do tempo — por isso a lista): `issue/utils/issueLifeState.ts` (`WAITING_RETRY` logo depois de `WAITING_PROVIDER`), `issue/services/BoardBulletin.ts`, `thread/utils/StopResolutions.ts` (`RESOLUTIONS_BY_KIND` para `STALLED`/`SERVER_ERROR`, `RESUMES_WITH_RESOLVER_POSTURE[AUTO_RETRY] = false`, `GIVEN_BY_NAME_ALONE[AUTO_RETRY] = false`), `thread/entities/Thread.ts` (`ANSWER_RECORDED_BY[AUTO_RETRY]`), `thread/handlers/ResumeIssueOnStopResolved.ts` (`RESUMES_EVEN_WITH_PENDING[AUTO_RETRY] = false`, `RESUME_TEXT[AUTO_RETRY]`), `thread/i18n/messages.ts`, `agent/services/QuotaBudget` (`RESERVED_ROLES[SUPERVISOR] = true`), a união `shared/schemas/IssueTimelineItemSchema.ts` e o leitor `issue/utils/issueTimeline.ts`, react `IssueCard.tsx`, `IssuesOverviewSection` e os renderizadores da linha do tempo (console e painel), o `SyncPanel` e o CHECK `panel_issues_life_state_check` na nuvem.

Enums só do `agent` (`agent/enums`, não cruzam o fio): `MailboxFailureClass` — `PROVIDER_ERROR`, `CLI_LOGIN`, `CRASH`, `ABANDONED`; `SupervisorMode` — `OFF`, `OBSERVE`, `ACT`; `ResumeInvalidationReason += HANDOFF_REQUESTED`.

Fatos de domínio do `agent` (`z.domainEvent`, só TS):
- `AgentIssueNudgedEvent` (`agent.issue.nudged`) — `{ issueId, threadId, ordinal, source: NudgeSource, quietItemId }`.
- `AgentRetryScheduledEvent` (`agent.mailbox.retry_scheduled`) — `{ itemId, targetKind, targetId, failureClass, attempt, maxAttempts, retryAt }`. Sem o texto do erro (pode ter caminho ou trecho de saída); o texto continua só em `last_error`.
- `AgentSupervisorReviewedEvent` (`agent.supervisor.reviewed`) — `{ issueId, reason: SuspicionReason, verdict: SupervisorVerdict, confidence?, mode: SupervisorMode, acted: boolean, fallback?: string }`.

Formas em `shared/schemas/` (linha do tempo, como `PublishRunSchema`): a união `IssueTimelineItemSchema` ganha `NUDGED { ordinal, source }`, `RETRY_SCHEDULED { attempt, maxAttempts, retryAt }`, `SUPERVISOR_REVIEWED { reason, verdict }` (só o que agiu; ver item 3). DTOs de leitura: `GetIssuesOverview`/`GetIssueDetail` ganham `retryingAt?` ao lado de `waitingForProviderUntil`. Sem `.refine()`, nada de entidade registrado.

Objetos do `agent` (`agent/objects`): `NudgePayloadSchema` — o payload do item `REMINDER` ganha `nudge: { ordinal, rootItemId? }` declarado (o mesmo padrão do `ResumeIssuePayloadSchema` da fase 4: o que o item é fica na coluna `claim_class`; o detalhe dele, num schema do payload — nunca no `dedupKey`).

### Item 1 — empurrão automático, até 2 vezes

**O que já existe e fica:** o reconciliador (60 s), o predicado de "nada em voo" (`LibSqlStalledIssueReader`), o steer `REMINDER` em AUTO, o turno de lembrete que não vai ao grupo (`RunIssueTurn`), o `STALLED` como aviso de bloqueio.

**O que muda:**
- **Contagem declarada.** `NUDGES_BEFORE_STALL = 2` (constante nomeada em `ReconcileStalledIssues`). O primeiro empurrão leva `nudge: { ordinal: 1, rootItemId: <turno que se calou> }`; o segundo, `ordinal: 2` com o mesmo `rootItemId`. O leitor deixa de inferir pelo payload solto: identifica o empurrão pela coluna `claim_class = REMINDER` e lê `ordinal`/`rootItemId` pelo `NudgePayloadSchema`. Regra: último item consumido não é `REMINDER` ⇒ empurrão 1 sobre ele; é `REMINDER` com `ordinal < NUDGES_BEFORE_STALL` ⇒ próximo empurrão, mesmo `rootItemId`; senão ⇒ `STALLED` com `DETAIL_AFTER_NUDGES` ("nem depois de dois empurrões"). `dedupKey` = `nudge:<issueId>:<rootItemId>:<ordinal>` (idempotência continua vindo do predicado + dedup).
- **Texto por ordinal** (tabela `NUDGE_TEXT: Record<1 | 2, string>`): o 1 é o lembrete de hoje (declare, não refaça trabalho). O 2 é o empurrão do brainstorm: "se parou no meio de um passo, termine esse passo; depois declare — concluí, a decisão que falta ou o que falta e de quem". O 2 pode trabalhar, sempre em AUTO: o filtro de permissão e a janela de arrependimento continuam valendo; o texto diz que o empurrão **não autoriza** publicar, fazer merge nem nada irreversível.
- **Espera declarada por feedback.** Um turno que pediu feedback (`IssueSpokeEvent` com `level: FEEDBACK`) declarou espera. Tabela `SIGNAL_DECLARES_WAIT: Record<SpokenLevel, boolean>` (`FEEDBACK: true`, `PROGRESS: false`). O `issue` grava `issue_issues.feedback_requested_at` ao consumir `integration.thread.issue_signal` de nível `FEEDBACK` (handler externo novo, `RecordFeedbackRequest`). O leitor do reconciliador exclui a issue quando `feedback_requested_at ≥ first_claimed_at` do último item consumido (o pedido veio do último turno ou depois dele). Um recado novo, uma resposta ou um turno novo encerram a espera naturalmente (o último item consumido passa a ser outro). `lifeStateOf` recebe `declaredWait` e devolve `WAITING_PERSON` antes de `STALLED`.
- **Fato e linha do tempo.** Cada empurrão grava `agent.issue.nudged` na transação do enqueue; o leitor da linha do tempo mostra `NUDGED` ("empurrão 1 de 2"). Painel e console mostram `REMINDED` como hoje enquanto o empurrão está na fila ou rodando.
- **Quem não é empurrado (lista fechada, cada linha com teste negativo):** stop aberto de qualquer kind (`NEEDS_INPUT`); pedido de feedback do último turno; pausada (issue ou conversa); item em voo de qualquer causa — rodando, na fila, adiado por limite, por pausa ou por nova tentativa, segurado pelo orçamento; comando de publicação e janela de arrependimento (rodam dentro do lease); arquivada; concluída.

### Item 2 — nova tentativa com espera crescente

**Causa do adiamento como coluna.** `agent_mailbox.defer_cause` (`MailboxDeferCause`, nullable: nulo ⇔ não adiado). `MailboxRepository.defer(ids, until, cause)` passa a exigir a causa; `holdItem` escreve `HOLD`, `waitForProvider` escreve `PROVIDER_LIMIT`, a nova tentativa escreve `RETRY`; o claim zera a coluna. Leitores e escritores da forma "lease no futuro, sem dono", e o que cada um faz com `RETRY` (tabela declarada `DEFER_RELEASE: Record<MailboxDeferCause, { onBoot, onProviderCredit, onProbe, onNewItem }>`):

| Quem | Hoje | `PROVIDER_LIMIT` | `HOLD` | `RETRY` |
|---|---|---|---|---|
| `releaseDeferredOnce` (boot) | solta tudo | solta | solta (o hold re-segura no claim) | **não** — o relógio da tentativa é persistido |
| `creditAcceptedTurn` / sonda (`releaseDeferred`) | solta tudo | solta | solta | **não** — o provedor ter voltado não prova que este item passa |
| item novo do mesmo alvo (`EnqueueMailboxItem`) | nada | nada | nada | **solta** — um recado de pessoa não espera atrás da tentativa (a classe de bug da fase 0); o recado viaja junto se a classe permitir (fase 4, 6b) |
| `providerWaitByIssue` ("esperando cota até") | infere por junção com `paused` | conta | não conta | não conta |
| `lifeStateOf` | adiado ⇒ `WAITING_PROVIDER` | `WAITING_PROVIDER` | (`PAUSED` vence antes) | `WAITING_RETRY` |
| `LibSqlStalledIssueReader` (em voo?) | sim | sim | sim | sim — issue esperando nova tentativa não é empurrada |
| exclusão por alvo no `claimNext` | conta | conta | conta | conta (ordem por alvo preservada) |

A junção com `paused` em `providerWaitByIssue` e no `lifeStateOf` sai: a causa diz. Os valores de `HOLD`/`PROVIDER_LIMIT` reproduzem o comportamento de hoje; só `RETRY` é novo.

**Classe da falha, declarada.** `recordFailure(bundle, cause)` vira `recordFailure(bundle, failure: { class: MailboxFailureClass, detail })`. Quem classifica é quem sabe: a falha de transporte pela tabela `FAILURE_CLASS_OF_TRANSPORT_STOP: Record<RetriedTransportStopKind, MailboxFailureClass>` (`SERVER_ERROR → PROVIDER_ERROR`, `AUTH_REQUIRED → CLI_LOGIN`), a exceção ⇒ `CRASH`, o teto ⇒ `ABANDONED`. Nunca pelo texto da causa.

**Calendário por classe e por pista** — `RETRY_SCHEDULE: Record<MailboxTargetKind, Record<MailboxFailureClass, readonly number[]>>` (esperas entre tentativas; tentativas = esperas + 1):

| | `PROVIDER_ERROR` | `CRASH` | `ABANDONED` | `CLI_LOGIN` |
|---|---|---|---|---|
| ISSUE | 1, 4, 15, 60 min (5 tentativas, ~1h20) | 1, 4, 15 min | 15 min (2 tentativas) | 0, 0 (como hoje) |
| THREAD | 10 s, 60 s (3 tentativas) | 10 s, 60 s | 0 (2 tentativas) | 0, 0 (como hoje) |

Por quê: na pista ISSUE ninguém espera em tempo real e uma sobrecarga do provedor passa em minutos; na THREAD há uma pessoa esperando resposta, então a espera é curta e o teto de tentativas não cresce. Login não volta sozinho com o tempo (esperar só atrasaria o aviso); o abandonado pode ainda estar vivo, e esperar reduz a chance de dois turnos ao mesmo tempo. Os números são ponto de partida — a medição pendente (tempo entre falhas de provedor e o próximo turno aceito) os confirma ou corrige antes do S2. `MAX_ATTEMPTS` deixa de ser constante global: sai do calendário.

**`fail` com espera.** `MailboxRepository.fail(head, followers, failure, schedule)`: `attempts` já foi cobrado no claim; se `attempts < schedule.length + 1` ⇒ `lease_until = now + schedule[attempts - 1]`, `defer_cause = RETRY`, sem dono; senão ⇒ `dead_at`. Os recados que viajavam junto voltam sem custo (como hoje). Grava `agent.mailbox.retry_scheduled` (sem texto do erro).

**Regras que ficam:** turno que já falou (`spoke`) não é repetido (bug de mensagem duplicada); recusa por limite com `retryAfter` continua indo para `waitForProvider` sem gastar tentativa; `PERMISSION_DENIED` continua registrado na primeira vez.

**Depois da última tentativa — pedir alguém, com a causa certa.** `raiseStopForPoisoned` passa a escolher o kind pela tabela `STOP_OF_FAILURE: Record<MailboxFailureClass, StopKind>` (`PROVIDER_ERROR`/`CRASH`/`ABANDONED → SERVER_ERROR`, `CLI_LOGIN → AUTH_REQUIRED`) — o aviso do grupo passa a dizer "login" quando é login (`CAUSE_OF_STOP[AUTH_REQUIRED] = CLI_LOGIN` já existe). O `detail` diz quantas tentativas e em quanto tempo.

**Visível.** `WAITING_RETRY` no quadro/painel com `retryingAt` ("nova tentativa às hh:mm, 3 de 5"); `RETRY_SCHEDULED` na linha do tempo da issue. Nada no grupo durante as tentativas (só o aviso de bloqueio no fim, como hoje).

### Item 3 — supervisor com modelo pequeno

**Suspeita por regra, sem modelo** — `agent/services/SuspectIssueReader` (porta + `LibSql…` + `Mock…`), só dados persistidos, disjunto do que o reconciliador vê (o reconciliador olha `WORKING` sem nada em voo; o supervisor olha o que **já** passou por ele ou o que ele não enxerga):
- `STALLED_OPEN` / `PROVIDER_ERROR_OPEN`: stop aberto do kind há ≥ `SUSPECT_STOP_AGE_MS` (30 min — dá tempo de uma pessoa ver o aviso primeiro).
- `NUDGE_LOOP`: ≥ `NUDGE_LOOP_EPISODES` (3) fatos `agent.issue.nudged` com `ordinal = 1` em 24 h — a tarefa trabalha, se cala, é empurrada, de novo e de novo.
- `SILENT_TURN`: item da issue com lease vivo há ≥ `SILENT_TURN_MIN_MS` (30 min) e última `issue_terminal_lines.at` há ≥ `SILENT_TURN_QUIET_MS` (20 min). O turno vivo é do dispatcher; o supervisor **não** o mata (PERGUNTAR AO DONO).
- **Nunca suspeitas:** issue pausada, conversa pausada, stop de pessoa aberto (decisão, pergunta, aprovação, permissão), feedback pedido, adiada por qualquer causa, concluída, arquivada. Com o provedor pausado (`QuotaStatusReader` passa a expor `providerPausedUntil`) ou o orçamento segurando de fato, a passada inteira é pulada.
- Esfriamento: a mesma `(issue, reason)` não é revista antes de `SUPERVISOR_COOLDOWN_MS` (60 min), lido do último `agent.supervisor.reviewed`.

**Cadência** — job `agent/usecases/SuperviseSuspectIssues` (`repeat.every = SUPERVISOR_INTERVAL_MS`, 20 min, dentro dos 15–30 do objetivo), no máximo `SUPERVISOR_MAX_PER_PASS` (5) issues por passada, mais antigas primeiro.

**Decisão no modelo pequeno** — `agent/services/IssueSupervisor` (porta; `ModelIssueSupervisor` sobre um `SupervisorAgent`, no mesmo molde do `ModelInboundTriage`): modelo pequeno do provedor da conversa (`smallModelFor`), **sem ferramentas** (`--tools ""`, falha fechada), prazo `SUPERVISOR_TIMEOUT_MS`, sem estado. Entrada só com nomes e textos (nunca telefone, JID ou endereço): chave e título, objetivo curto, motivo da suspeita, estado de vida, últimos `SUPERVISOR_TIMELINE_ITEMS` (12) itens da linha do tempo com texto cortado, contagens (empurrões, tentativas, idade do stop), notas de passagem se houver. Saída validada por Zod: `{ verdict, confidence, note (≤ 280) }`. Inválida, prazo estourado ou abaixo do piso de confiança da tabela `SUPERVISOR_MIN_CONFIDENCE: Record<SupervisorVerdict, number>` ⇒ `LEAVE` com `fallback` registrado. O veredito só vale se estiver em `VERDICTS_BY_REASON: Record<SuspicionReason, readonly SupervisorVerdict[]>`:

| Motivo | Vereditos admitidos |
|---|---|
| `STALLED_OPEN` | `NUDGE`, `RESTART_WITH_NOTES`, `ESCALATE`, `LEAVE` |
| `PROVIDER_ERROR_OPEN` | `NUDGE` (= tentar de novo), `RESTART_WITH_NOTES`, `ESCALATE`, `LEAVE` |
| `NUDGE_LOOP` | `RESTART_WITH_NOTES`, `ESCALATE`, `LEAVE` |
| `SILENT_TURN` | `ESCALATE`, `LEAVE` (matar o turno vivo é pergunta ao dono) |

**Gasto.** Grava `agent.turn.usage` com `role: SUPERVISOR` (o `TriageUsageRecorder` vira `SmallModelUsageRecorder` com o papel como campo, um gravador só); `RESERVED_ROLES[SUPERVISOR] = true` — o supervisor sai da mesma reserva do orquestrador e da triagem, nunca da cota das tarefas.

**Executar o veredito — só por portas que existem** (`agent/usecases/ActOnSupervisorVerdict`):
- `NUDGE` com stop aberto (`STALLED`/`SERVER_ERROR`) ⇒ `thread/usecases/ApplySupervisorRetry` (porta própria, irmã do `ApplyDueQuestionDefaults`) resolve com `AUTO_RETRY`. A resolução nunca entra pela porta nua: `GIVEN_BY_NAME_ALONE[AUTO_RETRY] = false` (o `ResolveStop` HTTP/MCP recusa `RESOLUTION_NOT_APPLICABLE`), `bareResolutionsForKind` não a oferece no cartão nem o `ExecutePanelAction` a aceita, e `ANSWER_RECORDED_BY[AUTO_RETRY]` não grava resposta. A resolução fecha o aviso de bloqueio pela política da fase 3 e a retomada sai por `ResumeIssueOnStopResolved` com `RESUME_TEXT[AUTO_RETRY]` (o empurrão do item 1 mais a nota do supervisor), **sempre em AUTO** (`RESUMES_WITH_RESOLVER_POSTURE[AUTO_RETRY] = false`).
- `RESTART_WITH_NOTES` ⇒ `AgentSession.requestHandoff(at)` (coluna `agent_agent_sessions.handoff_requested_at`) e o mesmo caminho do `NUDGE`. O próximo turno: `resumeDecision` devolve `HANDOFF_REQUESTED` e o `RunIssueTurn` segue o caminho da troca da fase 4 (sessão nova semeada com as notas da sessão, se houver, e as derivadas), fato `agent.session.handed_off`. Nenhum código novo de semeadura.
- `ESCALATE` ⇒ item `SUPERVISOR_REVIEWED` na linha do tempo e selo "supervisor pediu alguém" no cartão (console e painel). **Nenhuma mensagem nova a ninguém** até o dono decidir a quem escalar (PERGUNTAR AO DONO); o aviso de bloqueio que já foi ao grupo continua sendo o pedido.
- `LEAVE` ⇒ só o fato.
- Teto por issue: `SUPERVISOR_ACTIONS_PER_DAY: Record<SupervisorVerdict, number>` (`NUDGE` 2, `RESTART_WITH_NOTES` 1, `ESCALATE` 1, `LEAVE` sem teto). Passou do teto ⇒ `ESCALATE` uma vez, depois `LEAVE`.

**Modo** — `CODM_AGENT_SUPERVISOR_MODE` (`SupervisorMode`, manifesto de env com consumidores, padrão **`OBSERVE`**): `OFF` não roda; `OBSERVE` roda o modelo e grava `agent.supervisor.reviewed { acted: false }` — sem linha do tempo, sem selo, nada no grupo (mesma regra do orçamento em observação: não mostrar o que não aconteceu); `ACT` executa. A tabela de quem anuncia é declarada pelo `acted`, não um `if`.

### Item 4 — números para a decisão "segunda conta ou API"

Não é código. Fica no spec e no PR, e a decisão é do dono.

- **Horas paradas por limite:** ≥ 37 h/semana (fase 4, cópia de 18/11, limite inferior — a pausa só é medida pelos avisos de limite). Depois da instalação da fase 4, o fato `agent.provider.limit_observed` dá o número exato (consulta abaixo).
- **Volume de uma hora de tarefa** (fixture anonimizada da fase 4, `tests/fixtures/quota/usage-2026-11.json`, 339 h, 1.327 turnos de issue, 160 horas com turno de issue): por hora ativa, ~0,15 M de saída, ~0,83 M de escrita de cache, ~36 M de leitura de cache (entrada sem cache desprezível). O orquestrador soma ~11% da saída.
- **Custo em API para cobrir as horas paradas**, em unidades de preço: com `E` = preço por milhão de tokens de entrada do modelo e as proporções de preço público usadas na fase 4 (escrita 1,25 E, leitura 0,1 E, saída 5 E), uma hora de tarefa custa ~**5,4 E** (0,77 E saída + 1,03 E escrita + 3,6 E leitura). 37 h/semana ⇒ ~**200 E por semana**. `E` depende do modelo: as sessões gravam `DEFAULT` (o CLI escolhe), então o dono confere o preço do modelo que de fato roda; a faixa entre o modelo médio e o grande da tabela pública muda o número algumas vezes.
- Ressalva: supõe que as horas paradas teriam a intensidade média de uma hora ativa; as pausas acontecem justamente depois de horas intensas, então é provavelmente um **piso**.

## Composição com as fases 0–4

| Mecanismo existente | Como esta fase o usa |
|---|---|
| Lembrete de declaração (fase 0) | vira o empurrão 1; contagem declarada; o empurrão 2 é novo |
| `STALLED` como aviso de bloqueio, um por issue (fase 3) | continua sendo o "bloqueio visível" depois do empurrão 2; o supervisor só o resolve por `AUTO_RETRY` |
| Item envenenado → stop (#69) | continua sendo o "pedir alguém"; antes dele, o calendário de tentativas; kind certo para login |
| Adiamento, sonda, soltura no boot (#69, fase 0) | causa declarada; comportamento de `PROVIDER_LIMIT`/`HOLD` idêntico |
| Pausa (fase 2) | issue pausada nunca é empurrada nem suspeita; `PAUSED` vence `WAITING_RETRY` |
| Triagem no modelo pequeno (fase 2) | molde do supervisor (sem ferramentas, falha fechada, uso gravado) |
| Política de saída e modo do grupo (fase 3) | nada novo vai ao grupo; `AUTO_RETRY` fecha o aviso pela política existente |
| `claim_class` (fase 4) | o empurrão é `REMINDER`; o leitor usa a coluna |
| Orçamento em observação, `RESERVED_ROLES` (fase 4) | o supervisor entra na reserva; passada pulada com orçamento segurando de fato |
| Troca de sessão com notas (fase 4) | `RESTART_WITH_NOTES` só pede a troca; o resto é o caminho existente |

## Migrações

SQLite (uma, `0038`, `bun migrate:create` + `db:sync-go` + `db:check-go`; nenhuma tabela nova, contagem do core-go não muda):
- `agent_mailbox.defer_cause` text nullable, sem CHECK (coluna nova em tabela existente; o `z.enum` fecha na hidratação). **Preenchimento à mão:** linhas adiadas existentes (sem `consumed_at`, sem `dead_at`, sem `claimed_by`, `lease_until` no futuro) recebem `HOLD` quando a issue ou a conversa está pausada e `PROVIDER_LIMIT` no resto — a mesma regra que os leitores aplicam hoje por junção, uma vez, na migração.
- `agent_mailbox`: `UPDATE` à mão de `payload` das linhas `claim_class = 'REMINDER'` com `json_set(payload, '$.nudge', json_object('ordinal', 1))` (os lembretes antigos são o empurrão 1; `rootItemId` fica ausente só nelas).
- `issue_issues.feedback_requested_at` integer nullable.
- `agent_agent_sessions.handoff_requested_at` integer nullable.
- Conferir o SQL gerado: só `ADD COLUMN`, nunca reconstrução (`__new_`). Teste da migração com o `LibSqlDriver` real sobre linhas semeadas (adiado pausado → `HOLD`, adiado não pausado → `PROVIDER_LIMIT`, não adiado → nulo; lembrete antigo → `ordinal 1`).
- Go/sqlc: o gateway lê `issue_issues` por lista explícita de colunas e não lê as novas — sem `sqlc generate` (mesma razão da fase 4).

Nuvem (pg, `0009`, aplicada antes do daemon): recriar `panel_issues_life_state_check` com `WAITING_RETRY` (`pg/schema/panel.ts`, derivado de `IssueLifeState`). Conferir no S0a se algum CHECK da nuvem fecha `IssueTimelineItemKind`; se fechar, recriar também.

## Testes

- `ReconcileStalledIssues.test.ts`: turno calado → empurrão 1; empurrão 1 calado → empurrão 2 (mesmo `rootItemId`); empurrão 2 calado → `STALLED` com `DETAIL_AFTER_NUDGES`, aviso de bloqueio no grupo; turno que declara depois do empurrão 1 encerra o episódio; recado de pessoa entre empurrões começa episódio novo; passada repetida não duplica (dedup); lembrete antigo migrado conta como 1. **Negativos (um por linha da lista fechada do item 1):** stop de decisão, de pergunta, de aprovação, de permissão aberto; feedback pedido no último turno; issue pausada; conversa pausada; adiada por limite; adiada por nova tentativa; turno rodando; comando de publicação rodando — nenhum recebe empurrão em 5 passadas.
- `issueLifeState.test.ts`: `WAITING_RETRY` e sua precedência; `PAUSED` vence; feedback pedido ⇒ `WAITING_PERSON`.
- `LibSqlMailboxRepository.defer.test.ts`: `defer` exige causa; claim zera; `releaseDeferred`/`deferred` respeitam `DEFER_RELEASE`; item novo solta só `RETRY`.
- `LibSqlMailboxDispatcher.retry.test.ts` (relógio roteirizado): erro do provedor na pista ISSUE → tentativas em 1, 4, 15, 60 min e stop `SERVER_ERROR` depois da 5ª; THREAD → 10 s, 60 s; `AUTH_REQUIRED` esgotado → stop `AUTH_REQUIRED` (aviso de login); exceção e teto com o calendário deles; turno que falou não repete; limite com `retryAfter` continua adiando sem gastar tentativa; restart **não** solta a tentativa; `creditAcceptedTurn` **não** solta; recado novo solta e viaja junto; "esperando cota" nunca aparece para `RETRY`; `agent.mailbox.retry_scheduled` sem texto de erro.
- `ProviderWait.test.ts`: segue verde sem a junção com `paused`.
- `SuspectIssueReader.test.ts`: cada motivo entra; cada exclusão sai; esfriamento; provedor pausado pula a passada.
- `ModelIssueSupervisor.test.ts` (runner falso): veredito válido; JSON inválido, prazo e baixa confiança ⇒ `LEAVE` com `fallback`; veredito fora de `VERDICTS_BY_REASON` ⇒ `LEAVE`; sem ferramentas; uso `SUPERVISOR` gravado; entrada sem telefone/JID (sentinela).
- `SuperviseSuspectIssues.test.ts`: `OBSERVE` grava `acted: false` e não muda nada (nenhum item, nenhuma resolução, nenhuma linha do tempo); `ACT` + `NUDGE` resolve `STALLED` com `AUTO_RETRY`, retomada em AUTO mesmo quando o último resolvedor tinha "pode liberar"; `RESTART_WITH_NOTES` leva o próximo turno a sessão nova com notas (`handed_off`); `ESCALATE` só linha do tempo; teto por dia; `OFF` não roda.
- `QuotaBudget.test.ts`: gasto `SUPERVISOR` conta no piso da reserva.
- Arquitetura: todo `defer(` passa causa; todo `recordFailure` passa classe (fixtures negativas); exposição MCP inalterada (nenhuma ferramenta nova).
- Migração 0038 com o driver real; pg 0009 aceita `WAITING_RETRY`.
- **Aceite** (`tests/flows/fase5-acceptance.test.ts`, test bed `integration`, dispatcher real, relógio injetado): (1) tarefa parada sem motivo recebe empurrão 1 e 2 e, sem reação, vira `STALLED` com aviso de bloqueio no grupo; (2) tarefa com decisão aberta, com pergunta aberta e com feedback pedido não recebe empurrão em 10 passadas; (3) erro do provedor faz 5 tentativas espaçadas e só então pede alguém; (4) supervisor em `OBSERVE` não age; em `ACT` empurra o `STALLED` uma vez em AUTO.
- e2e: cartão com `WAITING_RETRY` e item `NUDGED` na linha do tempo (fixture).

## Rollout

- Ordem: **nuvem antes do daemon** — pg 0009 e o código do `SyncPanel` que aceita `WAITING_RETRY`; depois o daemon (SQLite 0038 no boot, testada antes numa cópia do banco real quando houver disco).
- Itens 1 e 2 entram **ligados**: são as regras que o objetivo aprovou, só mudam quantas vezes e quando o sistema tenta antes de pedir alguém, e nada novo vai ao grupo.
- Supervisor entra em **`OBSERVE`** (`CODM_AGENT_SUPERVISOR_MODE=OBSERVE`): uma semana gravando o que teria feito; ligar `ACT` é decisão do dono com os fatos `agent.supervisor.reviewed` (PERGUNTAR AO DONO).
- Reverter sem build: `CODM_AGENT_SUPERVISOR_MODE=OFF`. O calendário de tentativas é constante de código (como o `MAX_ATTEMPTS` de hoje); voltar ao comportamento antigo exige build.

## Como medi (antes)

**PENDENTE — medir com espaço em disco** (≥ 5 GiB livres). Cópia `sqlite3 -readonly "<banco vivo>" ".backup <dir temporário>/codm.db"`, só agregados, scripts fora do repo, apagar a cópia no fim. Janela: últimos 14 dias de `shared_events.occurred_at`. Instantes em ms.

```sql
-- 1. paradas silenciosas por semana, nas duas formas (antes da fase 3: HUMAN_REQUESTED com o texto do reconciliador)
select strftime('%Y-W%W', raised_at/1000, 'unixepoch') wk, kind, count(*)
  from issue_stops
 where kind = 'STALLED'
    or (kind = 'HUMAN_REQUESTED' and detail like 'a execução terminou sem conclusão%')
    or (kind = 'HUMAN_REQUESTED' and detail like 'a tarefa terminou o turno sem dizer%')
 group by 1, 2;

-- 2. como terminam e quanto duram (mediana/p90 fora do SQL): resolução, minutos até resolver, nunca resolvidas
select coalesce(resolution, 'ABERTA') res, count(*),
       avg((resolved_at - raised_at)/60000.0) min_avg
  from issue_stops
 where kind = 'STALLED' or (kind = 'HUMAN_REQUESTED' and (detail like 'a execução terminou sem conclusão%' or detail like 'a tarefa terminou o turno sem dizer%'))
 group by 1;
--    "terminou sem resolução mas a issue concluiu": parada aberta e issue COMPLETED depois dela
select count(*) from issue_stops s join issue_issues i on i.id = s.issue_id
 where s.resolved_at is null and i.status = 'COMPLETED' and (s.kind = 'STALLED' or s.detail like 'a execução terminou sem conclusão%');

-- 3. lembretes: quantos, e o que veio depois (declarou × parou)
select count(*) from agent_mailbox
 where target_kind = 'ISSUE' and (claim_class = 'REMINDER' or json_extract(payload, '$.declarationReminder') = 1);
--    depois do lembrete consumido: próximo fato da issue em até 10 min — stop de pergunta/decisão, issue.completed, ou STALLED/texto do reconciliador
--    (script: por lembrete, primeiro de issue_stops.raised_at / shared_events 'agent.run.completed' com a mesma issue e instante >= consumed_at)

-- 4. turnos que terminam sem declarar: turnos (fatos de uso role=ISSUE ou, antes da fase 4, agent.run.completed) seguidos de lembrete
select strftime('%Y-W%W', created_at/1000, 'unixepoch') wk, count(*) from agent_mailbox
 where claim_class = 'REMINDER' or json_extract(payload, '$.declarationReminder') = 1 group by 1;

-- 5. tentativas e envenenados por pista; categorias de erro só como contagem (nunca o texto)
select target_kind, attempts, (dead_at is not null) dead, count(*) from agent_mailbox group by 1, 2, 3;
select target_kind,
       case when last_error like '%overloaded%' or last_error like '%529%' or last_error like '%500%' then 'provedor'
            when last_error like '%login%' or last_error like '%auth%' then 'login'
            when last_error like '%abandonado%' then 'teto'
            when last_error is null then 'nenhum' else 'outro' end cat,
       (dead_at is not null) dead, count(*)
  from agent_mailbox where attempts > 1 or dead_at is not null group by 1, 2, 3;
--    (a categorização por texto é SÓ desta medição, fora do repo; o desenho classifica por tabela declarada)

-- 6. SERVER_ERROR: por resolução e tempo até resolver; e intervalo entre a falha e o próximo turno aceito do mesmo provedor
select coalesce(resolution, 'ABERTA'), count(*), avg((resolved_at - raised_at)/60000.0) from issue_stops where kind = 'SERVER_ERROR' group by 1;

-- 7. do STALLED à resolução, por quem resolveu (RETRY de alguém, TAKE_OVER, ANSWER via citação) — mediana/p90 no script
-- 8. quantas issues ficariam suspeitas por regra (item 3): STALLED/SERVER_ERROR abertos > 30 min, por dia; episódios de lembrete >= 3 em 24 h
-- 9. pedidos de feedback seguidos de lembrete (o buraco do item 1): fato agent.issue_spoke level=FEEDBACK e lembrete da mesma issue depois dele
select count(*) from shared_events f join agent_mailbox m on m.target_id = f.entity_id
 where f.name = 'agent.issue_spoke' and json_extract(f.payload, '$.level') = 'FEEDBACK'
   and (m.claim_class = 'REMINDER' or json_extract(m.payload, '$.declarationReminder') = 1) and m.created_at > f.occurred_at;

-- 10. item 4: horas paradas pelo provedor (só existe depois da fase 4 instalada)
select json_extract(payload, '$.window') w, json_extract(payload, '$.status') s, count(*) from shared_events
 where name = 'agent.provider.limit_observed' group by 1, 2;
```

Fixture (item 4): `python3 -I` sobre `tests/fixtures/quota/usage-2026-11.json` — soma dos baldes por papel, horas com turno de issue, baldes por hora ativa (feito em 20/11, números no item 4).

## Riscos

- Empurrão 2 que trabalha pode fazer algo que ninguém pediu: sempre AUTO, filtro de permissão e janela de arrependimento valem, o texto proíbe publicar/merge; no pior caso é o mesmo que um "continue" de uma pessoa sem "pode liberar".
- Espera de nova tentativa atrasa o aviso de erro em ~1h20 na pista de tarefas; aceito porque hoje o aviso vem em segundos e a resolução em ~17 h.
- Feedback pedido vira espera sem prazo: a tarefa fica "esperando pessoa" até alguém responder (ver PERGUNTAR AO DONO, lembrete escalonado).
- Supervisor errado: observação primeiro, vereditos fechados por motivo, teto por issue, falha fechada em `LEAVE`.

## Fora de escopo

- Lembrete escalonado para quem deve responder ("2 h no quadro, 6 h no grupo", brainstorm §5 C2) — fala com pessoas; pergunta ao dono.
- Matar ou reiniciar um turno vivo pelo supervisor (`SILENT_TURN`) — pergunta ao dono.
- Batimento declarado pela tarefa (C3): `ReportProgress` existe; usar a ausência dele como suspeita fica para depois da semana de observação.
- Segunda conta ou API: só os números (item 4); decisão do dono.
- Chave da pausa por provedor × modelo (fase 4, fora de escopo).

## PERGUNTAR AO DONO

1. **Supervisor: observar antes de agir?** (a) uma semana em `OBSERVE`, depois decidir com os vereditos registrados (recomendado, mesma regra do orçamento); (b) `ACT` desde o início, só com `NUDGE`; (c) `ACT` com os três vereditos.
2. **"Escalar" fala com quem?** (a) ninguém além do que já existe — selo no cartão e linha do tempo; o aviso de bloqueio já foi ao grupo (padrão deste spec); (b) uma linha no grupo mencionando quem pediu a tarefa; (c) mensagem direta para o dono do codm; (d) (b) em horário comercial e (c) fora dele.
3. **O supervisor pode parar um turno vivo que está mudo há muito tempo** (`SILENT_TURN`)? (a) nunca — só escala (padrão deste spec); (b) pode, e o próximo turno retoma a mesma sessão com um empurrão; (c) pode, e o próximo turno abre sessão nova com as notas.
4. **Tarefa que pediu feedback e ninguém respondeu:** (a) espera sem prazo, sem empurrão (padrão deste spec — "quem declarou espera não é incomodado"); (b) depois de N horas, um lembrete escalonado no grupo para quem pediu; (c) depois de N horas, empurrão para a tarefa seguir sozinha.
5. **Segunda conta ou API** (item 4, números acima): (a) não por agora — esperar a semana do orçamento em observação e remedir as horas paradas; (b) API só para a pista de tarefas quando a conta recusar, com teto semanal de gasto que o dono define; (c) segunda conta do provedor alternada na recusa; (d) mudar o modelo padrão das tarefas para um mais barato antes de comprar teto.

## Revisão (skill `spec-review`)

Pendente — ver a seção abaixo depois da passada.
