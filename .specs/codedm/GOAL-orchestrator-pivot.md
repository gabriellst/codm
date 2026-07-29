# GOAL — Pivot do orquestrador: a conversa vira o primário, a issue vira um fork declarado

**Base:** `agent-abstraction` @ `9f1968df` · **Spec ratificado:** `.specs/codedm/2026-07-28-orchestrator-pivot.md` (v3)
**Handoff:** `docs/handoff/2026-07-28-orchestrator-pivot-handoff.md`
**Decisor:** founder — **D1–D9 ratificadas, não se rediscutem**

> Este documento é a versão EXECUTÁVEL do spec. O spec decide; aqui só se ordena, se corta em
> tarefas e se diz como cada uma prova que funcionou. Onde os dois divergirem, **o spec ganha** —
> e a divergência é bug deste arquivo, para consertar aqui.

---

## 0. Onde estamos (verificado em `9f1968df`, não presumido)

**Pronto e commitado:**

| o quê | onde | estado |
|---|---|---|
| Colunas da F1 | `packages/contracts/db/schema-sqlite/{issue,agent}.ts` | `issue.origin_entry_id:37`, `issue.goal:46`, `agent_sessions.issue_id` nullable `:30`, `last_context_tokens:46`, uniques parciais `:64-65`, `agent_mailbox:98` |
| Contratos da F1 | `packages/contracts` | `integration.issue.created`, `integration.orchestrator.replied`, `quotedMessageId` + `replyEntryId` no delivery, `MailboxItemKind`, `MailboxTargetKind` |
| Mailbox | `agent/repositories/MailboxRepository/` | port + Drizzle + Mock + 7 testes de lease. **INERTE** — ninguém enfileira, ninguém consome |
| `AgentName.ORCHESTRATOR` | `agent/enums/AgentName.ts` | existe |
| `findPlatformId` | `ConsumedMessageRepository` | existe |
| Proveniência no domínio | `issue/entities/Issue.ts` + `DrizzleIssueRepository` | `originEntryId` + `goal` no schema, no mapeamento, e **write-once por omissão** no `set` do upsert (`9f1968df`) |

**Escrito mas NÃO commitado** (WIP em árvore, não compila sozinho):
`agent/agents/OrchestratorAgent/{prompt.ts,types.ts}` — a voz do produto e o input schema. Vermelho
por **um** erro só, e é o erro esperado: `TOOLS_IN_SCOPE.orchestration` não existe ainda (T2).

**Gates verdes na base:** `bun tsc` (7 projetos), **781** testes api-ts, 414 tooling, 60 codegen
contracts, go build + test, `bun check:generated`, drift de `schema.sql` limpo.

> O número é **781**, não 779 como diz o handoff. Medido revertendo tudo desta sessão. Se a sua
> contagem baixar disso, alguma coisa sumiu — não arredonde.

---

## 1. O que este goal entrega

Uma fase, um PR (**D9**): o orquestrador **conversa E forka**, e a classificação por mensagem morre
no mesmo commit. Ao fim, o exemplo canônico do §1 do spec roda **no grupo real** até o ack.

**Fora deste goal, explicitamente:** a volta do resultado composto (`ISSUE_RESULT`), `issue/steer`,
a morte do `RequestAgentReplyDelivery` — tudo F4. Compaction (§7.8) — F5. Não antecipe: cada um
tem um consumidor que só nasce lá, e um write sem consumidor é a dormência que a D5 proíbe.

---

## 2. As tarefas, em ordem de dependência

Cada tarefa é um commit (ou poucos), **verde antes de seguir**. T7 é a única indivisível.

### T1 — `OrchestratorPromptBuilder` + `OrchestratorInputSchema`

O WIP já existe em árvore. Fecha quando compilar (depende de T2) e tiver teste.

- `system()` + `user()`, no formato do `ClassifyIssuePromptBuilder` (o `IssueWorkPromptBuilder` é
  system-only porque `RunIssueTurn` já lhe entrega `input.prompt` pronto; aqui não existe essa
  string — o turno é um item discriminado + janela, e transformar isso em texto é RENDER).
- Nome de tool **lido do manifest**, nunca digitado.
- **AC-T1.1** — `bun x tsc -p tsconfig.build.json --noEmit` exit 0.
- **AC-T1.2** — teste colocado `prompt.test.ts` cobrindo, no mínimo: (a) turno `OPERATOR_MESSAGE` em
  GROUP renderiza a seção QUOTING com o `entryId` do item; (b) turno `ISSUE_RESULT` **não** renderiza
  QUOTING (a citação é obrigatória e é decisão do use case, não do modelo); (c) `contactKind` ≠ GROUP
  não renderiza a paragrafada de sala; (d) o nome do tool no texto vem de `TOOLS_IN_SCOPE`.
  **Prova de falseabilidade:** troque o literal do tool por uma string fixa e (d) fica vermelho.

> Convenção nova: nenhum prompt builder do repo tem teste colocado hoje (verificado). Este passa a
> ter, porque é a voz do produto e os ramos da D6 regridem em silêncio.

### T2 — O escopo `orchestration` + run token com escopo de THREAD (§7.2, §7.2.1)

**A tarefa mais perigosa do goal, e não é a maior.** Ver §3 (Armadilhas) antes de começar.

- **T2a — claims.** `RunTokenClaims.issueId` vira opcional; nasce `entryId?`. A guarda de
  `types/Agent.ts:145` deixa de ser "declarou escopo ⇒ exige `issueId`" e passa a ser **por escopo**:
  `issue-handling` exige, `orchestration` não.
- **T2b — `DeclareIssueOpen`** aceita `goal` e `originEntryId` e os repassa para `Issue.open`.
- **T2c — o tool de criação.** Controller novo (NÃO reusar `CreateIssueController`: ele é de outro
  escopo, pede `title` + `provider`, e o nome da classe É o nome do tool). Body: `{ goal }`.
  `originEntryId` **nunca é argumento** — o router injeta da claim. Persiste a row (WORKING, slug via
  `uniqueSlugKey` migrado do `IssueRouter`) + item `WORK` na mailbox da issue **na mesma tx** +
  `integration.issue.created`. Devolve `{ issueId, key }` no próprio turno (D4).
- **T2d — leitura.** `issue/list` e `issue/status`, thread-scoped pelas claims, via `OpenIssuesReader`
  + issue repo.
- **T2e — manifest.** `MCP_SCOPE_NAMES` ganha `'orchestration'`; `MCP_SCOPES` ganha a lista.
- **T2f — dono da thread.** **Todo tool de `orchestration` que aceite `issueId` verifica
  `issue.threadId === claims.threadId` no próprio handler.**
- `bun emit-openapi` + `bun sdk`, e **commitar `packages/client`** (ver Armadilha A3).

- **AC-T2.1** — `tests/architecture/mcp-manifest.test.ts` continua verde (igualdade de conjuntos entre
  manifest tipado e `openapi.json`, nas duas direções).
- **AC-T2.2** — um token de `orchestration` (sem `issueId`) **não** abre `/mcp/issue-handling` nem
  `/mcp/system`. Teste no `router.test.ts`.
- **AC-T2.3 — O TESTE QUE IMPORTA.** Um token de `orchestration` mintado para a thread A, chamando
  `issue/status` (ou qualquer tool com `issueId`) apontando para uma issue da thread B, é **rejeitado**.
  **Prova de falseabilidade obrigatória:** comente a verificação de dono do T2f e este teste PRECISA
  ficar vermelho. Se continuar verde, a checagem não está no caminho e o AC é vácuo.
- **AC-T2.4** — `bun check:generated` exit 0 (SDK regenerado E commitado).

### T3 — `OrchestratorAgent`

Espelha `IssueWorkAgent`: base `Agent`, sem `outputSchema`, `mcpScope: 'orchestration'`,
`tools = TOOLS_IN_SCOPE.orchestration`. Só `buildRequest`; **não sobrescreve `run()`**.

- **AC-T3.1** — o argv de um turno de orquestrador contém `--mcp-config` e `--allowedTools` com
  exatamente os tools do escopo (derivados, não digitados).
- **AC-T3.2** — nenhum turno de orquestrador estoura `AGENT_TOOLS_UNSUPPORTED` por falta de `issueId`.

### T4 — `RunOrchestratorTurn`

Espelha `RunIssueTurn`: resolve provider → resolve sessão **chaveada por thread** (`issue_id IS NULL`)
→ decide FRESH vs RESUMED e preenche `window.seeded` → parseia o payload da mailbox (primeiro
narrowing tipado de `payload: unknown`) → dreno → persiste `OrchestratorRepliedEvent` (domain do
contexto **agent**, por EVT-01).

- Extrai a linha-sentinela `[quote: <id>]` do fim do texto → `replyToEntryId`; sem linha, sem citação.
  A sentinela **não** vai para o transcript nem para o canal.
- v1 **não** streama SSE (os frame schemas são issue-keyed).
- **AC-T4.1** — dois turnos seguidos na mesma thread reusam a sessão (`--resume`), e a segunda
  chamada não abre sessão nova.
- **AC-T4.2** — resposta com sentinela produz `replyToEntryId`; sem sentinela produz `undefined`; a
  sentinela é removida do texto entregue. Os três num teste só.

### T5 — `MailboxDispatcher`

Modelo: `SqliteCommandQueue`. **Único consumidor.**

- lease por ALVO; `THREAD → RunOrchestratorTurn`, `ISSUE → RunIssueTurn`;
- **sweep no boot**;
- **re-poll imediato do mesmo alvo ao fim do turno**;
- falha → `attempts++`, backoff, poison depois de N.

- **AC-T5.1** — item órfão (deixado com lease vencido, simulando crash) é retomado pelo sweep de boot.
- **AC-T5.2** — dois itens para o MESMO alvo nunca rodam concorrentes; para alvos DIFERENTES, rodam.
- **AC-T5.3** — ao terminar um turno com outro item pendente do mesmo alvo, o segundo roda **sem
  esperar o próximo tick** do poller.
  **Prova de falseabilidade:** remova o re-poll e AC-T5.3 fica vermelho (não "mais lento": vermelho).

### T6 — `DeliverOrchestratorReply` (§7.5, perna CONVERSACIONAL)

Handler external no contexto **thread**, herdeiro estrutural do `RequestAgentReplyDelivery` (que
**não** morre agora — F4). Carrega a Thread (envelope: `channelId` + `contactRef`), grava a entrada
**SYSTEM** no transcript, resolve `quotedMessageId = findPlatformId(replyToEntryId)` quando há
citação, publica `ChannelDeliveryRequestedEvent { …, quotedMessageId, replyEntryId }`.
`DeliverChannelMessage` envia e faz claim **com `linkEntry`**.

- **AC-T6.1** — resposta com citação chega com `quotedMessageId` resolvido; sem citação, ausente.
- **AC-T6.2** — a entrada SYSTEM gravada tem `entryId`, e `findEntry` pelo `stanzaId` da saída resolve
  de volta para ele (é o que faz o fluxo 3 do §8 fechar depois).

### T7 — O PR ATÔMICO: a classificação morre

**Indivisível.** Meia-classificação viva é o "duas fontes de decisão" que a D5 proíbe.

- `ConsumeInboundMessage.ts:117` deixa de chamar `ClassifyMessage` e passa a enfileirar
  `OPERATOR_MESSAGE` **na mesma transação do ingest** (dedup por `entryId`).
- Morrem: `ClassifyMessage`, `IssueRouter`/`Default`/`Mock` + `slug.ts` (o `uniqueSlugKey` já migrou
  em T2c), `ClassifyIssueAgent` + prompt + `LlmDecisionSchema`, fluxo CLARIFY
  (`ClarificationRepository`, `thread_clarifications`, `ClarificationRequestedEvent`), **os DOIS**
  `MessageClassifiedEvent` (domain e wire), `RunIssueTurnOnClassification`, e os bindings/barrels.
- Órfãos a DECLARAR (não deletar): `TranscriptKind.ACTION` perde o produtor; `ClassificationMethod`
  fica enquanto a coluna existir; `StopKind.BLOCKED_BY_CLASSIFICATION` é wire congelado;
  `phase3-smoke.ts` é FROZEN e menciona a cadeia morta — **anotar, não "consertar"**.

- **AC-T7.1** — `git grep -n "ClassifyMessage\|IssueRouter\|MessageClassified\|ClassifyIssueAgent" --
  packages/api/typescript/src` volta **vazio** (docs e `.specs/` não contam).
- **AC-T7.2** — `bun tsc` + suíte api-ts verdes **no mesmo commit** em que a classificação sai.
- **AC-T7.3** — a contagem de testes não cai silenciosamente: a queda é explicada linha a linha na
  mensagem do commit (testes de artefato morto morrem com ele; qualquer outra queda é regressão).

### T8 — e2e 04 e 07

`E2eStubAgentRunner` discrimina por `outputSchema`, que deixa de existir. Passa a fingir um turno de
orquestrador que dirige `issue/create` via **MCP real**. Isso só é construível porque T2 está na
mesma fase (na v2 do spec não estava — era o buraco que a D9 fechou).

- **AC-T8.1** — `04-inbound-issue.spec.ts` e `07-issue-archive-restore.spec.ts` verdes.

---

## 3. Armadilhas — já custaram tempo, não se redescobrem

- **A1 — `schema.sql` do Go é DERIVADO.** Depois de toda migração:
  `cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts` e então `sqlc generate`.
  `--check` é o gate de drift (re-aplica as migrations num DB temporário e compara byte a byte —
  gate real, verificado).
- **A2 — rebuild de tabela do drizzle põe a coluna NOVA no SELECT da tabela VELHA.** Aconteceu na
  0004. Confira toda migration que reconstrói tabela.
- **A3 — `bun sdk` regenera `packages/client` e é fácil esquecer de commitar.** O `check:generated`
  que pegaria isso é manual, ausente do CI e do pre-commit. Já aconteceu na F1.
- **A4 — evento de integração publicado pelo TS NÃO cria linha no outbox** (`publish` despacha
  in-process). Para provar entrega, olhe `channel.message_sent` e o ledger. 400s já foram perdidos
  observando uma coluna que estruturalmente nunca apareceria.
- **A5 — `biome check --write --unsafe` apaga construtor de subclasse que só encaminha** — e quando o
  TIPO do parâmetro é o binding de DI, a deleção compila e religa em silêncio.
- **A6 — `tsc` passa com método a mais na implementação e ausente no port.** Aconteceu com
  `findPlatformId`.
- **A7 — `git add -A` varre o `AppChrome.tsx` do founder.** Stage explícito, sempre.
- **A8 — `git commit -- <pathspec>` falha sob lint-staged.** Stage, verifique, commite sem pathspec.
- **A9 — o hook de pre-commit roda `tsc`.** WIP vermelho em árvore bloqueia QUALQUER commit, inclusive
  de doc. Pare o WIP de lado (`mv`) em vez de `--no-verify`.
- **A10 — o walker de identidade IGNORA claim ausente, não falha.** É a razão do T2f existir. Ler
  `mcp/identity.ts` antes de mexer em claims.

---

## 4. Como se prova que acabou

**`tsc` verde não é evidência.** O bug consertado na manhã de 28-jul passou por todos os gates e
deixou o produto inerte por semanas.

```
cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && bun test
cd packages/contracts && bun test codegen/
cd packages/api/go && go build ./... && go test ./...
bun run test:tooling && bun tsc && bun check:generated
cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts --check
```

E, porque isto toca o caminho vivo:

```
bun desktop:sidecars && bun desktop:dev
cd packages/api/typescript && bun scripts/inject-own-message.ts "sua mensagem"
```

**Prova de aceite final (RUNTIME, grupo real):** o exemplo canônico do §1 do spec até o ack —
conversa de ida e volta, depois "crie uma issue" → ack imediato **enquanto** o subagent roda, e a
conversa segue livre. Nada disso é dispensável por teste verde.

### A disciplina que vale para toda AC

**Prove que o gate consegue REPROVAR antes de confiar nele.** Nesta linhagem cinco verificações se
revelaram vácuas. As AC-T1.2, AC-T2.3, AC-T5.3 e AC-T7.3 já vêm com o falseador escrito; para as
outras, invente um e rode. Uma AC que passa com a implementação desligada não é uma AC.

---

## 5. Decisões que continuam do founder, e NÃO se inventam

- **Cópia da recusa** — some com a D9 (o fork entra na mesma fase), mas se em algum momento o
  orquestrador precisar dizer que não consegue algo, a frase é do founder.
- **Nome do tool de criação** — a classe do controller É o nome do tool. `CreateIssue` já está tomado
  pelo `issue-handling`. Proposto: `ForkIssue` (casa com a linguagem do spec, "a issue é um fork
  explícito"). **Confirmar antes de T2c** — o nome aparece no prompt e vira wire.
- **Saneamento de markdown na entrega** (`**x**` → `*x*`) — recomendado, **fora** deste goal para não
  alargar o PR atômico. Hoje nada transforma o texto (verificado), e o defeito já chegou uma vez no
  grupo real.
