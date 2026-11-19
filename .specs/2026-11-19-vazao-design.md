# Fase 4 — vazão

Status: Reviewed (fase 4 do plano "tarefas visíveis, controláveis e que não se perdem")
Data: 2026-11-19
Depende de: `2026-11-12-pausa-por-pista-e-adiamento-liberavel-design.md` (pausa por limite, adiamento liberável), `2026-11-12-fase-0-tarefas-visiveis-design.md` (`first_claimed_at`, estado "esperando cota"), `2026-11-13-painel-na-nuvem-design.md` (snapshot do painel), `2026-11-16-falar-e-parar-na-hora-design.md` (triagem no modelo pequeno, "agora", pausa), `2026-11-17-emagrecer-o-grupo-design.md` (política de saída, `BlockCause`, um aviso por causa, resultado sem orquestrador).

## Problema (medido)

**Fonte.** Cópia somente leitura do banco de uma instalação real, janela de 13,9 dias (04/11 23:44Z → 18/11 20:11Z — `agent.turn.usage` só existe desde 04/11). A instalação roda a versão **anterior às fases 0–3** (`first_claimed_at` vazio em 100% dos itens, triagem e política de saída ausentes). Só agregados; comandos em "Como medi". Unidade de custo: ver "Unidade" abaixo — onde aparece "ponderado", é uma **suposição de tabela de preço**, não um número do provedor.

| Métrica | Valor |
|---|---|
| Turnos de issue em voo (de `agent.run.started` ao `agent.turn.usage`/`run.stop_raised` seguinte da mesma issue, teto 60 min) | 1.516 inícios, 208 sem fim pareado (`DeclareIssueOpen` também emite `run.started` sem turno, mais turnos mortos). Faixa (sem os não pareados → com eles, até o próximo início ou 60 min): 0 → 72,4–69,2%; 1 → 12,3–12,0%; 2 → 6,5–6,4%; 3 → 5,4–4,4%; **4 → 3,5–7,6%**; 5+ → 0–0,4% (o teto é 4; acima é artefato). Mediana 0, média 0,55–0,71 |
| Horas de turno de issue | 184–236 h em 13,9 dias (13,3–17 h/dia); por janela deslizante de 5 h: mediana 1,6–1,9 h, p90 7,5–9,4 h, máx. 12,1–17,8 h |
| Duração de um turno de issue (pareados) | mediana 4,4 min, p75 12,0, p90 21,7 |
| Demanda (issues com item vivo, rodando ou esperando) | mediana 1, máx. 18; ≥ 4 em 36,9% do tempo, ≥ 6 em 20,7% |
| Espera na fila por item de issue (de "pronto" — criado e o item anterior da mesma issue consumido — ao `run.started`) | STEER: n = 1.034, mediana 0 min, p90 16,8 min, 67 acima de 30 min. WORK: n = 158, mediana 0, p90 33,7 min, 19 acima de 30 min |
| Pausa por limite do provedor (união das janelas anunciadas no grupo) | 73,5 h em 13,9 dias (**22%**, ~37 h/semana), 13 janelas. Por semana ISO: W45 (05–08/11) 40,4 h; W46 31,6 h; W47 (16–18/11) 1,5 h. **Limite inferior:** o aviso desta versão só dizia a hora, então resets semanais de vários dias contam como horas |
| Gasto por papel (4.009 turnos com uso) | saída: orquestrador **11,3%**, issues 88,7%. Cache relido: 14,4% / 85,5%. Ponderado (suposição): 18,6% / 81,4%. Por semana, orquestrador: saída 11,1% / 11,6% / 10,5%; ponderado 15,0% / 20,7% / 21,7% |
| Triagem | **não derivável**: a triagem não grava `agent.turn.usage` e não existe nesta versão |
| Por turno | issue: 18,6 mil tokens de saída, 4,37 M de cache relido (mediana 1,5 M, p90 12,7 M). Orquestrador: 1,1 mil e 352 mil |
| Custo por tarefa concluída (154 criadas e concluídas na janela) | saída: mediana 72,6 mil, p90 314 mil. Ponderado: mediana 2,56 M, p90 10,7 M |
| Turnos por tarefa | concluídas: mediana 4, p90 18 (média 7); todas as criadas: mediana 4, p90 17 |
| Turnos recusados/mortos (uso zero) | 193 de issue, 61 do orquestrador |
| Contexto da sessão de issue ao fim do último turno | mediana 163 mil, p90 245 mil; **140 de 186 (75%) acima de 120 mil**; 66 acima de 200 mil |
| Recados que chegaram com outro item da mesma issue ainda pendente | 639 de 1.043 STEER (**61%**, limite superior do que juntar recados economiza) |
| Aprovações que acordaram a sessão | `APPROVAL_NEEDED → APPROVE` 165 e `PERMISSION_DENIED → APPROVE` 27 na janela (~15% dos 1.294 turnos de issue com uso — 13% só os `APPROVAL_NEEDED` —, limite superior do "pode publicar" sem sessão) |
| Máquina (18/11) | Apple M4, 10 núcleos, 16 GB; **volume de dados 99% cheio, 2,3 GiB livres**. Memória: 50% livre no instante. O RSS por turno de issue não foi medido (os processos `claude` vivos não eram turnos do codm) |

**Antes de cada recusa** (22 avisos agrupados em janelas de 45 min): horas de turno de issue nas 5 h anteriores entre 0 e 17,4 (05–10/11: 3,2–12,5 sem os não pareados, até 17,4 com eles; 11–13/11: 0,8–2,6); gasto ponderado nas 5 h anteriores entre 7×10⁶ e 6,8×10⁷; nos 7 dias anteriores, até 7,9×10⁸. As recusas de 11–13/11 vieram com pouco gasto em 5 h e o maior gasto em 7 dias: **limite semanal**. Nas transcrições locais do CLI (`~/.claude/projects`), `rate_limit_info` traz `status`, `resetsAt` (segundos), `rateLimitType ∈ {five_hour, seven_day, seven_day_overage_included}` (895 / 92 / 1), `overageStatus`, `isUsingOverage`, `unifiedRateLimitFallbackAvailable`. **`utilization` nunca apareceu**; `allowed_warning` só aparece no esquema do CLI, sem captura.

**O que não dá para derivar:** espera na fila pelo `first_claimed_at` (coluna vazia nesta versão; a espera acima vem do `run.started`); gasto da triagem; tipo da tarefa (diagnóstico × mudança) sem ler texto; quantas aprovações tinham um PR pronto; RSS e disco por turno.

### Leitura — o que a medição muda no desenho

1. **Vagas não são o gargalo.** As 4 vagas ficaram cheias 3,5–7,6% do tempo, enquanto a demanda passou de 4 em 37% do tempo: a diferença é pausa por limite e adiamento, não falta de vaga. Subir para 6 sem orçamento só chega mais cedo na recusa.
2. **Não existe um teto estável por janela de 5 h.** Antes das recusas, as horas de turno variaram de 0,8 a 17,4 e o gasto de 7×10⁶ a 6,8×10⁷. O ponto de partida do brainstorm ("~15 h de execução por janela") está acima da maioria das recusas medidas e **não cobre o limite semanal**, que dominou 11–13/11. Por isso o orçamento é medido em custo de tokens (não em horas, que nada persiste por turno), por janela **e** por semana, e o teto é **aprendido** — cortado por recusa, testado para cima por sonda — não fixado.
3. **A reserva de 5% não pode ser fechada agora.** O orquestrador gasta 11% da saída e 15–22% do ponderado, e esta medição é toda anterior à fase 3 (que tira dele os resultados de tarefa e o relatório). Regra do dono: usar o maior entre 5% e o medido. A reserva é calculada em execução e cai sozinha para 5% quando o medido cair.
4. **A pausa por limite cala o orquestrador junto.** No código desta linha (#69, `LibSqlMailboxDispatcher.pausedUntil`, igual em `feat/fase-2-falar` e `feat/fase-3-emagrecer`), uma recusa pausa **todas** as pistas. O commit da fase 0 que pausava só a pista recusada (002fb12, spec "pausa por pista") está em `feat/fase-0-destravar` mas não nesta linha: a pausa por pista se perdeu na integração com o #69, e o arquivo de progresso ainda a descreve como feita. **Achado para o dono.** Como a cota é da conta, isso é correto para o limite de 5 h. Logo, "o orquestrador continua respondendo com a cota de tarefas esgotada" só é possível se as tarefas pararem **antes** de o provedor recusar: o orçamento é o mecanismo, não a pausa.
5. **Disco.** Com 2,3 GiB livres, 6 vagas (cada uma com worktree e build) arriscam a máquina antes da cota. As vagas 5 e 6 dependem de um portão de disco e da limpeza automática de worktrees (item 1, decisão do dono de 19/11).
6. **Baratear é a alavanca maior:** 75% das sessões de issue passam de 120 mil de contexto; 61% dos recados poderiam viajar juntos; ~13% dos turnos são aprovações.

## Decisões do dono (não reabrir)

- Limite de tarefas simultâneas: **o máximo possível, adaptativo pela cota** (12/11).
- **Reserva de 5% da cota para o orquestrador** — e, antes de fechar nesse número depois da fase 3, **usar o maior entre 5% e o gasto medido do orquestrador** (objetivo, fase 4 item 3).
- Grupo enxuto (fase 3): o recibo de lote é resposta do orquestrador a uma pessoa, então continua no grupo; avisos de bloqueio são um por causa.
- Painel para todos por link de grupo (fase 1); ações pelo painel com identificação (fase 2).
- **19/11 (respostas às perguntas deste spec, finais):**
  1. Empate entre pedidos de mesma prioridade com a fila cheia: **ordem de chegada** (item 4).
  2. "Pode publicar" sem acordar a sessão: **comando de publicação declarado por workspace** — o codm o executa pela semântica da janela de arrependimento da fase 2 (pausa ou recado novo cancela), registrado na linha do tempo da tarefa; workspace sem comando declarado mantém o comportamento de hoje (a sessão acorda) (item 6c).
  3. Disco antes de 6 vagas: **limpeza automática de worktrees** de tarefas concluídas/arquivadas há tempo (constante nomeada, 7 dias), **nunca** uma worktree com mudança não commitada nem de tarefa aberta ou trabalhando; as vagas 5–6 só abrem com o espaço livre acima de um limiar nomeado (item 1).
  4. Orçamento: **observar uma semana antes** — entra só em observação (registra o que teria segurado, não segura nada); ligar é uma configuração, desligada por padrão (Rollout).

**Critério de aceite (objetivo):** simulação com eventos de uso reais (anonimizados) mostra o agendador segurando tarefa nova antes de estourar a janela; orquestrador continua respondendo com a cota de tarefas esgotada; recibo de lote com 10 itens registra 10 destinos; troca de sessão acima do limiar preserva o fio (teste).

## Desenho

### Quem é dono

- **`agent`** é dono do orçamento, das vagas, da ordem de reivindicação, de juntar recados, da troca de sessão e do modelo por tipo de tarefa. Ele já é dono da fila (`agent_mailbox`), das sessões, dos fatos de uso (`agent.turn.usage`), da leitura do limite do provedor (`RateLimitRecord`), da pausa (`LibSqlMailboxDispatcher`) e do fork (`ForkIssue`). Os atributos que a fila consulta (prioridade, tipo de trabalho, modelo) nascem no fork, que é do `agent` — então ficam numa tabela do `agent` (`agent_issue_attributes`), e a fila os lê por junção **dentro do próprio contexto**. O `agent` continua sem leitura de `issue` em execução (`ForkIssue.ts`, docblock).
- **`issue`** recebe esses atributos pelo evento de integração que já cria a issue (`IssueCreatedEvent`, via `PublishAgentIntegrationEvents`) e os guarda para leitura (console, painel, quadro). É projeção, não fonte.
- **`thread`** é dono do lote (agregado próprio `Batch`, não filho do `Thread`: o `Thread` já é grande e o lote tem ciclo de vida próprio). A mensagem de origem é dele, o recibo é fala do orquestrador no grupo e o destino "anexado a X" é um steer roteado, que ele já produz.
- **`ui`** (BFF) monta a saúde do sistema para o console; **`panel`** (nuvem) mostra lote e saúde a partir do snapshot.
- Dependências entre contextos: `ui → agent`, `issue → agent` e `thread → agent` **já existem** como `consumes` (superfície de serviços) nos `context.ts`; as portas novas (`QuotaStatusReader` para saúde, `WAITING_BUDGET` e snapshot; `ForkedIssueReader` para destinos de lote) só estendem as notas dessas arestas. Nenhuma aresta nova no mapa (`tests/architecture/context-map.test.ts`).

### Unidade de orçamento

O provedor não expõe saldo nem utilização (medido acima). O orçamento usa uma **unidade de custo** derivada dos baldes do `AgentUsageEvent` por uma tabela declarada `USAGE_COST_WEIGHTS: Record<AgentModelId, Record<UsageBucket, number>>` em `agent/utils/UsageCost.ts`, com `UsageBucket` = entrada, escrita de cache, leitura de cache, saída **e saída de raciocínio** (o docblock do `AgentUsageEvent` proíbe descartar esse balde). Proporção de preço público por modelo; `DEFAULT` herda a linha do modelo padrão de cada CLI pela tabela. A tabela é uma suposição: o teto é aprendido na mesma unidade, então um erro de escala se anula; um erro de **mistura** não se anula e aparece como teto instável — por isso a simulação de aceite roda também com pesos só de saída.

### Contrato primeiro

TypeSpec (`packages/contracts/src/wire/enums/`), todos cruzam o fio (console, painel, SDK, ou o evento de integração para o Go):
- `UsageRole` — `ORCHESTRATOR`, `ISSUE`, `TRIAGE`. Quem gastou.
- `ProviderLimitWindow` — `FIVE_HOUR`, `WEEKLY`, `UNKNOWN`. Mapeamento declarado de `rateLimitType` numa tabela em `StreamJsonCodec` (`five_hour → FIVE_HOUR`, `seven_day`/`seven_day_overage_included`/… `→ WEEKLY`, resto `→ UNKNOWN`), nunca por prefixo de string fora dela.
- `IssuePriority` — `HIGH`, `NORMAL`, `LOW`. Prioridade declarada da tarefa.
- `PriorityReason` — `CLIENT_BUG`, `DECLARED`, `DEFAULT`. Por que a tarefa tem essa prioridade; `CLIENT_BUG` é o "bug de cliente" do objetivo.
- `IssueWorkKind` — `CHANGE`, `DIAGNOSIS`. O que a tarefa faz; escolhe o modelo.
- `BatchItemDestinationKind` — `NEW_ISSUE`, `ATTACHED`, `ALREADY_LIVE`, `DECLINED`, `DEFERRED`, `NEEDS_DECISION`. Discriminante do destino de um item de lote.
- `QuotaState` — `OK`, `NEAR` (≥ 70% da semana), `HOLDING` (tarefas seguradas pelo orçamento), `REFUSED` (provedor recusando). Selo da saúde.
- `SlotLimit` — `MAX`, `MACHINE`, `BUDGET`. Por que a vaga efetiva é a que é.
- `PublishRunOutcome` — `SUCCEEDED`, `FAILED`, `TIMED_OUT`, `CANCELLED_BY_STEER`, `CANCELLED_BY_PAUSE`. Desfecho do comando de publicação (item 6c).
- `PublishFollowUpKind` — `COMPLETE`, `CONTINUE`. Discriminante de `StopAsk.onPublished` (item 6c).
- `MailboxClaimClass` — `DECISION_ANSWER`, `INTERRUPT` (o "agora"), `STEER`, `WORK`, `REMINDER`, `RESULT`, `OPERATOR`. Classe declarada do item da fila: campo **obrigatório** de `EnqueueMailboxItem` (a partir do S0c), gravado em coluna pelos 9 produtores de item (agent e thread). Substitui toda leitura de payload ou de prefixo de dedup (`resume:`) para saber "que item é este" (Non-Negotiable 5). Enum de fio (revisão 2): tipa uma coluna da tabela compartilhada `agent_mailbox` — que o gateway Go também abre — e o `CLAIM_RANK`, como `MailboxItemKind` e `PermissionPosture` ao lado dele.
- `BatchStatus` — `INCOMPLETE` (falta destino de algum item), `RECORDED` (todo item tem destino e o recibo saiu). Coluna `thread_batches.status` (CHECK) e campo do `BatchSchema` (console, painel).
- Existentes que crescem: `IssueLifeState += WAITING_BUDGET`; `BlockCause += BUDGET_HELD`; `IssueTimelineItemKind += BATCH_LINKED, PUBLISH_RAN`. **Tabelas totais tocadas** (o compilador acusa as `Record`, mas **não** a união da linha do tempo, que é de `z.literal` — por isso a lista é do spec): `issue/utils/issueLifeState.ts`, `thread/utils/OutputPolicy.ts` (`CAUSE_OF_STOP`/textos de causa), `thread/i18n/messages.ts`, `issue/services/BoardBulletin.ts`, a união `shared/schemas/IssueTimelineItemSchema.ts` (membros `BATCH_LINKED`, `PUBLISH_RAN`) e o seu leitor `issue/utils/issueTimeline.ts` (o mesmo para console e painel), react `IssueCard.tsx`, `IssuesOverviewSection` e o renderizador da linha do tempo (console e painel), CHECK `panel_issues_life_state_check` na nuvem.
- Evento de integração `issue.created` (TypeSpec, com bindings Go/Rust) ganha `priority`, `priorityReason`, `workKind`, `model` — opcionais (o Go só carrega).
- Todo `.tsp` novo entra no `main.tsp` (`import "./enums/<nome>.tsp"`), sem o que o `tsp compile` não o emite.

Enums só do `agent` (`agent/enums`, não cruzam o fio): `ProviderLimitStatus` — `REJECTED`, `WARNING`, `ALLOWED`. `HandoffNotesSource` — `SESSION`, `DERIVED`.

Fatos de domínio do `agent` (`z.domainEvent`, só TS):
- `AgentUsageEvent` ganha `role: UsageRole`, `provider: ProviderKind`, `model: AgentModelId` e `windows?: { window: ProviderLimitWindow, resetsAt }[]` (a fronteira de janela que o CLI informou no run, inclusive em linhas `allowed` — persiste no fato, então sobrevive ao reinício). Opcionais no schema porque linhas antigas não os têm; **o orçamento só soma eventos com `role`** — nada de inferir papel pelo `entity_id`. A triagem grava o fato (`role: TRIAGE`) por um `TriageUsageRecorder` do `agent`, chamado de dentro do `ModelInboundTriage` (o `thread`, que chama a triagem, não grava fato do `agent`).
- **Novo** `AgentProviderLimitEvent` (`agent.provider.limit_observed`) — `{ provider, model?, window: ProviderLimitWindow, status: ProviderLimitStatus, resetsAt? }`. Gravado quando o run termina com recusa ou aviso. É o fato de que o teto aprende e o que torna as horas pausadas mensuráveis daqui em diante.
- **Novo** `AgentQuotaHeldEvent` (`agent.quota.held`) — `{ window, spent, ceiling, reserve, enforced: boolean }`, gravado na transição "admitia → não admite" (e o inverso como `released`). Em modo observação, `enforced: false`: é onde o "teria segurado" fica registrado e medível.
- **Novo** `AgentSessionHandedOffEvent` (`agent.session.handed_off`) — `{ issueId, fromContextTokens, notesSource: HandoffNotesSource }`.

Schemas compartilhados em `shared/objects/` (só o `shared` declara `exposes.objects`, então é o único barril que o `registerSchemas` publica — mesma regra do `StopAsk` da fase 3; sem `.refine()`; invariantes ficam nos agregados donos):
- `QuotaSnapshotSchema` (console) — `{ state: QuotaState, window: { spent, ceiling, reserve, resetsAt? }, week: { spent, ceiling, resetsAt? }, slots: { inUse, max, effective, limitedBy: SlotLimit }, queue: { pending, heldByBudget }, diskFreeBytes }`.
- `PanelHealthSchema` (painel na nuvem, **sem números absolutos de conta**) — `{ state, windowPercent, weekPercent, slots: { inUse, effective }, queuePending, daemonSeenAt }`.
- `BatchItemDestinationSchema` — união discriminada por `kind`: `NEW_ISSUE { issueId }`, `ATTACHED { issueId }`, `ALREADY_LIVE { issueId?, note }`, `DECLINED { reason }`, `DEFERRED { reason, until? }`, `NEEDS_DECISION { issueId, stopId }`. Non-Negotiable 3.
- `BatchItemSchema` — `{ n, excerpt, destination }`; `BatchSchema` — `{ code ('L-31'), status: BatchStatus, sourceEntryId, items[] }`.
- `PublishCommandSchema` — `{ argv: string[] }` (1..`PUBLISH_ARGV_MAX` argumentos não vazios); `PublishFollowUpSchema` — `COMPLETE { summary } | CONTINUE {}`. `StopAsk` (fase 3) cresce por campos opcionais: `AskOption.authorizes?: AskEffect[]`, `StopAsk.onPublished?: PublishFollowUp`.

Em `shared/schemas/` (formas que dois contextos falam, não objetos de valor publicados — mesma regra do `RegretWindowSchema`):
- `PublishRunSchema` — `{ outcome: PublishRunOutcome, exitCode?, durationMs }`: o `agent` grava no fato `agent.publish.ran`, o `issue` o lê de volta para a linha do tempo.
- A união `IssueTimelineItemSchema` ganha `BATCH_LINKED { batchCode, n }` (o item `n` do lote `batchCode` desta conversa foi ligado à tarefa) e `PUBLISH_RAN { ...PublishRunSchema }`. O leitor `issue/utils/issueTimeline.ts` ganha as duas fontes já no S0a: `thread_batch_items` por `issue_id` e o fato `agent.publish.ran` — vazias até o S8 e o S11, mas a união e o leitor nascem juntos (a união não é `Record`, então o compilador não lembraria).

### Item 1 — vagas: 4 → 6, com portão de máquina

- O máximo da pista ISSUE vira configuração declarada (`CODM_AGENT_ISSUE_SLOTS_MAX`, padrão 6, manifesto com consumidores) — reverter para 4 não exige build novo. A vaga **efetiva** é `min(máximo, MachineCapacity.issueSlots(), admissão)`, com `limitedBy`. `drainLoop` passa a ler `effectiveSlots(kind)` em vez de `this.lanes[kind].slots`.
- `agent/services/MachineCapacity` (porta; `real` lê `statfs` do volume de dados e a pressão de memória do SO; `mock`/`integration` fixos). Tabela declarada `ISSUE_SLOTS_BY_DISK: readonly { minFreeBytes, slots }[]`: ≥ `ISSUE_SLOTS_FULL_MIN_FREE_BYTES` (20 GiB) → 6; ≥ 10 GiB → 4; ≥ 5 GiB → 2; abaixo → 1. **Decisão do dono (19/11):** as vagas 5–6 só abrem enquanto o livre ficar acima do limiar nomeado `ISSUE_SLOTS_FULL_MIN_FREE_BYTES`; o disco é liberado pela limpeza automática abaixo, não por portão mais baixo.
- **Limpeza automática de worktrees (decisão do dono, 19/11).** Fato medido no código: o codm **não cria nem modela** worktree por tarefa — a sessão roda com `cwd` = caminho do workspace (`RunIssueTurn`, `workspacePath`), e o isolamento por worktree é o follow-up R6, fora do domínio por decisão (`2026-08-04-redirecionar-trabalho-para-issue-concluida-design.md`). Quem cria worktree é o harness (o CLI do provedor) dentro do repositório. Então a ligação tarefa → worktree tem de ser **registrada**, nunca inferida pelo nome da pasta (`.claude/worktrees/<x>`) nem pelo caminho do workspace (Non-Negotiable 5):
  - **Registro:** o hook `PreToolUse` da janela de arrependimento (fase 2) já recebe do CLI o campo declarado `cwd` em toda chamada de shell da sessão da tarefa (hoje tolerado e ignorado por `PreToolHook`). O daemon grava em `agent_issue_attributes.worktree_path` o topo (`git rev-parse --show-toplevel`) desse `cwd` **quando** ele aparece em `git worktree list --porcelain` do workspace e **não** é a worktree principal (consulta, não convenção). Sem hook (codex, CLI sem `--plugin-dir`) não há registro — e tarefa sem registro nunca tem worktree apagada. **Fora do caminho da resposta (revisão 2):** o CLI espera a resposta do hook antes de rodar o comando, então o hook responde primeiro e só depois agenda o registro (sem `await` no handler; um `cwd` já visto para a tarefa nem agenda); as chamadas de `git` nunca atrasam nem decidem a resposta.
  - **Fechamento:** `agent_issue_attributes.closed_at` é carimbado pelo `agent` ao consumir `integration.issue.completed` / `integration.issue.archived`; qualquer item novo na fila da tarefa depois dele (reabertura) a desqualifica.
  - **Limpeza** (`agent/services/IssueWorktreeJanitor`, no boot e a cada `WORKTREE_JANITOR_INTERVAL_MS`, sempre antes de recalcular as vagas): candidata = linha com `worktree_path` e `closed_at` mais velho que `WORKTREE_CLEANUP_AFTER_MS` (7 dias), sem item na fila depois do `closed_at`, e nenhuma outra tarefa não fechada com o mesmo `worktree_path`. Antes de remover: a pasta ainda está no `git worktree list --porcelain`, não está travada (`locked`), e `git status --porcelain --untracked-files=all` sai vazio. Remoção por `git worktree remove` **sem `--force`** (o próprio git recusa árvore suja) e **a branch fica** (commits não pushados continuam no repositório). Qualquer dúvida ⇒ não apaga. Fato `agent.worktree.removed { issueId, freedBytes }`; recusas ficam no log, não no grupo.
- "Medir antes de passar de 6": o snapshot de saúde registra RSS dos processos de turno e disco livre a cada amostra; nada acima de 6 nesta fase.
- A pista THREAD fica com 3 vagas e **nunca** passa pelo orçamento.

### Item 2 — orçamento adaptativo por janela de 5 h e semanal

**Quem decide:** um serviço puro `agent/services/QuotaBudget` (sem I/O), alimentado por `QuotaLedgerReader` (lê `shared_events` por `name` + `occurred_at`, índice `events_name_idx`). O dispatcher pergunta antes de abrir a pista ISSUE.

**Global da conta, não por provedor.** O dispatcher não sabe em que CLI um item roda antes de reivindicá-lo (`LibSqlMailboxDispatcher.pausedUntil`, docblock) — a mesma razão pela qual a pausa é global. A admissão segue a mesma postura: se **qualquer** provedor com fatos estiver acima do teto de alguma janela, a pista ISSUE fica fechada. Numa instalação com claude e codex juntos, um segura o outro; registrado como custo aceito (a medição é de uma instalação só com claude).

**Janelas.** A de 5 h e a semanal. Fronteira: o último `resetsAt` daquela janela gravado nos fatos (`windows` do uso, ou `limit_observed`); sem ele, janela deslizante (5 h / 7 dias). A semana do provedor não é a semana ISO.

**Teto aprendido (por janela)** — derivado dos fatos, recalculado no boot e a cada fato novo, sem tabela (os fatos guardam o que é preciso, inclusive a fronteira):
- semente declarada `QUOTA_SEED_CEILING: Record<ProviderLimitWindow, number>`, ajustada **só com a semana W45** desta medição (as semanas seguintes ficam para validar fora da amostra, ver Testes);
- **recusa** na janela W ⇒ `teto = min(teto, G + emVoo × custoEsperado)` — G subconta, porque turnos em voo só reportam no fim;
- **aviso** (`WARNING`) ⇒ o mesmo vezes um fator declarado;
- **sonda para cima**: com o orçamento ligado, G nunca passa do teto, então "folga" nunca prova nada sozinha. Depois de `QUOTA_PROBE_AFTER` janelas seguidas terminadas sem recusa **e** com a pista segurada pelo orçamento em algum momento (havia demanda), o teto sobe `QUOTA_PROBE_STEP` (declarados; proposta 2 janelas, +10%). A recusa seguinte corta de volta. "Segurada" conta os dois modos: em observação, um `agent.quota.held { enforced: false }` na janela é a mesma evidência de demanda (revisão 2) — senão a semana de observação nunca subiria um teto que começou baixo;
- **troca de conta**: os fatos não carregam conta. Uma recusa com `resetsAt` e, depois, um turno aceito **antes** desse `resetsAt` (o `creditAcceptedTurn` de hoje) é a evidência que existe de conta trocada ou janela zerada antes: os cortes daquela janela voltam à semente;
- recusa `UNKNOWN` (ex.: codex, que não informa o tipo) corta só a janela de 5 h.

**Admissão (antes do `claimNext`, nunca depois).** A pista ISSUE só entra em `open` se, para as duas janelas:
`gastoIssue + emVoo × custoEsperado + custoEsperado ≤ teto − max(reserva × teto, gastoOrquestrador)`,
onde `gastoOrquestrador` = `ORCHESTRATOR + TRIAGE` na janela. A reserva é um **piso mantido livre** para o orquestrador, não uma parte que ele já gastou e que se reserva de novo.
- `custoEsperado` = **média** (não mediana) dos últimos 50 turnos de issue — a cauda é pesada (p90 ≈ 8× a mediana) e a mediana subprecificaria os turnos em voo.
- Sem admissão, a pista ISSUE sai de `open` como já sai na pausa: **nenhum item é reivindicado e devolvido**. Itens STEER de resposta a decisão continuam sujeitos ao orçamento: a reserva é do orquestrador, não das tarefas.
- Estado da tarefa: `WAITING_BUDGET` = o que hoje seria `QUEUED` **e** `QuotaStatusReader` diz que a pista está segurada **de fato** (orçamento ligado); precedência logo depois de `WAITING_PROVIDER` (a recusa do provedor é a causa mais forte). Um aviso por grupo afetado (`BlockCause.BUDGET_HELD`, política da fase 3) com o instante estimado de volta.
- **Modo observação (revisão 2):** com `CODM_AGENT_QUOTA_ENFORCE=false` nada é segurado, então nada é anunciado — sem `BUDGET_HELD` no grupo, sem `WAITING_BUDGET` no quadro nem no painel; o "teria segurado" fica só no fato `agent.quota.held { enforced: false }` e na saúde do console (`QuotaState.HOLDING` não aparece; o snapshot mostra gasto × teto). A tabela de quem anuncia é declarada pelo `enforced`, não um `if` no aviso.

**Reserva (item 3).** `reserva = max(0,05, parteMedida)`, com `parteMedida` = `ORCHESTRATOR + TRIAGE` sobre o total, nos últimos 7 dias, na unidade do orçamento, só com eventos com `role`. Até haver 7 dias desses eventos, vale o valor de partida declarado desta medição (18,6% ponderado). Quando o medido cair abaixo de 5% (esperado depois da fase 3), a reserva fecha em 5% sem mudança de código — é a regra do dono.

**Semanal.** O mesmo controle na janela semanal; ao cruzar 70% do teto semanal, `QuotaState.NEAR` na saúde (console e painel). Sem mensagem no grupo por isso; o grupo só ouve quando tarefas forem seguradas (`BUDGET_HELD`).

**Recusa mesmo assim.** Se o provedor recusar antes do teto aprendido, vale o caminho de hoje (#69: adiar, pausar a conta, avisar, sondar no teto) — **e ele pausa também o orquestrador**, porque a cota é da conta. O orçamento não promete o contrário: promete que, com o teto aprendido, a recusa fica rara e a próxima janela fecha a pista ISSUE mais cedo. O critério "orquestrador responde com a cota de tarefas esgotada" vale para a cota **das tarefas** (`teto − reserva`), não para a recusa do provedor.

**Limite por modelo (fora do escopo, registrado):** os resets de 7 dias com outra pista respondendo (spec "pausa por pista", 12/11) sugerem limite semanal por modelo. O fato `limit_observed` grava `model` para medir isso; mudar a chave da pausa fica para quando houver dado.

### Item 4 — fila com prioridade

Classes fixadas pelo objetivo, numa tabela total `CLAIM_RANK` em `agent/utils/ClaimRank.ts` sobre (`MailboxClaimClass` do item, `IssuePriority`/`PriorityReason` da tarefa) (menor vai primeiro):
1. item `DECISION_ANSWER` (o STEER que `thread/handlers/ResumeIssueOnStopResolved` enfileira passa a declarar a classe);
2. tarefa `CLIENT_BUG`; 3. tarefa `HIGH`; 4. `NORMAL`; 5. `LOW`.

- A classe do item é coluna (`agent_mailbox.claim_class`); a prioridade da tarefa vem de `agent_issue_attributes` por junção **no momento da reivindicação** (nada congelado no enqueue; o enqueue continua um insert simples). O `CASE` do rank é gerado da tabela, não escrito à mão.
- Ordem do `claimNext`: (1) a ordem das pistas continua sendo a primeira chave (`CASE target_kind`); (2) o candidato é sempre o item **mais antigo pronto do seu alvo** (`NOT EXISTS` de item mais antigo pronto do mesmo alvo); (3) os alvos são ordenados pelo menor rank entre os seus itens prontos (função de janela por alvo); (4) depois `created_at`. Um item de prioridade nunca passa à frente de um item mais antigo da mesma tarefa.
- Prioridade e tipo da tarefa: `ForkIssue` ganha `priority?`, `priorityReason?`, `workKind?` (padrões `NORMAL`/`DEFAULT`/`CHANGE`), grava em `agent_issue_attributes` na mesma transação do fork e manda no `IssueForkedEvent` → `issue.created`. Lote não muda prioridade de tarefa já criada: a prioridade declarada no lote vai no `ForkIssue` de cada item novo.
- **Todo nascimento de tarefa grava a linha (revisão 2).** O `ForkIssue` não é a única porta: `DeclareIssueOpen` (o worker separa trabalho no meio do turno) e `CreateIssue` (console/SDK) também criam issue. Os três gravam `agent_issue_attributes` na transação em que a issue nasce, pelo mesmo repositório (padrões `NORMAL`/`DEFAULT`/`CHANGE`; `thread_id` sempre) — senão a fila, o `ForkedIssueReader` e a limpeza de worktree tratariam essas tarefas como "antigas" para sempre. Teste de arquitetura: todo produtor de `IssueForkedEvent`/issue nova passa pelo repositório (fixture negativa).
- **Empate entre iguais com a fila cheia: ordem de chegada** (decisão do dono, 19/11) — é a chave `created_at` depois do rank, e `id` (uuid v7, monotônico) como última chave para dois itens do mesmo milissegundo: a ordem nunca depende do plano de consulta. Rodízio ou peso por grupo ficaram de fora; se voltarem, têm estado e viram serviço próprio, não linha da tabela.

### Item 5 — recibo de lote

- **Detecção sem modelo** (`thread/utils/BatchDetector.ts`, camada de regra da fase 2): mensagem com ≥ 3 itens numerados ou com marcador de lista vira candidata a lote, com N itens e o trecho de cada um. Lote **não passa pela triagem** (a triagem é sem estado e de uma mensagem; um lote precisa do orquestrador): vai direto ao orquestrador com o lote anexado ao item: `"Lote L-31: 10 itens — registre o destino de cada um com RecordBatch"`.
- **Ferramenta do orquestrador** `RecordBatch { batchCode, items: [{ n, destination: BatchItemDestination }] }` (controller no `thread`, `static mcpScopes = [McpScope.ORCHESTRATION]`). Invariante no agregado `Batch`: **todo item 1..N tem exatamente um destino**; faltou ou sobrou ⇒ `BATCH_ITEMS_MISMATCH` (DomainError) e a ferramenta devolve quais faltam. `NEW_ISSUE`/`ATTACHED`/`NEEDS_DECISION` referenciam issues da mesma conversa, validadas pela porta `ForkedIssueReader` do `agent`, que lê `agent_issue_attributes` por `(issue_id, thread_id)` (escrita na transação do fork, então já existe no mesmo turno; a linha de `issue_issues` nasce depois, por evento; issues antigas entram pelo preenchimento da 0037) ⇒ `BATCH_ISSUE_NOT_IN_THREAD`. `ATTACHED` não é só registro: o use case enfileira o trecho como steer para a issue. Os dois códigos são registrados no `thread/errors` (`registerErrorCodes`: `BATCH_ITEMS_MISMATCH` domínio, 422; `BATCH_ISSUE_NOT_IN_THREAD` aplicação, 422) com chave i18n pt/en, como todo erro nomeado — no S0b, junto da porta mock. O agregado vai de `BatchStatus.INCOMPLETE` a `RECORDED` quando o último destino entra.
- **Recibo**: só depois do destino completo, uma mensagem determinística (sem modelo) no grupo, voz do orquestrador fora da política (como o recibo de criação): `"Lote L-31: 10 itens → 4 tarefas novas, 3 em tarefas existentes, 2 já no ar, 1 recusado (motivo). <link>"`. Nenhum recibo com item sem destino; se o turno terminar com o lote `INCOMPLETE`, o próximo turno do orquestrador na conversa recebe um lembrete; persistindo, aviso de bloqueio `STALLED` da conversa.
- **Tela do lote**: console (`threads/$threadId/batches/$batchCode`) e painel (`/panel/g/<token>#L-31`). Linha do tempo da tarefa: `BATCH_LINKED`.
- Código `L-<n>` por conversa, contador num serviço (`thread/services/BatchSequence`), como `IssueSequence`.
- Fora: o "plano antes de abrir" (B2 do brainstorm).

### Item 6 — baratear a tarefa (opções medidas)

| Opção | Medição | Economia estimada (limite superior) | Decisão |
|---|---|---|---|
| a. Troca de sessão com notas acima de 120 mil | 75% das sessões passam de 120 mil; mediana 163 mil | custo por chamada proporcional ao contexto: sessão nova com notas (~20–40 mil) em vez de 163–245 mil corta 4–8× a releitura dos turnos seguintes | **Fazer** |
| b. Recados juntos num turno | 61% dos STEER chegaram com outro item da mesma issue pendente | até ~61% dos turnos de STEER (limite: parte desses já estava rodando, não esperando) | **Fazer** |
| c. "Pode publicar" sem acordar a sessão | 192 aprovações = ~13% dos turnos de issue | um turno de sessão grande por aprovação | **Fazer** — comando declarado por workspace (dono, 19/11) |
| d. Diagnóstico/leitura em modelo mais barato | não derivável (tipo não é registrado) | — | **Fazer**, medindo depois pelo `IssueWorkKind` |

**a. Troca de sessão com notas de passagem — dois limiares.** O guarda de hoje (`AgentSession.resumeDecision`) recusa retomar assim que `lastContextTokens > contextBudget`, então "o próximo turno ainda retoma e escreve as notas" só funciona com dois limiares declarados em `RunIssueTurn`:
- `ISSUE_HANDOFF_ASK_AT = 100_000`: acima dele, o turno retoma normalmente e o prompt pede que, ao terminar, a sessão chame a ferramenta nova `WriteHandoffNotes { notes }` (objetivo, estado, decisões, arquivos/branch, próximo passo). Custa só a saída das notas num turno que já ia acontecer;
- `ISSUE_CONTEXT_BUDGET = 120_000` (o `contextBudget` do guarda existente, como o `ORCHESTRATOR_CONTEXT_BUDGET`): acima dele, sessão nova. Com notas da sessão, elas entram no prompt; sem elas (a sessão pulou de < 100 mil para > 120 mil num turno, ou ignorou o pedido), entram as **derivadas** do estado durável — objetivo e título, decisões e respostas da linha do tempo, stops abertos, artefatos e links (PRs), últimos PROGRESS, branch e `git status` do cwd;
- as notas ficam em `agent_agent_sessions.handoff_notes`; o cursor (`lastMessageId`) continua o mesmo; fato `agent.session.handed_off`.
- O CLI compacta sozinho perto do teto dele; a troca acontece muito antes.

**b. Recados juntos.** Ao reivindicar um item de issue, o dispatcher reivindica junto, no mesmo `write`, os itens seguintes do mesmo alvo que formam um **prefixo contíguo** compatível: classe `STEER` e **mesma postura** da cabeça (postura é privilégio: um recado de quem não pode liberar nunca viaja com o de quem pode), até `MAX_COALESCED = 10`. O prefixo **para** no primeiro item que não é compatível (um `INTERRUPT`, um `DECISION_ANSWER`, um `REMINDER`, outra postura) — nunca o pula, para nenhum recado mais novo furar a fila de um mais velho. Lista fechada dos pontos que hoje tratam "um item", cada um com teste:
- porta do repositório com operações sobre conjunto: `claimNext → ClaimedMailboxBundle { head, followers[] }`, `renewLease(ids)`, `complete(ids)`, `defer(ids)`, `fail(head, followers)`, `holdItems(ids)`, todas numa transação (um crash no meio não parte o grupo);
- a reivindicação conta tentativa e carimba `first_claimed_at` em cada linha: cada seguidor carrega o seu `firstClaim` (para o ☑️ dele) e, em falha, só a cabeça gasta a tentativa (os seguidores têm a tentativa devolvida e voltam);
- heartbeat renova todas as linhas do grupo;
- `holdItem` (pausa), `waitForProvider`/`defer`, `releaseInterrupted`, `recordFailure`/envenenamento: sobre o grupo, com a regra de tentativa acima;
- `cueSteer` ☑️/✅ por item;
- entradas do `RunIssueTurn` que hoje são de um item: `posture` (igual em todo o grupo, pela regra acima), `answersEntryId`/`declarationReminder` (impossíveis num seguidor, pela classe), `firedByLoop` (o da cabeça; seguidores com loop param o prefixo), `turnKind`/prompt (os textos em ordem);
- `IssueTurnAborter.begin` registra a entrada do **último** recado do grupo (um "agora" que chega depois corta o grupo inteiro);
- `lastMessageId` e a chave de dedup do resultado (`RunIssueTurn`, `messageId`) = id do **último** item do grupo;
- `releaseOrphanedClaims` no boot solta todos (mesmo `claimed_boot`).

**c. "Pode publicar" determinístico — comando de publicação por workspace (decisão do dono, 19/11).** O codm não adivinha o que é publicar: executa só o que o dono declarou no workspace.
- **Onde é declarado (contrato):** configuração do workspace, `workspace_workspaces.publish_command` (JSON, nulo = sem comando), forma `PublishCommandSchema { argv: string[] }` em `shared/objects` — **lista de argumentos, nunca uma string de shell** (nada de `sh -c`, nada de expansão; `argv[0]` é o executável). Escrita por `PUT /workspaces/:workspaceId/publish-command` (`SetWorkspacePublishCommand`, body `{ command: PublishCommand | null }`) e lida por `GET /workspaces/:workspaceId/publish-command` (`GetWorkspacePublishCommand`); formulário no console com o schema do SDK. O dono do dado é o `workspace` (agregado `Workspace.setPublishCommand`); o `agent` lê pela aresta `agent → workspace` que já existe (o dispatcher já lê o workspace da conversa).
- **O comando nunca chega a um modelo (revisão 2, crítico).** `ListWorkspaces`, `AddWorkspace` e `RemoveWorkspace` são ferramentas MCP (`mcpScopes = [system, orchestration]`): um `argv` no DTO delas iria para o contexto do orquestrador — e um argv pode levar credencial. Por isso: (1) as duas portas do comando **não têm `mcpScopes`** (ausente = não exposto; são do console, com `CloudSessionMiddleware`); (2) nenhum DTO de controller exposto por MCP carrega `publishCommand` — `ListWorkspaces` não muda; leituras do workspace selecionam colunas explícitas, nunca a linha inteira num DTO; (3) teste fixa: o snapshot de exposição MCP e o `openapi.json` das operações com `x-mcp-scopes` não contêm `publishCommand`/`argv`. O `agent` lê a coluna direto no dispatcher (S11), nunca por ferramenta.
- **Quando roda:** só quando a resposta **autoriza publicar**, por dado declarado: a pergunta da tarefa (fase 3, `StopAsk`) tem `effects ∋ PUBLISH` e a resposta é a opção que declara `authorizes ∋ PUBLISH` (campo novo opcional `AskOption.authorizes: AskEffect[]`), ou um `APPROVAL_NEEDED` com `effects ∋ PUBLISH` resolvido `APPROVE`. Tabela `PUBLISH_AUTHORIZED_BY` no `agent`, sem `if` por kind. O gatilho é o item `DECISION_ANSWER` que a resolução já enfileira (`ResumeIssueOnStopResolved`): o dispatcher, ao reivindicá-lo, roda o comando no lugar do turno de sessão — mesma vaga, mesma pausa, mesma linha do tempo; não é turno de modelo, então não entra no `expectedTurnCost`. Quando o "pode publicar" chega como recado do orquestrador (texto), não há resposta declarada: a sessão acorda, como hoje.
- **O gatilho tem de existir e dizer de que stop é (revisão 2, crítico).** Hoje o `ResumeIssueOnStopResolved` (a) não enfileira **nada** para `APPROVE` quando a tarefa já tem item pendente (`RESUMES_EVEN_WITH_PENDING[APPROVE] = false`: a aprovação "pega carona" no turno que já vem) — então um "pode publicar" aprovado com um recado na fila nunca rodaria o comando —, e (b) o payload do item é `{ issueId, threadId, key, title, text }`: o `stopId` só existe dentro da chave de dedup `resume:<stopId>`, e lê-lo dali seria parse de convenção (Non-Negotiable 5). Correção:
  - o payload do item de retomada declara `stopId` e `resolution` (campos do schema do payload; `resume:<stopId>` continua só como chave de dedup) — **S0c**, junto com a classe `DECISION_ANSWER`;
  - "enfileira mesmo com item pendente" passa a ser `RESUMES_EVEN_WITH_PENDING[resolution]` **ou** `PUBLISH_AUTHORIZED_BY` autoriza aquela resolução daquele stop (as duas são tabelas declaradas; nada de virar `APPROVE` para `true` em geral, que daria um segundo turno a toda aprovação) — **S11**, que é dono da tabela, com teste: `APPROVE` que autoriza publicar com recado pendente ⇒ item enfileirado; `APPROVE` que não autoriza, com recado pendente ⇒ nada, como hoje. A dedup pelo stop continua garantindo um item só.
- **Como roda com segurança:** porta `agent/services/PublishCommandRunner` (`real`: spawn por `argv`, sem shell; `cwd` = **a worktree registrada da tarefa** (`agent_issue_attributes.worktree_path`, item 1), conferida dentro do workspace; sem worktree registrada, `cwd` = caminho do workspace só se nenhuma outra tarefa do workspace estiver rodando — senão a sessão acorda; ambiente do daemon sem os segredos dele (`CODM_*`, chaves internas); prazo `PUBLISH_COMMAND_TIMEOUT_MS` (10 min) com morte do grupo de processos; stdout+stderr capturados com teto `PUBLISH_OUTPUT_MAX_BYTES`). `mock`/`integration`: roteirizado.
- **Janela de arrependimento:** antes de executar, a mesma regra do `OpenRegretWindow` (fase 2) — confere `IssueHold` e `hasUnreadSteer` agora, espera `REGRET_WINDOW_MS` pelo `RegretWindowClock`, confere de novo. Pausa ⇒ `CANCELLED_BY_PAUSE`; recado novo ⇒ `CANCELLED_BY_STEER`; cancelado, o item vira turno de sessão normal (a sessão acorda com a resposta e o recado). O item reivindicado não conta como recado não lido (regra de `hasUnreadSteer`). A regra é extraída para um serviço único usado pelo hook e pelo comando — nunca duplicada.
- **Linha do tempo:** item novo `IssueTimelineItemKind.PUBLISH_RAN` com `PublishRunSchema { outcome: PublishRunOutcome, exitCode?, durationMs }` — **sem a linha de comando e sem a saída**, porque a linha do tempo vai ao painel na nuvem (mesma regra do `REGRET_WINDOW`: um argv pode levar credencial). A saída capturada vai ao log de terminal da tarefa (`issue_terminal_lines`, local, só console), ligada ao item da linha do tempo por coluna declarada: `issue_terminal_lines.timeline_item_id` (nullable) = id do fato `agent.publish.ran`, que é o `id` do item `PUBLISH_RAN` — o console abre "a saída desta publicação" por igualdade, nunca por janela de tempo nem por texto da linha. `PublishRunOutcome` = `SUCCEEDED` (exit 0), `FAILED` (exit ≠ 0 ou spawn falho), `TIMED_OUT`, `CANCELLED_BY_STEER`, `CANCELLED_BY_PAUSE`.
- **Grupo:** sucesso ou falha vira uma linha pelo `integration.thread.issue_signal` (nível `FEEDBACK`, política de saída da fase 3), texto determinístico por desfecho (`thread/i18n/messages.ts`, tabela total por `PublishRunOutcome`); cancelado não fala (a sessão acorda e fala).
- **Depois:** `FAILED`/`TIMED_OUT` ⇒ um recado à sessão com o desfecho e o fim da saída (ela precisa corrigir). `SUCCEEDED` ⇒ o que a pergunta declarou em `StopAsk.onPublished` (campo novo opcional, união discriminada por `PublishFollowUpKind`): `COMPLETE { summary }` — o codm conclui a tarefa pelo mesmo caminho da conclusão declarada, sem turno; `CONTINUE` ou ausente — um recado à sessão com o desfecho (um turno curto de confirmação, no lugar do turno que roda a publicação).
- Fato `agent.publish.ran { issueId, outcome, exitCode?, durationMs }` (sem argv).

**d. Modelo por tipo de trabalho.** Tabela `MODEL_BY_WORK_KIND: Record<ProviderKind, Record<IssueWorkKind, ModelChoice>>`, com `ModelChoice` união discriminada `{ kind: 'CONVERSATION' } | { kind: 'MODEL', model: AgentModelId }` (sem string sentinela; `DEFAULT` difere por CLI, então a tabela é por provedor). `CLAUDE_CODE.DIAGNOSIS → { MODEL, SONNET }`. O modelo é resolvido no fork e gravado em `agent_issue_attributes.model`; nunca muda na vida da issue (mudar invalida a retomada: `MODEL_CHANGED`). **Isto reverte uma decisão documentada** no dispatcher ("a issue herda o modelo da conversa, resolvido agora"): para tarefas novas, trocar o modelo da conversa deixa de valer para tarefas já abertas. Issues antigas (sem linha de atributos) continuam herdando.

### Item 7 — saúde do sistema

- `GET /ui/system/health` (BFF `ui`, query use case `GetSystemHealth`, DTO `QuotaSnapshotSchema`): selo, janela e semana, vagas com `limitedBy`, fila, disco, daemon. O dispatcher expõe o estado pela porta `QuotaStatusReader`.
- Console: faixa de saúde no topo de "Tarefas" (componente no `-components/` da rota, SDK, SSE existente).
- Painel na nuvem: o snapshot (`issue/usecases/PublishPanelSnapshot`) leva `PanelHealthSchema` (percentuais e estados, nunca gasto/teto absolutos); "daemon sem contato há N min" já existe.

## Migrações

SQLite (uma, `0037`, `bun migrate:create` + `db:sync-go` + `db:check-go`; contagem de tabelas do core-go 31 → 34, `store_test.go`):
- `agent_mailbox.claim_class` text NOT NULL **DEFAULT `'WORK'`** — constante, porque o `ADD COLUMN ... NOT NULL` do SQLite exige default constante (revisão 2); a linha existente recebe a classe derivada do `kind` num `UPDATE` escrito à mão na própria migração, pela tabela declarada `CLAIM_CLASS_OF_KIND` (`WORK → WORK`, `STEER → STEER`, `ISSUE_RESULT → RESULT`, `OPERATOR_MESSAGE → OPERATOR`). Por que `WORK`: é a classe mais conservadora para um escritor que contorne o `EnqueueMailboxItem` — nunca junta recados (S5), nunca passa à frente (S4) —, a mesma postura do `posture DEFAULT 'AUTO'` ao lado. **Sem CHECK** (coluna nova em tabela existente; o `z.enum` fecha na hidratação). Teste fixa a migração com o `LibSqlDriver` real: linhas semeadas de cada `kind` saem com a classe da tabela, nenhuma nula, e um insert sem a coluna sai `WORK`. Índice `(target_kind, target_id, created_at) WHERE dead_at IS NULL AND consumed_at IS NULL` se o plano de consulta pedir.
- `issue_terminal_lines.timeline_item_id` text nullable, indexado com `issue_id` (item 6c: a saída do comando ligada ao item `PUBLISH_RAN`).
- Tabela nova `agent_issue_attributes` (`issue_id` PK, `owner_id`, `thread_id` indexado, `priority`, `priority_reason`, `work_kind`, `model` nullable, `created_at`) — CHECKs por `enumCheck`. A migração **preenche** uma linha por issue existente a partir de `issue_issues` (`NORMAL`/`DEFAULT`/`CHANGE`, `model` nulo = herda da conversa), para a fila e o `ForkedIssueReader` valerem também para tarefas anteriores.
- `issue_issues.priority`, `priority_reason`, `work_kind`, `model` (projeção para leitura) — nullable, sem CHECK.
- `agent_agent_sessions.handoff_notes` text, `handoff_at` integer.
- `agent_issue_attributes.worktree_path` text nullable, `worktree_seen_at` integer, `closed_at` integer (item 1, limpeza). Preenchimento: `closed_at` = `completed_at` das issues concluídas, nulo nas demais (arquivada sem instante fica sem limpeza até ser fechada de novo); nenhuma linha antiga tem `worktree_path`, então nada antigo é apagado.
- `workspace_workspaces.publish_command` text (JSON) nullable (item 6c).
- Tabelas novas `thread_batches` (`id`, `owner_id`, `thread_id`, `code`, `seq`, `source_entry_id`, `item_count`, `status` (CHECK por `BatchStatus`), `receipt_entry_id`, `created_at`, `updated_at`, `version`; único `(thread_id, seq)`) e `thread_batch_items` (`batch_id`, `n`, `excerpt`, `destination` json, `issue_id` nullable indexado; PK `(batch_id, n)`).
- **Go/sqlc (revisão 2).** O gateway lê `issue_issues` e `workspace_workspaces` por consultas sqlc com **lista explícita de colunas** (`query/issue.sql`, `query/workspace.sql`), e as colunas novas são nullable ou têm default — nada do Go quebra nem precisa lê-las nesta fase, então o S0a **não** regenera o sqlc. Medido: o transcrito `core/db/sqlite/schema.sql` já está atrás do banco (29 `CREATE TABLE` contra 31 tabelas; sem `output_mode` da 0036). O slice que fizer o Go **ler** uma coluna nova faz antes o rito inteiro do `sqlc.yaml`: re-transcrever `schema.sql` do esquema atual (não só da 0037), `bun scripts/db/split-sqlite-schema.ts`, `sqlc generate` nos dois configs e o gate `scripts/sqlc-parity.test.ts`.

Nuvem (pg, `0008`, aplicada antes do daemon): `panel_batches` (`thread_id`, `code`, `owner_id`, `batch` jsonb = `BatchSchema`, `updated_at`; PK `(thread_id, code)`); coluna `health` jsonb (nullable, `PanelHealthSchema`) em **`panel_daemons`** — a saúde é da máquina e da conta, uma por dono, ao lado do `last_seen_at` que já vira o "daemon sem contato" (revisão 2: "estado do grupo" não existia como tabela; por grupo seria a mesma linha repetida); **recriar `panel_issues_life_state_check`** (`pg/schema/panel.ts`, derivado de `IssueLifeState`) com `WAITING_BUDGET` — sem isso o painel recusa o estado novo.

## Testes

- `QuotaBudget.test.ts` (puro): admissão nas duas janelas; piso da reserva (`max(reserva × teto, gastoOrquestrador)`), medido acima e abaixo de 5%; corte na recusa com turnos em voo; sonda para cima depois de N janelas sem recusa com demanda; volta à semente na troca de conta; `UNKNOWN` corta só 5 h; média com cauda.
- **Simulação de aceite em laço fechado** (`tests/flows/fase4-quota-replay.test.ts`, relógio injetado): a fixture anonimizada (`tests/fixtures/quota/usage-2026-11.json` — só deslocamentos de tempo, papel, os baldes e os instantes de recusa; sem ids, sem texto) é reproduzida como **demanda** (itens que chegam), e só os turnos admitidos são cobrados (custo do turno tirado da fixture). Semente ajustada só em W45; as recusas de W46–W47 são o teste fora da amostra, modeladas como "o provedor recusa quando o gasto real da janela passa do limite implícito daquela recusa". Assertivas: (1) a pista ISSUE fecha antes de o gasto alcançar cada limite implícito; (2) com a pista ISSUE fechada pelo orçamento, itens THREAD continuam sendo reivindicados e respondidos; (3) caso extra: com o provedor recusando mesmo assim, a pausa da conta acontece (THREAD inclusive, comportamento declarado), o teto é cortado e a janela seguinte fecha a pista mais cedo; (4) as horas seguradas são menores que as horas pausadas da fixture. Roda também com pesos só de saída.
- `LibSqlMailboxDispatcher.slots.test.ts`: vaga efetiva e `limitedBy`; THREAD nunca segurada.
- `LibSqlMailboxRepository.rank.test.ts`: `DECISION_ANSWER` passa à frente; FIFO no alvo mesmo com rank melhor num item mais novo; ordem das pistas preservada; empate por chegada.
- `LibSqlMailboxDispatcher.coalesce.test.ts`: três recados → um turno; prefixo para no "agora" e em postura diferente; pausa, adiamento, corte, falha (só a cabeça gasta) e envenenamento sobre o grupo; ☑️/✅ por item com o `firstClaim` de cada um; cursor e dedup = último item; crash no meio não parte o grupo.
- `RunIssueTurn.handoff.test.ts` (aceite "preserva o fio"): acima de 100 mil o prompt pede notas; acima de 120 mil sessão nova com notas, objetivo, decisão aberta e recado pendente no primeiro prompt; sem notas, as derivadas; abaixo de 100 mil nada muda; fato `handed_off`.
- `Batch.test.ts` + `RecordBatch.test.ts` (aceite "10 itens, 10 destinos"): 10 → 10 destinos gravados; 9 → `BATCH_ITEMS_MISMATCH`, nenhum recibo; issue de outra conversa → `BATCH_ISSUE_NOT_IN_THREAD`; issue recém-forkada no mesmo turno é aceita; `ATTACHED` → steer; recibo uma vez.
- `BatchDetector.test.ts`: listas, marcadores, menos de 3 não é lote, frase com números não é lista; lote não vai à triagem.
- Modelo: `DIAGNOSIS` roda no modelo da tabela; troca do modelo da conversa não muda issue aberta; issue antiga herda.
- Arquitetura: todo produtor de `AgentUsageEvent` passa `role`; todo produtor de item da fila passa `claimClass`; todo nascimento de issue grava `agent_issue_attributes` (fixtures negativas). Exposição MCP: nenhuma ferramenta exposta tem `publishCommand`/`argv` na entrada ou na saída (S0b).
- Migração 0037 aplicada pelo `LibSqlDriver` real sobre linhas semeadas (`claim_class` preenchido pelo `kind`); pg 0008 aceita `WAITING_BUDGET`.
- e2e: faixa de saúde no console com estado `HOLDING` (fixture).
- `IssueWorktreeJanitor.test.ts` (git real em pasta temporária): apaga a worktree de tarefa fechada há mais de 7 dias, limpa, registrada; **não** apaga com mudança não commitada, com arquivo não rastreado, travada, de tarefa reaberta (item na fila depois do `closed_at`), compartilhada com tarefa aberta, fechada há menos de 7 dias, sem registro, nem a worktree principal; a branch continua depois da remoção. Registro pelo hook: `cwd` dentro de uma worktree do workspace grava o topo; `cwd` na principal ou fora do workspace não grava.
- Publicação (`RunPublishCommand.test.ts`, relógio roteirizado, runner falso + um teste do runner real com um executável de teste): `argv` sem shell (um argumento com `;`/`$()` chega literal); `cwd` = worktree registrada; sem comando no workspace ⇒ turno de sessão; resposta que não autoriza ⇒ turno de sessão; recado durante a janela ⇒ `CANCELLED_BY_STEER` e turno de sessão; pausa ⇒ `CANCELLED_BY_PAUSE`; exit 0 ⇒ `PUBLISH_RAN SUCCEEDED`, linha `FEEDBACK` no grupo e `COMPLETE` conclui sem turno; exit ≠ 0 ⇒ `FAILED`, recado à sessão com o fim da saída; prazo ⇒ `TIMED_OUT` e o processo morto; a linha do tempo e o fato não levam argv nem saída (segredo no argv não aparece); a saída vai ao log de terminal.

## Rollout

- Ordem: **nuvem antes do daemon** — pg 0008 **e** o código da nuvem cujo `SyncPanel` (`z.enum(IssueLifeState)`) e o `panel_issues_life_state_check` já aceitam `WAITING_BUDGET` → só depois o daemon (SQLite 0037 no boot, testada numa cópia do banco real antes). Ao contrário, o primeiro `PUT /panel/sync` com uma tarefa `WAITING_BUDGET` seria recusado inteiro e o painel congelaria. (Com o orçamento em observação o estado nem é produzido, mas a ordem não depende disso.)
- O orçamento começa em **modo observação** (`CODM_AGENT_QUOTA_ENFORCE=false`, configuração declarada com consumidores, desligada por padrão): calcula, mostra na saúde e grava `agent.quota.held { enforced: false }`, sem segurar. **Decisão do dono (19/11): observar uma semana**; ligar é decisão revista com os fatos `quota.held` dessa semana.
- As vagas 5 e 6 só abrem com o livre acima de `ISSUE_SLOTS_FULL_MIN_FREE_BYTES`; a limpeza de worktrees roda antes.
- Workspace sem `publish_command` continua igual (a sessão acorda para publicar).
- Itens antigos entram com a classe derivada do `kind`; issues antigas sem atributos herdam modelo da conversa e prioridade `NORMAL`.
- Reverter sem build: `CODM_AGENT_QUOTA_ENFORCE=false`, `CODM_AGENT_ISSUE_SLOTS_MAX=4`.

## Como medi (antes)

Cópia `sqlite3 -readonly` / `python3 -I` sobre `file:<copia>?mode=ro`. Janela `occurred_at ∈ [primeiro agent.turn.usage, max(agent_mailbox.created_at)]`. Scripts fora do repo; só agregados.
```sql
-- gasto por papel: entidade do fato de uso é issue ou conversa
select (entity_id in (select id from issue_issues)) as is_issue, count(*), sum(json_extract(payload,'$.outputTokens')), sum(json_extract(payload,'$.cacheReadInputTokens')) from shared_events where name='agent.turn.usage' group by 1;
-- turnos em voo: par (agent.run.started, próximo agent.turn.usage|agent.run.stop_raised da mesma entity_id), teto 60 min; varredura de eventos +1/-1
-- espera: por item ISSUE, pronto = max(created_at, consumed_at do item anterior do mesmo alvo); espera = primeiro run.started do alvo >= pronto
-- pausa: SYSTEM com text like 'Atingi o limite%', agrupado em 45 min; fim = próxima ocorrência da hora anunciada (fuso -03); união dos intervalos
-- custo por tarefa: soma por issue (criada e COMPLETED na janela); turnos = nº de fatos de uso
-- contexto: agent_agent_sessions.last_context_tokens where issue_id is not null
-- recados juntáveis: STEER criado com item anterior do mesmo alvo ainda sem consumed_at
-- aprovações: issue_stops kind in (APPROVAL_NEEDED, PERMISSION_DENIED) and resolution='APPROVE'
```
Ponderação usada: entrada 1, escrita de cache 1,25, leitura de cache 0,1, saída 5 (proporção de preço público; suposição).
Máquina: `sysctl hw.memsize hw.ncpu`, `df -h /System/Volumes/Data`, `memory_pressure`. Forma do `rate_limit_info`: contagem de chaves nas transcrições locais do CLI.

## Riscos

- Teto aprendido instável se a tabela de pesos errar a mistura de baldes ou se o plano da conta mudar; mitigado pelo modo observação, pela sonda para cima, pela volta à semente na troca de conta e pela recusa como corte.
- Juntar recados muda o contrato "um item por turno": a lista de pontos acima é fechada e cada um tem teste.
- Notas derivadas podem perder estado tácito; a sessão escreve as suas quando pode.
- Disco cheio derruba a máquina antes da cota; o portão reduz vagas, não libera disco.

## Fora de escopo

- Segunda conta do provedor ou uso por API (decisão em aberto do dono; números na fase 5).
- Mudar a chave da pausa para provedor × modelo (só com dado do fato novo).
- Plano antes de abrir lote (B2).
- Passar de 6 vagas.

## Revisão (skill `spec-review`, 2026-11-19)

Revisão independente (agente sem contexto, só o spec e o código). Veredito inicial: **não pronto** (2 críticos, 7 moderados). Aplicado:
- **Crítico — admissão por provedor antes do `claimNext` é impossível** (o provedor só é conhecido depois da reivindicação; por isso `pausedUntil` é global): orçamento passou a ser global da conta.
- **Crítico — com o orçamento ligado o teto só desce** (a folga nunca acontece; recusa subconta turnos em voo; conta trocada sem identidade nos fatos; fronteira de janela perdida no reinício): sonda para cima declarada, corte com projeção dos turnos em voo, volta à semente na evidência de conta trocada, fronteira de janela gravada no fato de uso.
- Recados juntos: porta com operações sobre conjunto e transacional, prefixo contíguo que para no "agora"/postura diferente, `firstClaim` e tentativa por item, entradas de item único do `RunIssueTurn`, aborter e dedup pelo último item.
- Prioridade: o enqueue não lê a issue e o `agent` não lê `issue` em execução — classe do item virou campo declarado obrigatório (`MailboxClaimClass`, fim da leitura do prefixo `resume:`) e a prioridade da tarefa mora numa tabela do `agent` escrita no fork, lida por junção na reivindicação; `RecordBatch` não muda prioridade; a validação de destino do lote usa o fork (síncrono), não a linha de `issue_issues` (assíncrona).
- Troca de sessão: o guarda recusa retomar acima do orçamento — dois limiares (100 mil pede notas, 120 mil troca).
- `WAITING_BUDGET` derivado de `QUEUED` + `QuotaStatusReader`, com precedência.
- pg 0008 recria `panel_issues_life_state_check`; lista das tabelas totais tocadas.
- Simulação em laço fechado, semente fora da amostra, caso de recusa mesmo assim.
- Triagem grava uso por um gravador do `agent` dentro do serviço.
- Baixos: piso da reserva sem contar o orquestrador duas vezes; média em vez de mediana; balde de raciocínio nos pesos; `ModelChoice` discriminado; reversão da herança de modelo assumida; conjuntos fechados viraram enums; DTO do painel sem números absolutos; `limitedBy` nas vagas; arestas novas no mapa de contextos; opções de empate com estado; lote fora da triagem; máximo de vagas por env (reverter sem build).

**Cobertura da revisão e segunda passada.** A primeira passada leu `CLAUDE.md`, o código e os specs das fases 0–3, mas não `docs/BACKEND.md`, `docs/FRONTEND.md` nem os `registry.yaml` das skills. Depois dela o desenho mudou (tabela `agent_issue_attributes`, classe declarada do item, sonda para cima, portas novas); conferi à mão as arestas contra os `context.ts` (já declaradas, acima) e corrigi a ordem do plano. A segunda passada independente, só nas seções alteradas e com os docs e registries, foi feita antes do S0a — ver "Revisão 2 aplicada" abaixo.

### Revisão 2 aplicada (2026-11-19)

Segunda passada independente (`spec-review`, agora com `docs/BACKEND.md`, `docs/FRONTEND.md`, `.claude/registry.yaml` e os `registry.yaml` das skills), só nas seções alteradas. Veredito: **não pronto** (2 críticos, 9 moderados, 5 baixos). Aplicado:
- **Crítico — o comando de publicação vazaria para o modelo:** `ListWorkspaces` é ferramenta MCP (`system`, `orchestration`) e o desenho punha `publishCommand` no DTO dela. Agora: leitura e escrita por portas próprias sem `mcpScopes`, nenhum DTO exposto por MCP carrega o comando, teste sobre o snapshot de exposição e o `openapi.json` (item 6c).
- **Crítico — o gatilho do "pode publicar" não existia:** `ResumeIssueOnStopResolved` não enfileira nada para `APPROVE` com item pendente, e o payload não tem `stopId` (só a chave `resume:`). Agora: `stopId`/`resolution` declarados no payload (S0c) e "enfileira mesmo com pendente" também quando `PUBLISH_AUTHORIZED_BY` autoriza (S11) — sem virar `APPROVE` em geral (item 6c).
- Moderados: a união `IssueTimelineItemSchema` e o leitor `issue/utils/issueTimeline.ts` entram no S0a (a união é de `z.literal`, o compilador não acusa); `PublishRunSchema` em `shared/schemas` (forma de linha do tempo, como `RegretWindowSchema`), não em `shared/objects`; ordem de implantação: nuvem (pg **e** código do `SyncPanel`) antes do daemon; `MailboxClaimClass` virou enum de fio; `BatchStatus` declarado (coluna com CHECK e campo do `BatchSchema`); passos do sqlc registrados para o slice em que o Go ler coluna nova (e o transcrito, que já está atrasado, medido); `claim_class` com default constante `WORK` + `UPDATE` à mão + teste da migração com o driver real; `DeclareIssueOpen` e `CreateIssue` também gravam `agent_issue_attributes`; modo observação não anuncia (sem `BUDGET_HELD`, sem `WAITING_BUDGET`) e a sonda conta o "teria segurado"; saída do comando ligada ao item da linha do tempo por `issue_terminal_lines.timeline_item_id`.
- Baixos (leitura registrada, porque a revisão foi telegráfica): **imports no `main.tsp`** — todo `.tsp` novo é importado ali, senão não é emitido; **`mockController`** — no S0b as leituras `GET` (`GetSystemHealth`, `GetBatch`, `GetWorkspacePublishCommand`) usam `mockController = true` com `.example()` na saída (CTRL-C05), para o console e o painel construírem contra um retorno real; as escritas e ferramentas (`RecordBatch`, `WriteHandoffNotes`, `SetWorkspacePublishCommand`) **não**: um 2xx de mentira diria ao modelo (ou ao console) que gravou, e um `void` nem tem exemplo — recusam com o erro nomeado `THROUGHPUT_NOT_READY` (501), como o `OUTPUT_POLICY_NOT_READY` da fase 3; **registrar os códigos novos** — `THROUGHPUT_NOT_READY` (agent, thread, workspace), `BATCH_ITEMS_MISMATCH` e `BATCH_ISSUE_NOT_IN_THREAD` (thread) por `registerErrorCodes`, com i18n pt/en; **desempate por `id`** depois de `created_at`; **git fora do caminho da resposta do hook**.
- Nenhum achado rejeitado. Uma escolha local: a saúde do painel fica em `panel_daemons.health` (por dono), não "no estado do grupo" — a tabela por grupo repetiria o mesmo valor.

Perguntas abertas da revisão, respondidas no desenho: a reserva é um piso livre (não uma parte); o grupo de recados só junta mesma postura; admissão global aceita para instalação com dois CLIs (custo registrado); `Batch` é agregado próprio; o modo observação grava `agent.quota.held { enforced: false }`.

## Perguntas ao dono — respondidas (19/11)

As quatro perguntas desta seção foram respondidas pelo dono em 19/11 e estão em "Decisões do dono": (1) desempate por chegada; (2) comando de publicação declarado por workspace; (3) limpeza automática de worktrees + limiar para as vagas 5–6; (4) observar uma semana antes de ligar. Nenhuma pergunta aberta trava slice.
