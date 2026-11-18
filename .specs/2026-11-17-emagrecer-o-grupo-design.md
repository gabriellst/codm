# Fase 3 — emagrecer o grupo

Status: Reviewed (fase 3 do plano "tarefas visíveis, controláveis e que não se perdem")
Data: 2026-11-17
Depende de: `2026-11-12-fase-0-tarefas-visiveis-design.md` (chave curta, `issueId` nas mensagens, lembrete de declaração), `2026-11-13-painel-na-nuvem-design.md` (link do painel por grupo), `2026-11-16-falar-e-parar-na-hora-design.md` (camada de regra, triagem, pausa, ações pelo painel).

## Problema (medido)

**Fonte.** Cópia somente leitura do banco de uma instalação real, 14 dias completos (02/11 a 15/11, fuso −03). A instalação roda a versão **anterior às fases 0–2** (0% das entradas com `issue_id`, `first_claimed_at` vazio), então este é o "antes" de tudo o que o plano construiu. Só agregados; o grupo mais ativo é o **grupo A**. Comandos em "Como medi".

| Métrica | Valor |
|---|---|
| Mensagens do agente, todos os grupos (SYSTEM + DIRECT) | 5.636 em 14 dias |
| Mensagens do agente no grupo A | 3.701 (264/dia; dias entre 33 e 610; pico de 103 numa hora) |
| Mensagens do agente nos demais grupos | B 971 (69/dia), C 821 (59/dia), D 112 (8/dia), E 17, F 14 |
| Pedidos de "relatório" (todos os grupos) | 134–145 em 14 dias (~67–72/semana; 98 no grupo A). 134 são mensagens curtas (< 40 caracteres), ou seja, o comando; 145 é qualquer menção |
| Turnos do orquestrador acordados por `ISSUE_RESULT` | 1.357 de 3.137 (43%) em todos os grupos; 889 de 2.014 (44%) no grupo A |
| Turnos acordados por pessoas | 1.755 (`OPERATOR_MESSAGE` sem `via`) + 25 por loop agendado |
| `ISSUE_RESULT` por issue | 1.357 resultados de 196 issues (~6,9 por issue), contra 181 conclusões. **Todo** resultado tem `outcome.kind = COMPLETED`: é fim de turno, não fechamento |
| Mensagens do agente por issue (limite inferior) | mediana 8, p90 51, máx. 133 (196 issues) |

**Do que é feita a fala do agente no grupo A (3.701):**

| Tipo | Qtde | % | Como foi atribuído |
|---|---|---|---|
| Artefatos (prints, vídeos, links) | 1.556 | 42% | entrada com `artifact_id`; 1.496 registrados por issue |
| Respostas do orquestrador a resultado de issue | 889 | 24% | resposta atribuída ao item THREAD consumido logo depois dela (aproximado) |
| Respostas do orquestrador a pessoas | 1.119 | 30% | idem |
| Avisos de stop | 57 | 1,5% | texto começa com o título de `STOP_TITLES_PT` |
| Avisos de limite do provedor | 34 | 0,9% | texto do `providerPausedNotice` |
| Mensagens diretas (`DIRECT`) | 46 | 1,2% | origem (operador ou issue) não registrada nesta versão |

- **Rajadas de artefatos:** 991 dos 1.496 artefatos de issue (66%) saíram menos de 2 min depois do artefato anterior da mesma issue. Mediana de 8 artefatos por issue que mandou algum, p90 48.
- **Respostas a resultados (889):** 334 têm `?` (pedem algo), 258 falam "no ar", 103 pedem "posso publicar?", 21 são "sem novidade/ainda trabalhando". Contagem por palavra-chave, sobreposta e aproximada.
- **Paradas pedindo gente (tempo até FECHAR, não até a primeira resposta; inclui as paradas do reconciliador):** `HUMAN_REQUESTED` 373, mediana 58 min, p90 ~33 h, só 29% fechadas em até 15 min. `APPROVAL_NEEDED` 250, mediana 25 min, p90 ~5,6 h, 43% em até 15 min. Hoje `HUMAN_REQUESTED`/`APPROVAL_NEEDED` **não** avisam o grupo por conta própria (`NOTIFIES_ON_CHANNEL`): chegam só pela resposta do orquestrador ao `ISSUE_RESULT`.

**O que não dá para derivar:** a fração "progresso" das respostas a pessoas (só lendo texto); de qual issue veio cada `DIRECT`; quanto da fala é "recibo de criação" (o orquestrador o compõe livremente). A métrica "por issue" é um limite inferior: conta só artefatos e respostas a resultados, dentro da janela, de issues com pelo menos uma mensagem.

**Leitura.** Artefatos (42%) e respostas a resultados (24%) são dois terços da fala e são exatamente o que esta fase tira do grupo. As ~1.119 respostas a pessoas ficam por decisão do dono, então a meta do brainstorm (600–900 mensagens em 14 dias) **não** é alcançável só com esta fase; a meta verificável é por tarefa (critério abaixo). Avisos de bloqueio são ~2,5%, e o item "um por causa" fica mínimo.

## Decisões do dono (não reabrir)

- Grupo enxuto, não mudo: decisão, pergunta e pedido de feedback continuam no grupo, curtos, com níveis (§6.1). Resposta a quem falou com o agente continua no grupo.
- Pergunta de nível 2 espera **15 minutos** e segue com o padrão declarado.
- Aprovar pelo painel vale igual ao "pode publicar" no grupo.
- Eco de ação pelo painel: uma linha no grupo (fase 2, 6b), sem mudança aqui.

**Critério de aceite (objetivo):** no dev, uma tarefa típica (pedido → prévia → aprovação → no ar) gera no grupo no máximo recibo, feedback, decisão e fechamento; progresso não vai ao grupo; pergunta de nível 2 segue sozinha após 15 min; `relatorio` responde sem turno de modelo.

## Desenho

### Vocabulário (contrato primeiro, TypeSpec)

Enums novos em `packages/contracts/src/wire/enums/`:
- `IssueSignalLevel` — `DECISION`, `QUESTION`, `FEEDBACK`, `CLOSING`, `BLOCK_NOTICE`, `PROGRESS`. Nível de algo que uma issue quer dizer (§6.1).
- `GroupOutputMode` — `DECISIONS_ONLY`, `DECISIONS_AND_LIVE`, `EVERYTHING`. Modo do grupo (D5).
- `OutputRouting` — `GROUP`, `DIGEST`, `PANEL`. Para onde a política mandou: mensagem própria no grupo, junto com outras da mesma pessoa, ou só a linha do tempo/painel.
- `AskEffect` — `PUBLISH`, `IRREVERSIBLE`, `CLIENT_DATA`. O que a resposta a uma pergunta autoriza; qualquer efeito escala para `DECISION`.
- `BlockCause` — `PROVIDER_LIMIT`, `PROVIDER_ERROR`, `CLI_LOGIN`, `STALLED`, `CLASSIFICATION`. A chave do "um aviso por causa".

Enums existentes que crescem:
- `StopKind` += `DECISION_REQUESTED`, `QUESTION_ASKED`, `STALLED`. O último separa a parada "nem depois do lembrete" (`ReconcileStalledIssues`, hoje gravada como `HUMAN_REQUESTED`, o mesmo kind do `AskOperator`) de um pedido de verdade: sem ele, as tabelas por kind não distinguiriam um aviso de bloqueio de uma decisão. Resoluções de `STALLED`: `RETRY` (empurra a sessão), `TAKE_OVER`.
- `StopResolution` += `ANSWER` (alguém respondeu: uma opção ou texto), `DEFAULT_APPLIED` (o prazo venceu e a issue seguiu com o padrão).
- `IssueTimelineItemKind`: o item `MESSAGE` ganha `level` e `routing`; `STOP_RAISED` ganha `code` (`D1`), `question`, `options`, `dueAt`; `STOP_RESOLVED` ganha `answer`. Nenhum kind novo.
- `IssueControlSource` (já tem `WHATSAPP`/`CONSOLE`/`PANEL`): sem mudança.

Eventos (`packages/contracts/src/wire/events/`):
- **Novo** `integration.thread.issue_signal` — `{ issueId, threadId, level: FEEDBACK|PROGRESS, text, artifactIds: uuid[], mainArtifactId?, addresseeId? }`. Fala espontânea de uma issue que não é stop nem conclusão. Produzido só pelo `agent` (ferramentas `RequestFeedback`/`ReportProgress` e fim de turno), pela ponte `PublishAgentIntegrationEvents`, a mesma forma de `stop_raised`; consumido pelo `thread`. Os artefatos vão por id: o `thread` lê a linha do artefato pela leitura `reads.artifact` já declarada (caminho, tipo, mime) e entrega pelo `thread/services/ArtifactDelivery` que já existe — sem descritor duplicado no evento e sem aresta nova `thread → artifact`.
- `integration.thread.stop_raised` ganha `ask?: { question, options: {id,label}[], default?: AskDefault, effects: AskEffect[], addresseeId? }` (opcional: os stops de transporte não têm). Contrato de fase 0 estendido por campo opcional, sem quebrar o Go.
- `integration.issue.completed` (existe, já tem `summary`) passa a ter um consumidor no `thread`: é dele que sai o fechamento (abaixo).

Schemas compartilhados (`shared/schemas`):
- `StopAskSchema` — `question`, `options`, `default?`, `effects`, `addresseeId?`. `default` é união discriminada OBRIGATÓRIA para pergunta: `AskDefault = OPTION { optionId } | TEXT { text }` (Non-Negotiable 3: nada de `defaultOptionId | defaultText` opcionais com `refine`).
- `AskAnswerSchema` — a resposta de uma PESSOA: `OPTION { optionId } | TEXT { text }`. É o que o painel (`ANSWER_ASK`) e o console (`POST /stops/:stopId/answer`) aceitam.
- `StopAnswerSchema` — o registro no stop: `AskAnswer | DEFAULT { default: AskDefault }`. `DEFAULT` só o job escreve; nenhuma rota o aceita.
- `IssueSignalSchema` é payload de evento e NÃO entra no `registerSchemas`. `StopAskSchema`/`AskAnswerSchema` entram (cruzam o fio no painel e no console); nenhum carrega invariante sensível.

### Quem é dono: contexto `thread`

O `thread` já é dono do canal, do transcript, da entrega (`deliver_channel_message`/`_attachment`), dos stops (filho do agregado `Thread`) e das configurações do grupo. A política de saída é **regra do grupo** (modo, pessoas, link), então mora nele:
- `thread/utils/OutputPolicy.ts` — tabelas totais (nenhum `if` sobre nível):
  - `ROUTING_BY_MODE: Record<GroupOutputMode, Record<IssueSignalLevel, OutputRouting>>`;
  - `LEVEL_OF_STOP: Record<StopKind, IssueSignalLevel>` (substitui `NOTIFIES_ON_CHANNEL`, importado hoje por `thread/usecases/RaiseStop.ts` e `agent/usecases/RunIssueTurn.ts` — os dois mudam);
  - `CAUSE_OF_STOP: Record<StopKind, BlockCause | null>` (total: `SERVER_ERROR → PROVIDER_ERROR`, `AUTH_REQUIRED → CLI_LOGIN`, `STALLED → STALLED`, `BLOCKED_BY_CLASSIFICATION → CLASSIFICATION`, os pedidos → `null`). `PROVIDER_LIMIT` não é stop: continua no `NotifyProviderPaused`, que já é um aviso por pausa, e só passa a consultar `ROUTING_BY_MODE[mode][BLOCK_NOTICE]`.
- A escalada por efeito (§6.1: publicar ou dado de cliente sobe para Decisão) tem UM dono: o objeto de valor `StopAsk` — `Thread.raiseStop` deriva o kind (`effects` não vazio ⇒ `DECISION_REQUESTED`, sem prazo). A política só roteia o kind que recebe.
- `thread/usecases/DeliverIssueSignal.ts` — aplica a política: grava a entrada no transcript (com `issueId`, `level`, `routing`), e enfileira a entrega quando `GROUP`, ou o agrupamento quando `DIGEST`. Formatação por nível em `thread/i18n/messages.ts` (`signalFormat: Record<IssueSignalLevel, …>`).
- `thread/handlers/external.ts` — `RouteIssueSignal` (`integration.thread.issue_signal`) e `CloseIssueOnChannel` (`integration.issue.completed`) → `DeliverIssueSignal`. `RecordStopFromExecution` (existente) → `RaiseStop`, que passa a perguntar à política em vez de `NOTIFIES_ON_CHANNEL`.

Por que não um contexto novo: ele teria de ler roster, modo, canal e stops do `thread` e escrever no transcript dele — tudo superfície do `thread`. Por que não no `agent`: a política vale também para o `artifact` e para avisos do próprio `thread` (limite do provedor).

### Tabela de roteamento: todo caminho de saída de hoje

Todo caminho pelo qual uma issue chega ao canal hoje (mapeado no código) tem nível e destino. Caminho fora desta tabela é vazamento, e o teste `OutputPolicy.coverage.test.ts` falha se um produtor de `deliver_channel_message` com `issueId` não passar pela política.

| Caminho hoje | Arquivo | Passa a ser | Nível |
|---|---|---|---|
| Fim de turno da issue → `ISSUE_RESULT` → turno do orquestrador → resposta | `RunIssueTurn.enqueueResult`, `RunOrchestratorTurn`, `RecordOrchestratorReply` | `issue_signal` com o texto do turno (sem orquestrador) | `PROGRESS` |
| Conclusão declarada (`TransitionIssueStatus COMPLETED`) | `DeclareIssueComplete` → `integration.issue.completed` | consumida pelo `thread` (`CloseIssueOnChannel`) | `CLOSING` |
| `SendDirectMessage` chamado pelo run de uma issue | `thread/usecases/SendDirectMessage.ts` | ferramenta sai do escopo da issue; a issue usa `ReportProgress` | `PROGRESS` |
| `SendArtifact` chamado pelo run de uma issue (mídia e LINK) | `artifact/usecases/SendArtifact.ts`, `ArtifactDelivery.ts` | ferramenta sai do escopo da issue; a issue registra (`RecordArtifact`, linha do tempo) e cita o artefato em `RequestFeedback` ou na conclusão | `PROGRESS` (registro); `FEEDBACK`/`CLOSING` quando citado |
| `RaiseStop` (ferramenta) `APPROVAL_NEEDED` | `agent/usecases/DeclareStop.ts` → `thread/usecases/RaiseStop.ts` | stop com `ask` | `DECISION` |
| `AskOperator` / `TransitionIssueStatus NEEDS_INPUT` (`HUMAN_REQUESTED`) | `agent/usecases/AskOperator.ts`, `DeclareIssueComplete.ts` | stop com `ask` sem opções | `DECISION` |
| Stop de transporte (`SERVER_ERROR`, `AUTH_REQUIRED`) e item envenenado | `RunIssueTurn.persistOutcome`, `LibSqlMailboxDispatcher` | aviso por causa | `BLOCK_NOTICE` (`PROVIDER_ERROR`, `CLI_LOGIN`) |
| `PERMISSION_DENIED` | runner → `RaiseStop` | pede aprovação | `DECISION` (efeito `IRREVERSIBLE`) |
| `BLOCKED_BY_CLASSIFICATION` | `RaiseStop` | aviso | `BLOCK_NOTICE` (`CLASSIFICATION`, um por issue: a causa é a mensagem) |
| Parada "nem depois do lembrete" | `ReconcileStalledIssues` (passa a gravar `StopKind.STALLED`) | aviso por causa | `BLOCK_NOTICE` (`STALLED`) |
| Limite do provedor | `NotifyProviderPaused` | sem mudança de forma (já é um por pausa); passa pela tabela | `BLOCK_NOTICE` (`PROVIDER_LIMIT`) |

**Fora da política (continuam como estão), porque não são fala espontânea de issue:** respostas do orquestrador a pessoas (inclui o recibo de criação "Abri APP-12 …"), stops do próprio orquestrador (sem issue), DM do código do painel, eco de ação pelo painel, reações 👀/☑️/✅/⏸️, `SendDirectMessage` e `SendArtifact` do operador pelo console e do orquestrador (inclusive quando o orquestrador manda um artefato de uma issue: é a voz dele respondendo a alguém).

**Gate de vazamento.** `tests/architecture/channel-producers.test.ts`: lista DECLARADA dos produtores de `deliver_channel_message`/`deliver_channel_attachment` (hoje 7 arquivos: `RecordOrchestratorReply`, `RaiseStop`, `SendDirectMessage`, `NotifyProviderPaused`, `ExecutePanelAction`, `ArtifactDelivery`, `DeliverChannelAttachment`), cada um com o motivo (política / voz do orquestrador / operador / eco); um produtor novo fora da lista falha, com fixture negativa.

**Seleção por propriedade declarada, não por `if` de identidade.** O escopo MCP `ISSUE_HANDLING` deixa de expor `SendDirectMessage` e `SendArtifact` (cada controller declara `static mcpScopes`; a issue perde as duas, o orquestrador mantém). A issue ganha `AskDecision`, `AskQuestion`, `RequestFeedback`, `ReportProgress` e mantém `RecordArtifact`. O snapshot `agent/mcp/__snapshots__/exposure.test.ts.snap` muda e é o gate. Efeito colateral bom: some o bug em que `SendDirectMessage` de uma issue saía com `author: HUMAN` e voltava como mensagem recebida.

### Matriz nível × modo (decidida — ver nota)

> **Decidido pelo dono (18/11):** padrão `DECISIONS_AND_LIVE` para grupos existentes e novos; `DECISIONS_ONLY` mantém as perguntas no grupo; `EVERYTHING` leva o progresso ao grupo; sem trava dura (a janela de arrependimento segue como rede); decisão sem efeito e pergunta podem ser respondidas por qualquer participante que pode agir (`Thread.mayAct`); sem modo "legado" no rollout (o modo `EVERYTHING` é o caminho de volta por grupo). Galeria: depende do R2, ainda não habilitado — FEEDBACK manda só o print principal até lá.


| Nível | `DECISIONS_ONLY` | `DECISIONS_AND_LIVE` (padrão proposto) | `EVERYTHING` |
|---|---|---|---|
| DECISION | GROUP | GROUP | GROUP |
| QUESTION | DIGEST | DIGEST | DIGEST |
| FEEDBACK | PANEL | DIGEST | DIGEST |
| CLOSING | PANEL | GROUP | GROUP |
| BLOCK_NOTICE | GROUP (1 por causa) | GROUP (1 por causa) | GROUP (1 por causa) |
| PROGRESS | PANEL | PANEL | GROUP |

PERGUNTAR AO DONO: (a) "só decisões" mantém as perguntas no grupo? A proposta mantém (uma pergunta escondida seguiria com o padrão sem ninguém ver, o que contraria "grupo não mudo"); (b) `EVERYTHING` leva progresso ao grupo (perto do comportamento de hoje, sem a reescrita do orquestrador)?; (c) o padrão para grupos existentes e novos (proposta: `DECISIONS_AND_LIVE`, que é o que o critério de aceite descreve).

### Item 1 — níveis e ferramentas da issue

Ferramentas MCP novas no `agent` (controllers em `agent/controllers/`, `static mcpScopes = [ISSUE_HANDLING]`, use cases em `agent/usecases/`, input schemas de controller compondo `StopAskSchema`/`IssueSignalSchema`):
- `AskDecision { question, options[2..6] {id,label}, effects: AskEffect[], addressee? }` → stop `DECISION_REQUESTED`. Trava a issue (NEEDS_INPUT, como hoje).
- `AskQuestion { question, options?, default: AskDefault, effects: AskEffect[], addressee? }` → stop `QUESTION_ASKED` com prazo. `default` é obrigatório pelo schema (pergunta sem padrão não existe). `effects` não vazio ⇒ `Thread.raiseStop` grava `DECISION_REQUESTED` sem prazo (escalada) e a ferramenta devolve à sessão "virou decisão: espere a resposta".
- `RequestFeedback { text, mainArtifactId, artifactIds[] }` → `issue_signal` FEEDBACK. **Não** é stop (não trava; §6.1). O use case confere, antes de emitir, o que o `SendArtifact` confere hoje (`artifact/usecases/SendArtifact.ts:48`: artefato desta issue, enviável), para a recusa continuar síncrona para a sessão.
- `ReportProgress { text }` → `issue_signal` PROGRESS (linha do tempo).
- `AskOperator`, `RaiseStop` e `TransitionIssueStatus NEEDS_INPUT` ficam como aliases compatíveis (sessões em curso os chamam) e passam a levantar `DECISION_REQUESTED`: `AskOperator`/`NEEDS_INPUT` sem opções (a resposta é `TEXT`); `RaiseStop APPROVAL_NEEDED` com as opções sim/não e efeito `IRREVERSIBLE`; `RaiseStop HUMAN_REQUESTED` como `AskOperator`. `HUMAN_REQUESTED`/`APPROVAL_NEEDED` deixam de ser levantados por ferramenta e ficam no contrato para o histórico (não admitem `ANSWER`). `PERMISSION_DENIED` (do runner) continua com seu kind e `APPROVE`/`DENY`; as regras de resposta traduzem sim/não para `APPROVE`/`DENY` por tabela (`YES_NO_RESOLUTION`) nesse kind.
- `TransitionIssueStatus COMPLETED` já tem `summary` (até 4000, `DeclareIssueComplete.ts:20`; não muda — apertar o limite quebraria sessões em curso) e ganha `finalArtifactId?`. A mensagem de fechamento corta o resumo na formatação.
- Prompt da issue (`IssueWorkAgent`): quando usar cada ferramenta, que o texto livre do turno vai só para o painel, e que `effects` deve ser declarado sempre que a resposta autoriza publicar, uma ação irreversível ou mexer em dado de cliente.

**"Dado de cliente" é declarado, não inferido.** O efeito vem da ferramenta (campo obrigatório, pode ser vazio). Um modelo pode declarar menos do que devia; a rede de proteção que já existe é a janela de arrependimento (fase 2, item 3) nas ações irreversíveis reconhecidas. PERGUNTAR AO DONO: quer uma trava dura — "ação irreversível só roda se a issue tem uma decisão aprovada" — mesmo que isso mude o comportamento de tarefas que hoje publicam sem pedir?

### Decisões e perguntas: reaproveitar o stop, não um agregado novo

Pergunta de modelagem (CLAUDE.md, "question every aggregate"), por nível:
- **Decisão:** tem identidade, ciclo (aberta → respondida), invariante (quem pode responder, quais respostas valem), trava a issue, é respondida pelo painel e retoma a sessão com a resposta. O `Stop` (filho de `Thread`) já faz **tudo isso**: `raiseStop`/`resolveStop`, `RESOLUTIONS_BY_KIND`, `ResumeIssueOnStopResolved` (steer com a resposta), `MarkIssueNeedsInputFromStop`, item `STOP_RAISED/RESOLVED` na linha do tempo, `ANSWER_STOP` no painel, `GetNeedsYouPanel`. Um agregado `Decision` duplicaria esse ciclo e precisaria se manter em sincronia com o stop que trava a issue. ⇒ **reaproveitar**: kind `DECISION_REQUESTED` + objeto de valor `StopAsk`.
- **Pergunta:** é uma decisão com padrão e prazo. ⇒ mesmo stop, kind `QUESTION_ASKED`, `dueAt`.
- **Feedback:** não trava e não exige resposta. Um stop marcaria NEEDS_INPUT. ⇒ **não é stop**: é um sinal (entrada de transcript com nível); uma resposta citando o print vai à issue pelo roteador da fase 2.
- **Fechamento, aviso, progresso:** fatos. ⇒ sinal; sem agregado, sem tabela própria.

O que o stop ganha (`thread/entities/Thread.ts`, `StopSchema`):
- `ask?: StopAsk` — `seq` (número da pergunta **por issue**, dá o código `APP-12 · D1`), `question`, `options`, `default?`, `effects`, `addresseeId`, `dueAt`, `askEntryId` (a mensagem do grupo que fez a pergunta). O `seq` não vem do agregado (o `Thread` não carrega os stops de outras issues): `RaiseStop` lê `max(seq)+1` da issue na transação e o índice único `(issue_id, seq)` barra a corrida.
- `answer?: StopAnswer` e `answeredBy?`.
- `resolveStop` aceita `ANSWER` com `AskAnswer` (opção existente ou texto) e `DEFAULT_APPLIED` só quando `now ≥ dueAt`. Erros de domínio novos: `ASK_OPTION_UNKNOWN`, `ASK_NOT_DUE`, `ASK_ANSWER_REQUIRED`.
- **A pergunta trava a issue até a resposta ou o prazo** (`MarkIssueNeedsInputFromStop` é incondicional): é o "trava só até o prazo" do §6.1. Ao aplicar o padrão, a retomada reabre a issue como qualquer resolução.

**A primeira resolução ganha — de verdade.** Hoje não há essa garantia: `LibSqlThreadRepository.save` faz upsert sem `WHERE version`, a resolução é um `UPDATE … WHERE id` incondicional (`LibSqlThreadRepository.ts:123-125`) e `ResolveStop` lê o stop com `findStop` fora da transação. Correção (pré-requisito de tudo que resolve por regra ou por prazo): o `UPDATE` passa a ser `WHERE id = ? AND resolved_at IS NULL`, o repositório confere as linhas afetadas e zero vira `STOP_ALREADY_RESOLVED` (desfaz a transação inteira, então a entrada/eco/steer do perdedor não ficam); `ResolveStop` lê o stop dentro da transação. Teste de corrida no repositório.

**A resposta chega à sessão.** `ResumeIssueOnStopResolved` hoje (a) só leva a `resolution` no texto ("ANSWER" não diz nada) e (b) volta cedo quando a issue já tem trabalho pendente (`hasPending`). Para `ANSWER`/`DEFAULT_APPLIED`: o texto leva a pergunta, o código e a resposta (ou "ninguém respondeu em 15 min: siga com <padrão>"), e o steer é enfileirado SEMPRE (`dedupKey resume:<stopId>`), mesmo com item pendente — uma resposta engolida porque havia outro recado na fila é o pior desfecho aqui. Para os kinds antigos, o comportamento atual fica.

Custo de reaproveitar (todas as tabelas totais sobre os enums precisam do valor novo — o compilador aponta cada uma):
- `RESOLUTIONS_BY_KIND` (`DECISION_REQUESTED: [ANSWER, TAKE_OVER]`, `QUESTION_ASKED: [ANSWER, DEFAULT_APPLIED, TAKE_OVER]`, `STALLED: [RETRY, TAKE_OVER]`), `RESUMES_WITH_RESOLVER_POSTURE` (`ANSWER: true` — a postura é a de quem respondeu, e só quem pode liberar responde decisão com efeito; `DEFAULT_APPLIED: false`), `OFFERED_ON_PANEL` (`ANSWER` sim, `DEFAULT_APPLIED` não), `NOTIFIES_ON_CHANNEL` (substituído por `LEVEL_OF_STOP` em `RaiseStop.ts` e `RunIssueTurn.ts`), `STOP_TITLES_PT/EN`, `POLICY_KEY` em `RaiseStop.ts`.
- SQLite: `issue_stops` com CHECK de `kind` e `resolution` → reconstrução da tabela na migração; espelho Go (`db:sync-go`, `db:check-go`); o gateway Go não lê `issue_stops`, mas gera os enums.
- Nuvem: `panel_groups.open_stops` (jsonb) passa a levar `code`, `question`, `options`; o servidor valida o snapshot com o schema compartilhado ⇒ **deploy da nuvem antes do daemon**, como nas fases 1–2.
- Snapshot de exposição MCP e os testes de `RESOLUTIONS_BY_KIND`.

### Item 3 — responder: citação, painel e "sim" ambíguo

**Vínculo mensagem↔decisão.** A mensagem que a política manda para uma pergunta grava `stop_id` na entrada do transcript (coluna nova) e o stop guarda `askEntryId`. Num resumo agrupado (DIGEST), cada pergunta tem a própria entrada (só-registro) que aponta para a entrada do resumo por `digest_entry_id`; a regra de citação acha as perguntas do resumo por esse ponteiro. Nenhuma tabela nova.

**Regras novas no `RuleRouter` (camada sem modelo), em ordem, antes das da fase 2 E antes das palavras de controle** (hoje `control()` roda antes do roteador, `IngestChannelMessage.ts:153-161`; "segue" citando uma pergunta é resposta, não RESUME). As regras de resposta valem sob `Thread.mayAct` sem a janela de frescor do `canInvoke`: a resposta está amarrada a uma pergunta aberta específica, então uma mensagem recebida durante uma queda do daemon e ingerida na volta ainda responde — é isso que dá sentido à carência do item 1b.
1. **Citação de uma mensagem de pergunta** com stop aberto → resolve aquele stop. A resposta é lida por `parseAskAnswer` (`thread/utils/askAnswer.ts`, mesmo estilo de `controlCommand.ts`): número ou rótulo de opção, palavras de sim/não (tabela `BARE_ANSWERS`, caixa e acento ignorados) quando as opções são sim/não; qualquer outro texto ⇒ `TEXT`. Citação de um resumo com várias perguntas ⇒ precisa do código no texto (`D2 sim`); sem código ⇒ a pergunta de desambiguação abaixo.
2. **Código no texto** (`APP-12 D1 sim`, `D1 sim` citando mensagem da issue) → resolve aquele stop.
3. **Resposta solta** (mensagem inteira é uma palavra de `BARE_ANSWERS`, sem citação nem código), com perguntas abertas no grupo que ESTA pessoa pode responder. Esta regra exige `canInvoke` INTEIRO (portão de menção e frescor): num grupo com portão, um "sim" não endereçado entre duas pessoas não pode aprovar uma publicação. Só as regras 1, 2 e 4 (citação/código, que apontam uma pergunta específica) dispensam a janela de frescor. `BARE_ANSWERS` e `CONTROL_WORDS` são disjuntos (teste de tabela), então "pare"/"segue" soltos continuam sendo comando:
   - nenhuma → caminho de sempre;
   - exatamente uma com opções sim/não → resolve;
   - mais de uma → **uma** mensagem: "sim para qual? APP-12 · D1 (…) ou APP-15 · D2 (…) — responda citando." Fato `thread.answer_disambiguation_asked` com a pessoa; uma segunda resposta solta da mesma pessoa em 10 min não gera outra pergunta e vai ao orquestrador.
4. Citação de pergunta já resolvida (resposta atrasada) → vira STEER da issue ("resposta depois do prazo: …"), como a citação de mensagem de issue da fase 2.

**Quem pode responder.** Decisão com `effects` (publicar, irreversível, dado de cliente) e `PERMISSION_DENIED`: só quem pode liberar (`Thread.postureOf = BYPASS`), a mesma régua do `APPROVE` de hoje. Decisão sem efeito e pergunta: qualquer participante que pode agir (`Thread.mayAct`). Quem não pode ⇒ a mensagem segue o caminho de sempre (o orquestrador responde) e a decisão continua aberta. PERGUNTAR AO DONO: confirmar a régua para decisões e perguntas sem efeito.

**Ordem com a fase 2.** As regras 1–3 vêm antes da citação de issue: uma citação de pergunta é mais específica que uma citação de issue. Uma issue esperando alguém hoje vai ao orquestrador (fase 2); com uma pergunta aberta citada, a regra 1 resolve antes. A triagem nunca vê mensagem resolvida por regra; o piso "stop aberto bloqueia `NO_ACTION`" continua.

**Idempotência.** A resolução pela regra, pelo painel, pelo orquestrador (`ResolveStop` via MCP) e pelo prazo passam todas por `Thread.resolveStop` + o `UPDATE` condicional descrito acima: a primeira ganha, as outras recebem `STOP_ALREADY_RESOLVED` e são descartadas sem eco. A regra roda na mesma transação da entrada recebida; se perde, a mensagem segue o caminho de sempre.

**Painel.** `PanelActionBodySchema` ganha a variante `ANSWER_ASK { issueId, stopId, answer: AskAnswer }` (união discriminada por `kind`; Non-Negotiable 3: o painel mostra botões por opção e caixa de texto só quando a pergunta aceita texto). `ANSWER_STOP` continua para os kinds antigos. `PanelActionKind` += `ANSWER_ASK`. Eco "Ana respondeu APP-12 · D1 pelo painel" (`PanelActionEcho` += `ANSWERED`).

**Console.** Detalhe da issue: perguntas abertas no topo com código, opções e prazo ("segue com X às 14:32"), respondíveis pelo console (`POST /stops/:stopId/answer`, hook do SDK). Sem quadro novo.

### Item 1b — o padrão de 15 minutos

Cânone `scheduler` SCH-01/02/03a: estado persistido + varredura repetida, nunca `setTimeout`.
- **Relógio começa** quando a mensagem que leva a pergunta é ACEITA pelo gateway ("entregue" aqui = o `sender.send` voltou; não é o ✓✓ do WhatsApp). Onde: dentro da transação que `DeliverChannelMessage.recordOutbound` já abre depois do envio — ela acha as perguntas pelo `replyEntryId` (o `stop_id` da própria entrada, ou as entradas cujo `digest_entry_id` aponta para ela, no resumo) e grava `due_at = at + QUESTION_DEFAULT_MS` (15 min, constante nomeada) com `UPDATE … WHERE due_at IS NULL` — um reenvio depois de commit falho não empurra o prazo. Pergunta não entregue (canal desconectado) não vence.
- **Job** `ApplyDueQuestionDefaults` (`thread/jobs.ts`, `repeat.every = 30 s`; recebe `now` como entrada, como `canInvoke`, e o teste passa o instante): `findDueAsks(now)` — stops `QUESTION_ASKED` abertos com `due_at ≤ now` (índice em `due_at`) → `resolveStop(DEFAULT_APPLIED, { default })` → `ResumeIssueOnStopResolved` manda à sessão "ninguém respondeu em 15 min: siga com <padrão>". No grupo: nada (nível PROGRESS, só linha do tempo: "seguiu com o padrão às 14:32").
- **Execução perdida (SCH-04) — decisão: aplicar atrasado, não pular.** O cânone manda pular uma execução velha como transição distinta; aqui pular deixaria a issue travada para sempre, e o dono decidiu que a pergunta segue sozinha. A transição já é distinta (`DEFAULT_APPLIED` ≠ `ANSWER`) e a linha do tempo mostra o atraso quando `now − dueAt > 5 min` ("seguiu com o padrão — o codm estava desligado"). Antes de aplicar, uma carência: nada é aplicado nos `DEFAULT_GRACE_AFTER_CONNECT = 2 min` seguintes ao boot ou à última conexão do canal, para a ingestão do atraso chegar antes (a resposta vale sem janela de frescor, item 3). Porta nova: `ChannelConnectivity.connectedSince(channelId): Date | undefined`, alimentada pelo evento `channel.connected` que o daemon já recebe; o instante do boot vem do processo.
- **Issue segurada** (pausa da issue ou do grupo, `IssueHold`): não aplica; o prazo fica vencido e é aplicado no primeiro ciclo depois de retomar.
- **Corrida resposta × prazo:** os dois passam por `resolveStop`; quem grava primeiro ganha (idempotência acima). Resposta depois do padrão ⇒ regra 4 (vira steer).
- Teste com `now` injetado no job e na marcação de entrega: nenhum teste dorme 15 min (o core não tem `Clock`; não se cria um só para isto).

### Item 2 — política de saída e modo por grupo

- `Thread.outputMode: GroupOutputMode` (coluna `thread_threads.output_mode`, NOT NULL, padrão da migração = o padrão decidido), `Thread.configureOutputMode()`, `ConfigureOutputMode` em `ConfigureThreadSettings.ts`, controller `PUT /threads/:threadId/output-mode` (`mcpScopes` system + orchestration, como `ConfigureReactions`), lido em `GetThreadSettings`. Console: seletor no `ThreadSettingsDialog` (hook `useConfigureOutputMode`, três opções com uma linha explicando cada).
- **Formato por nível** (pt/en pela língua da conversa, `THREAD_MESSAGES.signalFormat`):
  - DECISION: "❓ APP-12 · D1 — <pergunta>\n1) … 2) …\n<quem decide>\n<link da issue>" (cita a mensagem de origem da issue quando há).
  - QUESTION: "APP-12 · D2 — <pergunta> Sigo com <padrão> se ninguém disser o contrário em 15 min."
  - FEEDBACK: o artefato principal com legenda "APP-12 · prévia — <texto>. Galeria: <link>"; os demais artefatos só no painel — **depende do pré-requisito de galeria abaixo**.
  - CLOSING: "✅ APP-12 · <título> — <resumo>" + artefato final quando declarado + link, citando a mensagem de origem (a resposta a quem pediu).
  - BLOCK_NOTICE: "<causa>: N tarefas paradas (APP-12, APP-15). Quem libera: <nome>" — ver um por causa.
  - Link da issue: `PanelPublisher.linkOf(threadId)` (já existe em `issue/services`, aresta `thread → issue` declarada) + `#<chave>` (âncora nova na página do painel, ver pré-requisito); sem login na nuvem, sem link.
- **Agrupar por pessoa (DIGEST).** Pergunta e feedback para a mesma pessoa (o `addresseeId` declarado, senão quem escreveu a mensagem de origem da issue) que chegam em `DIGEST_WINDOW_MS = 60 s` saem numa mensagem só. `DeliverIssueSignal` grava a entrada com `routing = DIGEST` e enfileira `flush_signal_digest` com `jobId = digest:<thread>:<pessoa>:<janela>` e `delay` = janela (o mesmo `jobId` deduplica). O flush lê as entradas pendentes da pessoa: uma só ⇒ sai no formato normal (com print); duas ou mais ⇒ "Ana, 3 coisas: APP-12 · D1 …; APP-15 prévia …; APP-15 · D2 … — <link>", sem anexos (os prints ficam no link). Decisões NÃO entram no resumo (precisam de citação própria). Uma pergunta só começa a contar o prazo quando o resumo que a leva é entregue.
- **Um aviso por causa.** `BLOCK_NOTICE` carrega `BlockCause` (+ provedor quando a causa é do provedor). Cada causa DECLARA se agrupa (`CAUSE_DEDUPES: Record<BlockCause, boolean>`): `PROVIDER_LIMIT`, `PROVIDER_ERROR`, `CLI_LOGIN` agrupam — enquanto há stop aberto dessa causa no grupo, o primeiro aviso vai ao grupo e os seguintes só ao painel; a causa fecha quando o último stop dela é resolvido. `STALLED` e `CLASSIFICATION` NÃO agrupam: a causa é a própria issue (uma segunda tarefa parada sem motivo precisa aparecer, senão ela morreria só no painel). Estado derivado dos stops abertos e de `CAUSE_OF_STOP[kind]`, sem coluna nem tabela nova. `PROVIDER_LIMIT` já é um por pausa e só passa a ser lido da tabela.

### Item 4 — `relatorio` vira consulta

- `relatorio` NÃO é um `IssueControlCommand`: aquele enum e suas tabelas (`CONTROL_EFFECT`, `controlUseCase`) são de comandos sobre UMA issue, e `control()` sai cedo sem alvo (`IngestChannelMessage.ts:365-366`). Enum local novo `ThreadCommand { REPORT }` (`thread/enums`) com tabela `THREAD_COMMANDS: Record<ThreadCommand, { words, match: WHOLE_MESSAGE }>` — o modo de casamento é DECLARADO (o `parseControlCommand` de hoje casa a primeira palavra, então "relatório do que fizeram ontem" viraria comando). Palavras: `relatorio`, `relatório`, `report`, `boletim`. A mensagem inteira, sem menções e sem pontuação final, tem de ser a palavra.
- Despacho próprio em `IngestChannelMessage`, depois das regras de resposta e antes das de controle: `REPORT` com `canCommand` ⇒ grava a entrada, monta o boletim e enfileira a entrega na mesma transação; `invocable: false` (nenhum turno). "relatório APP-12" (boletim de uma issue) fica fora.
- **Boletim** (`thread/services/BoardBulletin`, lendo `issue` pela aresta `thread → issue` existente: `IssueRepository` e um serviço novo `issue/services/IssueBoardReader` que expõe chave, título, status e estado de vida — `lifeStateOf` mora em `issue/utils`, superfície proibida para outro contexto; o `why` da aresta em `thread/context.ts` ganha `IssueBoardReader` e `PanelPublisher.linkOf`; stops abertos vêm do próprio `Thread`): não há campo de estágio, então as seções saem de status + estado de vida + perguntas abertas: **Esperando decisão** (stops `DECISION_REQUESTED`/`QUESTION_ASKED`, com código e quem decide), **Paradas** (`STALLED`, `PAUSED`, `WAITING_PROVIDER` com data), **Fazendo** (`RUNNING`/`QUEUED`), **Concluídas nas últimas 24 h**. Uma linha por issue (chave + título), no máximo 8 por seção ("+N no painel"), link do painel no fim.
- Medição: fato `thread.bulletin_sent` (sem texto) para contar pedidos antes/depois.
- Fora: boletim periódico (D2).

### Item 5 — resultado de tarefa deixa de acordar o orquestrador

- `RunIssueTurn.persistOutcome` não enfileira mais `ISSUE_RESULT`. No lugar, salva o fato `agent.issue_spoke` (ponte em `PublishAgentIntegrationEvents` → `integration.thread.issue_signal`) com o texto do turno, nível `PROGRESS`. O fechamento NÃO sai daqui: a declaração de conclusão chega por ferramenta MCP, que comita fora deste fluxo (`RunIssueTurn.ts:466-474` documenta por que ler isso aqui "responde a pergunta errada"); ele sai do `integration.issue.completed` (com `summary`) consumido pelo `thread`. Conclusão INFERIDA (saída limpa sem declaração, `summary` vazio) fecha com "✅ APP-12 · <título> — concluída" + link.
- **Prosa de fim de turno com pergunta implícita** (o caso medido "prévia pronta, posso publicar?" sem ferramenta): o turno não declarou nada ⇒ lembrete de declaração da fase 0 (agora pedindo `AskDecision`/`AskQuestion`/`RequestFeedback`) ⇒ se ignorado, a parada `STALLED` vira `BLOCK_NOTICE` no grupo ("APP-12 parou sem dizer o que falta"). Nunca termina em silêncio só no painel. Teste dedicado.
- O orquestrador continua sendo chamado quando a issue pede roteamento de verdade: ela abre outra tarefa com `CreateIssue` (já no escopo dela) ou uma decisão endereçada ao operador. `MailboxItemKind.ISSUE_RESULT` continua no contrato só para drenar itens enfileirados antes da atualização.
- Correção junto: o dispatcher não repassa `issueId` ao `RunOrchestratorTurn` (`LibSqlMailboxDispatcher.ts` ~897), então `OrchestratorRepliedEvent.issueId` sai vazio em produção. Corrigido no mesmo slice (vale para os itens drenados).
- **Ordem obrigatória:** este item só entra depois de a política entregar decisões, perguntas e feedback no grupo (itens 1–3). Hoje `HUMAN_REQUESTED`/`APPROVAL_NEEDED` só chegam ao grupo PELO `ISSUE_RESULT`; desligá-lo antes deixaria os pedidos mudos.

### Linha do tempo, painel e console

- `assembleIssueTimeline`: `MESSAGE` com `level` e `routing` ("só no painel" vs "no grupo"); `STOP_RAISED` com código, pergunta, opções e prazo; `STOP_RESOLVED` com a resposta e quem respondeu (ou "seguiu com o padrão").
- Painel na nuvem: página da issue mostra perguntas abertas com botões por opção (variante `ANSWER_ASK`), feedback com galeria; mensagens só-painel aparecem na linha do tempo. Quadro sem mudança de colunas.
- Console: seletor de modo; perguntas abertas no detalhe da issue; o chat da conversa mostra entradas só-painel esmaecidas com o selo "só no painel" (não foram ao WhatsApp).

### Pré-requisito: galeria e link da issue no painel (não existem)

O desenho manda prints intermediários e a galeria "para o painel". Conferido no código: o painel na nuvem **não tem artefatos** — o upload para bucket ficou como "etapa seguinte" no spec da fase 1 e não há código de upload em `panel/` nem em `issue/` — e **não tem link direto para uma issue** (`PanelPage` é uma página só, sem `/t/<chave>` nem âncora). Hoje um print que não vai ao grupo só é visto no console do operador.

Consequências e o que o plano faz:
- **Link da issue:** pequeno e sem custo — a página do painel passa a abrir a issue por âncora (`…/panel/g/<token>#APP-12`). Entra no slice do painel.
- **Galeria:** exige bucket (R2), credencial e custo ⇒ pela regra do objetivo, **PERGUNTAR AO DONO** antes de construir. Enquanto não houver galeria, o FEEDBACK manda no grupo só o print principal (uma mensagem, como o critério de aceite pede), com a legenda dizendo quantos outros existem ("+2 no console"), e o link aponta para a issue no painel (linha do tempo com os nomes dos artefatos). Os demais prints, e os de PROGRESS, ficam visíveis só no console do operador até a galeria existir — perda real de visibilidade para o grupo, e por isso a pergunta ao dono.

## Migrações

SQLite (uma, `0036`, `bun migrate:create` + `db:sync-go` + `db:check-go`):
- `thread_threads.output_mode` text NOT NULL DEFAULT (padrão decidido) + CHECK.
- `thread_transcript_entries`: `level` (nullable, CHECK `IssueSignalLevel`), `routing` (nullable, CHECK `OutputRouting`), `stop_id` (nullable), `digest_entry_id` (nullable: a entrada do resumo que levou esta), `addressee_id` (nullable). Índice `(thread_id, routing, digest_entry_id)` para o flush.
- `issue_stops`: reconstrução (CHECK de `kind` com `DECISION_REQUESTED`/`QUESTION_ASKED`/`STALLED` e de `resolution` com `ANSWER`/`DEFAULT_APPLIED`; precedente nas migrações 0007 e 0029) + `ask` (json), `answer` (json), `answered_by`, `seq` (int), `due_at` (int, nullable, índice), `ask_entry_id`. Único `(issue_id, seq)`. A causa do aviso não é coluna: sai de `CAUSE_OF_STOP[kind]`.
- Nenhuma tabela nova para decisões, sinais ou resumos.

Nuvem (pg, `0007`, `bun migrate:create` do perfil cloud + `bun migrate:deploy:cloud` manual): `panel_actions_kind_check` é derivado de `PanelActionKind` (`enumCheck`, `packages/contracts/src/db/pg/schema/panel.ts:171`) e precisa aceitar `ANSWER_ASK`. `open_stops` é jsonb (sem CHECK); o servidor valida pelo schema compartilhado, então os kinds novos exigem o servidor novo. Ordem: nuvem antes do daemon.

Política de stops: `issue_stop_policy_config` tem uma coluna por critério e `POLICY_KEY` é total sobre `StopKind`. Os três kinds novos usam colunas existentes (`DECISION_REQUESTED`/`QUESTION_ASKED`/`STALLED` → `humanRequested`), sem coluna nova: desligar "pedidos de pessoa" continua desligando todos eles.

Os CHECKs do SQLite são derivados dos enums gerados (`enumCheck`, conferido por `schema-drift.test.ts`): mudar `StopKind`/`StopResolution` sem a migração deixa o repo vermelho. Por isso o plano põe a migração no mesmo slice do contrato.

## Testes

- `OutputPolicy.test.ts`: tabela total (todo `IssueSignalLevel` × `GroupOutputMode`), escalada por efeito, `LEVEL_OF_STOP` total.
- `tests/architecture/channel-producers.test.ts`: lista declarada de produtores de entrega, com fixture negativa (produtor novo fora da lista falha).
- `LibSqlThreadRepository.test.ts`: duas resoluções do mesmo stop em transações concorrentes — uma grava, a outra recebe `STOP_ALREADY_RESOLVED` e nada dela fica; `due_at` gravado uma vez só.
- Migração 0036: linhas existentes de `issue_stops` sobrevivem à reconstrução com kind/resolução intactos; o `HUMAN_REQUESTED` de paradas antigas do reconciliador NÃO é reescrito (histórico).
- Stops da própria conversa (orquestrador, sem issue) continuam com o comportamento de hoje.
- `PanelSync.test.ts` (nuvem): um servidor com schema velho recusa `DECISION_REQUESTED` — documenta a ordem nuvem → daemon.
- `DeliverIssueSignal.test.ts`: GROUP grava e entrega; PANEL grava sem entregar; DIGEST agrupa duas da mesma pessoa em 60 s numa mensagem, uma sozinha sai no formato normal, decisão nunca agrupa; um aviso por causa (segundo stop da mesma causa não vai ao grupo; causa fechada reabre).
- `AskDecision/AskQuestion/RequestFeedback/ReportProgress.test.ts`: contrato da ferramenta; pergunta com efeito vira decisão; pergunta sem padrão recusada; feedback não trava a issue.
- `IngestChannelMessage.answer.test.ts`: citação resolve; código no texto resolve; "sim" solto com uma pendente resolve, com duas pergunta UMA vez e a segunda vai ao orquestrador; quem não pode liberar não aprova publicação; resposta atrasada vira steer; corrida com `ResolveStop` do orquestrador (um ganha).
- `ApplyDueQuestionDefaults.test.ts` (`now` injetado): vence aos 15 min da ENTREGA; não vence sem entrega; reenvio não empurra o prazo; segurada não aplica e aplica ao retomar; carência depois do boot/conexão; resposta e prazo no mesmo ciclo (um ganha); a sessão recebe o padrão mesmo com outro recado pendente.
- `ResumeIssueOnStopResolved.test.ts`: `ANSWER` leva pergunta, código e resposta; enfileira mesmo com item pendente; kinds antigos inalterados.
- `IngestChannelMessage.report.test.ts`: `relatorio` sem turno do orquestrador (nenhum item THREAD), seções certas, link quando logado; frase longa com "relatório" não é comando.
- `RunIssueTurn.test.ts`: nenhum `ISSUE_RESULT`; texto vira PROGRESS; turno mudo → lembrete → parada `STALLED` → aviso no grupo (prosa nunca morre só no painel). O fechamento é testado em `CloseIssueOnChannel.test.ts` (`integration.issue.completed` → CLOSING), não aqui.
- **Fluxo de aceite** (`tests/flows/fase3-typical-task.test.ts`, modo `integration` — outbox e mediators reais, para `stop_raised`/`issue.completed` chegarem aos handlers do `thread`; runner roteirizado; o job e a marcação de entrega chamados com `now` explícito, sem depender do relógio da fila): pedido → issue → `RequestFeedback` → `AskDecision` (publicar) → resposta citada → conclusão. Assertiva: o grupo recebe exatamente recibo, feedback, decisão e fechamento; nenhum PROGRESS sai; pergunta de nível 2 segue sozinha após 15 min (relógio); `relatorio` não cria item THREAD.
- e2e (Playwright): seletor de modo no console e resposta a uma pergunta pelo detalhe da issue.

## Rollout

- Uma migração; o modo é por grupo e trocável no console sem reiniciar.
- Deploy da nuvem antes do daemon (schemas de `open_stops`/linha do tempo e a variante `ANSWER_ASK`).
- Itens `ISSUE_RESULT` já na fila no momento da atualização são drenados pelo orquestrador como antes.
- Sessões de issue em curso perdem `SendDirectMessage`/`SendArtifact` no próximo turno (a lista de ferramentas é montada por turno); o prompt novo explica as substitutas.
- PERGUNTAR AO DONO: precisa de um caminho de volta (um quarto modo "legado", com o orquestrador reescrevendo resultados) durante a primeira semana?

## Como medi (antes)

Cópia somente leitura (`sqlite3 -readonly`), janela `at ∈ [02/11 03:00Z, 16/11 03:00Z)`. `<grupo-A>` é o id da conversa mais ativa (não registrado aqui).
```sql
-- fala do agente por grupo e por dia
select thread_id, count(*) from thread_transcript_entries where kind in ('SYSTEM','DIRECT') and <janela> group by thread_id;
select date((at-3*3600000)/1000,'unixepoch'), count(*) from thread_transcript_entries where thread_id='<grupo-A>' and kind in ('SYSTEM','DIRECT') and <janela> group by 1;
-- tipos: artefato, resposta do orquestrador (texto igual ao de agent.orchestrator_replied), resto
select sum(artifact_id is not null), sum(artifact_id is null and text in (select json_extract(payload,'$.text') from shared_events where name='agent.orchestrator_replied')) from thread_transcript_entries where thread_id='<grupo-A>' and kind='SYSTEM' and <janela>;
-- o que acordou o orquestrador
select kind, json_extract(payload,'$.via'), count(*) from agent_mailbox where target_kind='THREAD' and <janela em created_at> group by 1,2;
-- resposta → item: o item THREAD de menor consumed_at >= instante da resposta e created_at <= ele
-- relatório: CONTACT com lower(text) like '%relatorio%' or '%relatório%' (e length(text) < 40)
-- stops: issue_stops por kind, (resolved_at - raised_at) em minutos, mediana/p90 por row_number()
```

**Depois (a medir na instalação com esta fase):** mensagens do agente por dia no grupo A; mensagens no grupo por issue concluída (meta ≤ 4 na tarefa típica); fração de turnos do orquestrador acordados por `ISSUE_RESULT` (meta 0, salvo drenagem); `relatorio` sem turno (`thread.bulletin_sent` × itens THREAD); perguntas que seguiram pelo padrão.

## Riscos

- **O padrão de 15 min vai disparar quase sempre:** só 29% das `HUMAN_REQUESTED` e 43% das `APPROVAL_NEEDED` fecharam em 15 min. É a decisão do dono; o que protege é a escalada (efeito ⇒ decisão sem prazo) e a linha do tempo mostrando "seguiu com o padrão". Medir a fração depois.
- O modelo pode classificar para baixo (pergunta onde devia haver decisão) ou declarar efeito vazio. Ver a pergunta ao dono sobre a trava dura.
- O fechamento perde a voz do orquestrador: o texto vem do `summary` declarado. Resumo ruim ⇒ fechamento ruim; o prompt pede uma frase para quem pediu.
- O agrupamento atrasa pergunta/feedback em até 60 s.
- Privacidade: a linha do tempo já vai para o painel na nuvem com o texto das mensagens ligadas à issue (`issueTimeline.ts`); o texto livre de fim de turno, que antes passava pela reescrita do orquestrador, agora entra cru como PROGRESS. Mesma categoria de dado, mais volume. O prompt da issue pede que o texto do turno não traga segredo/credencial.
- Volume total: as respostas a pessoas (~30% do grupo A) ficam. A redução esperada vem de artefatos (42%) e respostas a resultados (24%).

## Fora de escopo

Lembretes de decisão em 2 h / 6 h (§6.1, coluna "se ninguém responde"); feedback sem resposta virar decisão de publicar; boletim periódico (D2); modo silencioso por horário (D5, madrugada); enquete/reação do WhatsApp para responder (D3); estágio da issue (`Prévia pronta`, `Aguardando decisão`) como campo; mudar o orquestrador em conversa geral; prioridade na fila (fase 4).

## Revisão (skill `spec-review`, 2026-11-17)

Revisão independente (agente sem o contexto do desenho) contra `docs/BACKEND.md`, `docs/FRONTEND.md`, CLAUDE.md, os specs das fases 0–2 e o código. Veredito do primeiro rascunho: **não pronto** — 5 críticos, 4 moderados, 5 baixos. Todos aplicados acima:
- **C1** parada do reconciliador e pedido de pessoa tinham o mesmo kind ⇒ `StopKind.STALLED`; `PROVIDER_LIMIT` fica fora dos stops.
- **C2** o fechamento não pode sair do `persistOutcome` ⇒ sai do `integration.issue.completed`; `summary` continua até 4000.
- **C3** "a primeira resolução ganha" não existia (upsert sem versão, `UPDATE` incondicional) ⇒ `UPDATE … WHERE resolved_at IS NULL` + linhas afetadas + leitura dentro da transação; teste de corrida.
- **C4** nada marcava "entregue" ⇒ marcação dentro da transação do `recordOutbound`, condicional.
- **C5** a resposta podia não chegar à sessão (`hasPending`, texto só com a resolução) ⇒ steer sempre, com a resposta.
- **M1** artefato do feedback: id + leitura `reads.artifact` + `ArtifactDelivery`; recusas síncronas no `RequestFeedback`; tabela de roteamento sem contradição.
- **M2** `relatorio` com enum, tabela e casamento declarados (`WHOLE_MESSAGE`), despacho próprio.
- **M3** regras de resposta antes das palavras de controle; `BARE_ANSWERS ∩ CONTROL_WORDS = ∅`.
- **M4** porta `connectedSince`, `now` como entrada, decisão SCH-04 escrita.
- **L1–L5** uniões (`AskDefault`, `AskAnswer` × `StopAnswer`), gate de produtores por lista declarada, escalada com um dono só (`StopAsk`), `seq` por consulta + índice único, `IssueBoardReader` e o `why` da aresta.

Ficaram como perguntas ao dono os itens abaixo. As correções NÃO foram re-revisadas por um agente independente; uma segunda passada sobre as seções alteradas é o primeiro passo do S0. Numa segunda leitura própria entraram ainda: a regra do "sim" solto exige `canInvoke` inteiro (portão de menção); `CAUSE_DEDUPES` declarado por causa (`STALLED`/`CLASSIFICATION` não agrupam); aliases das ferramentas antigas com kind definido; `POLICY_KEY` e o CHECK da nuvem na lista de migrações; e o pré-requisito de galeria abaixo.

## Perguntas ao dono (consolidado)

1. Matriz nível × modo e o modo padrão (ver tabela). "Só decisões" mantém perguntas? "Tudo" leva progresso ao grupo?
2. Trava dura: ação irreversível só com decisão aprovada?
3. Quem pode responder decisões e perguntas sem efeito (proposta: qualquer participante que pode agir; com efeito, só quem pode liberar).
4. Modo "legado" temporário no rollout?
5. Galeria no painel: aprovar bucket (R2) e credencial para subir artefatos? Sem ela, prints de progresso e os extras do feedback ficam visíveis só no console do operador.
