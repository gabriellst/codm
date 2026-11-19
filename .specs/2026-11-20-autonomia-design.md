# Fase 5 — autonomia

Status: Reviewed (fase 5 do plano "tarefas visíveis, controláveis e que não se perdem")
Data: 2026-11-20
Depende de: `2026-11-12-fase-0-tarefas-visiveis-design.md` (lembrete de declaração, `ReconcileStalledIssues`), `2026-11-16-falar-e-parar-na-hora-design.md` (pausa, "agora", janela de arrependimento, triagem no modelo pequeno), `2026-11-17-emagrecer-o-grupo-design.md` (política de saída, `STALLED`, um aviso por causa, `DEFAULT_APPLIED` escrito só por job), `2026-11-19-vazao-design.md` (`claim_class`, orçamento em observação, `RESERVED_ROLES`, troca de sessão com notas, `PUBLISH_AUTHORIZED_BY`). O comportamento de limite do provedor é o do #69 (pausa global, teto de reverificação `limitRecheckMs`, soltura no `creditAcceptedTurn`); a proposta "pausa por pista" (12/11) está Superseded e não existe nesta linha.

## Problema

### Medido antes (instalação real, 14 dias até 12/11 — anterior à fase 0, não remedido)

Números do diagnóstico que abriu o plano; só agregados. Medidos **antes** do lembrete de declaração (fase 0) e do `STALLED` (fase 3): termo de comparação, não retrato de hoje.

| Métrica | Valor |
|---|---|
| Paradas "a execução terminou sem conclusão" | 150 em 14 dias (~75/semana) |
| …resolvidas respondendo | 62, média ~3 h até a resposta |
| …resolvidas só com alguém assumindo | 81, média ~7 h |
| `SERVER_ERROR` (item envenenado depois de 3 tentativas) | 114 em 14 dias; 82 só resolvidos por alguém assumindo, média ~17 h depois |
| "continue/retome/cadê" escritos por pessoas | ~28/semana |
| Horas paradas por limite do provedor (fase 4, cópia de 18/11) | ≥ 37 h/semana (73,5 h em 13,9 dias, limite inferior) |

### Medido agora — **PENDENTE (sem espaço em disco)**

O volume de dados está com 3,4 GiB livres (`df -h`, 20/11); a regra desta fase é só copiar o banco com ≥ 5 GiB livres. Nenhuma cópia foi feita. As consultas exatas estão em "Como medi (antes)"; rodar assim que houver espaço, **antes do S2**, e registrar aqui. A versão instalada é a 0.9.0 (fases 0–2): paradas silenciosas aparecem como `HUMAN_REQUESTED` com o texto fixo do reconciliador (o `STALLED` é da fase 3), lembretes só têm `declarationReminder: true` no payload (a coluna `claim_class` é da 0037), e as consultas cobrem as duas formas.

### Lido no código (20/11, `feat/fase-4-vazao` 08b7bbe0)

1. **Um empurrão só, contado por inferência.** `ReconcileStalledIssues` manda **um** lembrete (steer em AUTO) ao turno que se calou; se o lembrete também se cala, levanta `STALLED` (aviso de bloqueio no grupo). O objetivo pede até **dois**. "É lembrete" é lido de `declarationReminder: true` no payload em seis lugares (`LibSqlStalledIssueReader`, `LibSqlMailboxRepository.hasUnreadSteer`, `issueLifeState.ts`, `issueTimeline.ts`, `reminderOf` no dispatcher, `RunIssueTurn` — que mantém o turno do lembrete mudo no grupo). A 0037 classificou os lembretes antigos como `STEER` (derivado do `kind`), então a coluna `REMINDER` só vale para lembretes novos.
2. **Pedido de feedback é incomodado.** `RequestFeedback` "não segura a issue" (não é stop). Um turno que termina depois dele deixa a issue `WORKING` sem nada em voo: o reconciliador manda o lembrete, e um segundo turno calado vira `STALLED` — embora o próprio texto do lembrete liste "pedir feedback" como declaração válida. Viola "quem declarou espera não é incomodado". As outras esperas declaradas já estão fora: todo stop leva a issue a `NEEDS_INPUT` (`MarkIssueNeedsInputFromStop`), e item em voo (adiado, rodando, na fila, comando de publicação, janela de arrependimento) tira a issue do predicado.
3. **Conversa pausada não está fora.** O leitor do reconciliador filtra `issues.paused`, mas `PauseThread` grava só `threads.paused`: uma issue de conversa pausada, sem nada em voo, recebe lembrete. Não há teste desse caso.
4. **"Nova tentativa" é imediata.** Uma falha que pede retry (`TRANSPORT_STOP_RETRIES`: `SERVER_ERROR`, `AUTH_REQUIRED`), uma exceção ou o teto de 1 h chamam `MailboxRepository.fail`, que solta o lease **agora** — o item volta no próximo poll (250 ms). Três tentativas em segundos e o item morre (`MAX_ATTEMPTS = 3`).
5. **Envenenamento sempre vira `SERVER_ERROR`.** `raiseStopForPoisoned` usa `SERVER_ERROR` até quando a causa foi `AUTH_REQUIRED` — o grupo lê "erro do provedor" quando falta login (`BlockCause.CLI_LOGIN` existe e nunca é usado por essa via).
6. **"Adiado" é uma forma de linha, não um fato declarado.** "Lease no futuro e sem dono" é escrito pela pausa do provedor (`waitForProvider`) **e** pela pausa da issue (`holdItem`); quem lê distingue os dois por junção com `paused` (`providerWaitByIssue`, `lifeStateOf`), e quem solta (`creditAcceptedTurn`, `ReleaseIssueWorkOnResume`) solta qualquer adiado. Uma terceira causa nessa forma apareceria como "esperando cota" e seria solta por qualquer retomada. Non-Negotiable 5: a causa tem de ser coluna.
7. **Não há supervisor.** Uma issue que já virou `STALLED` ou `SERVER_ERROR` espera alguém (médias de 7 h e 17 h acima). Nada olha de novo para ela.

## Decisões do dono que se aplicam (não reabrir)

- Objetivo, fase 5: **empurrão automático só para "parada sem motivo", até 2 vezes, depois bloqueio visível; quem declarou espera não é incomodado**; **nova tentativa com espera crescente para erro do provedor antes de pedir alguém**; **supervisor com modelo pequeno a cada 15–30 min, só sobre tarefas suspeitas, decidindo empurrar, reiniciar com as notas de passagem ou escalar**; **levar ao dono os números de segunda conta/API, sem decidir**.
- Grupo enxuto, um aviso por causa, `STALLED` não agrupa (fase 3). Resposta a quem falou continua no grupo.
- Orçamento observa antes de agir (fase 4, 19/11). **O supervisor não segue essa postura** (decisão do dono, 20/11): age desde a instalação, dentro das travas de segurança do item 3; a observação fica como registro de auditoria de todo veredito.
- Reserva do orquestrador `max(5%, medido)` (fase 4); o gasto do supervisor entra nela.
- O que ninguém pediu roda em AUTO e nunca eleva (participant-permission-posture; `RESUMES_WITH_RESOLVER_POSTURE`).

**Critério de aceite (objetivo):** tarefa parada sem motivo recebe empurrão e, sem reação, vira bloqueio visível; tarefa esperando pessoa não é empurrada.

## Desenho

### Quem é dono

- **`agent`** é dono dos três itens: fila (`agent_mailbox`, `fail`, `defer`, `giveBack`), reconciliador, sessão (`AgentSession`, troca com notas), triagem no modelo pequeno, fatos de uso e `RESERVED_ROLES`. O supervisor é um job do `agent` que **só produz pelas portas que já existem ou por portas irmãs delas** (enfileirar o empurrão, resolver um stop por job, pedir troca de sessão) — nenhum segundo produtor de `STALLED`.
- **`thread`** continua dono do stop, da resolução e do aviso no grupo. Ganha a resolução `AUTO_RETRY`, escrita só por job, como o `DEFAULT_APPLIED` da fase 3.
- **`issue`** continua dono do estado de vida e da linha do tempo (leituras), e expõe a linha do tempo por uma porta de serviço para o supervisor.
- **`ui`/`panel`** só mostram.

**Arestas e exceções (declaradas, não "nenhuma nova"):**
- `agent → thread`, superfície `usecases`: `ActOnSupervisorVerdict` chama `thread/usecases/ApplySupervisorRetry`. A superfície `usecases` é proibida por padrão; hoje a exceção é por arquivo (`packages/api/typescript/composition/policy.ts`, só o dispatcher). Entra **uma** entrada nova em `POLICY_EXCEPTIONS` nomeando `agent/usecases/ActOnSupervisorVerdict.ts`, com a mesma justificativa do `NotifyBudgetHeld`: a regra (quem pode resolver, o aviso, a política) é do `thread`; o `agent` só sabe quando.
- `agent → thread`, `reads` (tabela): `SuspectIssueReader` lê `issue_stops` (abertos por kind e idade) e `threads.paused` — aresta nova em `reads.thread` / `TABLE_READ_EDGES`, no mesmo padrão BFF do `LibSqlStalledIssueReader` sobre `issue_issues`.
- `agent → issue`, superfície `services`: a pausa vem do `IssueHold` (já consumido) e a linha do tempo da porta nova `issue/services/IssueTimelineReader` (hoje `assembleIssueTimeline` mora em `issue/utils`, que não é superfície importável).
- `issue → agent` e `ui → agent` já existem (leitura de `agent_mailbox`); as notas crescem.
- `tests/architecture/context-map.test.ts` e o detector de superfícies verdes com essas declarações.

### Contrato primeiro

TypeSpec (`packages/contracts/src/wire/enums/`), cada `.tsp` novo importado no `main.tsp`:
- **Novo** `MailboxDeferCause` — `PROVIDER_LIMIT`, `HOLD`, `RETRY`. Enum de fio pelo mesmo motivo do `MailboxClaimClass`: tipa uma coluna da tabela compartilhada que o gateway Go também abre.
- **Novo** `NudgeSource` — `RECONCILER`, `SUPERVISOR`.
- **Novo** `SuspicionReason` — `STALLED_OPEN`, `PROVIDER_ERROR_OPEN`, `NUDGE_LOOP`, `SILENT_TURN` (definições no item 3).
- **Novo** `SupervisorVerdict` — `NUDGE`, `RESTART_WITH_NOTES`, `ESCALATE`, `LEAVE`.
- Crescem: `IssueLifeState += WAITING_RETRY`; `StopResolution += AUTO_RETRY`; `UsageRole += SUPERVISOR`; `IssueTimelineItemKind += NUDGED, RETRY_SCHEDULED, SUPERVISOR_REVIEWED`.

**Tabelas totais tocadas, com o valor de cada membro novo** (o compilador acusa os `Record`, não as uniões de `z.literal` — por isso a lista):

| Tabela | Arquivo | Valor |
|---|---|---|
| precedência do estado | `issue/utils/issueLifeState.ts` | `WAITING_RETRY` logo depois de `WAITING_PROVIDER` |
| boletim | `thread/services/BoardBulletin/BoardBulletin.ts` | `WAITING_RETRY` = "tentando de novo" |
| `RESOLUTIONS_BY_KIND` | `thread/utils/StopResolutions.ts` | `STALLED`, `SERVER_ERROR` += `AUTO_RETRY` |
| `RESUMES_WITH_RESOLVER_POSTURE` | idem | `AUTO_RETRY: false` (sempre AUTO) |
| `GIVEN_BY_NAME_ALONE` | idem | `AUTO_RETRY: false` — o `ResolveStop` HTTP/MCP recusa `RESOLUTION_NOT_APPLICABLE` |
| `OFFERED_ON_PANEL` | idem | `AUTO_RETRY: false` |
| `ANSWER_RECORDED_BY` | `thread/entities/Thread.ts` | `AUTO_RETRY`: grava nada |
| `ANSWER_ECHO` | `thread/usecases/ExecutePanelAction.ts` | `AUTO_RETRY`: nenhum (nunca entra pelo painel) |
| `RESUMES_EVEN_WITH_PENDING` | `thread/handlers/ResumeIssueOnStopResolved.ts` | `AUTO_RETRY: false` |
| `RESUME_TEXT` | idem | `AUTO_RETRY` = o texto do empurrão 2 (item 1) |
| **novo** `RESUME_CLAIM_CLASS: Record<StopResolution, MailboxClaimClass>` | idem | `AUTO_RETRY → REMINDER`; todos os outros `DECISION_ANSWER` (o de hoje). Sem isso a retomada do supervisor teria o rank mais alto e passaria pelo gatilho de publicação |
| `PUBLISH_AUTHORIZED_BY` | `agent/objects/PublishAuthorizedBy.ts` | `AUTO_RETRY: () => false` |
| `ROW_DETAIL_PT/EN` | `thread/i18n/messages.ts` | "tentado de novo pelo supervisor" |
| `resolutionIsPrimary` | react `glyphs.tsx` | `AUTO_RETRY: false` |
| `RESERVED_ROLES` | `agent/services/QuotaBudget/QuotaBudget.ts` | `SUPERVISOR: true` |
| **novo** `SEEDS_FROM_NOTES: Record<ResumeInvalidationReason, boolean>` | `agent/usecases/RunIssueTurn.ts` | `CONTEXT_BUDGET_EXCEEDED: true`, `HANDOFF_REQUESTED: true`, resto `false` — substitui o `if (decision.reason !== CONTEXT_BUDGET_EXCEEDED)` |
| união da linha do tempo + leitor | `shared/schemas/IssueTimelineItemSchema.ts`, `issue/utils/issueTimeline.ts` | `NUDGED`, `RETRY_SCHEDULED`, `SUPERVISOR_REVIEWED` |
| renderizadores | react `IssueCard.tsx`, `IssuesOverviewSection`, linha do tempo (console e painel) | um por membro |
| nuvem | `SyncPanel`, `panel_issues_life_state_check` | `WAITING_RETRY` |

Enums só do `agent` (`agent/enums`, não cruzam o fio): `MailboxFailureClass` — `PROVIDER_ERROR`, `CLI_LOGIN`, `CRASH`, `ABANDONED`; `SupervisorMode` — `OFF`, `OBSERVE`, `ACT`; `ResumeInvalidationReason += HANDOFF_REQUESTED`.

Fatos de domínio do `agent` (`z.domainEvent`, só TS):
- `AgentIssueNudgedEvent` (`agent.issue.nudged`) — `{ issueId, threadId, ordinal, source: NudgeSource, rootItemId }`.
- `AgentRetryScheduledEvent` (`agent.mailbox.retry_scheduled`) — `{ itemId, targetKind, targetId, failureClass, attempt, maxAttempts, retryAt }`. Sem o texto do erro.
- `AgentSupervisorReviewedEvent` (`agent.supervisor.reviewed`) — `{ issueId, reason, verdict, confidence?, mode, acted, fallback? }`. A nota do modelo **não** é gravada nem repassada (ver item 3).
- `AgentSessionHandedOffEvent` cresce: `reason: ResumeInvalidationReason` (orçamento × pedido do supervisor). Opcional no schema (linhas antigas), obrigatório no produtor.

Formas em `shared/schemas/`: a união `IssueTimelineItemSchema` ganha `NUDGED { ordinal, source }`, `RETRY_SCHEDULED { attempt, maxAttempts, retryAt }`, `SUPERVISOR_REVIEWED { reason, verdict }`. DTOs: `GetIssuesOverview`/`GetIssueDetail` ganham `retryingAt?` (ao lado de `waitingForProviderUntil`) e `escalatedAt?` (último `ESCALATE` agido sem stop resolvido nem turno declarado depois); o `SyncPanel` leva os dois. Sem `.refine()`, nada de entidade registrado.

Objeto do `agent` (`agent/objects/NudgePayload.ts`): `NudgePayloadSchema` — `nudge: { ordinal, rootItemId?, source }`. O que o item é fica na coluna `claim_class = REMINDER`; o detalhe dele, no schema do payload (padrão do `ResumeIssuePayloadSchema`, fase 4) — nunca no `dedupKey`.

### Item 1 — empurrão automático, até 2 vezes

**O que já existe e fica:** o reconciliador (60 s), o predicado de "nada em voo", o steer em AUTO, o turno de lembrete que não vai ao grupo, o `STALLED` como aviso de bloqueio.

**O que muda:**
- **Identidade pela coluna, em todos os leitores.** Os seis leitores do problema 1 passam a perguntar `claim_class = REMINDER` (o `reminderOf` do dispatcher já tem a coluna no item reivindicado; o `RunIssueTurn` recebe a classe no input em vez de ler o payload). O campo `declarationReminder` sai dos produtores. Rail `tests/architecture/reminder-identity.test.ts`: nenhum `declarationReminder` no `src/` fora da migração (fixture negativa). A 0038 converte os lembretes antigos (ver Migrações).
- **Contagem declarada.** `NUDGES_BEFORE_STALL = 2`. Regra no reconciliador, sobre o último item consumido da issue: não é `REMINDER` ⇒ empurrão 1 com `rootItemId` = esse item; é `REMINDER` com `ordinal < NUDGES_BEFORE_STALL` ⇒ próximo ordinal, mesmo `rootItemId`; senão ⇒ `STALLED` com `DETAIL_AFTER_NUDGES` ("nem depois de dois empurrões"). `dedupKey` = `nudge:<issueId>:<rootItemId>:<ordinal>` (lembrete antigo sem `rootItemId` usa o próprio id). A idempotência continua vindo do predicado + dedup.
- **Texto por ordinal** (`NUDGE_TEXT: Record<1 | 2, string>`): o 1 é o lembrete de hoje (declare, não refaça trabalho). O 2 é o empurrão do brainstorm: "se parou no meio de um passo, termine esse passo; depois declare — concluí, a decisão que falta ou o que falta e de quem". O 2 pode trabalhar, sempre em AUTO: filtro de permissão e janela de arrependimento valem; o texto diz que o empurrão **não autoriza** publicar, merge nem nada irreversível.
- **Espera declarada por feedback, lida dos fatos do próprio `agent`.** Um turno que pediu feedback gravou `agent.issue_spoke` com `level: FEEDBACK` (o `agent` lê os próprios fatos de `shared_events`, como `LibSqlHandoffNotes`; `reads.shared` já declarado). Tabela `SIGNAL_DECLARES_WAIT: Record<SpokenLevel, boolean>` (`FEEDBACK: true`, `PROGRESS: false`). Predicado único na porta `agent/services/DeclaredWaitReader` (porta + `LibSql…` + `Mock…`): a issue declarou espera se existe fato de nível que declara espera com `occurred_at ≥ first_claimed_at` do último item consumido. Usado pelo reconciliador (exclui) e pelo `lifeStateByIssue` do `issue` (`WAITING_PERSON` antes de `STALLED`), pela superfície `services` da aresta `issue → agent` que já existe. Sem coluna nova, sem handler, sem corrida com o outbox: o fato é gravado na transação da ferramenta, antes de o turno terminar.
- **Pausa da conversa.** O leitor exclui também `threads.paused` pelo `IssueHold` (a mesma pergunta que o dispatcher faz).
- **Fato e linha do tempo.** Cada empurrão grava `agent.issue.nudged` na transação do enqueue; a linha do tempo mostra `NUDGED` ("empurrão 1 de 2") **no lugar** do item `STEER` do lembrete (o leitor pula os itens `REMINDER` da lista de steers). `REMINDED` no quadro como hoje.
- **Quem não é empurrado (lista fechada, cada linha com teste negativo):** stop aberto de qualquer kind; feedback pedido no último turno; issue pausada; conversa pausada; item em voo de qualquer causa — rodando, na fila, adiado por limite, por pausa ou por nova tentativa; comando de publicação e janela de arrependimento; arquivada; concluída.

### Item 2 — nova tentativa com espera crescente

**Causa do adiamento como coluna.** `agent_mailbox.defer_cause` (`MailboxDeferCause`, nullable). `defer(ids, until, cause)` exige a causa; `holdItem` escreve `HOLD`, `waitForProvider` escreve `PROVIDER_LIMIT`, a nova tentativa escreve `RETRY`. **Toda escrita que limpa ou troca o lease zera a coluna** — claim, `giveBack`, `releaseDeferred`, `releaseOrphanedClaims`, `complete`, `settleHold`, morte do item —, então "nulo ⇔ não adiado" vale também depois que um lease expira e o item é reivindicado. Porta, `LibSql…` e `Mock…` do repositório mudam juntos.

**Quem solta o quê** — tabela declarada `DEFER_RELEASE: Record<MailboxDeferCause, { onProviderCredit, onIssueResume, onNewItem }>`, sobre os soltadores que existem nesta linha:

| Soltador | Hoje | `PROVIDER_LIMIT` | `HOLD` | `RETRY` |
|---|---|---|---|---|
| `creditAcceptedTurn` (um turno do provedor passou) | solta todo adiado | solta | solta (como hoje; o hold re-segura no claim) | **não** — o provedor ter voltado não prova que este item passa |
| `ReleaseIssueWorkOnResume` (retomada da issue) | solta todo adiado da issue | solta (como hoje) | solta | **não** — retomar não é motivo para gastar a tentativa antes da hora |
| item novo do mesmo alvo (`EnqueueMailboxItem`) | nada | nada | nada | **solta, devolvendo a tentativa** (ver abaixo) |
| expirar o lease (`limitRecheckMs` / espera da tentativa) | o item volta | volta | volta | volta |

Leitores: `providerWaitByIssue` conta só `PROVIDER_LIMIT` (sai a junção com `paused`); `lifeStateOf`: `PROVIDER_LIMIT → WAITING_PROVIDER`, `RETRY → WAITING_RETRY` (`PAUSED` vence antes); `LibSqlStalledIssueReader` trata qualquer adiado como em voo; a exclusão por alvo do `claimNext` conta qualquer adiado (ordem por alvo preservada).

**Recado de pessoa durante a espera.** O `claimNext` sempre entrega o item mais antigo do alvo, então soltar a espera faz a cabeça que falhou rodar de novo — com o recado junto, se a classe permitir (fase 4, 6b). Para isso **não** virar "três tentativas em segundos": a soltura por item novo **devolve a tentativa** que a espera representava (`attempts - 1`) e grava o mesmo `retryAt` adiante só se a nova rodada falhar de novo. Teste com três recados durante a espera: o calendário não avança por eles.

**Classe da falha, declarada.** `recordFailure(bundle, failure: { class: MailboxFailureClass, detail })`. A falha de transporte é classificada pela tabela `FAILURE_CLASS_OF_TRANSPORT_STOP: Record<RetriedTransportStopKind, MailboxFailureClass>` (`SERVER_ERROR → PROVIDER_ERROR`, `AUTH_REQUIRED → CLI_LOGIN`), a exceção ⇒ `CRASH`, o teto ⇒ `ABANDONED`. Nunca pelo texto. Rail: todo `recordFailure(` passa classe.

**Calendário por pista e classe** — `RETRY_SCHEDULE: Record<MailboxTargetKind, Record<MailboxFailureClass, readonly number[]>>` (esperas entre tentativas; tentativas = esperas + 1; **espera 0 = semântica de `giveBack`**: lease nulo, sem causa — nunca `lease = now`, o bug de milissegundo documentado no `giveBack`):

| | `PROVIDER_ERROR` | `CRASH` | `ABANDONED` | `CLI_LOGIN` |
|---|---|---|---|---|
| ISSUE | 1, 4, 15, 60 min (5 tentativas, ~1h20) | 1, 4, 15 min | 15 min (2 tentativas) | 0, 0 (como hoje) |
| THREAD | 10 s, 60 s (3 tentativas) | 10 s, 60 s | 0 (2 tentativas) | 0, 0 (como hoje) |

Na pista ISSUE ninguém espera em tempo real e uma sobrecarga do provedor passa em minutos; na THREAD há uma pessoa esperando, então a espera é curta e o teto não cresce. Login não volta sozinho com o tempo; o abandonado pode ainda estar vivo, e esperar reduz a chance de dois turnos ao mesmo tempo. Ponto de partida — a medição pendente (tempo entre falha de provedor e o próximo turno aceito) confirma ou corrige antes do S2. `MAX_ATTEMPTS` global sai.

**`fail` com espera, atômico com o fato.** `MailboxRepository.fail(head, followers, failure, schedule, tx)`: `attempts` já foi cobrado no claim; se `attempts < schedule.length + 1` ⇒ adiado `RETRY` até `now + schedule[attempts - 1]` (ou `giveBack` se a espera é 0); senão ⇒ morto. O dispatcher abre uma unidade de trabalho (`UnitOfWorkFactory`, como em `holdItem`) e grava `agent.mailbox.retry_scheduled` na mesma transação. Os recados que viajavam junto voltam sem custo (como hoje).

**Regras que ficam:** turno que já falou (`spoke`) não repete; recusa por limite com `retryAfter` vai para `waitForProvider` sem gastar tentativa; `PERMISSION_DENIED` registrado na primeira vez; "agora" e pausa não gastam tentativa.

**Depois da última tentativa — pedir alguém com a causa certa.** `STOP_OF_FAILURE: Record<MailboxFailureClass, StopKind>` (`PROVIDER_ERROR`/`CRASH`/`ABANDONED → SERVER_ERROR`, `CLI_LOGIN → AUTH_REQUIRED`); o aviso diz "login" quando é login. O `detail` diz quantas tentativas e em quanto tempo.

**Visível.** `WAITING_RETRY` no quadro e no painel com `retryingAt` ("nova tentativa às hh:mm, 3 de 5"); `RETRY_SCHEDULED` na linha do tempo. Nada no grupo durante as tentativas.

### Item 3 — supervisor com modelo pequeno

**Suspeita por regra, sem modelo** — `agent/services/SuspectIssueReader` (porta + `LibSql…` + `Mock…`), só dados persistidos, disjunto do que o reconciliador vê:
- `STALLED_OPEN` / `PROVIDER_ERROR_OPEN`: stop aberto do kind há ≥ `SUSPECT_STOP_AGE_MS` (30 min — tempo de uma pessoa ver o aviso primeiro). `SERVER_ERROR` de issue só nasce do envenenamento, então o motivo é bem definido.
- `NUDGE_LOOP`: ≥ `NUDGE_LOOP_EPISODES` (3) fatos `agent.issue.nudged` com `ordinal = 1` em 24 h.
- `SILENT_TURN`: item da issue com lease vivo há ≥ `SILENT_TURN_MIN_MS` (30 min) e última `issue_terminal_lines.at` há ≥ `SILENT_TURN_QUIET_MS` (20 min). O supervisor **nunca** para um turno vivo (decisão do dono, 20/11): o vigia de inatividade continua sendo o único que mata um turno; o supervisor só sinaliza (`ESCALATE` ou `LEAVE`).
- **Nunca suspeitas:** issue ou conversa pausada (`IssueHold`), stop de pessoa aberto, espera declarada por feedback (`DeclaredWaitReader`), adiada por qualquer causa, concluída, arquivada. Com o provedor pausado (`QuotaStatusReader.providerPausedUntil()`, novo) ou o orçamento segurando de fato, a passada inteira é pulada.
- Esfriamento: a mesma `(issue, reason)` não é revista antes de `SUPERVISOR_COOLDOWN_MS` (60 min), lido do último `agent.supervisor.reviewed`.

**Cadência** — job `agent/usecases/SuperviseSuspectIssues` (`repeat.every = SUPERVISOR_INTERVAL_MS`, 20 min), no máximo `SUPERVISOR_MAX_PER_PASS` (5) issues por passada, mais antigas primeiro.

**Decisão no modelo pequeno** — `agent/services/IssueSupervisor` (porta; `ModelIssueSupervisor` sobre um `SupervisorAgent`, no molde do `ModelInboundTriage`): modelo pequeno do provedor da conversa (`smallModelFor`), **sem ferramentas** (`--tools ""`, falha fechada), prazo `SUPERVISOR_TIMEOUT_MS`, sem estado. Entrada só com nomes e textos: chave e título, objetivo curto, motivo, estado de vida, últimos 12 itens da linha do tempo (pela porta `IssueTimelineReader`) com texto cortado, contagens, notas de passagem se houver. **Texto livre redigido antes de sair:** sequências de ≥ 8 dígitos e endereços com `@` viram `[omitido]` (função `redactForModel`, teste com sentinelas). Saída validada por Zod: `{ verdict, confidence }` — **sem nota livre** (texto de modelo não entra num turno AUTO de outra sessão). Inválida, prazo ou abaixo de `SUPERVISOR_MIN_CONFIDENCE: Record<SupervisorVerdict, number>` ⇒ `LEAVE` com `fallback`. O veredito só vale se estiver em `VERDICTS_BY_REASON`:

| Motivo | Vereditos admitidos |
|---|---|
| `STALLED_OPEN` | `NUDGE`, `RESTART_WITH_NOTES`, `ESCALATE`, `LEAVE` |
| `PROVIDER_ERROR_OPEN` | `NUDGE` (retomar a tarefa), `RESTART_WITH_NOTES`, `ESCALATE`, `LEAVE` |
| `NUDGE_LOOP` | `RESTART_WITH_NOTES`, `ESCALATE`, `LEAVE` |
| `SILENT_TURN` | `ESCALATE`, `LEAVE` |

**Gasto.** `agent.turn.usage` com `role: SUPERVISOR` (o `TriageUsageRecorder` vira `SmallModelUsageRecorder` com o papel como campo); `RESERVED_ROLES[SUPERVISOR] = true`.

**Executar o veredito** (`agent/usecases/ActOnSupervisorVerdict`):
- `NUDGE` com stop aberto ⇒ `thread/usecases/ApplySupervisorRetry` (irmã do `ApplyDueQuestionDefaults`) resolve com `AUTO_RETRY`. O aviso de bloqueio fecha pela política da fase 3; a retomada sai pelo `ResumeIssueOnStopResolved` com `RESUME_CLAIM_CLASS[AUTO_RETRY] = REMINDER`, payload `nudge: { ordinal: NUDGES_BEFORE_STALL, source: SUPERVISOR }` e `RESUME_TEXT[AUTO_RETRY]` = texto do empurrão 2, em AUTO. **A corrente fica limitada:** como a retomada já é o último empurrão do episódio, um turno calado depois dela vira `STALLED` direto na passada seguinte — um turno automático a mais por ação do supervisor, nunca um par novo de empurrões.
- `PROVIDER_ERROR_OPEN` + `NUDGE`: o item morto **não** é revivido (o texto dele, possivelmente um recado de pessoa, continua morto e visível na linha do tempo); a retomada diz que o trabalho parou por erro e pede para continuar de onde estava. Reviver o item é seguimento, não esta fase.
- `RESTART_WITH_NOTES` ⇒ `AgentSession.requestHandoff(at)` (coluna `agent_agent_sessions.handoff_requested_at`), depois o mesmo caminho do `NUDGE` quando há stop; **sem stop** (`NUDGE_LOOP`) ⇒ o `agent` enfileira ele mesmo o empurrão `REMINDER` com `ordinal = NUDGES_BEFORE_STALL`, `source: SUPERVISOR` (mesma porta do reconciliador). No turno seguinte: `resumeDecision` checa o pedido **antes** do orçamento de contexto e devolve `HANDOFF_REQUESTED`; `SEEDS_FROM_NOTES[HANDOFF_REQUESTED] = true` leva ao caminho de troca da fase 4 (notas da sessão, se houver, e as derivadas); `completeHandoff` limpa `handoff_requested_at`; fato `handed_off` com `reason`. Issue sem linha de sessão: não há o que trocar, o turno já é novo — o pedido é ignorado e registrado no fato do supervisor.
- `ESCALATE` ⇒ item `SUPERVISOR_REVIEWED` na linha do tempo e `escalatedAt` no cartão (console e painel). **Nenhuma mensagem nova a ninguém** (decisão do dono, 20/11): só selo e linha do tempo — o aviso de bloqueio já foi ao grupo uma vez.
- `LEAVE` ⇒ só o fato.
- Teto por issue: `SUPERVISOR_ACTIONS_PER_DAY: Record<SupervisorVerdict, number>` (`NUDGE` 2, `RESTART_WITH_NOTES` 1, `ESCALATE` 1, `LEAVE` sem teto) **e** o teto total `SUPERVISOR_MAX_ACTIONS_PER_ISSUE_PER_DAY = 3` (soma das ações agidas que geram turno — `NUDGE` e `RESTART_WITH_NOTES` — em 24 h, contadas pelos fatos `agent.supervisor.reviewed` com `acted: true`); passou de qualquer teto ⇒ `ESCALATE` uma vez, depois `LEAVE`. Com o teto, o máximo automático por issue por dia é 3 turnos do supervisor, cada um seguido no máximo de um `STALLED`.
- **Um turno automático por ação** (decisão do dono, 20/11): a retomada depois de uma ação do supervisor é contada como o último empurrão do episódio (`ordinal = NUDGES_BEFORE_STALL`); se não der em nada, a tarefa aparece como bloqueada (`STALLED`) — nunca um par novo de empurrões.

**Travas de segurança** (o supervisor age desde a instalação, então elas são parte do desenho, cada uma com teste):
- **Só três ações:** nova tentativa (`AUTO_RETRY` sobre o stop), reinício com notas (`requestHandoff`) e escalada por selo/linha do tempo. O supervisor **nunca** faz merge, publica, muda prioridade, responde decisão/pergunta/aprovação de pessoa, nem fala com ninguém (grupo, pessoa ou dono). Rail `tests/architecture/supervisor-reach.test.ts`: `ActOnSupervisorVerdict` e `SuperviseSuspectIssues` só importam as portas listadas em `SUPERVISOR_ALLOWED_PORTS` (fixture negativa com uma porta de publicação/envio).
- **Turnos dele são `REMINDER` em AUTO:** nunca passam à frente de `DECISION_ANSWER`, nunca disparam o gatilho de publicação (`PUBLISH_AUTHORIZED_BY[AUTO_RETRY] = () => false`), nunca herdam a postura de quem resolveu antes; o texto da retomada proíbe publicar, merge e o que for irreversível.
- **Toda ação registrada com o motivo:** cada veredito — agido ou não — grava `agent.supervisor.reviewed { issueId, reason, verdict, confidence?, mode, acted, fallback? }`; as ações agidas aparecem também na linha do tempo (`SUPERVISOR_REVIEWED` com `reason` e `verdict`).
- **Teto por tarefa:** `SUPERVISOR_ACTIONS_PER_DAY` e `SUPERVISOR_MAX_ACTIONS_PER_ISSUE_PER_DAY` (acima).
- **Falha fechada:** saída inválida, prazo, confiança baixa ou veredito fora de `VERDICTS_BY_REASON` ⇒ `LEAVE`; issue ou conversa pausada, espera declarada, stop de pessoa aberto e turno vivo nunca são tocados.

**Modo** — `CODM_AGENT_SUPERVISOR_MODE` (`SupervisorMode`; entrada no manifesto de env de `template.config.ts` com consumidores, `.env.example` e `ProductConfig`, como `CODM_AGENT_QUOTA_ENFORCE`), padrão **`ACT`** (decisão do dono, 20/11): `ACT` executa dentro das travas; `OBSERVE` roda o modelo e grava `acted: false` — sem linha do tempo, sem selo, nada no grupo; `OFF` não registra o job. Em qualquer modo que roda, todo veredito fica no fato `agent.supervisor.reviewed` (auditoria).

### Item 4 — números para a decisão "segunda conta ou API"

Não é código. Fica no spec e no PR; a decisão é do dono.

- **Horas paradas por limite:** ≥ 37 h/semana (fase 4, cópia de 18/11, limite inferior). Depois da instalação da fase 4, `agent.provider.limit_observed` dá o número exato.
- **Volume de uma hora de tarefa** (fixture anonimizada da fase 4, `tests/fixtures/quota/usage-2026-11.json`: 339 h, 1.327 turnos de issue, 160 horas com turno de issue): por hora ativa, ~0,15 M de saída, ~0,83 M de escrita de cache, ~36 M de leitura de cache.
- **Custo em API para cobrir as horas paradas**, em unidades de preço: com `E` = preço por milhão de tokens de entrada do modelo e as proporções de preço público usadas na fase 4 (escrita 1,25 E, leitura 0,1 E, saída 5 E), uma hora de tarefa custa ~**5,4 E**; 37 h/semana ⇒ ~**200 E por semana**. `E` depende do modelo: as sessões gravam `DEFAULT`, então o dono confere o preço do modelo que de fato roda; entre o modelo médio e o grande da tabela pública o número muda algumas vezes.
- Ressalva: supõe a intensidade média de uma hora ativa; as pausas vêm depois de horas intensas, então é provavelmente um **piso**.

## Composição com as fases 0–4

| Mecanismo existente | Como esta fase o usa |
|---|---|
| Lembrete de declaração (fase 0) | vira o empurrão 1; identidade pela coluna; o empurrão 2 é novo |
| `STALLED` como aviso de bloqueio (fase 3) | continua sendo o bloqueio visível; o supervisor só o resolve por `AUTO_RETRY` |
| Item envenenado → stop (#69) | continua sendo o "pedir alguém"; antes dele, o calendário; kind certo para login |
| Pausa do provedor, `creditAcceptedTurn`, `ReleaseIssueWorkOnResume` | causa declarada; `PROVIDER_LIMIT`/`HOLD` idênticos a hoje |
| Pausa (fase 2) | issue ou conversa pausada nunca é empurrada nem suspeita |
| Triagem no modelo pequeno (fase 2) | molde do supervisor |
| Política de saída (fase 3) | nada novo vai ao grupo; `AUTO_RETRY` fecha o aviso pela política existente |
| `claim_class`, `CLAIM_RANK`, `PUBLISH_TRIGGER` (fase 4) | empurrão e retomada do supervisor são `REMINDER` — nunca passam à frente nem disparam publicação |
| Orçamento em observação, `RESERVED_ROLES` (fase 4) | o supervisor entra na reserva; passada pulada com orçamento segurando de fato |
| Troca de sessão com notas (fase 4) | `RESTART_WITH_NOTES` só pede a troca; `SEEDS_FROM_NOTES` no lugar do `if` |

## Migrações

SQLite (uma, `0038`, `bun migrate:create` + edição à mão + `db:sync-go` **depois** da edição + `db:check-go`; nenhuma tabela nova):
- `agent_mailbox.defer_cause` text nullable, sem CHECK (coluna nova em tabela existente; o `z.enum` fecha na hidratação). **Preenchimento à mão:** adiados existentes (sem `consumed_at`, `dead_at`, `claimed_by`; `lease_until` no futuro) → `HOLD` quando a issue ou a conversa está pausada, `PROVIDER_LIMIT` no resto — a regra que os leitores aplicam hoje por junção, uma vez, na migração.
- `agent_mailbox`, à mão: lembretes antigos — `WHERE json_extract(payload,'$.declarationReminder') = 1` — recebem `claim_class = 'REMINDER'` e `payload = json_set(json_remove(payload,'$.declarationReminder'), '$.nudge', json_object('ordinal', 1, 'source', 'RECONCILER'))`. A 0037 os deixou como `STEER`; a 0.9.0 instalada roda 0037 e 0038 juntas no mesmo boot, então o filtro é pelo payload, não pela classe.
- `agent_agent_sessions.handoff_requested_at` integer nullable.
- **`issue_stops` é reconstruída.** `issue_stops_resolution_check` é `enumCheck` sobre `StopResolution`; com `AUTO_RETRY` o drizzle-kit emite `__new_issue_stops` (como a 0036 fez para `DEFAULT_APPLIED`). Revisar o SQL linha a linha: copiar só as colunas existentes, recriar os dois CHECKs e todos os índices (`stops_issue_id_idx`, `stops_thread_id_idx`, o único de `seq`, o de `due_at`), `PRAGMA foreign_keys` como na 0036. Esta é a única reconstrução; o resto é `ADD COLUMN`.
- Go: conferir no S0a que o gateway lê `agent_mailbox` e `issue_stops` por lista explícita de colunas (`query/*.sql`); sem `sqlc generate` se nenhuma coluna nova for lida.
- Teste com o `LibSqlDriver` real sobre linhas semeadas: adiado pausado → `HOLD`, não pausado → `PROVIDER_LIMIT`, não adiado → nulo; lembrete antigo (`STEER` + `declarationReminder`) → `REMINDER` + `ordinal 1`; stop com `AUTO_RETRY` grava; stops existentes preservados (contagem e índices).

Nuvem (pg, `0009`, aplicada antes do daemon): recriar `panel_issues_life_state_check` com `WAITING_RETRY`; `panel_issues.retrying_at` e `panel_issues.escalated_at` (timestamptz nullable, precedente `waiting_for_provider_until`); conferir se algum CHECK fecha `IssueTimelineItemKind` ou `StopResolution` e recriar se fechar.

Regeneração: `bun contracts` (antes das migrações — os CHECKs derivam dos enums gerados) e `bun emit-openapi && bun sdk`, commitados; `cargo check`.

## Testes

- `ReconcileStalledIssues.test.ts`: turno calado → empurrão 1; calado → empurrão 2 (mesmo `rootItemId`); calado → `STALLED` com `DETAIL_AFTER_NUDGES` e aviso de bloqueio; declarar depois do empurrão 1 encerra o episódio; recado de pessoa entre empurrões começa episódio novo; passada repetida não duplica; lembrete migrado conta como 1. **Negativos, um por linha da lista fechada do item 1, 5 passadas cada**: stop de decisão, de pergunta, de aprovação, de permissão; feedback pedido no último turno; issue pausada; **conversa pausada**; adiada por limite, por pausa, por nova tentativa; turno rodando; comando de publicação rodando.
- `reminder-identity.test.ts` (arquitetura): nenhum `declarationReminder` no `src/` (fixture negativa); `RunIssueTurn` mantém o turno `REMINDER` mudo no grupo.
- `declaredWait.test.ts`: feedback do último turno ⇒ espera; feedback de um turno anterior ⇒ não; progresso ⇒ não.
- `issueLifeState.test.ts`: `WAITING_RETRY` e precedência; `PAUSED` vence; espera declarada ⇒ `WAITING_PERSON`.
- `LibSqlMailboxRepository.defer.test.ts`: `defer` exige causa; toda escrita que limpa lease zera a causa (claim, `giveBack`, `releaseDeferred`, `releaseOrphanedClaims`, `complete`, `settleHold`, morte); soltadores respeitam `DEFER_RELEASE`.
- `LibSqlMailboxDispatcher.retry.test.ts` (relógio roteirizado): calendário ISSUE (1, 4, 15, 60 min, stop depois da 5ª) e THREAD; espera 0 = `giveBack`; login esgotado → `AUTH_REQUIRED`; exceção e teto; `spoke` não repete; `retryAfter` não gasta; `creditAcceptedTurn` e retomada da issue **não** soltam `RETRY`; recado novo solta e viaja junto **sem avançar o calendário** (três recados na mesma espera); "esperando cota" nunca para `RETRY`; fato atômico com o `fail` e sem texto de erro.
- `ProviderWait.test.ts`: verde sem a junção com `paused`.
- `SuspectIssueReader.test.ts`: cada motivo entra; cada exclusão sai; esfriamento; provedor pausado pula.
- `ModelIssueSupervisor.test.ts` (runner falso): veredito válido; inválido, prazo, baixa confiança, fora de `VERDICTS_BY_REASON` ⇒ `LEAVE`; sem ferramentas; uso `SUPERVISOR`; redação de dígitos e `@` no texto livre (sentinelas).
- `SuperviseSuspectIssues.test.ts` / `ActOnSupervisorVerdict.test.ts`: `OBSERVE` não muda nada; `OFF` não roda; `ACT` + `NUDGE` resolve `STALLED` com `AUTO_RETRY`, retomada `REMINDER` em AUTO mesmo quando o último resolvedor tinha "pode liberar", não passa à frente de `DECISION_ANSWER`, não dispara publicação; turno calado depois dela ⇒ `STALLED` direto; `RESTART_WITH_NOTES` com e sem stop ⇒ sessão nova com notas e `handed_off { reason: HANDOFF_REQUESTED }`; sem sessão ⇒ ignorado; `ESCALATE` só linha do tempo e `escalatedAt`; teto por dia; issue pausada.
- `ResolveStop`/`ExecutePanelAction`/`GetNeedsYouPanel`: `AUTO_RETRY` recusado ou não oferecido.
- `QuotaBudget.test.ts`: `SUPERVISOR` no piso da reserva.
- Arquitetura: `defer(` com causa, `recordFailure(` com classe, `POLICY_EXCEPTIONS` com a entrada nova, `context-map.test.ts` com `reads.thread`; exposição MCP inalterada.
- Migração 0038 com o driver real (acima); pg 0009 aceita `WAITING_RETRY` e as colunas.
- **Aceite** (`tests/flows/fase5-acceptance.test.ts`, test bed `integration`, dispatcher real, relógio injetado — segue o precedente do aceite da fase 4, não o `mock` que o registry de `test` sugere para fluxos, porque o critério depende do dispatcher e do reconciliador reais): (1) tarefa parada sem motivo recebe empurrão 1 e 2 e, sem reação, vira `STALLED` com aviso no grupo; (2) tarefa com decisão aberta, pergunta aberta, feedback pedido e conversa pausada não recebe empurrão em 10 passadas; (3) erro do provedor faz 5 tentativas espaçadas e só então pede alguém; (4) supervisor em `OBSERVE` não age; em `ACT` empurra o `STALLED` uma vez em AUTO.
- e2e: cartão `WAITING_RETRY` e item `NUDGED` na linha do tempo (fixture).

## Rollout

- Ordem: **nuvem antes do daemon** — pg 0009 e o `SyncPanel` que aceita `WAITING_RETRY`, `retryingAt`, `escalatedAt`; depois o daemon (SQLite 0038 no boot, testada antes numa cópia do banco real quando houver disco — a reconstrução de `issue_stops` torna esse teste obrigatório).
- Itens 1 e 2 entram **ligados**: são as regras que o objetivo aprovou; mudam quantas vezes e quando o sistema tenta antes de pedir alguém, e nada novo vai ao grupo.
- Supervisor entra em **`ACT`** (decisão do dono, 20/11), com as travas do item 3; os fatos `agent.supervisor.reviewed` são a auditoria de todo veredito. `OBSERVE` e `OFF` ficam como ajuste.
- Desligar sem build: `CODM_AGENT_SUPERVISOR_MODE=OFF` (ou `OBSERVE` para só registrar). O calendário é constante de código, como o `MAX_ATTEMPTS` de hoje.

## Como medi (antes)

**PENDENTE — medir com espaço em disco** (≥ 5 GiB livres). Cópia `sqlite3 -readonly "<banco vivo>" ".backup <dir temporário>/codm.db"`, só agregados, scripts fora do repo, apagar a cópia no fim. Janela: últimos 14 dias. Instantes em ms. Lembretes nas duas formas (payload antigo e coluna nova).

```sql
-- 1. paradas silenciosas por semana, nas duas formas (antes da fase 3: HUMAN_REQUESTED com o texto do reconciliador)
select strftime('%Y-W%W', raised_at/1000, 'unixepoch') wk, kind, count(*)
  from issue_stops
 where kind = 'STALLED'
    or (kind = 'HUMAN_REQUESTED' and (detail like 'a execução terminou sem conclusão%' or detail like 'a tarefa terminou o turno sem dizer%'))
 group by 1, 2;

-- 2. como terminam e quanto duram (mediana/p90 no script): resolução, minutos até resolver, abertas
select coalesce(resolution, 'ABERTA') res, count(*), avg((resolved_at - raised_at)/60000.0) min_avg
  from issue_stops
 where kind = 'STALLED' or (kind = 'HUMAN_REQUESTED' and (detail like 'a execução terminou sem conclusão%' or detail like 'a tarefa terminou o turno sem dizer%'))
 group by 1;
--    parada aberta cuja issue concluiu depois (terminou "sozinha")
select count(*) from issue_stops s join issue_issues i on i.id = s.issue_id
 where s.resolved_at is null and i.status = 'COMPLETED'
   and (s.kind = 'STALLED' or s.detail like 'a execução terminou sem conclusão%' or s.detail like 'a tarefa terminou o turno sem dizer%');

-- 3/4. lembretes por semana (= turnos que terminaram sem declarar e foram lembrados)
select strftime('%Y-W%W', created_at/1000, 'unixepoch') wk, count(*) from agent_mailbox
 where target_kind = 'ISSUE' and (claim_class = 'REMINDER' or json_extract(payload, '$.declarationReminder') = 1)
 group by 1;
--    o que veio depois de cada lembrete consumido (script): em até 10 min, stop de pergunta/decisão, issue.completed
--    ou parada do reconciliador — taxa "declarou depois do lembrete" × "parou"

-- 5. tentativas e envenenados por pista; categorias de erro só como contagem (nunca o texto)
select target_kind, attempts, (dead_at is not null) dead, count(*) from agent_mailbox group by 1, 2, 3;
select target_kind,
       case when last_error like '%overloaded%' or last_error like '%529%' or last_error like '%500%' then 'provedor'
            when last_error like '%login%' or last_error like '%auth%' then 'login'
            when last_error like '%abandonado%' then 'teto'
            when last_error is null then 'nenhum' else 'outro' end cat,
       (dead_at is not null) dead, count(*)
  from agent_mailbox where attempts > 1 or dead_at is not null group by 1, 2, 3;
--    (a categoria por texto é SÓ desta medição, fora do repo; o desenho classifica por tabela declarada)

-- 6. SERVER_ERROR: por resolução e tempo até resolver
select coalesce(resolution, 'ABERTA'), count(*), avg((resolved_at - raised_at)/60000.0) from issue_stops where kind = 'SERVER_ERROR' group by 1;
--    e (script) intervalo entre a última falha de um item envenenado e o próximo agent.run.completed de qualquer issue
--    — quanto tempo o provedor levou para voltar; calibra o calendário de PROVIDER_ERROR

-- 7. da parada silenciosa à resolução, por resolução (RETRY, TAKE_OVER, ANSWER) — mediana/p90 no script
-- 8. quantas issues ficariam suspeitas por regra, por dia: STALLED/SERVER_ERROR abertos > 30 min; >= 3 lembretes em 24 h
-- 9. pedidos de feedback seguidos de lembrete (o buraco do item 1)
select count(*) from shared_events f join agent_mailbox m on m.target_id = f.entity_id
 where f.name = 'agent.issue_spoke' and json_extract(f.payload, '$.level') = 'FEEDBACK'
   and (m.claim_class = 'REMINDER' or json_extract(m.payload, '$.declarationReminder') = 1) and m.created_at > f.occurred_at;
-- 10. lembretes a issues de conversa pausada (o buraco do problema 3)
select count(*) from agent_mailbox m join issue_issues i on i.id = m.target_id join threads t on t.id = i.thread_id
 where (m.claim_class = 'REMINDER' or json_extract(m.payload, '$.declarationReminder') = 1) and t.paused = 1;
-- 11. item 4: horas paradas pelo provedor (só existe depois da fase 4 instalada)
select json_extract(payload, '$.window') w, json_extract(payload, '$.status') s, count(*) from shared_events
 where name = 'agent.provider.limit_observed' group by 1, 2;
```

Fixture (item 4): `python3 -I` sobre `tests/fixtures/quota/usage-2026-11.json` — soma dos baldes por papel, horas com turno de issue, baldes por hora ativa (feito em 20/11, números no item 4).

## Riscos

- Empurrão 2 que trabalha pode fazer algo que ninguém pediu: sempre AUTO, filtro de permissão e janela de arrependimento valem, o texto proíbe publicar/merge; no pior caso é um "continue" de quem não tem "pode liberar".
- Espera de nova tentativa atrasa o aviso de erro em ~1h20 na pista de tarefas; aceito porque hoje o aviso vem em segundos e a resolução em ~17 h.
- Feedback pedido vira espera sem prazo (decisão do dono, 20/11): nunca empurrada nem bloqueada por esperar pessoa.
- Reconstrução de `issue_stops` na 0038: risco de perder linha ou índice; mitigado pelo teste com o driver real e pela cópia do banco real antes do PR.
- Supervisor errado agindo desde a instalação (sem semana de observação, decisão do dono): só três ações reversíveis, vereditos fechados por motivo, sem texto livre, teto por issue, falha fechada em `LEAVE`, todo veredito registrado; `OFF`/`OBSERVE` sem build.

## Fora de escopo

- Lembrete escalonado para quem deve responder (brainstorm §5 C2) — fala com pessoas.
- Matar ou reiniciar um turno vivo pelo supervisor (`SILENT_TURN`).
- Reviver o item envenenado (o supervisor retoma a tarefa, não o item).
- Batimento declarado pela tarefa (C3) como suspeita.
- Segunda conta ou API: só os números (item 4).

## Decisões do dono (20/11, finais)

Substituem as perguntas abertas deste spec; não reabrir.

1. **Supervisor age desde a instalação** (`ACT` por padrão), com nova tentativa (`AUTO_RETRY`), reinício com notas e escalada — sem semana de observação. O modo continua ajustável (`OFF`/`OBSERVE`); o registro de todo veredito (`agent.supervisor.reviewed`) fica como auditoria.
2. **Escalar não fala com ninguém novo:** selo no cartão e linha do tempo; o aviso de bloqueio já foi ao grupo uma vez.
3. **Turno vivo mudo nunca é parado pelo supervisor:** o vigia de inatividade continua sendo o único que mata; o supervisor só sinaliza.
4. **Feedback sem resposta espera sem prazo:** nunca empurrado nem bloqueado por esperar pessoa.
5. **Um turno automático por ação do supervisor**, contado como o último empurrão; sem efeito, a tarefa aparece como bloqueada.
6. **Segunda conta ou API: ainda não** — remedir depois da semana de observação do orçamento da fase 4.

## Revisão (skill `spec-review`, 2026-11-20)

Passada independente (agente sem o contexto do autor, protocolo da skill: `CLAUDE.md`, buscas dirigidas em `docs/BACKEND.md`, registries de `migrate`, `bounded-context` e `test/typescript`, `composition/policy.ts`, migrações 0036/0037, código). Veredito: **não pronto** — 1 crítico, 10 moderados, 6 baixos. Os achados principais foram conferidos à mão no código antes de aplicar (ausência de soltura no boot e de sonda nesta linha; 0037 classificando lembretes como `STEER`; `ReleaseIssueWorkOnResume` soltando todo adiado; retomada enfileirada como `DECISION_ANSWER`). Todos aplicados:
- **Crítico — `AUTO_RETRY` força reconstruir `issue_stops`** (CHECK de `StopResolution`): a 0038 declara a reconstrução, com revisão linha a linha e teste.
- `DEFER_RELEASE` reescrito sobre os soltadores reais (`creditAcceptedTurn`, `ReleaseIssueWorkOnResume`, item novo; sem boot nem sonda, que não existem nesta linha); espera 0 = `giveBack`; toda escrita que limpa lease zera a causa; soltura por recado devolve a tentativa.
- Lembretes antigos são `STEER` na 0037: a 0038 converte pelo payload; os seis leitores passam à coluna, com rail.
- Retomada do supervisor como `DECISION_ANSWER` passaria à frente e no gatilho de publicação: `RESUME_CLAIM_CLASS` (`AUTO_RETRY → REMINDER`) e as tabelas que faltavam (`PUBLISH_AUTHORIZED_BY`, `OFFERED_ON_PANEL`, `ANSWER_ECHO`, `resolutionIsPrimary`, `ROW_DETAIL_*`); caminho do `BoardBulletin` corrigido.
- Arestas declaradas: entrada em `POLICY_EXCEPTIONS`, `reads.thread`, porta `IssueTimelineReader`.
- Pausa da conversa não era excluída: exclusão pelo `IssueHold` e teste.
- Espera por feedback lida dos fatos do próprio `agent` (sem coluna nem handler, sem corrida com o outbox).
- `RESTART_WITH_NOTES`: `SEEDS_FROM_NOTES` no lugar do `if`, ordem no `resumeDecision`, limpeza do pedido, caso sem sessão, `reason` no `handed_off`.
- Corrente do supervisor limitada (retomada = último empurrão); restart sem stop definido; nota do modelo removida da saída (texto de modelo não entra em turno AUTO).
- `retryingAt`/`escalatedAt` com DTO, `SyncPanel`, colunas pg e regeneração.
- Baixos: fato da tentativa atômico com o `fail`; env no manifesto e `ProductConfig`; `PROVIDER_ERROR_OPEN` não revive o item (escrito); redação de texto livre; desvio do aceite em `integration` registrado; `NUDGED` substitui o item `STEER` do lembrete.
- Nenhum achado rejeitado. Pergunta aberta da revisão que virou pergunta ao dono: a 5 (turnos depois de uma ação do supervisor) — decidida em 20/11 (um turno). As demais foram respondidas no desenho (retomada não solta `RETRY`; Go conferido no S0a). Assumido e a conferir no S3: `RequestFeedback` chamado pela execução de outra issue (`actingIssueId` diferente) não deveria contar como espera declarada desta — o `DeclaredWaitReader` filtra pelo `entity_id` do fato.
