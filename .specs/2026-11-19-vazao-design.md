# Fase 4 — vazão

Status: Draft (fase 4 do plano "tarefas visíveis, controláveis e que não se perdem")
Data: 2026-11-19
Depende de: `2026-11-12-pausa-por-pista-e-adiamento-liberavel-design.md` (pausa por limite, adiamento liberável), `2026-11-12-fase-0-tarefas-visiveis-design.md` (`first_claimed_at`, estado "esperando cota"), `2026-11-13-painel-na-nuvem-design.md` (snapshot do painel), `2026-11-16-falar-e-parar-na-hora-design.md` (triagem no modelo pequeno, "agora", pausa), `2026-11-17-emagrecer-o-grupo-design.md` (política de saída, `BlockCause`, um aviso por causa, resultado sem orquestrador).

## Problema (medido)

**Fonte.** Cópia somente leitura do banco de uma instalação real, janela de 13,9 dias (04/11 23:44Z → 18/11 20:11Z — `agent.turn.usage` só existe desde 04/11). A instalação roda a versão **anterior às fases 0–3** (`first_claimed_at` vazio em 100% dos itens, triagem e política de saída ausentes). Só agregados; comandos em "Como medi". Unidade de custo: ver "Unidade" abaixo — onde aparece "ponderado", é uma **suposição de tabela de preço**, não um número do provedor.

| Métrica | Valor |
|---|---|
| Turnos de issue em voo (de `agent.run.started` ao `agent.turn.usage`/`run.stop_raised` seguinte da mesma issue, teto 60 min) | 1.516 turnos. Fração do tempo: 0 → 69,2%; 1 → 12,0%; 2 → 6,4%; 3 → 4,4%; **4 → 7,6%**; 5+ → 0,4% (artefato de reinício/pareamento; o teto é 4). Mediana 0, média 0,71 |
| Horas de turno de issue | 236 h em 13,9 dias (17 h/dia); por janela deslizante de 5 h: mediana 1,9 h, p90 9,4 h, máx. 17,8 h |
| Duração de um turno de issue | mediana 5,2 min, p75 12,7, p90 23,6 |
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
| Aprovações que acordaram a sessão | `APPROVAL_NEEDED → APPROVE` 165 e `PERMISSION_DENIED → APPROVE` 27 na janela (~13% dos 1.294 turnos de issue com uso, limite superior do "pode publicar" sem sessão) |
| Máquina (18/11) | Apple M4, 10 núcleos, 16 GB; **volume de dados 99% cheio, 2,3 GiB livres**. Memória: 50% livre no instante. O RSS por turno de issue não foi medido (os processos `claude` vivos não eram turnos do codm) |

**Antes de cada recusa** (22 avisos agrupados em janelas de 45 min): horas de turno de issue nas 5 h anteriores entre 0 e 17,4 (05–10/11: 4,3–17,4; 11–13/11: 0,8–2,6); gasto ponderado nas 5 h anteriores entre 7×10⁶ e 6,8×10⁷; nos 7 dias anteriores, até 7,9×10⁸. As recusas de 11–13/11 vieram com pouco gasto em 5 h e o maior gasto em 7 dias: **limite semanal**. Nas transcrições locais do CLI (`~/.claude/projects`), `rate_limit_info` traz `status`, `resetsAt` (segundos), `rateLimitType ∈ {five_hour, seven_day, seven_day_overage_included}` (895 / 92 / 1), `overageStatus`, `isUsingOverage`, `unifiedRateLimitFallbackAvailable`. **`utilization` nunca apareceu**; `allowed_warning` só aparece no esquema do CLI, sem captura.

**O que não dá para derivar:** espera na fila pelo `first_claimed_at` (coluna vazia nesta versão; a espera acima vem do `run.started`); gasto da triagem; tipo da tarefa (diagnóstico × mudança) sem ler texto; quantas aprovações tinham um PR pronto; RSS e disco por turno.

### Leitura — o que a medição muda no desenho

1. **Vagas não são o gargalo.** As 4 vagas ficaram cheias 7,6% do tempo, enquanto a demanda passou de 4 em 37% do tempo: a diferença é pausa por limite e adiamento, não falta de vaga. Subir para 6 sem orçamento só chega mais cedo na recusa.
2. **Não existe um teto estável por janela de 5 h.** Antes das recusas, as horas de turno variaram de 0,8 a 17,4 e o gasto de 7×10⁶ a 6,8×10⁷. O ponto de partida do brainstorm ("~15 h de execução por janela") está acima da maioria das recusas medidas e **não cobre o limite semanal**, que dominou 11–13/11. Por isso o orçamento é medido em custo de tokens (não em horas, que nada persiste por turno), por janela **e** por semana, e o teto é **aprendido** por recusa e folga — não fixado.
3. **A reserva de 5% não pode ser fechada agora.** O orquestrador gasta 11% da saída e 15–22% do ponderado, e esta medição é toda anterior à fase 3 (que tira dele os resultados de tarefa e o relatório). Regra do dono: usar o maior entre 5% e o medido. A reserva é calculada em execução e cai sozinha para 5% quando o medido cair.
4. **A pausa por limite cala o orquestrador junto.** No código atual (#69, `LibSqlMailboxDispatcher.pausedUntil`), uma recusa pausa **todas** as pistas do provedor — o spec "pausa por pista" foi substituído pela pausa por conta. Como a cota é da conta, isso é correto para o limite de 5 h. Logo, "o orquestrador continua respondendo com a cota de tarefas esgotada" só é possível se as tarefas pararem **antes** de o provedor recusar: o orçamento é o mecanismo, não a pausa.
5. **Disco.** Com 2,3 GiB livres, 6 vagas (cada uma com worktree e build) arriscam a máquina antes da cota. A vaga 5 e 6 dependem de um portão de disco (item 1) e de uma decisão do dono (perguntas).
6. **Baratear é a alavanca maior:** 75% das sessões de issue passam de 120 mil de contexto; 61% dos recados poderiam viajar juntos; ~13% dos turnos são aprovações.

## Decisões do dono (não reabrir)

- Limite de tarefas simultâneas: **o máximo possível, adaptativo pela cota** (12/11).
- **Reserva de 5% da cota para o orquestrador** — e, antes de fechar nesse número depois da fase 3, **usar o maior entre 5% e o gasto medido do orquestrador** (objetivo, fase 4 item 3).
- Grupo enxuto (fase 3): o recibo de lote é resposta do orquestrador a uma pessoa, então continua no grupo; avisos de bloqueio são um por causa.
- Painel para todos por link de grupo (fase 1); ações pelo painel com identificação (fase 2).

**Critério de aceite (objetivo):** simulação com eventos de uso reais (anonimizados) mostra o agendador segurando tarefa nova antes de estourar a janela; orquestrador continua respondendo com a cota de tarefas esgotada; recibo de lote com 10 itens registra 10 destinos; troca de sessão acima do limiar preserva o fio (teste).

## Desenho

### Quem é dono

- **`agent`** é dono do orçamento, das vagas, da prioridade de reivindicação, de juntar recados, da troca de sessão e do modelo por tipo de tarefa. Ele já é dono da fila (`agent_mailbox`), das sessões, dos fatos de uso (`agent.turn.usage`), da leitura do limite do provedor (`RateLimitRecord`) e da pausa (`LibSqlMailboxDispatcher`). Nenhum outro contexto lê ou escreve a fila.
- **`issue`** guarda os dois atributos declarados da tarefa que o `agent` consulta: prioridade e tipo de trabalho (colunas em `issue_issues`, escritas no fork, lidas pela porta que o `agent` já usa para a issue).
- **`thread`** é dono do lote: a mensagem de origem é dele, o recibo é fala do orquestrador no grupo e o destino "anexado a X" é um steer roteado, que ele já produz.
- **`ui`** (BFF) monta a saúde do sistema para o console; **`panel`** (nuvem) mostra lote e saúde a partir do snapshot.

### Unidade de orçamento

O provedor não expõe saldo nem utilização (medido acima). O orçamento usa uma **unidade de custo** derivada dos quatro baldes do `AgentUsageEvent` por uma tabela declarada `USAGE_COST_WEIGHTS: Record<AgentModelId, Record<UsageBucket, number>>` em `agent/utils/UsageCost.ts` (proporção de preço público entre entrada, escrita e leitura de cache e saída por modelo; `DEFAULT` herda a linha do modelo padrão do CLI). A tabela é uma suposição: o teto é aprendido na mesma unidade, então um erro de escala se anula; um erro de **mistura** (peso relativo errado entre baldes ou modelos) não se anula e aparece como teto instável — por isso a simulação de aceite roda também com pesos só de saída, e o spec mede as duas.

### Contrato primeiro

TypeSpec (`packages/contracts/src/wire/enums/`), todos cruzam o fio (console, painel, SDK):
- `UsageRole` — `ORCHESTRATOR`, `ISSUE`, `TRIAGE`. Quem gastou.
- `ProviderLimitWindow` — `FIVE_HOUR`, `WEEKLY`, `UNKNOWN`. Mapeamento declarado de `rateLimitType` (`five_hour → FIVE_HOUR`, `seven_day* → WEEKLY`, ausente/outro → `UNKNOWN`) numa tabela em `StreamJsonCodec`, nunca por prefixo de string fora dela.
- `IssuePriority` — `HIGH`, `NORMAL`, `LOW`. Prioridade declarada da tarefa (lote ou orquestrador).
- `PriorityReason` — `CLIENT_BUG`, `DECLARED`, `DEFAULT`. Por que a tarefa tem essa prioridade; `CLIENT_BUG` é o "bug de cliente" do objetivo.
- `IssueWorkKind` — `CHANGE`, `DIAGNOSIS`. O que a tarefa faz; escolhe o modelo.
- `BatchItemDestinationKind` — `NEW_ISSUE`, `ATTACHED`, `ALREADY_LIVE`, `DECLINED`, `DEFERRED`, `NEEDS_DECISION`. Discriminante do destino de um item de lote.
- `QuotaState` — `OK`, `NEAR` (≥ 70% da semana), `HOLDING` (tarefas seguradas pelo orçamento), `REFUSED` (provedor recusando). Selo da saúde.
- Existentes que crescem: `IssueLifeState += WAITING_BUDGET` (a próxima vez da tarefa está segurada pelo orçamento, não pelo provedor); `BlockCause += BUDGET_HELD` (um aviso por grupo enquanto o orçamento segura tarefas daquele grupo); `IssueTimelineItemKind += BATCH_LINKED` (a tarefa nasceu ou recebeu um item de lote).

Fatos de domínio do `agent` (`z.domainEvent`, só TS — não cruzam serviço):
- `AgentUsageEvent` ganha `role: UsageRole`, `provider: ProviderKind`, `model: AgentModelId` (opcionais no schema porque linhas antigas não os têm; **o orçamento só soma eventos com `role`** — nada de inferir papel pelo `entity_id`). A triagem passa a gravar o fato (`role: TRIAGE`, entidade = conversa).
- **Novo** `AgentProviderLimitEvent` (`agent.provider.limit_observed`) — `{ provider, model?, window: ProviderLimitWindow, status: 'REJECTED' | 'WARNING', resetsAt? }`. Gravado quando o runner vê `rejected` (já lido hoje) ou `allowed_warning` (se aparecer). É o fato de que o teto aprende e o que torna as horas pausadas mensuráveis daqui em diante (hoje só a hora do aviso existe).
- **Novo** `AgentSessionHandedOffEvent` (`agent.session.handed_off`) — `{ issueId, fromContextTokens, notesSource: 'SESSION' | 'DERIVED' }`. Linha do tempo e medição do item 6.

Schemas compartilhados em `shared/objects/` (só o `shared` declara `exposes.objects`, então é o único barril que o `registerSchemas` publica — mesma regra do `StopAsk` da fase 3; sem `.refine()` sensível). Os invariantes ficam nos objetos de valor/agregados dos contextos donos (`thread/entities/Batch`):
- `QuotaSnapshotSchema` — `{ state: QuotaState, window: { spent, ceiling, reserve, resetsAt? }, week: { spent, ceiling, resetsAt? }, slots: { inUse, max, effective }, queue: { pending, heldByBudget }, diskFreeBytes }`.
- `BatchItemDestinationSchema` — união discriminada por `kind`: `NEW_ISSUE { issueId }`, `ATTACHED { issueId }`, `ALREADY_LIVE { issueId?, note }`, `DECLINED { reason }`, `DEFERRED { reason, until? }`, `NEEDS_DECISION { issueId, stopId }`. Non-Negotiable 3: nada de `issueId?/reason?` soltos.
- `BatchItemSchema` — `{ n, excerpt, destination: BatchItemDestination }`; `BatchSchema` — `{ code ('L-31'), sourceEntryId, items[] }`.

Migrações: ver seção própria.

### Item 1 — vagas: 4 → 6, com portão de máquina

- `TURN_LANES[ISSUE].slots` vira o **máximo** (6); a vaga **efetiva** é `min(max, MachineCapacity.issueSlots(), orçamento)`. Nenhum número novo no laço: `drainLoop` passa a ler `effectiveSlots(kind)` em vez de `this.lanes[kind].slots`.
- `agent/services/MachineCapacity` (porta + implementação `real` que lê `statfs` do volume de dados e a pressão de memória do SO; `mock` e `integration` devolvem valores fixos). Tabela declarada `ISSUE_SLOTS_BY_DISK: readonly { minFreeBytes, slots }[]` (proposta: ≥ 20 GiB → 6; ≥ 10 GiB → 4; ≥ 5 GiB → 2; abaixo → 1). O piso não é decidido sozinho: ver "Perguntar ao dono".
- "Medir antes de passar de 6": o snapshot de saúde registra RSS total dos processos de turno e disco livre a cada amostra; nada acima de 6 entra nesta fase.
- A pista THREAD fica com 3 vagas e **nunca** passa pelo orçamento (é a reserva).

### Item 2 — orçamento adaptativo por janela de 5 h e semanal

**Quem decide:** um serviço puro `agent/services/QuotaBudget` (sem I/O), alimentado por um leitor `QuotaLedgerReader` (lê `shared_events` por `name` + `occurred_at`, índice existente `events_name_idx`). O dispatcher pergunta antes de abrir a pista ISSUE.

**Janelas.** Por provedor: a de 5 h e a semanal. Fronteira: o último `resetsAt` conhecido daquela janela (de recusa ou de `rate_limit_event`); sem ele, janela deslizante (5 h / 7 dias). A semana do provedor não é a semana ISO.

**Teto aprendido (por provedor × janela)** — derivado dos fatos, recalculado no boot e a cada fato novo, sem tabela:
- semente declarada (`QUOTA_SEED_CEILING: Record<ProviderLimitWindow, number>` em unidades; proposta a partir desta medição: 5 h ≈ p25 do gasto nas 5 h antes das recusas de 5 h de 06–10/11; semana ≈ 90% do gasto de 7 dias antes das recusas de 11–13/11; registrado no código com a origem);
- **recusa** da janela W com gasto G na janela corrente ⇒ `teto = min(teto, G)` (a recusa prova que G bastou);
- **aviso** (`allowed_warning`) ⇒ o mesmo, multiplicado por um fator declarado (o aviso vem antes do fim);
- **folga**: janela W que terminou sem recusa com gasto G > teto ⇒ `teto = G` (prova de que cabia mais);
- uma janela `UNKNOWN` aprende só a de 5 h (a mais conservadora) e é registrada para revisão.

**Admissão (antes do `claimNext`, nunca depois).** A pista ISSUE só entra em `open` se, para as duas janelas:
`gasto(todos os papéis) + emVoo × custoEsperado + custoEsperado ≤ teto × (1 − reserva)`.
- `custoEsperado` = mediana do custo dos últimos 50 turnos de issue (custo só chega no fim do turno, então turnos em voo são projetados por ele).
- Sem admissão, a pista ISSUE sai de `open` como já sai na pausa: **nenhum item é reivindicado e devolvido** (desfazer uma reivindicação nunca é de graça — lição de 05/08). Itens STEER que respondem a decisão (prioridade de item, abaixo) continuam sujeitos ao orçamento: a reserva é do orquestrador, não das tarefas.
- Estado da tarefa: issue com item vivo e pista segurada pelo orçamento ⇒ `IssueLifeState.WAITING_BUDGET`; um aviso por grupo afetado (`BlockCause.BUDGET_HELD`, política da fase 3) com o instante estimado de volta (fronteira da janela).

**Reserva (item 3).** `reserva = max(0,05, parteMedida)`, com `parteMedida` = gasto `ORCHESTRATOR + TRIAGE` sobre o total, nos últimos 7 dias, na unidade do orçamento, só com eventos que têm `role`. Até haver 7 dias de eventos com `role`, vale a medição desta fase (18,6% ponderado; ver "Unidade") como valor declarado de partida. Quando o medido cair abaixo de 5% (esperado depois da fase 3), a reserva fecha em 5% sem mudança de código — é exatamente a regra do dono.

**Semanal.** O mesmo controle na janela semanal; ao cruzar 70% do teto semanal, `QuotaState.NEAR` na saúde do sistema (console e painel) e uma linha no registro. Sem mensagem no grupo por isso (o grupo só ouve quando tarefas forem seguradas — `BUDGET_HELD`).

**Recusa mesmo assim.** Se o provedor recusar antes do teto aprendido, o caminho de hoje (#69: adiar, pausar a conta, avisar, sondar no teto) segue igual, e a recusa corta o teto para a próxima vez.

**Limite por modelo (fora do escopo, registrado):** os resets de 7 dias com outra pista respondendo (spec "pausa por pista", 12/11) sugerem limite semanal por modelo; a pausa por conta de hoje cala também o orquestrador nesse caso. O fato `limit_observed` grava `model` para medir isso; mudar a chave da pausa fica para quando houver dado.

### Item 4 — fila com prioridade

Classes fixadas pelo objetivo, numa tabela total `CLAIM_RANK` em `agent/utils/ClaimRank.ts` (menor vai primeiro):
1. item que leva a **resposta a uma decisão** (STEER gerado por `thread/usecases/AnswerStop` → `thread/handlers/ResumeIssueOnStopResolved`) — prioridade de **item**;
2. tarefa `PriorityReason.CLIENT_BUG`;
3. tarefa `IssuePriority.HIGH` (declarada em lote ou pelo orquestrador);
4. `NORMAL`; 5. `LOW`.

- Coluna `agent_mailbox.rank` (inteiro, gravado no enqueue a partir da tabela; o enqueue já conhece o tipo do item e lê a issue). A ordem por destino continua FIFO: o candidato é sempre o item **mais antigo pronto do seu alvo** (`NOT EXISTS` de item mais antigo pronto do mesmo alvo), e os alvos são ordenados por `min(rank)` dos seus itens prontos, depois por `created_at`. Um STEER de prioridade nunca passa à frente de um item mais antigo da mesma tarefa.
- Prioridade da tarefa: `ForkIssue` ganha `priority?: IssuePriority` e `priorityReason?: PriorityReason` (padrão `NORMAL/DEFAULT`); a ferramenta do lote declara por item; o orquestrador marca `CLIENT_BUG` quando o pedido descreve um defeito visto por cliente (prompt + teste de contrato da ferramenta).
- **Empate entre iguais com a fila cheia: PERGUNTAR AO DONO** (abaixo). Até a resposta, o código grava a opção (a) como tabela trocável, sem `if`.

### Item 5 — recibo de lote

- **Detecção sem modelo** (`thread/utils/BatchDetector.ts`, camada de regra da fase 2): mensagem com ≥ 3 itens numerados ou com marcador de lista vira candidata a lote, com N itens e o trecho de cada um. A mensagem segue para o orquestrador (um lote precisa de contexto para decidir destinos) com o lote anexado ao item: `"Lote L-31: 10 itens — registre o destino de cada um com RecordBatch"`.
- **Ferramenta do orquestrador** `RecordBatch { batchCode, items: [{ n, destination: BatchItemDestination, priority? }] }` (controller no `thread`, `static mcpScopes = [McpScope.ORCHESTRATION]`). Invariante no agregado `Batch` (filho do `Thread`): **todo item 1..N tem exatamente um destino**; faltou ou sobrou ⇒ `BATCH_ITEMS_MISMATCH` (DomainError), e a ferramenta devolve quais faltam. `NEW_ISSUE`/`ATTACHED` referenciam issues existentes da mesma conversa (`BATCH_ISSUE_NOT_IN_THREAD`). O destino `ATTACHED` não é só registro: o use case enfileira o trecho como steer para a issue (a mesma porta do roteamento da fase 2).
- **Recibo**: só depois do destino completo, uma mensagem determinística (sem modelo) no grupo, voz do orquestrador fora da política (como o recibo de criação): `"Lote L-31: 10 itens → 4 tarefas novas, 3 em tarefas existentes, 2 já no ar, 1 recusado (motivo). <link>"`. Nenhum recibo com item sem destino; se o turno terminar sem `RecordBatch` completo, o lote fica `INCOMPLETE` e o próximo turno do orquestrador na conversa recebe o lembrete (um, como o lembrete de declaração da fase 0); persistindo, aviso de bloqueio `STALLED` na conversa.
- **Tela do lote**: console (`threads/$threadId/batches/$batchCode`) e painel (`/panel/g/<token>#L-31`), com cada item, destino e link da tarefa. Linha do tempo da tarefa: `BATCH_LINKED`.
- Código `L-<n>` por conversa, contador no mesmo padrão do `IssueSequence` (serviço, não regra do agregado).
- Fora: o "plano antes de abrir" (B2 do brainstorm).

### Item 6 — baratear a tarefa (opções medidas)

| Opção | Medição | Economia estimada (limite superior) | Decisão |
|---|---|---|---|
| a. Troca de sessão com notas acima de 120 mil | 75% das sessões passam de 120 mil; mediana 163 mil | custo por chamada proporcional ao contexto: sessão nova com notas (~20–40 mil) em vez de 163–245 mil corta 4–8× a releitura dos turnos seguintes | **Fazer** |
| b. Recados juntos num turno | 61% dos STEER chegaram com outro item da mesma issue pendente | até ~61% dos turnos de STEER (limite: parte desses já estava rodando, não esperando) | **Fazer** |
| c. "Pode publicar" sem acordar a sessão | 192 aprovações = ~13% dos turnos de issue | um turno de sessão grande por aprovação | **Perguntar** (o que é "publicar" por workspace) |
| d. Diagnóstico/leitura em modelo mais barato | não derivável (tipo não é registrado) | — | **Fazer**, medindo depois pelo `IssueWorkKind` |

**a. Troca de sessão com notas de passagem.** A issue passa a usar `contextBudget` (já existe para o orquestrador: `ORCHESTRATOR_CONTEXT_BUDGET`, `ResumeInvalidationReason.CONTEXT_BUDGET_EXCEEDED`), com `ISSUE_CONTEXT_BUDGET = 120_000` declarado em `RunIssueTurn`. Quem escreve as notas:
- **pela própria sessão (preferido):** quando `lastContextTokens` passa do limiar, o PRÓXIMO turno ainda retoma, e o prompt do turno pede que, ao terminar, a sessão chame a ferramenta nova `WriteHandoffNotes { notes }` (objetivo, estado, decisões tomadas, arquivos/branch, próximo passo). Custa só a saída das notas num turno que já ia acontecer;
- **derivadas (reserva, sem modelo):** se a sessão não escreveu, as notas são montadas do estado durável — objetivo e título da issue, decisões e respostas da linha do tempo, stops abertos, artefatos e links (PRs), últimos PROGRESS, branch e `git status` do cwd.
- As notas ficam em `agent_agent_sessions.handoff_notes`; a sessão nova começa com elas no prompt; o cursor (`lastMessageId`) continua o mesmo (a fila não muda); fato `agent.session.handed_off`.
- O CLI ainda compacta sozinho perto do teto dele; a troca acontece muito antes (120 mil).

**b. Recados juntos.** Ao reivindicar um item de issue, o dispatcher reivindica junto, no mesmo `write`, os STEER **prontos e mais novos do mesmo alvo** (até `MAX_COALESCED = 10`, exceto o steer "agora", que tem caminho próprio). O turno recebe os textos em ordem. Todo ponto que hoje trata "um item" passa a tratar "o grupo" — lista fechada, cada um com teste:
- `complete` → todos; `holdItem` (pausa) → todos, tentativa devolvida; `waitForProvider`/`defer` → todos; `releaseInterrupted` → todos; `recordFailure` → a cabeça conta a tentativa e envenena; os seguidores voltam sem gastar tentativa;
- `cueSteer` ☑️/✅ por item (cada recado roteado ganha o seu);
- `lastMessageId` = id do **último** item do grupo (o guarda de retomada compara o cursor com o item consumido);
- `releaseOrphanedClaims` no boot já solta todos (mesmo `claimed_boot`).
- `MailboxRepository.claimNext` devolve `ClaimedMailboxBundle { head, followers[] }`; `MockMailboxRepository` acompanha.

**c. "Pode publicar" determinístico — PERGUNTAR AO DONO** (abaixo). O codm não sabe o que é "publicar" em cada workspace (merge? deploy? comando?). O desenho fica pronto até a resposta: a decisão com efeito `PUBLISH` (fase 3) pode carregar um `PublishPlan` declarado pela issue; se o plano existir e a resposta for "aprovar", o daemon executa o plano pela janela de arrependimento (fase 2) sem turno de sessão e manda à sessão um recado "quando terminar".

**d. Modelo por tipo de trabalho.** `ForkIssue` ganha `workKind: IssueWorkKind` (padrão `CHANGE`). Tabela `MODEL_BY_WORK_KIND: Record<ProviderKind, Record<IssueWorkKind, AgentModelId | 'THREAD'>>` (`CLAUDE_CODE.DIAGNOSIS → SONNET`; `'THREAD'` = o modelo da conversa). O modelo é fixado no fork e nunca muda na vida da issue (mudar invalida a retomada: `MODEL_CHANGED`). `providerFor`/`modelFor` no dispatcher passam a perguntar à issue para itens ISSUE.

### Item 7 — saúde do sistema

- `GET /ui/system/health` (BFF `ui`, query use case `GetSystemHealth`, DTO `QuotaSnapshotSchema`): selo `QuotaState`, janela e semana (gasto, teto, reserva, reset), vagas (em uso, máximo, efetiva e por quê), fila (pendentes por pista, seguradas pelo orçamento), disco livre, daemon (desde quando). O dispatcher expõe o estado por uma porta de leitura (`QuotaStatusReader`), não pelo repositório de outro contexto.
- Console: faixa de saúde no topo de "Tarefas" (componente no `-components/` da rota, SDK, SSE existente).
- Painel na nuvem: o snapshot (`issue/usecases/PublishPanelSnapshot`) leva `health` (lido do `agent` por porta de leitura declarada) (sem números de conta, só percentuais e estados); "daemon sem contato há N min" já existe.

## Migrações

SQLite (uma, `0037`, `bun migrate:create` + `db:sync-go` + `db:check-go`; o teste de contagem de tabelas do core-go sobe de acordo):
- `agent_mailbox.rank` integer NOT NULL DEFAULT 4 (NORMAL) e índice `(target_kind, rank, created_at) WHERE dead_at IS NULL AND consumed_at IS NULL`.
- `issue_issues.priority` text NOT NULL DEFAULT `'NORMAL'`, `priority_reason` text NOT NULL DEFAULT `'DEFAULT'`, `work_kind` text NOT NULL DEFAULT `'CHANGE'`, `model` text (nullable: issues antigas usam o da conversa) — **sem CHECK** (precedente `output_mode`, fase 3: CHECK em tabela existente força reconstrução; o `z.enum` fecha na hidratação).
- `agent_agent_sessions.handoff_notes` text, `handoff_at` integer.
- Tabelas novas `thread_batches` (`id`, `owner_id`, `thread_id`, `code`, `seq`, `source_entry_id`, `item_count`, `status`, `receipt_entry_id`, `created_at`, `updated_at`, `version`; único `(thread_id, seq)`) e `thread_batch_items` (`batch_id`, `n`, `excerpt`, `destination` json, `issue_id` nullable indexado; PK `(batch_id, n)`) — CHECKs derivados dos enums novos.

Nuvem (pg, `0008`, `bun migrate:create:cloud`, aplicada antes do daemon): `panel_batches` (snapshot por grupo) e coluna `health` jsonb no estado do grupo. Sem dado de conta.

## Testes

- `QuotaBudget.test.ts` (puro): admissão nas duas janelas; reserva `max(5%, medido)`, incluindo medido < 5%; teto cai na recusa, sobe na folga, não sobe sem fim de janela; janela `UNKNOWN`; `custoEsperado` com turnos em voo.
- **Simulação de aceite** (`tests/flows/fase4-quota-replay.test.ts`, modo `mock`, relógio injetado): replay de uma fixture **anonimizada** derivada desta medição — só deslocamentos de tempo, papel e os quatro baldes, e os instantes de recusa (`tests/fixtures/quota/usage-2026-11.json`, sem ids, sem texto). Assertivas: (1) o agendador deixa de admitir ISSUE **antes** de cada instante de recusa da fixture; (2) com a pista ISSUE segurada, itens THREAD continuam sendo reivindicados e respondidos; (3) as horas seguradas são menores que as horas pausadas da fixture. Roda também com pesos só de saída.
- `LibSqlMailboxDispatcher.slots.test.ts`: vagas efetivas = mínimo de máximo, máquina e orçamento; THREAD nunca segurada.
- `LibSqlMailboxRepository.rank.test.ts`: decisão respondida passa à frente; FIFO dentro do alvo mesmo com rank maior num item mais novo; empate pela regra vigente.
- `LibSqlMailboxDispatcher.coalesce.test.ts`: três recados viram um turno; pausa, adiamento, corte "agora", falha e envenenamento sobre um grupo; ☑️/✅ por item; cursor = último item.
- `RunIssueTurn.handoff.test.ts` (aceite "preserva o fio"): sessão acima de 120 mil ⇒ turno pede notas; turno seguinte abre sessão nova com notas, objetivo, decisões abertas e recados pendentes no prompt; sem notas da sessão, as derivadas entram; fato `handed_off`.
- `Batch.test.ts` + `RecordBatch.test.ts` (aceite "10 itens, 10 destinos"): 10 itens ⇒ 10 destinos gravados; 9 ⇒ `BATCH_ITEMS_MISMATCH` e nenhum recibo; `ATTACHED` enfileira o steer; recibo uma vez.
- `BatchDetector.test.ts`: listas numeradas, marcadores, menos de 3 itens não é lote, frase com números não é lista.
- `ForkIssue` / modelo: `DIAGNOSIS` roda no modelo da tabela; retomada não muda de modelo.
- Contrato: `UsageRole` gravado em todo fato de uso (orquestrador, issue, triagem) — teste de arquitetura que falha se um produtor de `AgentUsageEvent` omitir `role`.
- e2e: faixa de saúde no console com estado `HOLDING` (fixture).

## Rollout

- Ordem: pg 0008 na nuvem → daemon (SQLite 0037 no boot, testada numa cópia do banco real antes).
- O orçamento começa em **modo observação** (`CODM_AGENT_QUOTA_ENFORCE=false`, env declarada no manifesto com consumidores): calcula, mostra na saúde e grava o que teria segurado, sem segurar. Liga depois de uma semana de eventos com `role` ou por decisão do dono.
- As vagas 5 e 6 só abrem com o portão de disco satisfeito.
- Itens antigos entram com `rank` NORMAL; issues antigas, `CHANGE` e modelo da conversa.
- Reverter: `CODM_AGENT_QUOTA_ENFORCE=false` e `TURN_LANES[ISSUE].slots` volta a 4.

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

- Teto aprendido instável se a tabela de pesos errar a mistura de baldes ou se o plano da conta mudar; mitigado pelo modo observação, pela folga e pela recusa como corte.
- Juntar recados muda o contrato "um item por turno": a lista de pontos acima é fechada e cada um tem teste.
- Notas derivadas podem perder estado tácito; a sessão escreve as suas quando pode.
- Disco cheio derruba a máquina antes da cota; o portão reduz vagas, não libera disco.

## Fora de escopo

- Segunda conta do provedor ou uso por API (decisão em aberto do dono; números na fase 5).
- Mudar a chave da pausa para provedor × modelo (só com dado do fato novo).
- Plano antes de abrir lote (B2).
- Passar de 6 vagas.

## Perguntar ao dono

1. **Prioridade entre pedidos com a fila cheia** (decisão em aberto no objetivo). As classes do objetivo (decisão respondida, bug de cliente, prioridade declarada) estão no desenho; a pergunta é o desempate entre iguais:
   - (a) **chegada** — quem pediu primeiro vai primeiro (FIFO dentro da classe);
   - (b) **rodízio por grupo** — uma vaga para cada grupo com fila, na vez, depois FIFO; nenhum grupo monopoliza;
   - (c) **peso por grupo** definido por você no console (ex.: grupo X vale 2 vagas para cada 1 dos outros);
   - (d) **quem pode liberar primeiro** — pedido de quem tem `mayAct` passa à frente de pedido de outros participantes.
   Até a resposta: (a), como tabela trocável.
2. **"Pode publicar" sem acordar a sessão** — o que conta como publicar:
   - (a) só **merge do PR** que a issue declarou (`gh pr merge`, checks verdes), deploy fica com o CI;
   - (b) **comando de publicação por workspace**, cadastrado por você no console (o codm só executa o que está declarado);
   - (c) não executar nada: acordar a sessão, mas numa sessão nova barata com as notas de passagem;
   - (d) deixar como está nesta fase.
3. **Disco e vagas 5–6** (2,3 GiB livres medidos):
   - (a) liberar disco antes do rollout e manter o portão proposto (≥ 20 GiB → 6 vagas);
   - (b) portão mais baixo (≥ 10 GiB → 6) aceitando o risco;
   - (c) o codm limpar sozinho worktrees de tarefas arquivadas há mais de N dias;
   - (d) ficar em 4 vagas nesta fase.
4. **Ligar o orçamento** — depois de uma semana em modo observação (proposta) ou já ligado no rollout.
