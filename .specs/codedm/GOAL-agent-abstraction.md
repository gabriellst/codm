# GOAL — Agent Abstraction: uma interface só, stream-json sobre pipes, tools declaradas por MCP, agents como cidadãos

> Este documento é o **CONTRATO** do goal (founder, 2026-07-26). Ele **SUBSTITUI**
> `.specs/codedm/OVERNIGHT-GOAL-2026-07-24-go-domain-port.md`, que fica em disco apenas como
> histórico. Em divergência entre qualquer resumo de sessão e este doc, **este doc vence**.
>
> **Este documento é auto-contido e executável sem supervisão.** Ele é um goal de noite: ninguém
> estará disponível para responder pergunta, arbitrar dúvida de design ou aprovar desvio. Toda
> decisão que o executor precisaria perguntar já está fechada aqui (§3), e todo critério de aceite é
> **mecanicamente verificável** — um comando, um `grep`, um teste. Dúvida genuinamente nova →
> `.specs/codedm/OVERNIGHT-BLOCKED.md`, **pular só aquela fatia**, continuar (§8, regra 10).
>
> Fontes da verdade a LER antes de agir: `.specs/codedm/2026-07-26-agent-driving-stream-json.md`
> (o mecanismo + o adendo de MCP, já ratificados), `.specs/codedm/2026-07-26-agent-abstraction-convergence.md`
> (o veredito de convergência), `.specs/codedm/2026-07-24-fundamentals-and-upstream.md` (o handoff),
> `CLAUDE.md` (a constituição), e o contexto `agent` do medscall
> (`/Users/work/Desktop/Projetos/medscall/software/monorepo/packages/api/src/agent/`) como shape de
> **referência lida** — nunca como dependência (§6).

## 0. O que esta emenda mudou (26-jul, pós-`149b6aa3`)

Quatro coisas, e elas estão **dobradas no corpo do doc**, não anexadas no fim:

1. **MCP inverteu a fonte de fatos.** O desenho anterior **inferia** o que aconteceu lendo frames.
   Com um servidor MCP **nosso**, o agent **declara** o fato de domínio chamando as nossas tools com
   payload tipado. Frames viram observabilidade/UI; **tool call vira a fonte de verdade do domínio**
   (§3 D8, §4.3, §4.4, Fase 6).
2. **Um buraco de tipo real foi fechado.** `AgentInputSchemaConstraint` e `AgentInputEnvelope` eram
   citados e nunca definidos — sem eles o narrowing genérico colapsa em `Record<string, unknown>` e
   o runner não lê `ownerId`/`issueId`/`cwd` sem cast, o que a própria AC-3.4 proíbe. Ambos agora
   estão **definidos concretamente** (§4.6, Fase 1).
3. **A convergência com o medscall virou decisão fechada** (§3 D9, §6): **léxico e playbook
   convergem; o seam de runtime NÃO** — duplicação deliberada com a razão escrita. O executor **não
   deve** tentar compartilhar tipos/bytes com o medscall.
4. **O estado mudou.** A **metade Go** da Fase 0 está **pronta e commitada** (`149b6aa3`). O que
   resta da Fase 0 é a **metade TS**: tirar o daemon do PGlite embarcado e colocá-lo no **mesmo
   arquivo SQLite** (§7, Fase 0).

**Passe de revisão adversarial (iteração 1) — o que foi FECHADO depois**, tudo para que nenhuma fase
dependa de alguém acordado. Registrado aqui porque cada item era um ponto onde o executor pararia:

- **A Fase 0 ganhou caminho não-assistido até `CONNECTED`** — o único gate que travava a noite
  inteira. `CONNECTED` só era alcançável por pareamento QR do whatsmeow; agora há um ingress de
  teste **do lado Go**, guardado por `CODEDM_E2E`, e a AC exige **duas travessias cross-process**
  (§7 Fase 0, item 7 + AC-0.5/AC-0.6 + §9 critério 1).
- **Todo smoke com `claude` real ganhou regra de saída escrita** (§8, regra **8-bis**), do mesmo
  naipe do fallback de transporte MCP: tentar → `ATTEMPT-FAILED` no BUILD-LOG → substituto
  determinístico → PARKEAR **só** a AC de smoke → continuar. As ACs degradáveis estão **nomeadas**.
- **`AgentMcpInvocation` virou tipo definido e a cunhagem do run token virou decisão fechada**: a
  base `Agent` cunha (é a única que enxerga o envelope), o runner **revoga**; o `AgentRunRequest`
  continua **sem** `ownerId`/`issueId`/`threadId` (§4.2, §4.4, AC-1.11 + AC-6.12).
- **Stop de TRANSPORTE ≠ stop de DOMÍNIO** — a contradição entre a regra 6 e o `AgentRunResult` foi
  resolvida por uma tabela, não por prosa (§4.3, AC-6.7).
- **`codedm__ask_operator` fechada como fire-and-forget**, com destino nomeado e AC própria
  (§4.4, AC-6.10). **Entry point público tipado** para agent estruturado, com formato fechado
  (§4.5, AC-5.8).
- Atrito removido: allowlist de arquivos existentes na AC-1.10, caminho de smoke padronizado em
  `phase<N>-smoke/`, caminho `terminal/` × `agent/` do teste de arquitetura alinhado às fases
  (AC-3.2 + AC-5.9), modo de falha da AC-5.5 amarrado à regra 2, branch de trabalho nomeada
  (`agent-abstraction`), `ownerId` alinhado a `z.uuid()`.

**Passe de revisão adversarial (iteração 2) — as cinco últimas bifurcações fechadas.** Cada uma era
um ponto onde o executor teria de escolher arquitetura sozinho às 3h:

- **`detail` chega ao card "Needs you".** A Fase 6 acrescenta `detail: string` ao
  `issue-stop-raised.tsp` — **campo aditivo, permitido pela regra 5** — e
  `MaterializeIssueFromExecution` o repassa, usando a pergunta como `title` em `HUMAN_REQUESTED`.
  Sem isso, `raise_stop`/`ask_operator` perdiam o texto no bridge e a AC-6.10(b) era insatisfazível
  (§4.4 item (i), AC-6.10).
- **`record_artifact` tem dono.** A tool é um **controller fino do contexto `artifact`** despachando
  o `RecordArtifact` que já existe; `DeclareArtifact` **não nasce**, o publicador do evento congelado
  continua **um só**, não há eco e `ref`/`meta` não se perdem. Fallback por integration event escrito
  e autorizado (§4.4 item (ii), AC-6.11).
- **O ciclo de vida do run não double-publica.** `RunIssueTurn` só cunha conclusão/stop de domínio
  quando o agent injetado não tem escopo de tool; os use cases de declaração **reusam** as classes de
  evento existentes (§4.3, regra 7; AC-6.4 estendida). *(A iteração 3 corrigiu o predicado: era
  `request.mcp`, que o use case não enxerga — ver o bloco da iteração 3 abaixo.)*
- **A Fase 0 lista o que realmente quebra.** O re-cabeamento de `packages/contracts` (exports,
  `drizzle:generate`, morte de `drizzle:migrate`, `db/migrations.ts`, `migrate:dev` da raiz) e a
  enumeração completa das referências a PGlite/pg — sem isso o próprio `bun run contracts` da AC-0.2
  ficava vermelho (Fase 0, itens 4 e 5).
- **Escape hatches e pathspecs.** O generic do `AgentInputSchemaConstraint` não é o contrato (a
  AC-1.4 é), a AC-1.11 perdeu a metade que ainda não existe (virou AC-6.12), o rename de tabela é da
  **Fase 4**, o router MCP **não** é emitido na OpenAPI, e `BUILD-LOG`/`OVERNIGHT-*` estão pinados em
  `.specs/codedm/`.

**Passe de revisão adversarial (iteração 3) — as premissas FALSAS e os predicados INALCANÇÁVEIS.**
Cada item aqui foi **verificado contra o repo real** antes de ser escrito; a iteração anterior errou
justamente por afirmar sem ler. O que mudou:

- **A Fase 0 não podia passar o próprio gate.** Apagar `packages/contracts/db/schema/` derruba
  `tests/architecture/context-map.test.ts` (a constante `CONTRACTS_SCHEMA:29`, lida por **dois**
  testes, com `readdirSync` que lança `ENOENT`) e cega o grafo (`scripts/graph/core/config.ts:177` →
  `scripts/graph/tests/build.integration.test.ts:50`), além de fossilizar `.claude/registry.yaml:137`.
  A deleção agora é o **último** passo do item 4, com os rails re-apontados antes (a iteração 4
  fechou a lista em **4** — ver abaixo), a re-expressão dos parsers para o dialeto SQLite escrita, e
  **AC-0.11** cobrando cada um (§7 Fase 0, item 4).
- **O teste de import-graph EXISTE.** O doc afirmava que `ImportGraphIsolation.test.ts` era citado em
  dois cabeçalhos e não existia. Falso: o rail é
  **`tests/architecture/pty-isolation.test.ts`**, vivo, com `ALLOWED_PREFIX` e duas famílias de
  literais confinadas. A AC-3.2 passou a **estender** esse arquivo (terceira família:
  `node:child_process`), e criar um rail paralelo agora **reprova** (AC-3.2, AC-5.9, §9 critério 4).
- **O predicado anti-double-publish era inalcançável de onde estava.** A regra 7 condicionava em
  `request.mcp`, mas o `AgentRunRequest` é montado **dentro** do `Agent` (§4.2/§4.5) — o use case
  nunca o vê. Realocado para o **escopo de tool do agent injetado** (`agent.tools.length`), que é
  equivalente por construção e **é** o que o `RunIssueTurn` enxerga; AC-6.4 e AC-6.7 remontadas a
  partir dessa posição (§4.3 regra 7).
- **`FactSource` não tinha portador.** As duas classes reusadas
  (`AgentRunCompletedEvent`/`AgentRunStopRaisedEvent`) não têm campo `source` — uma AC
  assertando nele falharia por campo inexistente. O campo agora **entra** no schema das duas (evento
  de domínio context-private → **zero** custo de contrato, bridge intocado), §4.3 regra 6.
- **A cunhagem do run token se contradizia.** §4.5 declarava `run()` abstrato enquanto §4.2/§4.4
  diziam que a base cunha *dentro de `run()`*. Resolvido: **`run()` é template method CONCRETO**, o
  ponto de variação vira `protected abstract buildRequest(input)`, e todas as menções foram
  alinhadas (§4.2, §4.4, §4.5, AC-5.8, AC-6.12).
- **Os três códigos de erro novos tinham ripple não-declarado.** `error-coherence.test.ts` exige
  união ≡ `registerErrorCodes` no mesmo arquivo, e `locales/error-codes.check.ts` torna a tradução
  em `en.json`+`pt.json` um erro de **`react tsc`**. As 4 paradas, a alocação camada/status/fase e a
  ordem de execução estão em §5.1, cobradas pela **AC-6.13**.
- **`CODEDM_E2E=1` estava errado.** Todo consumidor TS compara com `'true'` (`src/boot.ts:23`,
  `src/shared/{index,registry}.ts`, `src/terminal/registry.ts:18`) e os harnesses exportam `'true'`.
  Corrigido para `CODEDM_E2E=true` em todo o documento, com o guard Go alinhado (§7 Fase 0, item 7).
- **Faltava re-baseline depois das deleções e do rename.** `registry-scan.baseline.json` carrega
  chaves em `PGliteDriver`/`NodePgDriver` (Fase 0), em `RunTerminalSession.ts` (Fase 3) e em
  `src/terminal/` (Fase 5, incluindo uma **já fóssil** — `TerminalSessionRegistry/`, diretório que
  não existe). Novas **AC-0.12**, **AC-3.7/AC-3.8** e **AC-5.10**.
- **A escada do `record_artifact` pulava os degraus baratos**, e os critérios 2 e 4 da §9 estavam
  mais frouxos que as ACs que resumem (um grep literal do avaliador os reprovaria). Ambos alinhados;
  a §8 regra 1 ganhou a nota de que os dois docs de partida entram no **primeiro commit** — a árvore
  não nasce suja.

**Passe de revisão adversarial (iteração 4) — a lista fechada que não estava fechada, e o rail que
nascia vermelho.** Tudo re-verificado contra a árvore antes de escrever. O que mudou:

- **A lista de rails da Fase 0 estava um curto — e o curto era um gate duro.**
  `tests/architecture/enum-placement.test.ts:38` declara a **sua própria** cópia de
  `CONTRACTS_SCHEMA` (`join(…, 'contracts', 'db', 'schema')`), consumida pelo CMPL-01 (`:112-113`)
  via `scanSchemaMirrors` → `listSchemaFiles` → `readdirSync`. Apagar o diretório = `ENOENT` = suíte
  vermelha **dentro de `bun run test`**, que é exatamente o que a AC-0.9 exige verde. Pior: o
  próprio grep da AC-0.11(a) (`db', 'schema'`) casa esse arquivo, então a AC reprovava num arquivo
  que a "lista fechada" nunca nomeava. Nasceu o sub-item **(4d)** com o retarget concreto (constante,
  filtro de arquivos idêntico ao de (4a)/(4c), e a reescrita do texto de remédio do CMPL-01, que
  hoje prescreve o idioma pg `.$type<Enum>()`); AC-0.11 passou a **4 rails** com prova (e); AC-0.9
  passou a nomear os **dois** rails de gate (§7 Fase 0, item 4).
- **O rail de spawn nascia com um violador embutido.** A AC-3.2(b) confinava
  `node:child_process` ao `AgentRunner`, mas `services/ProviderDetector/SystemProviderDetector.ts:2`
  importa `spawnSync` — e a §5.3 marca esse arquivo **FICA**, ainda por cima estendendo-o na Fase 1
  para probar `caps` (ou seja: ele **precisa** continuar spawnando). O rail ia vermelho no instante
  em que fosse estendido, sem caminho de resolução escrito. Agora o allowed-set do família spawn é
  **explícito e nomeado** (`ALLOWED_SPAWN_PREFIXES` = `AgentRunner` + `ProviderDetector`), com o
  porquê, espelhado em AC-3.2(b), AC-5.9 e §9 critério 4.
- **Duas ACs de Fase 1 eram mutuamente exclusivas.** A §5.1 alocava `AGENT_TOOLS_UNSUPPORTED` à
  Fase 1, mas o ripple obrigatório toca `src/terminal/errors/index.ts`, os dois `locales/*.json` e o
  `packages/client/dist/**` — nenhum deles na allowlist da AC-1.10, cuja cláusula final é
  *"qualquer arquivo existente fora desta lista … é violação"*. O código é **levantado** só a partir
  da Fase 6 (a própria tabela já dizia isso entre parênteses), então ele foi **movido para a Fase
  6**, junto dos outros dois — um único ripple de erro, uma única AC de fechamento (AC-6.13).
- **Duas contagens não batiam com a árvore.** AC-0.12 dizia **4** chaves de baseline em
  `PGliteDriver`/`NodePgDriver` — são **3**. AC-5.10 dizia **7** chaves em `src/terminal/` e então
  enumerava **6**; e, das 6, três já caem na re-baseline da AC-3.7 (as 2 de `RunTerminalSession` +
  a fóssil `TerminalSessionRegistry`), sobrando **3** (as de `DetectProviders`) quando a Fase 5
  chega. Ambas corrigidas para o que o `grep` do executor vai encontrar.
- **O snippet da §4.5 não tipava.** `(this.constructor as typeof Agent).NAME` referenciava um membro
  que a base não declarava (o `static readonly NAME` está nos agents concretos, §4.8/D5). A base
  ganhou `static readonly NAME: AgentName` no snippet.

---

## 1. Contexto e o que mudou

### 1.1 O que foi abandonado

O goal de 2026-07-24 tinha uma tese única: *"Reescrever o **domínio** (hoje em
`packages/api/typescript/src`) como **novos contextos Go** sobre o kernel `template/core-go`,
colapsando **2 sidecars + 2 bancos + Redis → UM sidecar Go + UM SQLite (WAL)**"*
(`OVERNIGHT-GOAL-2026-07-24-go-domain-port.md:8-10`). Esse port **morreu**. Três razões, nesta ordem:

1. **O terminal era o gate, e o gate caiu por outro motivo.** A decisão (e) do goal antigo
   (`:62-66`) reconhecia o terminal como *"o contexto de MAIOR risco"* e exigia um spike de paridade
   `Bun.Terminal` ↔ Go (`creack/pty` + ConPTY) **antes** de portar. Sem paridade, o alvo "só Go"
   já nascia como "um sidecar Go + o runner de PTY TS interino" (`:129-131`) — ou seja, **o payoff
   inteiro do port dependia de um spike de PTY**. O estudo do open-design
   (`2026-07-26-agent-driving-stream-json.md`) desmontou a premissa por baixo: *"O terminal engine
   foi julgado 'resists a Go port' **por causa do acoplamento PTY/TUI/JSONL**. Esse raciocínio não
   sobrevive a este achado"* (`:77-80`). Não porque devamos portar — mas porque **o engine não
   precisa de PTY nenhum**, e portanto a justificativa "o terminal prende o domínio em TS"
   evaporou junto com a justificativa oposta. O port perdeu o seu contexto crítico como argumento.

2. **A economia de memória não paga a reescrita.** Colapsar 2 sidecars → 1 binário economiza
   **~1 runtime Bun**. O footprint real do produto é de ~500MB–1GB, **dominado pela WebView do
   Tauri e pelos subprocessos dos agent CLIs** (cada `claude` em execução é o item caro, e eles são
   N por issue ativa). Reescrever ~10 contextos TS em Go para economizar single-digit por cento de
   RSS é troca ruim.

3. **O problema real que o port ia resolver é o split-DB, e o substrato SQLite resolve sozinho.**
   O sintoma documentado é a lista de channels aparecendo **DISCONNECTED** porque o daemon lê PGlite
   e o gateway Go escreve Postgres (`2026-07-24-fundamentals-and-upstream.md:112-120`). O goal
   antigo resolvia isso *de lambuja*, movendo o `ui` para Go (`:39`). O commit `469eed5b`
   ("feat(sqlite): salvage the SQLite substrate from the abandoned go-domain port") separou as duas
   coisas: o substrato sobreviveu, a tese não.

O branch `go-domain-port` foi arquivado em `archive/go-domain-port-2026-07-26`.

### 1.2 O que sobrevive

- **O substrato SQLite como implementação concreta**, exatamente com as regras da decisão (a) e da
  regra 5 do goal antigo (`:48-52`, `:80-83`): dialeto SQLite único, namespaces viram prefixo de
  tabela, `uuid→text`, `timestamptz→integer{timestamp_ms}`, `jsonb→text{json}`, enums `text + CHECK`;
  `modernc.org/sqlite` puro-Go, WAL, `//go:embed migrations`, **data-dir encapsulado no construtor
  do store, zero `CODEDM_DATA_DIR` vazando pelas camadas**.
- **A decisão (c) — sem consumer groups** (`:56-59`): single-operator, um consumidor por direção,
  dedup por `UNIQUE` no destino + `ON CONFLICT DO NOTHING`, claim de outbox sob txn IMMEDIATE.
- **A decisão (d) — fresh start** (`:60-61`): não há migração de dados PGlite→SQLite. É por isso que
  renomear tabela e trocar de dialeto é barato.
- **A disciplina de processo inteira** (`:68-91`) — reproduzida na §8 deste doc.

### 1.3 Estado ATUAL do substrato (26-jul) — leia antes de tocar em qualquer coisa

**A metade Go da Fase 0 está PRONTA e COMMITADA em `149b6aa3`** ("feat(sqlite): move the Go gateway
off Postgres onto the shared SQLite store"). O que já é fato consumado, e que o executor **não deve
reabrir, refazer nem reverter**:

- Os **5 repositórios de channel** (channel, message, message-projection, remote, remote-projection)
  estão sobre o `SqliteStore` compartilhado; `core/module.go` largou o provider `NewPostgresDB` e
  binda o `SqliteUnitOfWork` real (era Noop).
- **whatsmeow roda num SEGUNDO pool modernc sobre o MESMO arquivo, com `PRAGMA foreign_keys` ON**,
  porque `Container.Upgrade` recusa rodar com FK OFF e o nosso store deliberadamente roda FK OFF —
  pragma é **por conexão**, não por arquivo. `_txlock=immediate` é obrigatório (não cosmético) sob
  contenção cross-pool.
- **`pgx` e `redis` estão a ZERO linhas nos dois `go.sum`.** Não há superfície Postgres do lado Go.
- **Boot smoke provado sem Postgres no ar:** o binário boota, migra por `//go:embed`, e
  `POST /api/channel/channels/whatsapp` seguido de `GET /api/channel/channels` devolve a linha
  escrita — read-after-write atravessando HTTP sobre um arquivo só.
- Nomes/caminhos que importam: `packages/api/go/core/db/sqlite/store.go` (arquivo `codedm.db`,
  ledger `_sqlite_migrations`, split por `--> statement-breakpoint`, lock de instância única),
  `packages/api/go/core/db/dbutil/sqlite.go` (timestamptz→INTEGER-ms, boolean→INTEGER).

**O que FALTA na Fase 0 é a metade TS**: o daemon ainda persiste em **PGlite embarcado**
(`packages/api/typescript/src/shared/registry.ts:55-126`) e os repositórios TS ainda apontam para o
schema **pg** (`packages/contracts/db/schema/`, 25 tabelas). O schema SQLite equivalente **já existe**
(`packages/contracts/db/schema-sqlite/`, **25 tabelas** + `migrations/`) — o trabalho é **troca de
dialeto + driver**, não modelagem nova. Só quando as duas metades estiverem no mesmo arquivo é que o
aceite *"a lista de channels mostra CONNECTED"* passa a ser **provável**. Bônus esperado e
mensurável: sair do heap wasm do PGlite deve devolver ~50–100MB de RSS.

### 1.4 O que muda agora

Com 2 sidecars aceitos permanentemente, o **E2** do handoff vira a linha viva, não o E1: se um split
existe, a ponte cross-service tem de ser **padrão documentado**, não lacuna implícita
(`2026-07-24-fundamentals-and-upstream.md:196-199`). Aqui a ponte é literal: **um SQLite
compartilhado pelos dois sidecars**. O Go fica com **apenas** o contexto `channel`/gateway — a mesma
divisão do medscall. O daemon TS mantém o domínio inteiro. E é dentro do daemon TS que este goal
acontece.

---

## 2. Objetivo

Substituir o engine de terminal baseado em PTY por **uma única abstração de agent** no daemon TS:
um seam com **um método** que dirige qualquer coding-agent CLI externo via `child_process.spawn`
com **pipes** e **stream-json bidirecional**, e sobre o qual vivem **agents internos como cidadãos
de domínio de primeira classe** (o classificador de mensagem inbound, e os que vierem). Classificar
uma mensagem e executar trabalho num repositório passam a ser **a mesma chamada com requests
diferentes** — a distinção one-shot/interativo, que hoje é um vazamento de *transporte* dentro do
domínio, deixa de existir.

E — a metade que esta emenda acrescenta — **o agent deixa de ser lido e passa a falar**: um servidor
MCP do CodeDM expõe as nossas tools de domínio (`complete_issue`, `raise_stop`, `record_artifact`,
`ask_operator`) e o agent **declara** o que aconteceu com payload tipado, em vez de nós deduzirmos
da saída dele. Isso destrava a fatia PARKED de materialização de issue — ela esperava "o engine
produzir os eventos de execução", e agora o próprio agent os emite.

O contrato OpenAPI/SDK continua sendo o invariante; o e2e roda verde a cada fase.

---

## 3. As decisões fechadas

Estas **não** se reabrem durante a execução. Decisão nova genuína → `OVERNIGHT-BLOCKED.md`, pular só
aquela fatia, continuar.

**(D1) 2 sidecars, aceitos como permanentes.** Go mantém **apenas** `internal/channel` +
`internal/shared` (padrão medscall). O daemon TS mantém o domínio. O shell Tauri supervisiona dois
processos. Os dois sidecars compartilham **UM SQLite** — é isso que mata o split-DB, não um colapso
de binários.

**(D2) stream-json sobre pipes; ZERO PTY no caminho do agent.** A invocação canônica é a do spec
(`2026-07-26-agent-driving-stream-json.md:14-25`):

```
claude -p --input-format stream-json --output-format stream-json --verbose \
       [--include-partial-messages] [--model X] [--add-dir …] \
       [--session-id <uuid> | --resume <id>] \
       [--mcp-config <cfg> --allowedTools <list>] \
       --permission-mode auto
```

`stdio: ['pipe','pipe','pipe']`, `shell: false`, `detached: true` (não-Windows). O prompt entra como
**uma linha JSONL no stdin** e **o stdin não fecha** enquanto o turno vive. A resposta é
reconstruída **exclusivamente do stdout JSONL parseado** — nunca de stdout cru, nunca de
`~/.claude/projects`. Fim de turno é **estrutural** (frame `result` com `stopReason !== 'tool_use'`;
a guarda `parent_tool_use_id == null` **foi removida em 27-jul** — o frame `result` não tem essa
chave, e o invariante sobrevive mais forte: sub-agent não emite `result`. Ver §4.3 regra 5),
nunca marcador de TUI. O
`--permission-mode auto` substitui o auto-accept do trust prompt. **`auto`, NÃO `bypassPermissions`**
(emenda do founder, 27-jul): o prompt que dirige esses runs vem de **terceiro**, por um canal de
mensagem, então um waiver em bloco entregaria a esse input a superfície de tools inteira. `auto` é o
modo graduado do próprio CLI e é a postura certa aqui.
**MEDIDO antes de trocar** — porque a justificativa original do bypass era *"headless nunca mostra
prompt, então qualquer outro modo arrisca pendurar"*, e pendurar é caro (a Fase 2 provou que um turno
que não fecha deixa um `claude` vivo). Num run headless em 2.1.220: exit 0 em 10s, frame terminal
normal (`stop_reason: end_turn`, `permission_denials: []`), Write e Read executados. Ou seja `auto`
**não pendura e não desliga tools**. O que `auto` bloqueia e o bypass não **não foi caracterizado** —
exigiria sondar operações destrutivas; fica deliberadamente não-medido em vez de afirmado.

**(D3) UMA interface de agent, para classificação E para execução.** Hoje o seam é
`TerminalLLMRunner` com **cinco** membros abstratos (`TerminalLLMRunner.ts:66-86`): `generate`,
`stream`, `getSession`, `killSession`, `prewarm`. O `generate` documenta o vazamento com todas as
letras: *"The runner invokes the provider CLI in non-interactive 'print' mode (e.g. `claude -p
<prompt> --output-format json`), parses the JSON … **No streaming, no terminal session** — the pure
`generate()` half of the seam, used by `IssueClassifier`"* (`types.ts:54-59`). E a prova de que a
diferença é **só transporte** está no argv builder compartilhado: `buildCommand(provider, binaryPath,
mode: 'generate' | 'stream', …)` cujo único delta para claude é
`if (mode === 'generate') base.push('--output-format', 'json')` (`oneshot.ts:65-85`). **Uma flag.**
Isso vira **um** método `run(request)`; o que distingue classificação de trabalho é **o request**
(`outputSchema` presente ou ausente), nunca a interface.

**(D4) CLIs externos são literais de dado, um por CLI — nunca uma classe.** Vem do open-design:
*"Each CLI is a **data literal** (`RuntimeAgentDef`), not a class — one pipeline, 26 agents"*
(`2026-07-26-agent-driving-stream-json.md:39`). Substitui o `switch (provider)` escrito à mão em
`buildCommand` e `defaultBinary` (`oneshot.ts:73-96`).

**(D5) Agents internos são cidadãos de domínio, no shape do medscall.** Classe `@injectable()` por
propósito, com `inputSchema`/`outputSchema` declarativos, prompt builder irmão, identidade em
`AgentName`, registrada como **token DI de classe** — sem factory, sem mapa nome→agent
(`medscall .../agent/registry.ts:19-60`; `.../agent/types/Agent.ts:83-127`).

**(D6) PTY só para um painel de shell voltado ao usuário — e ele não existe hoje.** O spec fixa a
fronteira: *"`node-pty` IS a dependency — used **only** for a user-facing shell pane, **never** for
an agent. That is the boundary to copy"* (`:37-38`). Como esse painel **não está especificado**, o
subtree PTY é **deletado** nesta reestruturação (4028 LOC em
`services/TerminalLLMRunner/ClaudeCliTerminalLLMRunner/`, ~54% das 7504 LOC do contexto `terminal`).
A opção fica preservada em `git log`, não em código morto. Se o painel for especificado, ele nasce
como preocupação do **shell desktop**, não como parte do runtime de agent.

**(D7) Processo por turno; sem REPL vivo entre turnos.** É a decisão de maior alavancagem e ela é
fechada aqui. O REPL longo só existia para amortizar o custo de boot da PTY (boot settle, trust
banner, priming turn) — por isso existem `SessionPrewarmService`, `SessionMap`, `queue.ts`, o timer
de idle-evict e o `prewarm()` no seam. Com `-p` headless **não há boot sequence**, logo não há custo
a esconder. Continuidade multi-turno passa a ser o `--session-id`/`--resume` nativo do claude,
persistido na linha durável (`:33-36`). Consequência aceita: `prewarm`/`getSession`/`killSession`
saem da interface e o cancelamento vira process-group kill.

**(D8) NÓS declaramos tools — via um servidor MCP nosso — e o agent DECLARA fatos de domínio.**
Esta é a inversão. O claude aceita servidores MCP externos (`--mcp-config`, escopo por
`--allowedTools`/`--disallowedTools`), e o open-design já faz exatamente isso
(`apps/daemon/src/mcp-config.ts`). O CodeDM não tem MCP hoje — **é lacuna, não limitação**. As
consequências, todas fechadas:

- **Fato de domínio vem de tool call, não de parser.** Trocar inferência por declaração:

  | Inferir (frágil, o desenho antigo) | Declarar (tipado, o desenho novo) |
  |---|---|
  | deduzir do `stop_reason` que a issue terminou | `complete_issue(summary)` |
  | parsear texto atrás de "preciso de aprovação" | `raise_stop(kind, detail)` — `StopKind` já é enum do wire |
  | raspar output atrás de arquivo gerado | `record_artifact(kind, name, ref)` — `ArtifactKind` já é enum do wire |
  | heurística para detectar pedido de esclarecimento | `ask_operator(question)` |

- **Frames deixam de ser a fonte de verdade do domínio** e passam a ser observabilidade/UI +
  transcript + telemetria de uso. §4.3 formaliza as três categorias e a regra anti-double-publish.
- **`ProviderDef` carrega capacidade de tool como DADO** (`mcpConfigFlag`, `allowedToolsFlag`),
  **nunca** como branch no runner. Provider sem MCP simplesmente não declara os campos.
- **O runner NÃO ganha um loop de tools, e o seam NÃO ganha um campo `tools`.** O claude fala com o
  nosso servidor MCP por um **transporte separado**; o runner continua só spawnando e drenando
  frames. *(Isto é uma diferença dura em relação ao medscall, onde o runner medeia o loop — ver §6.)*
- **Escopo de tools varia por agent, e é declarado no agent**: `ClassifyIssueAgent` roda **sem
  nenhuma tool**; `IssueWorkAgent` roda com o conjunto completo.
- **Identidade nunca vem do modelo.** `ownerId`/`issueId`/`threadId` **não são argumentos de tool**:
  vêm do token de execução que o runner injeta na config MCP (§4.4). Um LLM não escolhe em nome de
  quem age.

**(D9) Convergência com o medscall: léxico e playbook SIM, seam de runtime NÃO.** Decisão fechada
(`2026-07-26-agent-abstraction-convergence.md`). Detalhe operacional em §6. Em uma linha: **não
tente compartilhar tipos, arquivos ou pacotes com o medscall neste goal.** A duplicação é
deliberada e a razão está escrita.

**(D10) Config multi-tenant anda no INPUT do agent, nunca no request do runner.** Pré-compromisso
adotado do medscall (`agents/ServiceAgent/types.ts:26-29` estende o input schema com a config;
`ServiceAgent.ts:65-69` consome só no prompt builder). O runner **nunca** vê tenancy. Sem esse
pré-compromisso, a primeira config a aparecer aterrissa no `AgentRunRequest` e o seam apodrece.
Continuamos **não** portando o `AgentConfig` do medscall agora (seria contexto especulativo,
proibido por `CLAUDE.md`) — o que se fecha aqui é **onde ele aterrissa quando existir**.

---

## 4. A abstração

### 4.1 O seam: `AgentRunner`, um método

```ts
// agent/services/AgentRunner/AgentRunner.ts
export abstract class AgentRunner {
	abstract run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent>

	abstract shutdown(): Promise<void>
}
```

**Por que exatamente este método, e por que só ele.** O medscall mantém dois (`LlmRunner.generate`
+ `LlmRunner.stream`, `medscall .../services/LlmRunner/LlmRunner.ts:83-89`) e isso é **legítimo lá**:
são dois caminhos de runtime de verdade sobre o mesmo backend — *"single Mastra call vs. AG-UI
subscriber drain"*. **Aqui não são.** Depois de (D2), classificar e executar são: o mesmo `spawn`,
o mesmo formato de stdin, o mesmo parser de stdout, o mesmo sinal de fim de turno. Um segundo método
codificaria **zero** informação de domínio e reintroduziria exatamente o que o founder rejeitou.
**Divergimos do medscall aqui, conscientemente.**

`AsyncIterable` (e não `Promise`) porque o caso streaming é o caso geral e o estruturado é o
degenerado — a inversa não é verdadeira. A ergonomia de "só me dê o objeto" é resolvida por um
helper **sobre a mesma iteração** (§4.5), não por um segundo método.

**O seam NÃO ganha um campo `tools`, e isto é deliberado (D8).** No medscall o runner **medeia** o
loop de tools: ele recebe `tools: Tool[]` + `ToolContext` e executa a ferramenta quando o modelo
pede. Aqui não: o `claude` conversa com o **nosso servidor MCP por um transporte separado** (§4.4),
e o runner continua fazendo uma coisa só — spawnar e drenar frames. A configuração MCP entra no
`AgentRunRequest` como **dado de invocação** (`mcp`), do mesmo naipe de `binaryPath` e `cwd`, não
como inventário de funções executáveis. Se algum dia um provider exigir que **nós** executemos a
tool inline, isso nasce como um segundo `ProviderDef`/`eventParser`, **nunca** como um segundo
método no seam.

### 4.2 O request — onde a diferença de fato mora

```ts
export interface AgentRunRequest<OutputSchema extends ZodType | undefined = undefined> {
	agentName: AgentName              // identidade p/ telemetria + logs (medscall AgentName)
	// `provider: ProviderKind` foi REMOVIDO na Fase 4.5 — com um runner por CLI ele era uma chave de
	// resolução que não resolve nada: quem recebe o request JÁ É o runner daquele CLI. A resolução
	// kind → runner acontece na DI (`terminal/registry.ts`). Mantê-lo obrigava toda spec a construir
	// um `ProviderKind` DENTRO do próprio runner, que é exatamente o que a AC-4.5.3 proíbe.
	cwd: string                       // workspace absoluto da thread
	systemPrompt?: string
	messages: AgentMessage[]          // o turno; múltiplas mensagens = mesmo turno vivo
	outputSchema?: OutputSchema       // ← O ÚNICO botão que faz disto "classificação"
	model?: AgentModelId              // wire enum (D-contract) — NUNCA `string`
	session?: { resumeId?: string; newId?: string }
	binaryPath?: string               // resolvido pelo ProviderDetector
	mcp?: AgentMcpInvocation          // config + escopo de tools DESTE run (§4.4). Ausente = sem tools
	signal?: AbortSignal              // cancelamento → process-group kill
}
```

**`AgentMcpInvocation` — definido aqui, não citado.** É o portador da fronteira de identidade (§4.4),
e por isso não pode ficar implícito:

```ts
// agent/types/AgentMcpInvocation.ts
export interface AgentMcpInvocation {
	/** Qual dos dois transportes de §4.4 ficou. Decidido em boot pelo detector, não por agent. */
	transport: 'http' | 'stdio'
	/** transport==='http': URL absoluta do router MCP local (ex.: `http://127.0.0.1:<API_PORT>/mcp`). */
	endpoint?: string
	/** transport==='stdio': o entry stub + args (ex.: `{ command: 'bun', args: ['agent/mcp/stdio-entry.ts'] }`). */
	command?: { command: string; args: readonly string[] }
	/** O run token OPACO (§4.4). Vai no header `Authorization` (http) ou no `env` (stdio). */
	token: string
	/** Escopo DESTE run — vira `--allowedTools`. Vem de `agent.tools`, nunca do runner. */
	allowedTools: readonly AgentToolName[]
}
```

**Quem cunha o token — decisão fechada: a classe base `Agent`, nunca o runner.** O runner **não vê**
o input do agent (o `Agent` traduz input → request), logo ele **não tem** `ownerId`/`issueId`/
`threadId` para cunhar coisa alguma. Portanto:

- A base `Agent` injeta o `RunTokenService` (§4.4) e cunha o token **no corpo CONCRETO do seu
  `run()`** — que é template method, não abstrato (§4.5; é lá que o shape final está escrito) — a
  partir do próprio envelope (`input.ownerId/issueId/threadId` + `AgentName` + `expiresAt`), monta o
  `AgentMcpInvocation` com `allowedTools = this.tools`, e o passa em `request.mcp`. Se `this.tools`
  é `[]`, **não monta `mcp` nenhum** e o campo fica `undefined`. A subclasse implementa só
  `buildRequest(input)` e **não** vê o token.
- O runner trata `mcp` como **dado opaco de invocação**: traduz para argv via `ProviderDef`
  (§4.7) e, no fim do run (normal ou cancelado, §4.11), chama `runTokenService.revoke(mcp.token)`.
  Ele **nunca** lê o conteúdo do token e **nunca** o cunha.
- Consequência checável (AC-1.11): `AgentRunRequest` **continua sem** `ownerId`/`issueId`/`threadId`
  — a identidade viaja **dentro** do token, opaca para o seam. Grep prova.

- **Classificação** = `run({ …, outputSchema: LlmDecisionSchema, messages: [oneUserMessage] })`,
  **sem `mcp`**.
- **Trabalho real** = `run({ …, messages: [inbound], session: { resumeId }, mcp })`, sem
  `outputSchema`.

Nada mais difere. `extractJson` (o scan de janela `{...}` encolhendo, `oneshot.ts:103-124`) **morre**:
com stream-json o texto final do assistant vem já delimitado por frame, e a validação é
`outputSchema.safeParse` sobre ele.

**`model` é tipado, não `string`** (adotado do medscall, §6): a regra 4 deste goal — *contrato antes
de implementação* — condena `model?: string`. `AgentModelId` é enum do wire
(`packages/contracts/wire/enums/agent-model-id.tsp`), valor inicial **exatamente**
`{ DEFAULT, SONNET, OPUS, HAIKU }`; `DEFAULT` significa **omitir `--model`**. Estender o value-set é
editar o contrato, não passar string nova. Idem `stopReason`: o `stop_reason` do claude é conjunto
**fechado** → `AgentStopReason` (`{ END_TURN, MAX_TOKENS, STOP_SEQUENCE, TOOL_USE, PAUSE_TURN,
REFUSAL, UNKNOWN }`), com `UNKNOWN` absorvendo valor não previsto **e registrando warn** — nunca
crash. A exceção de "conjunto aberto → `z.string()`" vale para o **nome de tool** (§4.9), não para
esses dois.

### 4.3 As três categorias de sinal — e qual delas é o domínio

Esta é a seção que a inversão do MCP reescreve. Um run produz três coisas **de naturezas
diferentes**, e confundi-las é a origem de todo o parser frágil que este goal está deletando:

| Categoria | O que é | Origem | Vai ao outbox? |
|---|---|---|---|
| **Frame** | formato de wire do CLI (`tool_use`, `text_delta`, `result`) | stdout JSONL | **Nunca.** É SSE/UI. |
| **Fato observado** (`AgentTurnFact`) | transcript consolidado, ciclo de vida de tool, contagem de token | accumulator puro sobre frames | Sim — evento de domínio do contexto `agent` |
| **Fato declarado** | *"a issue terminou"*, *"preciso de aprovação"*, *"gerei este artefato"* | **chamada de tool MCP nossa** (§4.4) | Sim — via use case do contexto `agent`, e daí para o integration event **congelado** |

**A fonte de verdade do domínio é a DECLARAÇÃO.** O accumulator não tem mais o trabalho de adivinhar
intenção; ele consolida o que dá para consolidar mecanicamente (texto, tool lifecycle, tokens) e
mais nada.

```ts
export type AgentRuntimeEvent =
	| { type: 'frame'; frame: AgentFrame }            // TRANSPORTE — SSE; nunca vai ao outbox
	| { type: 'fact'; fact: AgentTurnFact }           // FATO OBSERVADO, cunhado mid-turn
	| { type: 'finished'; result: AgentRunResult }    // exatamente UM, sempre o último

export type AgentFrame =
	| { kind: 'system_init'; sessionId: string; model: string }
	| { kind: 'assistant_text'; messageId: string; text: string; parentToolUseId: string | null }
	| { kind: 'text_delta'; messageId: string; delta: string }
	| { kind: 'thinking_delta'; delta: string }
	| { kind: 'tool_use'; toolUseId: string; tool: string; input: unknown; parentToolUseId: string | null }
	| { kind: 'tool_result'; toolUseId: string; ok: boolean; summary: string; parentToolUseId: string | null }
	| { kind: 'result'; stopReason: AgentStopReason; usage: AgentTurnUsage }
	| { kind: 'error'; detail: string }

// O agregado de tokens do turno, carregado PELO frame terminal — não é um frame.
export interface AgentTurnUsage {
	inputTokens: number
	outputTokens: number
	cacheCreationInputTokens: number
	cacheReadInputTokens: number
}

export interface AgentRunResult {
	outcome: AgentRunOutcome            // COMPLETED | STOPPED
	replyText: string
	sessionId: string | null
	output?: unknown                    // presente sse outputSchema foi passado E validou
	failed: boolean                     // validação estrutural falhou — NUNCA throw
	failure?: string
	stop?: { kind: TransportStopKind; detail: string }   // SÓ stops de TRANSPORTE — ver abaixo
}
```

> **EMENDA 27-jul — a taxonomia acima é a MEDIDA; a anterior era derivada do estudo de produto e
> estava errada em três pontos.** Correções apuradas pelo decision gate da Fase 2 (`bf217a2a`,
> artefato em `.specs/codedm/phase2-smoke/`, divergências D1/D3/D4), dobradas **no documento** —
> antes viviam só no corpo da mensagem de commit, o que fazia o próximo executor ler a versão errada.
> Reproduzíveis a partir dos bytes crus em `phase2-smoke/raw/*.jsonl`, os quatro arquivos.
>
> - **Não existe frame `usage`. Removido da união.** Usage é um **campo**: aparece por-assistant em
>   `message.usage` e uma vez, **já agregado sobre o turno inteiro**, no frame terminal `result`
>   (ao lado de `modelUsage` e `total_cost_usd`). Consequência dura para o accumulator: o
>   `AgentUsageEvent` é cunhado **UMA vez, do agregado terminal** — dobrar as cópias por-assistant
>   conta o mesmo token duas vezes. E o agregado tem **quatro** baldes, não dois (regra 8 abaixo).
> - **`tool_use` / `tool_result` / `text` / `thinking` NÃO são frames** — são **content blocks**,
>   entradas de `message.content[]` de um frame `assistant` (text, thinking, tool_use) ou `user`
>   (tool_result), e **um frame pode carregar vários**. O codec precisa de um passo real de
>   **fan-out sobre `content[]`** para sintetizar a união acima: não é renomear campo, e o orçamento
>   de ~150 LOC do codec tem de **absorver esse fan-out**. Dois detalhes medidos que o codec erra se
>   ignorar: `tool_result.is_error` é **ausente** no sucesso (não `false`), logo `ok` deriva de
>   `is_error !== true`; e `tool_result.content` veio **string** num caso e **array** noutro — os
>   dois shapes ocorrem no corpus e ambos têm de ser aceitos.
> - **`parentToolUseId` saiu do frame `result` e entrou em `assistant_text`/`tool_result`.** É onde
>   ele de fato existe no wire (frames `assistant`/`user`, chave `parent_tool_use_id`); no `result`
>   **a chave não existe**. Ver a regra 5, reescrita por causa disto.

**Stops de TRANSPORTE ≠ stops de DOMÍNIO — e só os primeiros vivem no `AgentRunResult`.** O
`StopKind` do wire (`stop-kind.tsp`) tem cinco valores e eles se partem em dois grupos com **origens
diferentes**, o que fecha a contradição entre a regra 6 e este record:

| Grupo | Valores | Quem levanta | `FactSource` |
|---|---|---|---|
| **Transporte** | `AUTH_REQUIRED`, `SERVER_ERROR` | o **runner**, observando o processo/stream (o CLI pediu `/login`, o processo morreu, o stream quebrou) | `INFERRED` — legítimo, é o único jeito |
| **Domínio** | `APPROVAL_NEEDED`, `HUMAN_REQUESTED`, `BLOCKED_BY_CLASSIFICATION` | **só** `codedm__raise_stop` (§4.4) | `DECLARED` |

`TransportStopKind` é um **subtipo em TS do wire enum**, não um enum novo — nenhum value-set é
redeclarado (regra 5 da §8):

```ts
// agent/enums/TransportStopKind.ts
export type TransportStopKind = typeof StopKind.AUTH_REQUIRED | typeof StopKind.SERVER_ERROR
export const TRANSPORT_STOP_KINDS = [StopKind.AUTH_REQUIRED, StopKind.SERVER_ERROR] as const
```

Consequência dura, e é ela que a AC-6.7 testa: um run **sem `mcp`** ainda pode terminar com
`stop: { kind: AUTH_REQUIRED }` (transporte, `INFERRED`) — o que ele **não** pode produzir é um stop
de **domínio**, porque `raise_stop` não existe sem tools.

**`AgentTurnFact` — definido, não citado** (era a lacuna apontada pelo veredito de convergência).
São **subclasses de `BaseDomainEvent`**, porque é isto que vai ao outbox; POJO não serve:

```ts
// agent/events/index.ts
export type AgentTurnFact =
	| AgentMessageEvent    // { messageId, text, role }         — transcript consolidado
	| AgentToolCallEvent   // { toolUseId, tool, input, output, status, startedAt, finishedAt, errorMessage }
	| AgentUsageEvent      // { inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens }
```

O `AgentToolCallEvent` carrega **ciclo de vida completo**, no shape do `ChatToolCallEvent` do
medscall (`events/ChatEvent.ts:19-36`) — é ele que o `flush()` materializa como FAILED quando um
`tool_use` fica órfão.

**Regras duras do fold:**

1. **UM wrapper opaco por frame de transporte, não uma classe por tipo de frame.** Isto é medscall
   verbatim: eles tinham 32 classes espelho de AG-UI + 138 linhas de conversor e **deletaram tudo**
   em favor de um `AgUiFrameEvent` único, porque *"AG-UI é wire format; não modelamos isso como
   vocabulário de domínio"* (`medscall .../agent/README.md:432`). O `AgentFrame` acima é a taxonomia
   do wire do claude e para por aí.
2. **Fatos observados saem do accumulator, não do parser.** `StreamJsonToTurnFactAccumulator` é uma
   máquina de estado pura `(frame) => AgentTurnFact | null`, com `flush()` que materializa
   `tool_use` sem `tool_result` como falha, testada sobre sequências de frames enlatadas. Sem
   dependência de spawn, sem I/O.
3. **ANTI-DOUBLE-PUBLISH: o accumulator IGNORA as nossas próprias tools.** Toda tool exposta pelo
   nosso servidor MCP tem prefixo **`codedm__`**. Ao ver `tool_use`/`tool_result` com esse prefixo, o
   accumulator emite **apenas** o frame (observabilidade) e **nunca** um fato — porque o fato já foi
   persistido pelo use case que atendeu a chamada (§4.4). Sem essa guarda, uma `complete_issue`
   publicaria `integration.issue.completed` **duas vezes**.
4. **Validação estruturada nunca lança no meio do drain.** Falha vira `finished` com
   `failed: true`. É a regra que o medscall documenta no próprio contrato do agent: *"validation
   failures surface as a terminal event with `payload.failed === true` (never as a thrown error, so
   consumers can still drain the stream cleanly)"* (`medscall .../agent/types/Agent.ts:117-125`).
5. **Turn-end é estrutural.** `kind: 'result'` com `stopReason !== TOOL_USE` fecha o turno e só então
   `stdin.end()`. Backstop **obrigatório**: watchdog de inatividade. Isso substitui os três
   detectores concorrentes de hoje e mata os enums `TuiMarker`/`TuiActionType`/`TurnEndSignal`.

   **EMENDA 27-jul — a guarda `parentToolUseId == null` FOI REMOVIDA DESTA REGRA, e removê-la é
   correção de bug, não afrouxamento.** A formulação anterior era
   `kind: 'result' && parentToolUseId == null && stopReason !== TOOL_USE`. Medido nos quatro
   arquivos de `phase2-smoke/raw/`: **o frame `result` não tem a chave `parent_tool_use_id`** —
   `'parent_tool_use_id' in result` é `False` nas quatro capturas, **incluindo a do sub-agent**.
   Logo `undefined == null` até seria `true` em `==` frouxo, mas a intenção declarada era comparação
   estrita sobre um campo do record (`parentToolUseId: string | null`, agora removido do `result`),
   e qualquer implementação que leia esse campo estará lendo algo que não existe. Escrita
   literalmente sobre um campo inexistente, a guarda **é um hang**: o turno nunca fecha e o run cai
   no watchdog.

   **O invariante que a guarda queria proteger sobrevive numa forma MAIS FORTE, e é por isso que a
   remoção é segura:** o sub-agent **não emite frame `result` nenhum**. Verificado em
   `s3-subagent.jsonl` — o sub-agent fez um `tool_use` (`Read`) completo, recebeu `tool_result` e
   terminou, e o arquivo contém **exatamente UM** frame `result`. `type === 'result'` é portanto
   **um-por-run por construção**, e o fim de turno não precisa de desempate por parentesco.

   **`parent_tool_use_id` continua load-bearing — só que noutro lugar:** ele vive nos frames
   `assistant`/`user` e é a **chave de escopo do accumulator** (medido: `toolu_01WpAVhnCvdR8Ywmh4rK4jed`
   em três frames consecutivos do sub-agent). É o que separa o transcript do sub-agent do transcript
   do agent principal. Por isso ele entrou em `assistant_text`/`tool_result` na taxonomia acima.

   **A metade `stopReason !== TOOL_USE` fica, mas está NÃO-FALSIFICADA, não verificada.** `stop_reason`
   é `null` em **todos** os frames `assistant` do corpus, e nenhum `result` com `stop_reason:
   'tool_use'` foi observado nem pôde ser provocado. Mantê-la é barato (`AgentStopReason` já está
   congelado) e defensivo. **Quem reportar a Fase 2 não pode apresentá-la como medida.**

   **O watchdog não é opcional, e o contrafactual mostra por quê.** `raw/stdin-hold-control.json`:
   segurando o stdin aberto depois do frame terminal, o filho seguia **vivo 17358 ms depois**, com
   zero frames adicionais. `stdin.end()` **é** o ato que encerra o turno — logo um codec que erra o
   turn-end **vaza um processo `claude` vivo**, não apenas demora.
6. **Degradação sem tools é VISÍVEL, não silenciosa — e o `source` tem um PORTADOR declarado.**
   Quando o agent roda sem escopo de tool, a conclusão continua sendo cunhada do `outcome` terminal
   — mas o evento carrega `source: FactSource.INFERRED` em vez de `DECLARED`. Nesse modo
   **artefatos e stops de DOMÍNIO simplesmente não existem** (não há `record_artifact` nem
   `raise_stop`); **stops de TRANSPORTE continuam existindo** e continuam `INFERRED`, porque nunca
   dependeram de tool alguma (tabela acima).

   **O portador — verificado que HOJE não existe, e por isso é entrega da Fase 6.** As duas classes
   reusadas não têm o campo: `AgentRunCompletedEventSchema` é
   `z.domainEvent({ issueId, threadId, key, completedAt })` e `AgentRunStopRaisedEventSchema` é
   `z.domainEvent({ stopId, issueId, threadId, kind })`. Uma AC assertando em `event.payload.source`
   hoje falharia por campo inexistente. Portanto, **a Fase 6 acrescenta `source: z.enum(FactSource)`
   ao schema das DUAS classes** — nomeadamente
   `packages/api/typescript/src/agent/events/AgentRunCompletedEvent.ts` e
   `.../AgentRunStopRaisedEvent.ts`. Todo
   `new AgentRunCompletedEvent({...})` / `new AgentRunStopRaisedEvent({...})` passa a
   preencher o campo: `RunIssueTurn` com `INFERRED`, os use cases de declaração com `DECLARED`.
   (Nomes atualizados pela Fase 5, que renomeou as classes e os nomes de evento `terminal.*` →
   `agent.run.*` — ver a emenda do founder na §7/Fase 5. Continuam context-private, custo de
   contrato zero.)

   **Custo de contrato: ZERO.** Estes são eventos de domínio **context-private** (`terminal.*`), não
   wire — o cabeçalho das próprias classes diz *"Context-private fact"*. Eles não vivem em
   `packages/contracts`, não passam por TypeSpec, não aparecem na OpenAPI e o
   `PublishTerminalIntegrationEvents` **não repassa** o campo (os integration events continuam
   congelados; a **única** mudança de contrato da Fase 6 continua sendo o `detail` do item (i) da
   §4.4). O `source` fica onde a consulta é feita: na tabela de eventos/outbox
   (`shared_events`) — *"dá para consultar quantas issues fecharam por inferência"* vira um `SELECT`,
   não uma promessa. Exercitado por **AC-6.7(a)** e **AC-6.4(c)**.
7. **UM produtor por fato, escolhido pelo ESCOPO DE TOOL DO AGENT — e as classes de evento são as
   MESMAS.** A regra 3 guarda o **accumulator**; esta guarda o **ciclo de vida do run**, que é o
   outro caminho capaz de publicar o mesmo evento congelado — e sem ela a AC-6.4 não fecha.
   Verificado: `terminal/usecases/RunTerminalSession.ts` (`persistOutcome`, `:195-224`) levanta
   `AgentRunCompletedEvent` / `AgentRunStopRaisedEvent` a partir do `outcome`, e esses **já**
   fazem bridge para `integration.issue.completed` / `stop_raised`. Com tools ligadas, isso somado a
   uma `complete_issue` declarada dá **duas** publicações.

   **Onde o predicado mora — e por que NÃO é `request.mcp`.** O `AgentRunRequest` é montado **dentro
   do `Agent`** (§4.2, §4.5): o use case injeta o agent e chama `agent.run(input)`; ele **nunca**
   enxerga o request, logo `if (request.mcp)` seria inalcançável de dentro do `RunIssueTurn`.
   O predicado equivalente que o use case **enxerga** é o **escopo de tool do agent injetado** —
   `readonly tools: readonly AgentToolName[]`, campo público da base `Agent` (§4.5). E a
   equivalência é **exata**, não aproximada, porque as duas regras que a sustentam já estão
   fechadas: (i) §4.2 — *"se `this.tools` é `[]`, não monta `mcp` nenhum"*; (ii) §4.7 — agent que
   **exige** tools contra provider sem `mcpConfigFlag` **falha nomeado** (`AGENT_TOOLS_UNSUPPORTED`),
   nunca degrada em silêncio. Não existe terceiro caso. Portanto
   **`request.mcp` presente ⟺ `agent.tools.length > 0`**, e o use case usa o lado que ele consegue
   ler. Fica assim, sem ambiguidade:
   - **`RunIssueTurn` cunha a conclusão / o stop de DOMÍNIO de ciclo de vida SOMENTE quando
     `this.<agentInjetado>.tools.length === 0`** (`FactSource.INFERRED`). Com escopo não-vazio, o
     **único** produtor do fato de domínio é o use case de declaração (`FactSource.DECLARED`).
   - **O stop de TRANSPORTE é cunhado SEMPRE**, independente do escopo de tool, a partir de
     `result.stop` (`TransportStopKind`, tabela desta seção), sempre `FactSource.INFERRED` — ele
     nunca dependeu de tool alguma. Transcript idem.
   - Um `if` sobre `agent.tools.length` **é legítimo** aqui — é política de origem de fato, não
     branch de provider (regra 4 da §8). O que a regra 4 proíbe é `if (provider === 'x')`.
   - **Os use cases de declaração REUSAM as classes de evento que já existem**
     (`AgentRunCompletedEvent` / `AgentRunStopRaisedEvent`, renomeadas **apenas** pelo `git mv`
     da Fase 5, que a §5.3 lista como "FICAM"). **Não nascem eventos de domínio paralelos**, e
     portanto o bridge **não ganha branch novo** — continua com o mesmo 1:1 de hoje. Um evento novo
     aqui significaria dois branches mapeando ao mesmo evento congelado: é exatamente o
     double-publish que a AC-6.4 mede.
   - Caso degenerado, e a AC-6.4 mede este: run de um agent **com escopo de tool** que declara
     `complete_issue` **e** também termina normalmente → **exatamente um**
     `integration.issue.completed` no outbox.
8. **O fato de uso é cunhado UMA VEZ, do agregado terminal, e carrega os QUATRO baldes.**
   *(Regra acrescentada em 27-jul pela divergência D4 do smoke da Fase 2 — o `AgentUsageEvent`
   congelado na Fase 1 tinha só `{inputTokens, outputTokens}`, o que é uma falha de correção, não de
   estilo.)*

   **Uma vez, do `result`:** não existe frame `usage` (ver a emenda da taxonomia acima). Usage
   aparece por-assistant em `message.usage` **e** agregado no frame terminal. O accumulator emite
   `AgentUsageEvent` **só** no frame terminal; somar as cópias por-assistant conta o mesmo token
   duas vezes.

   **Quatro baldes, porque o wire parte o input em três contadores e o simples é o MENOR.** Medido
   em `phase2-smoke/raw/s1-text.jsonl`, um turno real: `input_tokens: 2`,
   `cache_creation_input_tokens: 9188`, `cache_read_input_tokens: 15273` — `total_cost_usd`
   0,0997765. Persistir só `inputTokens` gravaria **2** para **~24,5k** de input efetivamente
   consumido: a quota por custo, que a §4.3 declara ser o propósito deste evento, erraria por ~3
   ordens de grandeza. Total de input do turno =
   `inputTokens + cacheCreationInputTokens + cacheReadInputTokens`.

   **Os quatro campos são OBRIGATÓRIOS, não opcionais.** Um provider que não cacheia contribui `0`
   nos dois baldes de cache — o que é **aritmeticamente correto**, não "desconhecido": sem cache,
   todo o input cai em `inputTokens` e a soma continua valendo. Campo opcional reintroduziria em
   silêncio exatamente a perda que esta regra corrige, toda vez que fosse omitido.

   **Continua SEM `costUsd` e sem moeda — e D4 REFORÇA essa escolha em vez de contradizê-la.** Os
   quatro baldes precificam de forma diferente (um cache read é ~1 ordem de grandeza mais barato que
   um input token fresco). Guardar os baldes é o que permite ao leitor aplicar uma tabela de preço
   revisável; guardar um `costUsd` congelaria a tabela de hoje dentro do registro durável. O FATO é
   a contagem de token; o preço é política de quem lê.

   **Custo de contrato: ZERO — é aditivo sobre evento de domínio context-private** (`agent.turn.*`,
   nunca `integration.*`), permitido explicitamente pela regra 5 da §8. Não passa por TypeSpec, não
   aparece na OpenAPI, não tem contraparte de wire.
9. **Frame BEM-FORMADO porém DESCONHECIDO é descartado em silêncio e NUNCA aborta o drain.**
   *(Regra acrescentada em 27-jul pela divergência D6 — mais forte, e mais load-bearing, do que
   "linha não-JSON é ignorada".)* O corpus tem **dez** tipos de frame que a taxonomia não nomeia:
   `system/{hook_started,hook_response,status,thinking_tokens,task_started,task_progress,task_updated,task_notification}`,
   `rate_limit_event` e `stream_event`. Não são hipotéticos: `system/hook_started` +
   `system/hook_response` e `rate_limit_event` aparecem nas **quatro** capturas, disparados pelos
   `SessionStart` hooks do próprio usuário, inlinando ~4KB de stdout de hook. É **ruído ambiental
   que o CodeDM não controla** — muda com a máquina, com o `~/.claude` do usuário e com a versão do
   CLI. Um codec que trate frame desconhecido como erro morre em runs reais na primeira máquina com
   hook configurado. Nota de escopo: `--bare` pularia os hooks ao custo de CLAUDE.md/plugins — é
   decisão de `ProviderDef`, **não** do codec, e não substitui esta regra.

### 4.4 O servidor MCP do CodeDM — como o agent declara

**Nasce um servidor MCP do CodeDM expondo as tools de domínio, com os schemas Zod que já existem.**
Quatro tools, prefixo `codedm__`, todas mapeando para vocabulário **já congelado** no wire:

| Tool | Payload | Aterrissa em |
|---|---|---|
| `codedm__complete_issue` | `{ summary: string }` | use case `DeclareIssueComplete` (ctx `agent`) → levanta a **classe de evento que já existe**, `AgentRunCompletedEvent` (→ `AgentSessionCompletedEvent` depois do `git mv` da Fase 5) → bridge existente → **`integration.issue.completed`** (congelado) |
| `codedm__raise_stop` | `{ kind: StopKind; detail: string }` | `DeclareStop` (ctx `agent`) → **a mesma** `AgentRunStopRaisedEvent` → bridge existente → **`integration.issue.stop_raised`** (agora com `detail`, ver (i) abaixo) |
| `codedm__record_artifact` | `{ kind: ArtifactKind; name: string; ref: string; meta?: string }` | **contexto `artifact`**: `RecordArtifactTool` → use case **que já existe** `RecordArtifact` → `artifact.recorded` → bridge existente do `artifact` → **`integration.artifact.recorded`** (ver (ii) abaixo) |
| `codedm__ask_operator` | `{ question: string }` | `AskOperator` (ctx `agent`) → **a mesma** `AgentRunStopRaisedEvent`, com `kind` fixado em `StopKind.HUMAN_REQUESTED` e `detail: question` → **`integration.issue.stop_raised`** |

**Nenhum evento de domínio novo nasce para servir as tools.** `agent.run.completed` /
`agent.stop.raised` / `agent.artifact.declared` / `agent.operator.asked` são **nomes de fato na
prosa deste doc, não classes**: os use cases de declaração **reusam** as classes de evento que a §5.3
lista como "FICAM", renomeadas **apenas** pelo `git mv` da Fase 5. Consequência dura e checável: o
bridge write-side **não ganha branch novo** — continua com exatamente o mesmo 1:1 de hoje, e por isso
não existe um segundo caminho publicando o mesmo evento congelado (§4.3, regra 7).

**Duas aterrissagens precisavam de um cidadão nomeado. As duas estão fechadas aqui, e nenhuma delas
é decisão de founder.**

**(i) `detail` — a Fase 6 acrescenta `detail: string` a `packages/contracts/wire/events/issue-stop-raised.tsp`.**
Verificado: o evento congelado carrega hoje só `{stopId, issueId, threadId, kind}`, e
`issue/handlers/MaterializeIssueFromExecution.ts:66` passa `detail: ''` **hardcoded**, derivando o
`title` de `STOP_TITLES[kind]`. Sem o campo, o texto de `raise_stop(kind, detail)` e a pergunta de
`ask_operator(question)` **morrem no bridge** — o card "Needs you" nasce vazio e a AC-6.10(b) é
insatisfazível. **Isto é permitido pela regra 5 da §8: é campo ADITIVO num evento existente, não
value-set novo nem evento novo** — a regra proíbe *redeclarar vocabulário*, não estender payload.
Custo já orçado: `bun run contracts` + `bun sdk` + `react tsc` + `e2e tsc`, que são exatamente o gate
da AC-6.8. Junto vai a única mudança de consumidor: `MaterializeIssueFromExecution` passa
`detail: event.payload.detail ?? ''` adiante e, quando `kind === StopKind.HUMAN_REQUESTED`, usa a
**pergunta como `title`** (`STOP_TITLES` continua sendo o fallback para os outros quatro kinds).
Exercitado por **AC-6.10(b)** e **AC-6.11**.

**(ii) `record_artifact` aterrissa no contexto DONO DA ESCRITA — a tool é um controller fino do
`artifact`, e `DeclareArtifact` NÃO existe.** O desenho anterior mandava um `DeclareArtifact` do
`agent` publicar `integration.artifact.recorded`, e isso não fechava por três razões verificadas:
(a) `artifact/handlers/external.ts` declara com todas as letras que BC6 *"consumes no inbound
integration events"* — logo **nada materializaria a linha** e a AC-6.2 seria inalcançável; (b)
`artifact-recorded.tsp` **não carrega `ref` nem `meta`**, então materializar a partir dele perderia
justamente o que identifica o artefato — que é a razão escrita no próprio `external.ts`; (c)
apareceria um **segundo publicador** do mesmo evento congelado, já que
`artifact/handlers/PublishArtifactIntegrationEvents.ts` é o primeiro, e sem dono declarado.

**A regra de propriedade, em uma linha: uma tool MCP é um controller fino do bounded context que é
DONO da escrita que ela provoca.** `complete_issue` / `raise_stop` / `ask_operator` são fatos de
**execução** → contexto `agent`, que já tem o bridge congelado. `record_artifact` é **escrita no
catálogo** → contexto `artifact`, que já tem o use case tipado com `ref`/`meta`
(`artifact/usecases/RecordArtifact.ts`) e já é, por declaração própria, *"the write-owner of the
artifact catalog"*. Portanto nasce **`artifact/mcp/RecordArtifactTool.ts`** — handler fino que
verifica o run token, lê `ownerId`/`issueId`/`threadId` **das claims** e despacha `RecordArtifact`.
Consequências: o publicador de `integration.artifact.recorded` continua **um só** (o bridge do
`artifact`, intocado, servindo tanto este caminho quanto o operador-driven), o `external.ts` continua
sem consumidor e a razão registrada nele continua verdadeira, e **não há eco**
(declarar → publicar → materializar → publicar…). AC própria: **AC-6.11**.

**Se algum rail reprovar o registro do tool do `artifact` no router do `agent`, descer a ESCADA na
ordem — do mais barato para o mais caro, e PARAR no primeiro que passar.** O erro a evitar é pular
direto para o degrau 3 (mudança de contrato + handler novo + idempotência) quando os dois primeiros
resolvem sem tocar em contrato nenhum. Verificado contra os rails reais
(`tests/architecture/context-map.test.ts` + `scripts/detectors/import-direction.ts` +
`slice-closure.ts`):

- **Degrau 1 — SEM import cross-context nenhum (o mais barato; tentar primeiro).** O `artifact`
  registra a **sua** perna de tool a partir do **próprio** `artifact/index.ts`, e o router MCP
  compõe as tools na **raiz de composição**. `shared/index.ts`, `shared/registry.ts`, `routers.ts` e
  `index.ts` são `BOOTSTRAP_FILES` (`shared/context-map.ts`) — **excluídos** da checagem de edge por
  construção, exatamente porque existem para agregar todo contexto. Custo: **zero** declaração nova,
  zero mudança de política. Se der para compor aí, acabou.
- **Degrau 2 — declarar a intenção (barato, e é o mecanismo que o rail oferece).** O
  `context-map.test.ts` é **intent-first**: uma edge é legal se estiver em `CONTEXT_MAP` e a
  superfície for permitida por `CROSS_CONTEXT_POLICY`, **ou** se houver uma `POLICY_EXCEPTIONS`
  nomeada. Então: acrescentar `agent: { artifact: { note: '…' } }` ao `CONTEXT_MAP` **mais** uma
  entrada de `POLICY_EXCEPTIONS` nomeando o arquivo (`agent/mcp/router.ts`) e a superfície
  (`@artifact/mcp`) com o *why*. Verificado que **não cria ciclo**: `artifact` depende hoje de
  `thread` e `issue`, nunca de `agent` — logo nenhum `ANNOTATED_CYCLES` novo é necessário.
  Preferir a `POLICY_EXCEPTIONS` nomeada (per-file, liveness-gated) a alargar
  `CROSS_CONTEXT_POLICY.allowed` com `'mcp'` — alargar a política global é decisão de arquitetura
  para o repo inteiro; a exceção nomeada é uma decisão com trilha de review. Custo: **duas
  declarações**, zero mudança de contrato, zero código redesenhado.
- **Degrau 3 — o caminho de integration event (o caro; só se 1 e 2 falharem).**
  `artifact/handlers/MaterializeArtifactFromAgent.ts`, external handler consumindo
  `integration.artifact.recorded` publicado pelo bridge do `agent`, **com `ref` acrescentado a
  `artifact-recorded.tsp`** pela mesma permissão aditiva do item (i), e **idempotência por
  `artifactId` cunhado pelo declarante** (`RecordArtifact` ganha `artifactId` opcional no input —
  hoje ele mina o id em `Artifact.create()` — e vira **no-op sem evento** quando a linha já existe; é
  isso, e só isso, que corta o eco na segunda passada). Este degrau custa `bun run contracts` +
  `bun sdk` + `react tsc` + `e2e tsc` e um handler novo — por isso é o último.

**Registrar no BUILD-LOG em QUAL degrau parou e por que os anteriores não serviram (com a saída
literal do rail que reprovou) — não é decisão de founder.**

**`codedm__ask_operator` — fechado como FIRE-AND-FORGET.** A tool **não bloqueia** esperando humano:
o handler dispara o use case e devolve **imediatamente** `{ delivered: true }`, com uma resposta de
texto fixa ao modelo (*"A pergunta foi entregue ao operador. Não espere resposta neste turno; se não
puder prosseguir sem ela, chame `codedm__raise_stop`."*). **Razão:** numa noite não há ninguém para
responder, e uma tool síncrona travaria o run até o watchdog — o pior modo de falha possível. O
destino é nomeado e **não** é um bridge novo, nem um evento novo: o `AskOperator` levanta a **mesma
classe** `AgentRunStopRaisedEvent` que o `DeclareStop` levanta, e o **mesmo**
`handlers/PublishTerminalIntegrationEvents.ts` que já publica os outros três a mapeia para
`integration.issue.stop_raised` com `StopKind.HUMAN_REQUESTED` e `detail: question` — ou seja, a
pergunta vira um stop "Needs you" na thread, exatamente o vocabulário que o produto já renderiza, e
**com o texto visível** (item (i) acima; sem o campo `detail` este parágrafo seria uma promessa
vazia). Nenhum integration event novo, nenhum branch novo no bridge; `ask_operator` é **açúcar
tipado sobre a mesma aterrissagem de `raise_stop`**, com o `kind` fixado pelo handler (o modelo não
escolhe o kind aqui). Exercitada pela **AC-6.10**.

**Nenhum integration event NOVO é criado — a única mudança de contrato é o campo aditivo `detail`
do item (i).** Os bridges write-side que já existem
(`terminal/handlers/PublishTerminalIntegrationEvents.ts:24-25` e
`artifact/handlers/PublishArtifactIntegrationEvents.ts`) e o consumidor que já existe
(`issue/handlers/MaterializeIssueFromExecution.ts:22-23`) continuam intactos — a tool só passa a ser
**quem origina** o fato. É exatamente por isso que esta fatia destrava a materialização de issue sem
inventar vocabulário. Hoje o engine **não tem caminho nenhum** para `integration.artifact.recorded`
(o único produtor é o bridge do `artifact`, alimentado pelo caminho operador-driven); com
`record_artifact` o agent passa a alimentar **o mesmo** produtor, pelo mesmo use case.

**Transporte — decisão fechada, com fallback já escolhido (nada de perguntar):**

- **Padrão: HTTP montado no próprio daemon.** O servidor MCP é um router do daemon
  (`agent/mcp/`), e o runner injeta em `--mcp-config` um JSON apontando para
  `http://127.0.0.1:<API_PORT>/mcp` com um **run token** no header. Zero processo extra, zero porta
  extra, e o daemon já é um servidor HTTP.
- **Fallback (se o smoke da Fase 6 mostrar que o CLI não fala HTTP MCP nessa versão):** um stub
  stdio (`agent/mcp/stdio-entry.ts`) declarado como `command`+`args` no `--mcp-config`, com o run
  token no `env`, que apenas repassa para o mesmo router HTTP local. **Registrar no BUILD-LOG qual
  dos dois ficou e seguir** — isto não é decisão de founder.
- **O router MCP NÃO é emitido na OpenAPI/SDK — decisão fechada, para não sobrar pergunta.** Ele é
  rota de **produção**, então `Router.registerControllers` o coletaria sob `EMIT_OPENAPI` e um
  endpoint JSON-RPC de tool viraria hooks React Query no SDK — ruído sem consumidor. Precedente no
  próprio repo: `shared/controllers/TestIngressController.ts` é montado **fora** do conjunto emitido
  (*"route collection runs under EMIT_OPENAPI, where CODEDM_E2E is unset, so the controller is not
  mounted"*) e por isso tem **0 hits** em `packages/api/typescript/public/docs/openapi.json`. O
  router MCP segue a **mesma disciplina de montagem** — rota real no daemon, fora do registry
  emitido. Consequência para a regra 5 da §8: o wire-identity do MCP é garantido pelos **schemas Zod
  das tools + `AgentToolName`** (AC-1.6, Fase 1), **não** pela OpenAPI; a regra 5 continua valendo
  integralmente para o que a §4.9 muda no SSE. Checado por grep na **AC-6.8**.

**Identidade vem do token, nunca do payload (invariante de segurança).** O run token carrega
`{ ownerId, issueId, threadId, agentName, expiresAt }` e é o **único** lugar de onde o handler de
tool lê identidade. Consequência checável: **nenhum input schema de tool contém `ownerId`, `issueId`
ou `threadId`**. Um modelo não escolhe em nome de quem age, e um prompt injetado não consegue
completar a issue de outro owner.

**Quem cunha, quem revoga — sem ambiguidade (§4.2).** `RunTokenService` (`agent/mcp/RunTokenService.ts`)
expõe três verbos: `mint(claims): string`, `verify(token): RunTokenClaims | null`, `revoke(token): void`.

| Papel | Quem faz | Por quê |
|---|---|---|
| **Cunhar** | a classe base **`Agent`**, no corpo **concreto** do seu `run()` (template method, §4.5), antes de montar o request | é o **único** que tem o envelope (`input.ownerId/issueId/threadId`, §4.6) **e** monta o request. O runner não vê o input; a subclasse só implementa `buildRequest()`. |
| **Transportar** | `request.mcp.token` (opaco) → header `Authorization` (http) ou `env` (stdio) | o seam não ganha campo de identidade |
| **Verificar** | o **router MCP**, a cada tool call | fronteira de autorização por chamada |
| **Revogar** | o **runner**, no término do run (normal, erro ou cancelamento §4.11) | é quem sabe que o processo morreu |

Tokens são de vida curta (`expiresAt` = janela do run + graça) e **revogados** ao fim: uma tool call
atrasada de um run morto recebe **401** e não escreve nada (AC-6.6).

**Escopo por agent, declarado no agent (D8):** cada agent expõe `readonly tools: readonly AgentToolName[]`.
`ClassifyIssueAgent` → `[]` (e o runner **não passa `--mcp-config`**). `IssueWorkAgent` → as quatro.
O runner traduz isso em `--allowedTools` a partir do `ProviderDef`; se o provider não declara
`mcpConfigFlag` e o agent pede tools, o run falha **rápido e nomeado** com o
`ApplicationError` novo `AGENT_TOOLS_UNSUPPORTED` — nunca degrada em silêncio.

**Simetria com os agents internos** (por que isto é estrutural e não um extra): uma tool MCP é uma
função com schema de entrada e saída — a **mesma** forma do `Agent` (`inputSchema`/`outputSchema`).
Um agent interno pode, no futuro, ser exposto como tool ao agent externo (o claude chamando
`codedm__classify_issue` quando não sabe onde encaixar algo). Uma abstração, dois pontos de uso.
**Não implementar isso agora** — é o motivo pelo qual a forma precisa ficar simétrica, não uma
entrega deste goal.

### 4.5 Structured output: a MESMA chamada

O açúcar vive na **classe base do Agent**, não no runner:

```ts
// agent/types/Agent.ts
export abstract class Agent<
	InputSchema extends AgentInputSchemaConstraint,
	OutputSchema extends ZodType | undefined = undefined,
> {
	/**
	 * Identidade, declarada por cada agent concreto (§4.8/D5) e DECLARADA aqui para que o template
	 * method abaixo possa lê-la por `this.constructor`. Sem esta linha o snippet não tipa — `NAME`
	 * não existiria no lado estático da base. Estático não cai em `strictPropertyInitialization`,
	 * então a base pode declarar sem inicializar; a subclasse atribui.
	 */
	static readonly NAME: AgentName

	abstract readonly inputSchema: InputSchema
	readonly outputSchema?: OutputSchema
	readonly tools: readonly AgentToolName[] = []
	readonly input!: z.output<InputSchema> & AgentInputEnvelope   // phantom
	readonly output!: OutputSchema extends ZodType ? z.output<OutputSchema> : never

	constructor(
		protected readonly runner: AgentRunner,
		protected readonly runTokenService: RunTokenService,
	) {}

	/**
	 * ÚNICO entry point, e é CONCRETO — template method. É aqui (e só aqui) que o run token é
	 * cunhado, porque é a única camada que enxerga o envelope E monta o request (§4.2/§4.4).
	 * NÃO sobrescrever numa subclasse.
	 */
	async *run(input: this['input']): AsyncIterable<AgentRuntimeEvent> {
		const mcp = this.tools.length === 0
			? undefined
			: this.buildMcpInvocation(input)                       // chama runTokenService.mint(...) aqui dentro
		const request = { ...this.buildRequest(input), mcp, agentName: (this.constructor as typeof Agent).NAME }
		yield* this.runner.run(request)                            // o runner REVOGA o token no término (§4.4)
	}

	/** O ÚNICO ponto de variação por agent: traduz input → request, SEM `mcp` e SEM identidade. */
	protected abstract buildRequest(
		input: this['input'],
	): Omit<AgentRunRequest<OutputSchema>, 'mcp' | 'agentName'>

	/** Helper SOBRE run(): draina, valida o terminal, devolve o output tipado. Não é um segundo transporte. */
	protected async collect(input: this['input']): Promise<this['output']> { /* drena run(), lê result.output */ }
}
```

**A contradição que este bloco fecha, registrada para não voltar:** um desenho anterior declarava
`abstract run(...)` na base **e** dizia (§4.2, §4.4) que a base cunha o token *dentro de `run()`* —
impossível ao mesmo tempo, já que uma base sem corpo não tem onde cunhar, e a AC-6.12 exige
`.mint(` **só** em `agent/types/Agent.ts`. **Resolução, única e válida para todas as menções:
`run()` é CONCRETO na base** (template method); o ponto de variação por agent é
`protected abstract buildRequest(input)`, que devolve o request **sem** `mcp` e **sem** identidade.
Consequências que já estão escritas em outros lugares e continuam valendo sem ajuste: a base é a
única a chamar `mint` (AC-6.12), o runner é o único a chamar `revoke` (AC-6.12), o
`AgentRunRequest` segue sem `ownerId`/`issueId`/`threadId` (AC-1.11), e `IssueWorkAgent` não expõe
método público além de `run()` (AC-5.8) — porque agora ele nem **implementa** `run()`, só
`buildRequest()`.

**Os dois blocos acima são ILUSTRATIVOS** — eles fixam a *forma* (quem é concreto, quem é abstrato,
quem declara `NAME`, quem chama `mint`), não a assinatura literal. O que vence, e o que o executor
tem de satisfazer, são as ACs: **AC-5.8** (agent com `outputSchema` expõe exatamente um método
público cujo corpo é `return this.collect(input)`; `IssueWorkAgent` não expõe nada além de `run()`),
**AC-6.12** (`.mint(` só em `agent/types/Agent.ts`, `.revoke(` só no runner) e a AC-5.8 do template
method (`run()` não sobrescrito, `buildRequest` implementado 2×). Divergência de detalhe no snippet
que faça o `tsc` passar é aceitável e não precisa de aprovação; divergência que mova `mint`, torne
`run()` sobrescrevível ou crie um segundo método público **é** violação de AC.

Os campos `input!`/`output!` são **phantom** (definite-assignment, nunca atribuídos) — puros
carregadores de tipo, copiados do medscall (`.../agent/types/Agent.ts:90-104`), que também explica
por que é **classe abstrata e não interface**: `instanceof` sobrevive e o tsyringe ganha um token de
classe estável. `collect()` existe em **um** lugar, é `protected`, e não aparece no seam.

**Agent com `outputSchema` expõe UM método público de conveniência — e isso NÃO é um segundo
transporte.** `collect()` sendo `protected` fecharia o caminho para o consumidor legítimo: a §5.2
mantém `thread/usecases/ClassifyMessage` **injetando** o `ClassifyIssueAgent` e consumindo a decisão
**dentro da própria transação** — logo tem de existir um jeito tipado de pedir o output. Decisão
fechada:

```ts
// agent/agents/ClassifyIssueAgent/ClassifyIssueAgent.ts
@injectable()
export class ClassifyIssueAgent extends Agent<typeof ClassifyIssueInputSchema, typeof LlmDecisionSchema> {
	static readonly NAME = AgentName.CLASSIFY_ISSUE   // a base só DECLARA; cada agent ATRIBUI (§4.5)

	/** Entry point público e tipado. Delega a collect(), que delega a run(). Zero transporte novo. */
	async classify(input: this['input']): Promise<this['output']> {
		return this.collect(input)
	}
}
```

**A regra, escrita para não virar precedente frouxo:** um agent com `outputSchema` pode expor
**exatamente um** método público nomeado pelo **propósito de negócio** (`classify`, não `execute`,
não `generate`), cujo corpo é **`return this.collect(input)`** e nada mais. Agent **sem**
`outputSchema` (`IssueWorkAgent`) **não** expõe método algum além de `run()` — o consumidor dele é
um handler que draina o stream. Um método com corpo além do `return this.collect(...)` significa que
lógica de política vazou para dentro do agent (ela vive no `IssueRouter`, §4.8). AC-5.8 grepa isso.

### 4.6 `AgentInputEnvelope` + `AgentInputSchemaConstraint` — o buraco de tipo, fechado

O desenho anterior escrevia `readonly input!: z.output<InputSchema> & AgentInputEnvelope` e
`AgentInputSchemaConstraint` **sem definir nenhum dos dois**. Isso não é cosmético: o medscall
documenta exatamente o que quebra — *"TypeScript's generic narrowing of `z.output<InputSchema>` alone
collapses to `Record<string, unknown>` under constraint erasure, losing the envelope fields"*
(`medscall .../services/LlmRunner/LlmRunner.ts:54-59`; mesma explicação em
`types/AgentInputSchemaConstraint.ts:19-31`). Sem o constraint, o runner **não lê `ownerId`/`issueId`/
`cwd` do input sem cast** — e a AC-3.4 deste goal proíbe qualquer `as any`/`@ts-expect-error` novo.
Adotamos **a técnica** do medscall, **não** os campos do envelope deles:

```ts
// agent/types/AgentInput.ts
import { z } from '@codedm/core-typescript'
import type { ZodObject, ZodRawShape } from 'zod'

/** O envelope que TODO input de agent do CodeDM carrega — a identidade do run. */
export const BaseAgentInputSchema = z.object({
	ownerId: z.uuid(),                                 // uuid, alinhado ao resto do repo — ver nota
	issueId: z.uuid().optional(),                      // OPCIONAL — corrigido na Fase 5, ver nota abaixo
	threadId: z.uuid(),
	cwd: z.string(),                                   // workspace ABSOLUTO — nunca opcional
	context: z.record(z.string(), z.unknown()).optional(),
})

export const AgentInputSchema = BaseAgentInputSchema
export type AgentInputEnvelope = z.output<typeof AgentInputSchema>

/**
 * O constraint que preserva os campos do envelope sob erasure: qualquer input schema de agent é um
 * ZodObject cujo shape ESTENDE o do envelope. É isto que faz `z.output<InputSchema>` continuar
 * narrow o suficiente para o runner ler `input.cwd` sem cast.
 */
export type AgentInputSchemaConstraint = ZodObject<(typeof BaseAgentInputSchema)['shape'] & ZodRawShape>
```

**Escape hatch — o CONTRATO é o type-test da AC-1.4, não a forma literal do generic.** Esta
formulação **não foi verificada** contra o zod instalado (**4.4.3**), onde `ZodObject<Shape, Config>`
tem **dois** parâmetros e onde a assinabilidade de um `.extend()` concreto a um alvo com index
signature é justamente a parte frágil da técnica. Portanto: **se este literal não type-checar,
ajustar aridade/parâmetros até a AC-1.4 passar sem cast** — segundo parâmetro explícito, um
`interface … extends ZodObject<…>`, ou um constraint estrutural sobre `z.output<S>` — e **registrar a
forma final no BUILD-LOG**. O que a AC-1.4 exige é `input.cwd` / `input.ownerId` / `input.issueId`
legíveis **sem cast** com `bun tsc` verde, não uma linha de código específica. **Não é decisão de
founder e não vai para `OVERNIGHT-BLOCKED.md`.**

E o verbo de schema, espelhando `z.agentInput(props)` do medscall
(`shared/utils/schema/ExtraTypes.ts:219-224`), para que o constraint valha **por construção** e não
por disciplina — o mesmo lugar onde já vivem `z.domainEvent` / `z.integrationEvent`
(`packages/api/typescript/core/src/utils/schema/ExtraTypes.ts:171-210`):

```ts
// core/src/utils/schema/ExtraTypes.ts
export function agentInput<T extends ZodRawShape>(properties: T) {
	return BaseAgentInputSchema.extend(properties)      // devolve o tipo que satisfaz o constraint
}
```

**Notas de contrato**, para não repetir o erro que este parágrafo corrige:

- `cwd` **nunca** é opcional. Um agent sem workspace absoluto não tem o que executar, e um `cwd?`
  vira `process.cwd()` implícito — o pior default possível num produto que roda em repositórios
  reais do usuário.
- **`ownerId` é `z.uuid()`, não `z.string()`** — alinhado ao repo inteiro, onde `ownerId` já é
  `z.uuid()` em entidade, use case e `ctx` de controller (`issue/entities/Issue.ts:7`,
  `artifact/usecases/RecordArtifact.ts:13`, `issue/schemas/IssueParam.ts:4`, e ~20 outros). A única
  exceção viva é `auth/schemas/SessionSchema.ts:28` (`z.string().nullable()`, porque a sessão
  pré-onboarding ainda não tem owner) — e ela **não** é o caso do agent: um agent só roda com owner
  resolvido. Congelar `z.string()` aqui criaria uma segunda verdade sobre o mesmo id.
- **`issueId` é OPCIONAL** — corrigido na execução da Fase 5 (27-jul), e o motivo é ESTRUTURAL, não
  temporário. O universo de agents do CodeDM tem exatamente dois membros e um deles roda **antes de a
  issue existir**: `ClassifyIssueAgent` decide se uma mensagem CONTINUA uma issue aberta, ABRE uma
  nova, ou é ambígua demais — o `issueId` é a SAÍDA dele, nunca a entrada. A Fase 1 congelou o campo
  como obrigatório olhando só o lado do `IssueWorkAgent`; nada no repo consegue fornecer um id no
  momento da classificação (`ClassifyMessage` tem `ownerId`, `threadId`, `entryId` e o workspace —
  não tem issue). As duas alternativas eram piores e estão registradas para não voltarem: forjar um
  uuid que não identifica nada (a "identidade vinda do nada" que a §4.4 existe para impedir), ou
  cunhar um descartável por run. **Sobrescrever a chave por agent via `.extend()` também não é
  opção**: `AgentInputSchemaConstraint` fixa o shape do envelope, e `ZodUUID` e
  `ZodOptional<ZodUUID>` não são atribuíveis **em nenhuma das duas direções** — o override quebra o
  constraint venha de onde vier. A garantia de identidade permanece intacta onde ela pesa: só um
  agent com escopo de tool **não vazio** cunha run token, e esse é o `IssueWorkAgent`, que sempre roda
  contra uma issue resolvida. **Obrigação da Fase 6:** estreitar `issueId` no ÚNICO ponto de cunhagem
  (`agent/types/Agent.ts`), que é a única camada que enxerga envelope e request. A AC-1.4 continua
  satisfeita — ela exige `input.issueId` LEGÍVEL sem cast, e ele é (`string | undefined`); o
  type-test foi ajustado no mesmo commit.
- `ownerId`/`issueId`/`threadId` no envelope são os **mesmos** que o run token carrega (§4.4). **A
  base `Agent` os copia do input para as claims do token** (ela é a única que enxerga os dois lados,
  §4.2); o handler de tool os lê do token. Uma origem, dois usos, e o `AgentRunRequest` continua sem
  nenhum deles.
- `context` é o slot aberto — e é onde **config multi-tenant aterrissa quando existir** (D10),
  nunca no `AgentRunRequest`.

### 4.7 `ProviderDef` — ⚠️ SUPERSEDED PELA FASE 4.5, mantido só como histórico

> **NÃO IMPLEMENTAR O QUE ESTÁ ABAIXO.** `ProviderDef`, `PROVIDER_DEFS` e `defs/*` foram **deletados**
> na Fase 4.5 e a seção fica apenas para explicar de onde o desenho veio. O que vale hoje: a unidade de
> variação é **o CLI**, e cada um é uma classe concreta (`ClaudeAgentRunner`) que carrega o que era o
> def — `binary` (bin/versionArgs/helpArgs/capabilityFlags), `buildArgs`, aliases de modelo, render do
> `--mcp-config` — como membros **estáticos** seus. Ver a seção "### Fase 4.5" para o raciocínio
> completo, incluindo a contradição que matou este desenho (`streamFormat: 'plain'` num literal exige
> do runner exatamente o branch que a própria regra proibia).
>
> O que **sobreviveu** do que está abaixo: `ProviderCapabilities` (a metade *probada* em runtime, hoje
> em `types/ProviderCapabilities.ts` e ainda produzida pelo `ProviderDetector`) e `ProviderKind` (o wire
> enum, que é vocabulário de domínio). O campo `provider` do `AgentRunRequest` **não** sobreviveu (§4.2).

```ts
// agent/providers/ProviderDef.ts
export interface ProviderDef {
	id: ProviderKind
	bin: string
	fallbackBins?: string[]
	versionArgs: string[]
	helpArgs?: string[]
	capabilityFlags?: Record<string, string>     // '--include-partial-messages' -> 'partialMessages'
	buildArgs(opts: {
		model?: AgentModelId
		cwd: string
		extraDirs?: string[]
		resumeSessionId?: string
		newSessionId?: string
		mcp?: AgentMcpInvocation                  // §4.4 — dado, nunca branch
		caps: ProviderCapabilities                // passado por PARÂMETRO — ver nota abaixo
	}): string[]
	promptViaStdin: boolean
	promptInputFormat: 'text' | 'stream-json'
	streamFormat: 'claude-stream-json' | 'json-event-stream' | 'plain'
	eventParser?: string
	resumesSessionViaCli?: boolean
	capturesSessionIdFromStream?: boolean
	authProbe?: { args: string[]; timeoutMs?: number }

	// --- capacidade de TOOL como DADO (D8). Provider sem MCP simplesmente não declara. ---
	mcpConfigFlag?: string                        // ex.: '--mcp-config'
	mcpConfigFormat?: 'json-inline' | 'json-file'
	allowedToolsFlag?: string                     // ex.: '--allowedTools'
	disallowedToolsFlag?: string
}

// agent/providers/registry.ts
export const PROVIDER_DEFS: Record<ProviderKind, ProviderDef> = { … }   // exaustivo por tipo
```

Quatro escolhas explícitas:

- **`Record<ProviderKind, ProviderDef>`, não array + dedupe em runtime.** `ProviderKind` já é wire
  enum (`provider-kind.tsp`: `CLAUDE_CODE`, `CODEX`, `OPENCODE`); a exaustividade vira erro de
  `tsc`, que é estritamente melhor que a checagem de duplicidade em boot do open-design.
- **`caps` entra por parâmetro, não por `Map` global mutável.** No open-design o `buildArgs` lê um
  mapa de módulo populado pela detecção — impuro na prática. Aqui o `ProviderDetector` devolve
  `{ status, binaryPath, version, caps }` e o caller passa `caps` adiante. **Divergência consciente
  do open-design**, alinhada ao "contrato antes de implementação" do `CLAUDE.md`.
- **Capacidade ausente degrada o REQUEST, nunca a interface.** Provider sem stream-json →
  `promptInputFormat: 'text'` + `streamFormat: 'plain'`, o runner escreve-e-fecha o stdin e emite
  frames `assistant_text` por linha. Provider sem resume → `resumesSessionViaCli` ausente, e o
  **prompt** passa a carregar o transcript renderizado. Nenhum `if (provider === …)` no runner.
  Se `codex`/`opencode` não tiverem modo JSONL equivalente (não verificado — ver risco na Fase 1),
  a adaptação é **um `eventParser` novo**, nunca um segundo método no seam.
- **Tool é a MESMA história.** Provider sem `mcpConfigFlag` → o runner não passa nada; agent que
  **exige** tools falha nomeado (`AGENT_TOOLS_UNSUPPORTED`). Não existe `if (provider === 'CLAUDE_CODE')`
  para decidir se dá para declarar tools.

### 4.8 Agents internos: definição, registro e escopo

Um diretório por agent, exatamente como o medscall (`.../agent/README.md:740-748`):

```
agent/agents/ClassifyIssueAgent/{ClassifyIssueAgent.ts, prompt.ts, types.ts, index.ts}
agent/agents/IssueWorkAgent/{IssueWorkAgent.ts, prompt.ts, types.ts, index.ts}
```

- **`ClassifyIssueAgent`** — absorve o miolo LLM do `IssueClassifier` atual: `LlmDecisionSchema`
  (`IssueClassifier.ts:47-53`) vira o `outputSchema`; `SYSTEM_PROMPT` (`:130-134`) e
  `buildClassificationPrompt` (`:136-142`) viram um `@injectable() ClassifyIssuePromptBuilder` em
  `prompt.ts`. **`tools = []`** — classificar é decidir, não agir. **Fica de fora do agent**: o
  atalho determinístico de reply-quote (`:78-80`), o gate de confiança contra
  `DEFAULT_THRESHOLD = 0.6` (`:72,89`), a cunhagem de slug (`:98`) e o fallback de clarify
  (`:108-114`) — isso é **política de roteamento**, não runtime de agent, e permanece num serviço
  fino `IssueRouter` no contexto `agent`.
- **`IssueWorkAgent`** — sem `outputSchema`, **com as quatro tools**, prompt de sistema resolvido por
  um prompt builder stateful (caminho do repo, título da issue, histórico do thread), como o
  `ServicePromptBuilder` do medscall. O prompt **instrui explicitamente** a chamar
  `codedm__complete_issue` ao terminar e `codedm__raise_stop` quando travar — a declaração só existe
  se for pedida.

Ambos injetam **o mesmo** `AgentRunner`. **Isso é a decisão (D3) satisfeita estruturalmente:**
interface idêntica, transporte idêntico, request diferente.

> **ATRIBUIÇÃO DE FASE, fechada na execução da Fase 5 (27-jul) — as quatro tools do `IssueWorkAgent`
> e a metade MCP do `run()` são da FASE 6, não da 5.** A Fase 5 entrega a base `Agent` com `run()`
> template method concreto, `buildRequest` como único ponto de variação, e `tools` declarado. O que
> ela **não** entrega, porque não teria com o que falar: `buildMcpInvocation`, a dependência de
> construtor `RunTokenService` e a chamada `mint`. Motivo verificável, não preferência:
> `RunTokenService` é **contrato sem implementação** por decisão da própria Fase 1 e **não tem binding
> em `agent/registry.ts`** — injetá-lo na base faria a resolução DI do `IssueWorkAgent` estourar no
> boot; e montar um `AgentMcpInvocation` agora entregaria ao CLI um `--mcp-config` apontando para uma
> rota que ainda não existe. Pelo mesmo motivo o prompt do `IssueWorkAgent` **não** instrui
> `codedm__complete_issue`/`codedm__raise_stop` nesta fase: mandar o modelo chamar uma tool fora do
> `--allowedTools` produz um turno que NARRA uma chamada que não pode fazer. Escopo, instrução, router
> e implementação do token entram **juntos** na Fase 6. O invariante da §4.3 regra 7 vale nos dois
> estados: `request.mcp` presente ⟺ `agent.tools.length > 0` — com escopo vazio, `mcp` simplesmente
> não existe. A AC-6.12 (`.mint(` só em `agent/types/Agent.ts`) é AC **da Fase 6** e é lá que passa a
> ter alvo.

**Registro** em `agent/registry.ts` via `expandBindings`, token de classe, mesma instância nos três
envs — sem mapa nome→agent, sem factory (`medscall .../agent/registry.ts:19-60`):

```ts
{ token: AgentRunner,        mock: StubAgentRunner, integration: StubAgentRunner, real: realRunner },
{ token: ClassifyIssueAgent, mock: ClassifyIssueAgent, integration: ClassifyIssueAgent, real: ClassifyIssueAgent },
{ token: IssueWorkAgent,     mock: IssueWorkAgent,     integration: IssueWorkAgent,     real: IssueWorkAgent },
```

`AgentName` (enum privado do contexto) existe para **identidade** — `static readonly NAME` na
classe, `agentName` no request, label em log/telemetria — nunca para resolução. O seam E2E hermético
atual é preservado tal e qual (`terminal/registry.ts:18-20`: sob `CODEDM_E2E` o `real` cai para um
stub determinístico) — **nenhum teste jamais spawna um CLI de verdade**. O stub E2E **também** sabe
chamar o endpoint MCP local, para que o caminho declarativo seja exercitado sem `claude` no ar
(§7, AC-6.2).

**Não** portamos o `AgentConfig` do medscall agora (D10): aqui seria contexto especulativo, proibido
por `CLAUDE.md`. O que está fechado é **onde** ele aterrissa quando aparecer: `context` do envelope.

### 4.9 Streaming/SSE

`AgentStreamRegistry` **fica como está** e é portado sem reescrita: canal observador SSE (um writer
por issue, cap por owner, drop silencioso sem observador, force-unregister quando o writer falha,
`AgentStreamRegistry.ts:137-145`) **mais** a guarda de single-active-run absorvida
(`beginSession`/`endSession`, `:151-162`). É transporte puro, zero significado de domínio.

Muda **uma** coisa, e ela é um ganho: `TerminalActionFrameSchema` hoje é chaveado em
`z.enum(TuiActionType)` — saída de regex sobre a TUI (`AgentStreamRegistry.ts:26-32`). Passa a
carregar o **`tool` real do frame `tool_use` + um resumo do `input`**. `tool` é `z.string()`, **não**
enum: o conjunto é aberto (MCP acrescenta ferramentas em runtime — inclusive as nossas), e a regra
"conjunto fechado → enum" do `CLAUDE.md` não se aplica a conjunto aberto. Isso é o "net gain" do
spec (`:49-51`): o painel passa a poder dizer *"Claude está editando `foo.ts`"*. **É mudança de
contrato** → `bun sdk` + `react tsc` + `e2e tsc` no mesmo gate.

Só handlers/use cases do contexto `agent` invocam agents. O controller SSE
(`StreamTerminalSession`) **não** chama agent: ele registra um writer e pronto. O router MCP (§4.4)
**também não** chama agent — ele atende uma tool call e dispara um use case.

### 4.10 Sessão / resume

A entidade durável já existe e já é do shape certo — só está mal nomeada. `TerminalLLMSession`
(`entities/TerminalLLMSession.ts:5-17`) carrega `{ownerId, issueId, threadId, provider, cwd,
claudeSessionId, lastTurnAt}` sobre `terminal_terminal_llm_sessions`
(`packages/contracts/db/schema-sqlite/terminal.ts:10-33`, único por issue).

Vira `AgentSession`, com `claudeSessionId → agentSessionId` (o nome atual amarra o modelo a um
vendor) e **duas colunas novas**: `model` e `lastMessageId`. Elas dão casa às quatro guardas de
invalidação de resume do spec (`:34-36`) — `model_changed`, `cwd_changed`, `missing_cursor`,
`conversation_advanced` — que viram **um método de invariante na entidade**:

```ts
// CORRIGIDO na Fase 4 — a assinatura de dois campos não decide `conversation_advanced`. Ver AC-4.9.
resumeDecision(ctx: { model: AgentModelId; cwd: string; cursor?: string }): { resume: true; id: string } | { resume: false; reason: ResumeInvalidationReason }
```

Sem novo value object: a guarda não é reusada em lugar nenhum, e `CLAUDE.md` manda default no mais
enxuto. `listRecentForPrewarm` some junto com o prewarm (D7).

### 4.11 Cancelamento

`detached: true` no spawn + `process.kill(-pgid, 'SIGTERM')`, escalando para `SIGKILL` após uma
janela de graça. **Process group é obrigatório**: os subprocessos MCP/tool do claude sobrevivem ao
filho direto (`spec :67-68`) — e com D8 isso passa a ser literal, já que o claude pode ter um cliente
MCP nosso vivo. Substitui `closePtyGracefully` e o `shutdown()` duck-typed do runner que hoje o passo
de shutdown do daemon resolve por `import()` dinâmico + `any`
(`packages/api/typescript/src/index.ts`, step `'terminal sessions'`) — passa a ser um método
declarado no `AgentRunner`, sem duck-typing e sem `as any`. O run token é **invalidado** no
cancelamento: uma tool call atrasada de um run morto recebe 401, nunca escreve.

---

## 5. Onde isso vive

### 5.1 O contexto

**O contexto `terminal` é RENOMEADO para `agent`** — `git mv`, história preservada. Não se cria um
segundo contexto: dois contextos disputando "runtime de agent" é exatamente a ambiguidade que este
goal existe para remover, e a `CONTEXTS` é a declaração única de identidade
(`shared/contexts.ts`).

- `CONTEXTS.terminal: { pgSchema: 'terminal' }` → `CONTEXTS.agent: { pgSchema: 'agent' }`.
- `terminal/index.ts:9` hoje passa o **literal** `name: 'terminal'` a `BoundedContext.create` — o
  próprio doc da `contexts.ts` proíbe literais (*"Every consumer imports the value from here
  (`CONTEXTS.ui`, never the literal `'ui'`)"*). Corrigir na renomeação: `name: CONTEXTS.agent`.
- Tabela: `terminal_terminal_llm_sessions` → `agent_agent_sessions`, em `db/schema-sqlite/` +
  migration. (Depois da Fase 0 **existe um diretório de schema só** — o pg morreu junto com o
  PGlite.) Barato porque a decisão (d) — fresh start — segue valendo.
  **Atribuição de fase, fechada para não sobrar bifurcação: o rename de tabela/prefixo acontece na
  FASE 4**, na **mesma e única** migration que renomeia `claudeSessionId → agentSessionId` e
  acrescenta `model` + `lastMessageId` (é o que a AC-4.5 já exige ao pedir `claudeSessionId` → 0
  hits). A **Fase 5 não emite migration nenhuma** — ela é `git mv` de código, `CONTEXTS`,
  `context-map` e DI. Duas migrations para o mesmo rename seria desperdício sob fresh start; uma
  Fase 4 que renomeia a coluna mas não a tabela deixaria `terminal_*` vivo dentro do contexto
  `agent`. Checado por **AC-4.7**.
- `ANNOTATED_CYCLES` em `shared/context-map.ts:128` (a entrada `['terminal','thread']` ocupa `:129-132`)
  é reescrito de `['terminal','thread']` para
  `['agent','thread']`, com o *why* atualizado.
- **Códigos de erro NÃO mudam.** `TERMINAL_ALREADY_RUNNING`, `SESSION_ALREADY_STREAMING`,
  `TOO_MANY_TERMINAL_STREAMS`, `PROVIDER_NOT_DETECTED`, `TERMINAL_SPAWN_FAILED`,
  `CLASSIFICATION_FAILED` (`terminal/errors/index.ts:7-18`) são vocabulário público (status HTTP +
  chave i18n + consumo no react). Renomear custa ripple e não compra nada. Entram **três** códigos
  novos: `AGENT_RESUME_INVALIDATED` (informativo, não-fatal), `AGENT_TOOLS_UNSUPPORTED` (§4.7) e
  `AGENT_RUN_TOKEN_INVALID` (§4.4) — códigos novos são permitidos; **renomear os antigos não é**.

  **O ripple de um código novo é OBRIGATÓRIO e tem 4 paradas — enumeradas aqui porque duas delas
  são gates duros que falham em arquivos que o executor não estaria olhando.** Verificado nos rails:

  | # | Arquivo | O que entra | Quem cobra |
  |---|---|---|---|
  | 1 | `src/<ctx>/errors/index.ts` — a **união** | o literal na `*Errors` da camada certa | `tests/architecture/error-coherence.test.ts` exige **conjunto igual** união ↔ registro, **no mesmo arquivo**. Um código só na união = **500 cego**. |
  | 2 | `src/<ctx>/errors/index.ts` — o **`registerErrorCodes({...})`** | `CODE: HttpStatusCode.X` na **mesma** chamada inline | o mesmo teste. Um código só no registro = **entrada morta**. |
  | 3 | `packages/app/react/src/locales/en.json` **e** `pt.json`, sob `errors.<CODE>` | a tradução nas **duas** | `packages/app/react/src/locales/error-codes.check.ts` faz `pt.errors satisfies Record<ErrorCode, string>` e idem `en` → **`react tsc` VERMELHO** sem a chave. |
  | 4 | (gerado, não editado) `packages/client/dist/typescript/src/error-codes/index.ts` | regenerar | `registerErrorCodes` → `bun emit-openapi` (root `x-error-codes`) → `bun sdk` → `packages/client/generators/error-codes.ts`. **Sem rodar `bun sdk`, o passo 3 nem compila** — `ErrorCode` ainda não conhece o código. |

  Ordem que funciona: **1+2 → `bun emit-openapi` → `bun sdk` → 3 → `react tsc`**. Nenhum passo é
  opcional e nenhum é decisão de founder.

  **Alocação fechada dos três — camada, status e FASE, para não sobrar bifurcação:**

  | Código | União | Status | Fase | Nota |
  |---|---|---|---|---|
  | `AGENT_RESUME_INVALIDATED` | `<Ctx>ApplicationErrors` | `HttpStatusCode.CONFLICT` | **4** (§4.10, AC-4.4) | Informativo/não-fatal: registrado mesmo assim, porque o rail exige o par união↔registro; se o resume acabar sendo só log estruturado, **não criar o código** — e então remover esta linha do goal, nunca deixar meia entrada. |
  | `AGENT_TOOLS_UNSUPPORTED` | `<Ctx>ApplicationErrors` | `HttpStatusCode.UNPROCESSABLE_ENTITY` (mesmo naipe de `PROVIDER_NOT_DETECTED`) | **6** | §4.7. **Não é Fase 1** — ver a nota logo abaixo da tabela. |
  | `AGENT_RUN_TOKEN_INVALID` | `<Ctx>InterfaceErrors` | `HttpStatusCode.UNAUTHORIZED` | **6** (§4.4, AC-6.6) | **Atenção:** `TerminalInterfaceErrors` é `never` hoje — este código faz a união deixar de ser `never`, e `InterfaceErrors` passa a ser `BaseInterfaceErrors \| <Ctx>InterfaceErrors` com um membro real. |

  **Por que `AGENT_TOOLS_UNSUPPORTED` NÃO é da Fase 1 (colisão de ACs, fechada aqui):** um desenho
  anterior o alocava à Fase 1 "como contrato". Isso torna **AC-1.10 e o ripple de 4 paradas
  mutuamente exclusivos**: o ripple obriga a editar `src/terminal/errors/index.ts` (paradas 1+2),
  `packages/app/react/src/locales/{en,pt}.json` (parada 3) e a regenerar
  `packages/client/dist/typescript/src/error-codes/index.ts` (parada 4) — e **nenhum** desses quatro
  está na allowlist de arquivos existentes da AC-1.10, cuja cláusula final é *"qualquer arquivo
  existente fora desta lista aparecendo no diff é violação da AC"*. Fazer metade do ripple é pior
  ainda: união sem registro (ou vice-versa) deixa `error-coherence.test.ts` vermelho, e chave i18n
  faltando deixa o `react tsc` vermelho. Como o código só é **levantado** a partir da Fase 6, ele
  **inteiro** (união + registro + i18n + regen) acontece na **Fase 6**, junto dos outros dois, num
  único ripple e com uma única AC de fechamento. Até lá, §4.7/§4.8 descrevem o comportamento
  ("falha nomeado"), sem que o literal exista no código.

  Onde o arquivo mora depende da fase: até a Fase 4 é `src/terminal/errors/index.ts`; a partir da
  Fase 5 é `src/agent/errors/index.ts` (mesmo arquivo, `git mv`). Como os **três** códigos caem nas
  Fases 4 e 6, na prática só o `AGENT_RESUME_INVALIDATED` toca o caminho `terminal/` (Fase 4) e os
  outros dois nascem já em `agent/errors/index.ts`. **AC de fechamento: AC-6.13.**

### 5.2 Divergência consciente do medscall: quem invoca o agent

O medscall proíbe: agent é invocado **só** por handler ou job, nunca por use case, nunca por
controller. **Não adotamos essa regra para o classificador.** Justificativa: no medscall o agent
produz a **resposta visível ao usuário** — um efeito colateral, logo handler. Aqui o classificador
produz uma **decisão que o chamador precisa usar dentro da própria transação**:
`thread/usecases/ClassifyMessage.ts` persiste transcript + clarification junto com o resultado.
Tornar isso event-driven quebraria uma decisão de roteamento em duas transações e exigiria uma saga
sem ganho algum. Então: `ClassifyMessage` continua injetando — só que agora
`@agent/agents/ClassifyIssueAgent` em vez de `@terminal/services/IssueClassifier`
(`ClassifyMessage.ts:5`), e a Partnership anotada continua sendo Partnership anotada.
O `IssueWorkAgent`, esse sim, é dirigido **só por handler** (`RunIssueTurnOnClassification` →
`RunIssueTurn`, que injeta o agent).

> **CORREÇÃO DE CONTRATO (execução da Fase 5, 27-jul) — QUEM é injetado.** O parágrafo acima nomeia
> `@agent/agents/ClassifyIssueAgent` como o token que `ClassifyMessage` injeta, e isso **não pode
> valer** depois que a §4.8/§5.3 tiram do classificador as quatro decisões de POLÍTICA (atalho de
> reply-quote, piso de confiança, cunhagem de slug, fallback de clarify) e as põem no `IssueRouter`.
> Se o use case injetasse o agent, ele teria de executar essas quatro — isto é, política de roteamento
> do contexto `agent` rodando dentro do contexto `thread`, exatamente o vazamento que o split existe
> para impedir. **Fica assim: `ClassifyMessage` injeta `@agent/services/IssueRouter`, e o router injeta
> `ClassifyIssueAgent`.** Tudo que a §5.2 realmente sustenta continua de pé — a divergência do medscall
> (um use case invoca, porque a decisão é consumida DENTRO da própria transação), a Partnership
> anotada, e as partes grepáveis da AC-5.8: o método do router chama-se `classify(...)`, então
> `ClassifyMessage chama classify(...)` continua literalmente verdadeiro, e
> `git grep "for await" -- src/thread` continua **0 hits**.

O **router MCP** é a terceira porta, e ela é HTTP: uma tool call é um request como outro qualquer —
controller fino → use case do contexto `agent` → evento de domínio → outbox. Ele **não** chama agent
e **não** fala com o runner.

### 5.3 Destino arquivo a arquivo (contexto `terminal`, 7504 LOC)

| Arquivo / pasta | Destino |
|---|---|
| `services/TerminalLLMRunner/ClaudeCliTerminalLLMRunner/**` (4028 LOC: `spawner.ts` 315, `transcript.ts` 236, `ClaudeBootSequence.ts` 189, `tui/` 197, `ansi.ts` 70, `SessionMap.ts`, `SessionStore.ts`, `queue.ts`, `BinaryProbe.ts`, `logger/`, `testFakePty.ts` + 6 suites de PTY) | **MORRE** (D2/D6/D7) |
| `services/TerminalLLMRunner/TerminalLLMRunner.ts` (5 membros) | **VIRA** `services/AgentRunner/AgentRunner.ts` (1 membro + `shutdown`) |
| `services/TerminalLLMRunner/types.ts` (`TerminalRuntimeEvent`, `AgentGenerateRequest`) | **VIRA** `AgentRuntimeEvent` + `AgentFrame` + `AgentRunRequest`; `AgentGenerateRequest` **morre** |
| `services/TerminalLLMRunner/oneshot.ts` (175 LOC: `buildCommand(mode)`, `defaultBinary`, `extractJson`, `mergeLineStreams`) | **MORRE**; argv vai para `providers/defs/*`, o resto é substituído pelo codec |
| `services/SessionPrewarm/**` + o `setup:` de `terminal/index.ts:17-25` | **MORRE** (D7) |
| `services/IssueClassifier/IssueClassifier.ts` | **SPLIT**: prompt+schema → `agents/ClassifyIssueAgent/`; threshold/slug/clarify → `services/IssueRouter/`; `slug.ts` acompanha o router |
| `services/IssueClassifier` `OpenIssueRef` (`:11-16`, importado por 3 arquivos de `thread/`) | **MOVE para `thread/`** — é conceito de thread; a dependência inverte no sentido certo |
| `services/ProviderDetector/**` | **FICA**, estendido para devolver `caps` (probe de `helpArgs` × `capabilityFlags`, incluindo a capacidade de MCP). Corrigir o comentário obsoleto de `SystemProviderDetector.ts:82-83` que afirma que o daemon roda sob Node por causa do node-pty — falso desde o Fork D2 (é o mesmo hit que a AC-3.2 aponta em `:82`). **O `import { spawnSync } from 'node:child_process'` (`:2`) FICA e é legítimo** — o detector spawna por design, e por isso ele é o segundo prefixo do `ALLOWED_SPAWN_PREFIXES` do rail (AC-3.2(b)/AC-5.9); não movê-lo para baixo de `services/AgentRunner/` |
| `services/AgentStreamRegistry/**` | **FICA**; só o `TerminalActionFrameSchema` muda (§4.9) |
| `services/TerminalOutputAccumulator/**` | **ENCOLHE**: hoje tem dois caminhos de conclusão (`turn_completed` → `replyParts.join` vs `exit === 0` → `stdout.join`) — o segundo existia só para servir o one-shot e **some** |
| `usecases/RunTerminalSession.ts` (249 LOC) | **VIRA** `usecases/RunIssueTurn.ts`; `persistLifecycle` encolhe (sem `resumed`/`killedReason` de PTY); a disciplina de duas transações com o stream **estritamente fora de tx** (`:82-121`) é preservada |
| `entities/TerminalLLMSession.ts` + repositório + schemas | **VIRA** `AgentSession` (§4.10) |
| `enums/{TuiActionType,TuiMarker,TurnEndSignal,TerminalSessionKillReason}.ts` | **MORREM** |
| `enums/{ClassificationVerdict,TerminalRunOutcome}.ts` | **FICAM** (`TerminalRunOutcome` → `AgentRunOutcome`) |
| `events/TerminalSessionIdleEvictedEvent.ts` (exportado, nunca construído) | **MORRE** |
| `events/TerminalSessionResumedEvent`, `TerminalSessionKilledEvent` | **MORREM** ou encolhem com D7 — decidir na Fase 4 com base no que o resume nativo ainda torna observável |
| `events/{Started,ReplyDrafted,Completed,StopRaised}` + `handlers/PublishTerminalIntegrationEvents` + `handlers/RunTerminalSessionOnClassification` | **FICAM** (os integration events são congelados). O que muda é **quem os origina**: tool call em vez de inferência (§4.4). As classes de evento são **REUSADAS** pelos use cases de declaração — não nascem eventos de domínio paralelos, e o bridge não ganha branch (§4.3, regra 7). **Única edição de payload: `Completed` e `StopRaised` ganham `source: z.enum(FactSource)` no schema** (§4.3, regra 6) — evento de domínio context-private, o bridge **não** repassa o campo, contrato congelado intocado |
| `controllers/{DetectProviders,StreamTerminalSession}.ts` | **FICAM** |
| **NASCEM** | `providers/{ProviderDef.ts, registry.ts, defs/{claude,codex,opencode}.ts}`, `services/StreamJsonCodec/`, `services/AgentRunner/{StreamJsonAgentRunner,StubAgentRunner,E2eStubAgentRunner}/`, `types/{Agent.ts, AgentInput.ts, AgentMcpInvocation.ts}`, `enums/TransportStopKind.ts`, `agents/ClassifyIssueAgent/`, `agents/IssueWorkAgent/`, `enums/{AgentName.ts, AgentToolName.ts, FactSource.ts}`, `services/IssueRouter/`, **`mcp/{router.ts, tools/*.ts, RunTokenService.ts}`**, `usecases/{DeclareIssueComplete,DeclareStop,AskOperator}.ts` |
| **NASCEM fora do contexto `agent`** | `artifact/mcp/RecordArtifactTool.ts` — a tool `codedm__record_artifact` é controller fino do contexto **DONO da escrita** e despacha o `RecordArtifact` que já existe (§4.4 item (ii)). **Não** existe `agent/usecases/DeclareArtifact.ts` |

### 5.4 Ferramental que precisa nascer junto (house rule)

`agents/` é um **tipo de artefato novo**. `CLAUDE.md` ("if you wrote it, the CLI should write it") e
o `docs/CLI.md` (tabela de verbos de backend, sem linha `agent`) obrigam: na mesma fase em que o
primeiro agent nasce, entram **`.claude/skills/agent/{SKILL.md, registry.yaml}`** (variante
`typescript`) e o verbo **`bun cli agent <ctx> <Name>`** com auto-wiring de barrel. Sem isso o
`/review` e o `bun review` não sabem classificar os arquivos novos, e o próximo agent nasce à mão.

O `registry.yaml` da skill precisa codificar, como `bad_practices`, pelo menos: (1) segundo método no
seam; (2) classe por tipo de frame; (3) `throw` no meio do drain para falha de validação; (4)
`if (provider === …)` no runner; (5) `ownerId`/`issueId` em input schema de tool; (6) fato de
domínio cunhado por heurística de texto; (7) **tool MCP síncrona que bloqueia esperando humano**
(§4.4 — trava o run até o watchdog); (8) **runner cunhando run token** (§4.2 — quem cunha é a base
`Agent`; o runner só revoga); (9) **método público num agent além do `run()`/do único delegador de
`collect()`** (§4.5); (10) **evento de domínio novo criado para servir uma tool** quando já existe a
classe que faz bridge para o integration event congelado (§4.3, regra 7); (11) **tool que publica um
integration event sem consumidor do outro lado** — a tool pertence ao contexto DONO da escrita
(§4.4 item (ii)); (12) **dois publicadores do mesmo integration event congelado** sem dono declarado;
(13) **subclasse de `Agent` sobrescrevendo `run()`** (§4.5 — `run()` é template method concreto; o
ponto de variação é `buildRequest()`, e um `run()` sobrescrito reabre um segundo lugar para cunhar
run token); (14) **use case condicionando em `request.mcp`** (§4.3, regra 7 — o request é montado
dentro do `Agent` e o use case não o enxerga; o predicado observável é o **escopo de tool** do agent
injetado).

---

## 6. Linhagem e convergência com o medscall — DECISÃO FECHADA

> Esta seção existe para que o executor **não** gaste a noite tentando compartilhar runtime com o
> medscall. O veredito completo está em `.specs/codedm/2026-07-26-agent-abstraction-convergence.md`.

### 6.1 O veredito

| Camada | Decisão |
|---|---|
| **Léxico** — nomes de seam, campos do request, taxonomia de evento, regras invioláveis | **CONVERGE.** Nome idêntico, campo idêntico, regra idêntica nos dois repos. |
| **Playbook** — `.claude/skills/agent/{SKILL.md, registry.yaml}` | **CONVERGE.** Um artefato, escrito uma vez, propagado pelo trem de sync que já roda. |
| **Seam de runtime** — `AgentRunner`, request record, união de frames, `ProviderDef`, `Tool`, agregado de sessão | **NÃO CONVERGE. Duplicação deliberada, razão escrita abaixo.** |
| **Bytes compartilhados** (`Agent<I,O>`, `AgentStreamRegistry`) | **NÃO AGORA** — não por prudência, por **ausência de cano**. |

**A razão, em uma frase:** as quatro incompatibilidades duras não são quatro acidentes, são **uma
pergunta observada quatro vezes — quem roda o loop de tools**. Ela determina a aridade do método,
se `tools` é campo do request, onde mora a autorização e quem é dono do histórico. No medscall o
runner medeia o loop e `ToolContext { chatId, ownerId }` é a **fronteira de autorização por
chamada**; no CodeDM a autoridade é delegada por atacado uma vez no spawn
(`--permission-mode auto`) e o loop de tools acontece **fora** do runner, entre o CLI e
o nosso servidor MCP (D8). Uma interface cuja assinatura é inteiramente determinada por uma pergunta
que os dois consumidores respondem de forma oposta não é uma interface compartilhada — **são duas
interfaces com o mesmo nome.**

E, mecanicamente: `medscall/sync.yaml` não carrega **nenhuma** linha de código de runtime
(`grep -c "packages/api/src" sync.yaml` → 0; `adapted: []`), o contexto `agent` do medscall é
**Tier 4 — product code, "not the template's business"** (`ECOSYSTEM.md:71-73`), e nenhum dos repos
roda `bun sync:check` em CI. Não existe cano para carregar byte nenhum.

**Regra operacional para o executor:** o medscall é **referência lida** (modelo shadcn, Tier 3), não
dependência. Copiar **julgamento** é o mecanismo; copiar arquivo não é. Todo arquivo do contexto
`agent` que nasceu de leitura do medscall carrega um comentário `// CONTEXT-ORIGIN:` apontando o
arquivo e o pin de origem — e o pin de 40 hex do medscall vai para
`.specs/codedm/source-map-and-decisions.md` (regra `## Sources` do `BOOTSTRAP.md`).

### 6.2 O que o CodeDM ADOTA do medscall (já dobrado no corpo deste doc)

| # | Item | Onde já está |
|---|---|---|
| **A** | `AgentInputSchemaConstraint` + `AgentInputEnvelope` definidos, com `z.agentInput()` para valer por construção | §4.6 · Fase 1 |
| **B** | `model` e `stopReason` **tipados** (`AgentModelId`, `AgentStopReason`), nunca `string` | §4.2 · Fase 1 |
| **C** | `AgentTurnFact` como união de **`BaseDomainEvent`**, definida **antes** do codec, com `AgentToolCallEvent` de ciclo de vida completo | §4.3 · Fase 1 |
| **D** | Pré-compromisso de placement da config: ela chega pelo **input schema** do agent, nunca pelo request do runner | D10 · §4.6 |

### 6.3 O que o CodeDM NÃO faz (e o medscall faz)

Não portar `Tool`/`ToolContext` como tipos de request (§4.1). Não adotar a proibição "agent só por
handler" para o classificador (§5.2). Não adotar `generate` como segundo método (D3). Não importar
`Agent<I,O>` nem `AgentStreamRegistry` de lá — **duplicar com o mesmo nome e a mesma forma**.

### 6.4 Débito cross-repo conhecido — FORA DE ESCOPO deste goal

**Não "consertar" isto durante a execução. Não reverter. Só não piorar.**

- **`packages/api/typescript/core/src/types/EventHandler.ts` (linhas ~73-87) carrega um bugfix
  crítico que existe SÓ no fork do CodeDM:** ele reconstrói os objetos JSONB vindos do outbox na
  classe declarada, para que `instanceof` volte a funcionar. Sem ele *"the whole domain→integration
  event bridge is dead in real mode"*. **`template-fullstack` e `medscall` NÃO têm esse fix.** Ou
  seja: o CodeDM está **à frente**, não atrás. Qualquer diff contra o template que mostre essa
  divergência é **esperado** — reverter para "convergir" quebraria o bridge de eventos inteiro em
  modo real. O upstream disso é um PR separado, em outro repo, fora deste goal.
- Outros resíduos do mesmo drift, também fora de escopo: `CODEDM_DATA_DIR` dentro de
  `core/src/utils/Config.ts`, `core/src/utils/index.ts` ausente no fork, os 6 especificadores
  `@template/` hardcoded em `core/src`. Registrar no `OVERNIGHT-REPORT.md` se cruzarem o caminho;
  **não** corrigir aqui.

---

## 7. Fases

Toda fase: e2e **verde** ao final, entrada no `BUILD-LOG.md`, commit convencional **com pathspec
explícito** (§8, regra 11), `git status` limpo. Fase substantiva = workflow com builder + 2 juízes
adversariais (§8, regra 2).

**Toda AC abaixo é verificável por comando.** Onde diz "grep → 0", o executor roda o grep e cola a
saída no BUILD-LOG. Onde diz "teste", o teste é escrito **na mesma fase** — AC sem teste é AC não
cumprida. Nenhuma AC depende de alguém julgar se "está bom".

> Convenção de grep: todos os greps deste documento excluem `node_modules/`, `dist/`,
> `packages/client/dist/` e `packages/contracts/generated/`. Sugestão de forma:
> `git grep -n "<padrão>" -- <paths>` (o `git grep` já respeita o índice e ignora o que é ignorado).
>
> **Caminhos pinados — os três arquivos de registro JÁ EXISTEM e ficam em `.specs/codedm/`, não na
> raiz.** Toda menção neste documento a `BUILD-LOG.md`, `OVERNIGHT-REPORT.md` e
> `OVERNIGHT-BLOCKED.md` significa, sempre e só: **`.specs/codedm/BUILD-LOG.md`**,
> **`.specs/codedm/OVERNIGHT-REPORT.md`**, **`.specs/codedm/OVERNIGHT-BLOCKED.md`** — **anexar**
> neles, nunca criar duplicata na raiz. Mesma disciplina do `phase<N>-smoke/`, que também vive sob
> `.specs/codedm/`. É aí que o critério 15 (§9) procura.

### Fase 0 — Um SQLite para os dois sidecars: **a metade TS** (PRECEDE tudo)

**A metade Go está PRONTA em `149b6aa3` (§1.3). NÃO reabrir, NÃO refazer, NÃO reverter.** Se algum
gate Go falhar, o conserto é aditivo e registrado — não é uma re-migração.

O que **falta**: tirar o daemon TS do PGlite embarcado e colocá-lo no **mesmo arquivo** que o
gateway Go já escreve (`<dataDir>/codedm.db`). O schema SQLite já existe
(`packages/contracts/db/schema-sqlite/`, 25 tabelas — mesma contagem do pg), então isto é **troca de
dialeto + driver**, não modelagem. Trabalho concreto:

1. **`SqliteDriver`** em `packages/api/typescript/core/src/db/drivers/SqliteDriver.ts` — drizzle
   `bun-sqlite`, WAL, `busy_timeout`, **FK OFF** (mesma convenção do store Go), `_txlock=immediate`
   nas escritas. O **data-dir é resolvido dentro do construtor**, como no Go.
2. **Migrations com o MESMO ledger do Go.** O driver aplica
   `packages/contracts/db/schema-sqlite/migrations/*.sql` com o mesmo split por
   `--> statement-breakpoint` e a mesma tabela `_sqlite_migrations` que
   `packages/api/go/core/db/sqlite/store.go` usa. **Dois migradores idempotentes sobre um ledger
   comum**: quem bootar primeiro aplica, o segundo é no-op. Isso é requisito, não detalhe — se os
   ledgers divergirem, o segundo processo reaplica DDL e quebra o boot.
3. **Locks precisam coexistir.** O store Go tem lock de instância única e o TS tem `DataDirLock`.
   Dois processos **têm** de abrir o mesmo arquivo. Portanto o lock passa a ser **por papel**
   (`daemon.lock` × `gateway.lock`), nunca exclusivo sobre o `.db`. Se o lock atual do Go for
   file-level exclusivo, ajustar **o nome do arquivo de lock**, não o comportamento.
4. **Repositórios/queries TS passam a importar o schema SQLite — e o TOOLING do `contracts` é
   re-cabeado JUNTO.** Isto não é detalhe: a AC-0.2 exige `bun run contracts` **verde e idempotente
   2×**, e hoje `contracts` é `tsp:compile && codegen:wire && drizzle:generate`, com
   `drizzle:generate`/`drizzle:migrate` apontando para `db/drizzle.config.ts`, que é
   `dialect: 'postgresql'` sobre `./db/schema/index.ts`. Apagar `db/schema/` sem tocar no tooling
   **quebra o próprio gate**. Lista fechada, nada fora dela:
   - `packages/contracts/package.json` → **`exports`**: `"."` e `"./db"` re-apontam para
     `./db/schema-sqlite/index.ts`; `"./db/migrations"` continua existindo e re-aponta para o ledger
     SQLite (abaixo).
   - `packages/contracts/package.json` → **scripts**: `drizzle:generate` passa a usar
     `--config=db/schema-sqlite/drizzle.config.ts`; **`drizzle:migrate` MORRE** — o cabeçalho do
     próprio config sqlite já registra que `drizzle-kit migrate` para sqlite exige
     `better-sqlite3`/`@libsql`, que este workspace **não tem**; quem aplica são o `SqliteDriver`
     (item 2) e o `SqliteStore` Go. `all` segue `tsp:compile && codegen:wire && drizzle:generate`.
   - `packages/contracts/db/drizzle.config.ts` (pg) → **deletado**; o config sqlite vira o canônico.
     Atualizar o cabeçalho dele, que hoje diz que o pg *"stays the canonical source"* e chama o
     substrato sqlite de alvo do go-domain port — prosa obsoleta desde o `469eed5b`.
   - `packages/contracts/db/schema/` (25 tabelas pg) e `packages/contracts/db/migrations/`
     (10 SQL pg + `meta/`) → **deletados** (decisão (d), fresh start — não há dado a migrar).
     **A deleção é o ÚLTIMO passo do item 4, e só depois que os 4 rails/ferramentas abaixo já
     estiverem re-apontados** — cada um deles LÊ esse diretório hoje, então apagar antes deixa a
     Fase 0 incapaz de passar o próprio gate (AC-0.9). Lista fechada, verificada arquivo a arquivo,
     nada fora dela:

     **(4a) `packages/api/typescript/tests/architecture/context-map.test.ts` — DOIS testes leem o
     diretório**, ambos por `readdirSync(CONTRACTS_SCHEMA)`, onde
     `CONTRACTS_SCHEMA = join(…, 'contracts', 'db', 'schema')` (**linha 29**). Com o diretório
     apagado o `readdirSync` lança `ENOENT` e a suíte fica **vermelha** — não "verde por vacuidade".
     E re-apontar a constante **não basta**: os dois parsers procuram `pgSchema('x')`, que **não
     existe** em `db/schema-sqlite/` (lá é `sqliteTable('<prefixo>_<tabela>', …)`), então ambos
     casariam **zero** vezes — o primeiro teste falharia (`inContracts: []` × 9 declarados) e o
     segundo ficaria **cego** (pior que falhar). Os dois:
     - `test('pgSchema parity: declared CONTEXTS pgSchemas == contracts/db/schema pgSchema() literals')`
       (**:163-180**) — compara `CONTEXTS.pgSchema` + `FOREIGN_PGSCHEMAS` + `PENDING_PGSCHEMAS`
       contra os literais de `pgSchema('…')`.
     - `tableOwners()` da perna **TABLE-READ** (**:206-228**) — resolve `export const X = <schema>.table(`
       → pgSchema dono, e é o que faz `TABLE_READ_EDGES` valer.

       **Re-expressão obrigatória (mecânica, sem heurística frouxa):** a namespace no dialeto SQLite
       é o **prefixo do nome da tabela** — cada arquivo de `db/schema-sqlite/` já declara isso no
       cabeçalho (*"`terminal` (pgSchema namespace) → `terminal_*` table prefix"*). Verificado: as
       **25** tabelas carregam exatamente **9** prefixos — `artifact`, `authentication`, `gateway`,
       `issue`, `owner`, `shared`, `terminal`, `thread`, `workspace` — e **nenhum** nome de pgSchema
       do repo contém `_`, logo *"o trecho antes do PRIMEIRO `_` do literal de `sqliteTable`"* é
       determinístico. Portanto: `CONTRACTS_SCHEMA` → `…/contracts/db/schema-sqlite`; o filtro de
       arquivos passa a excluir também `_enum.ts` e `drizzle.config.ts` (além de `index.ts`); o
       primeiro teste compara o conjunto **deduplicado e ordenado** desses prefixos contra
       `declared` (o lado `declared` **não muda** — continuam os mesmos 9); e `tableOwners()` mapeia
       `export const (\w+) = sqliteTable\(\s*'([a-z]+)_` → grupo 2. **A regex TEM de tolerar quebra de
       linha** (`\s*` depois do parêntese): verificado no `schema-sqlite/` — apenas **6 das 25** tabelas
       declaram `sqliteTable('prefixo_nome', {` numa linha só (as 5 de `auth.ts` e uma de `issue.ts`); as
       outras 19 quebram a chamada (`export const terminalLLMSessions = sqliteTable(` em
       `terminal.ts:10`, com o literal `'terminal_terminal_llm_sessions',` na linha seguinte). Uma regex
       intolerante a newline coletaria 2 prefixos contra 9 declarados e faria o rail nascer VERMELHO. O
       mesmo `\s*` vale para a perna de paridade (*"o trecho antes do primeiro `_` do literal de
       `sqliteTable`"*). **Não** mudar `CONTEXTS`,
       `FOREIGN_PGSCHEMAS` nem `TABLE_READ_EDGES`: o value-set declarado continua idêntico — o que
       muda é só o **parser do lado dos contracts**.

     **(4b) `scripts/graph/core/config.ts:177` — `DRIZZLE_SCHEMA_DIR = ${PKG.contracts}/db/schema`**,
     consumido por `scripts/graph/adapters/ts/extractors/drizzle.ts:16,31`,
     `scripts/graph/registry/classifier.ts:88` e `scripts/graph/registry/discovery.ts:7`. O extractor
     **degrada em silêncio** (`if (!existsSync(schemaDirAbs)) return { tablesExtracted: 0 }`), mas o
     teste commitado `scripts/graph/tests/build.integration.test.ts:50`
     (*"drizzle extractor emits db-table nodes from contracts/db/schema"*, `expect(tables.length).toBeGreaterThan(0)`)
     **fica vermelho**. Nota de escopo, verificada: essa suíte **não** está em `bun run test` nem em
     `test:tooling` nem no `pre-commit` — ela é ferramental do code-graph, fora do gate set das
     fases. **Consertar mesmo assim** (a AC-0.11 cobra): apontar `DRIZZLE_SCHEMA_DIR` para
     `db/schema-sqlite` **e** estender `extractTablesFromFile` (`drizzle.ts:41-60`), que hoje só
     reconhece `pgTable` / `<schema>.table`, para reconhecer `sqliteTable`; o `schemaName` deixa de
     ser o nome do arquivo e passa a ser o mesmo prefixo do literal de (4a) — senão o grafo
     atribuiria `authentication_users` ao contexto `auth` e `shared_events` ao contexto
     `infrastructure`, que são nomes de arquivo, não namespaces.

     **(4c) `.claude/registry.yaml:137` — o componente `db-schema`** classifica
     `"packages/contracts/db/schema/*.ts"` e passaria a casar **nada** (fóssil silencioso: `/review`
     e `bun review` param de saber classificar schema). Verificado que **nenhum** rail de liveness
     cobre padrões da `registry.yaml` (o `allowlist-liveness.test.ts` cobre `slice-closure.allow.yaml`,
     os `EXEMPTIONS` das disciplinas e as `exceptions` do `import-direction`; `taxonomy-parity` e
     `skill-examples` não olham este padrão) — ou seja, **ninguém vai avisar**. Trocar o padrão para
     `"packages/contracts/db/schema-sqlite/*.ts"` com as exclusões `"!*/index.ts"`, `"!*/_enum.ts"`,
     `"!*/drizzle.config.ts"`, e reescrever o `note:` — hoje ele descreve o dialeto pg (*"plain text
     + jsonb columns, no pgEnum, no $type<>()"*) e passa a descrever o SQLite (`sqliteTable`,
     `text` + `CHECK` via `enumCheck`, `integer{ mode: 'timestamp_ms' }`, `text{ mode: 'json' }`).

     **(4d) `packages/api/typescript/tests/architecture/enum-placement.test.ts` — o QUARTO rail, e
     ele está DENTRO de `bun run test`** (logo dentro do gate da AC-0.9, ao contrário de (4b)).
     Verificado: o arquivo declara a **sua própria** cópia da constante —
     `const CONTRACTS_SCHEMA = join(import.meta.dir, '..', '..', '..', '..', 'contracts', 'db', 'schema')`
     (**linha 38**) — consumida pelo teste **CMPL-01** (**:112-113**) via
     `scanSchemaMirrors(CONTRACTS_SCHEMA)` → `listSchemaFiles(dir)` → `readdirSync(dir, { withFileTypes: true })`.
     Com o diretório apagado é o **mesmo `ENOENT`** de (4a): suíte **vermelha**, `bun run test`
     vermelho, Fase 0 sem gate. Note que a constante de (4a) e a de (4d) são **duas declarações
     independentes** — re-apontar só a de `context-map.test.ts` não conserta esta. O que fazer,
     mecânico:
     - `CONTRACTS_SCHEMA` → `join(import.meta.dir, '..', '..', '..', '..', 'contracts', 'db', 'schema-sqlite')`.
     - `listSchemaFiles` (**:58-62**) hoje filtra só `.ts` **não-`.test.ts`** — sem o `!== 'index.ts'`
       que `context-map.test.ts` tem. Aplicar **o mesmo filtro de (4a)/(4c)**: excluir `index.ts`,
       `_enum.ts` e `drizzle.config.ts`, senão o scan passa a varrer três arquivos que não são
       tabela. (`migrations/` já é ignorado sozinho: o filtro exige `e.isFile()`.)
     - **CMPL-02 não é tocado** — ele varre `src/**/enums` via `API_SRC`, não os contracts.
     - **Decisão sobre o texto de remédio do CMPL-01** (`:112-118`): a mensagem manda usar
       `.$type<Enum>()` e **para aí**. `.$type<>()` NÃO é idioma pg — é drizzle dialect-agnostic e já
       está em uso no dialeto novo (`schema-sqlite/artifact.ts:20`, `channel.ts:22`, `terminal.ts:20`).
       O defeito é outro: sozinho ele só tipa o TS e **não amarra o value-set no banco**. Reescrever
       para o idioma completo que o próprio (4c) descreve: *"importe o enum do binding gerado
       (`@codedm/contracts-typescript/wire/enums`) e amarre o value-set na coluna com `text` +
       `.$type<Enum>()` + `enumCheck(...)` (CHECK), nunca com uma união de literais escrita à mão"*.
       Sem isso o rail continua verde mas prescreve, na mensagem de falha, metade do idioma.
     - **A asserção em si não muda** e continua verde: verificado que `db/schema-sqlite/*.ts` tem
       **0** aliases de união string top-level hoje
       (`grep -nE "^type\s+[A-Za-z0-9_]+\s*=\s*'" packages/contracts/db/schema-sqlite/*.ts` → 0 hits),
       e a **não-vacuidade** já é provada pelo terceiro teste do arquivo (o fixture em `mkdtempSync`,
       que exercita `scanSchemaMirrors` num diretório temporário e **não** depende do caminho real).

     **Verificado que NÃO quebra** (não gastar tempo com eles): `.claude/hooks/classify-edit.test.ts:263-265`
     usa `packages/contracts/db/schema/*.ts` como **string literal** para exercitar `globToRegExp` —
     não lê o filesystem nem a `registry.yaml`, e segue verde. Atualizar o literal é higiene
     opcional, **não** é gate.
   - `packages/contracts/db/migrations.ts` (exportado como `@codedm/contracts/db/migrations`,
     consumido pelo driver e pelo build `--target=node`) → **re-apontado** para
     `db/schema-sqlite/migrations`, **preservando** o override `CODEDM_MIGRATIONS_DIR` e a cópia que
     `packages/api/typescript/scripts/build.ts` faz para `dist/migrations`.
   - **Scripts de raiz**: `migrate:dev` (hoje `drizzle:migrate`) é **removido** — a migração passa a
     acontecer no boot dos dois sidecars sobre o ledger comum; `migrate:create` continua apontando
     para `drizzle:generate` (agora sqlite). As menções em `.claude/skills/migrate/SKILL.md` e
     `.claude/commands/install.md` ganham **uma linha** dizendo que o boot migra. Qualquer outro
     script de raiz que ficar órfão: remover e registrar no BUILD-LOG.
5. **PGlite sai de vez** — e o raio real é maior que "driver + dialeto", então ele está **enumerado
   aqui** para o orçamento não estourar no meio da noite. Saem `PGliteDriver`, `NodePgDriver`,
   `@electric-sql/pglite` e `pg` do `package.json` e do `bun.lock`; `mock`/`integration` passam a
   usar `SqliteDriver` em `:memory:`. Estas são **todas** as referências vivas hoje
   (`git grep -lnE "PGlite|pglite|NodePgDriver|from 'pg'" -- packages/api/typescript packages/e2e packages/contracts`),
   e a **AC-0.1 conta inclusive menção em comentário e em prosa** nestes caminhos:
   `core/package.json` · `core/src/bun-file-assets.d.ts` ·
   `core/src/db/drivers/{index,DataDirLock,NodePgDriver,PGliteDriver}.ts` ·
   `core/src/types/Registry.ts` · `core/src/utils/Config.ts` ·
   `scripts/{build,emit-openapi,require-emit-env,smoke-node-boot}.ts` · `src/bun-file-assets.d.ts` ·
   `src/index.ts` · `src/shared/{index,registry}.ts` · `src/ui/registry.ts` ·
   `src/terminal/services/TerminalLLMRunner/E2eStubTerminalLLMRunner/E2eStubTerminalLLMRunner.ts` ·
   `tests/kernel/{DomainEventListByNameSince,DrizzleIdempotencyGuard,PostgresCommandQueue}.test.ts` ·
   `tests/support/{TestBed,PersistenceProbe}.ts` ·
   `packages/e2e/{playwright.config.ts,scripts/run-e2e.ts,scripts/cleanup-stale-dbs.ts,tests/README.md}`.
   Nenhum é decisão difícil — é **sweep**. Arquivo da lista que já não exista ou já esteja limpo
   quando a fase rodar: registrar e seguir.
   **Dois cuidados de rail dentro deste sweep, verificados:** (a) os dois arquivos de
   `tests/kernel/` da lista (`PostgresCommandQueue.test.ts`, `DomainEventListByNameSince.test.ts`)
   são **nomeados** nos `EXEMPTIONS` de `tests/architecture/probe-discipline.test.ts` — **editar** o
   conteúdo é livre, mas **renomear/apagar** derruba `allowlist-liveness.test.ts` (permissão
   fóssil). Se algum deles precisar mudar de nome, mover a entrada de exemption **no mesmo commit**.
   (b) `PGliteDriver.ts` e `NodePgDriver.ts` carregam **3** chaves em
   `scripts/detectors/registry-scan.baseline.json` (verificado: `NodePgDriver.ts::universal#as-unknown`,
   `PGliteDriver.ts::universal#as-any`, `PGliteDriver.ts::universal#as-unknown`) — apagados os
   arquivos, as chaves viram fósseis: é o que a **AC-0.12** cobra.
6. **e2e**: `packages/e2e/scripts/run-e2e.ts` continua com data-dir scratch por run — agora um
   arquivo `.db`, não um diretório PGlite.
7. **Ingress de teste do lado GO — o mecanismo que torna `CONNECTED` alcançável sem humano.** Isto
   **não é opcional**: sem ele a AC-0.6 não tem caminho não-assistido e a fase inteira trava. O
   problema, verificado: `channel-status.tsp` vai `CREATED → CONNECTING → CONNECTED`, e
   `internal/channel/entities/channel.go:103` só chega a `CONNECTED` via `SetConnected` — hoje
   disparado **apenas** por `handlers/channel_connected_handler.go:74`, ou seja, **pareamento QR do
   whatsmeow**. Um `POST /api/channel/channels/whatsapp` num data-dir scratch para em `CREATED`. E o
   e2e atual **não serve de prova**: `packages/e2e/utils/given/gateway.ts` sobe **só o daemon** e
   semeia a linha `CONNECTED` por um ingress de teste **em TS** (`shared/controllers/TestIngressController.ts`,
   rota `/v1/_test/gateway`) — isso não toca o store compartilhado.

   **Solução: o espelho Go do ingress TS que já existe.** Nasce
   `packages/api/go/internal/channel/controllers/test_ingress.go`, montado **somente** quando
   `CODEDM_E2E=true` (mesma disciplina de guarda do `TestIngressController.ts`), expondo
   `POST /api/channel/_test/connect` com body `{ "channelId": "<uuid>", "ownerRemoteID": "<jid>" }`.
   O handler roda **dentro do processo Go real**, pelo caminho real: `ChannelRepository.Find` →
   `inst.SetConnected(ownerRemoteID)` → `ChannelRepository.Save`, tudo sob o `SqliteUnitOfWork`.
   Ou seja: entidade real, evento de domínio real (`ChannelConnectedEvent`), store compartilhado
   real — **só o gatilho** é de teste, no lugar do QR. Nenhuma linha de produção muda de
   comportamento; a rota não existe fora de `CODEDM_E2E`.

   **O literal é `CODEDM_E2E=true`, NÃO `=1` — verificado, e errar isto é uma noite perdida em
   silêncio.** Todo consumidor TS compara com a **string `'true'`**:
   `src/boot.ts:23` (`process.env.CODEDM_E2E === 'true'`), `src/shared/index.ts:34`,
   `src/shared/registry.ts:114`, `src/terminal/registry.ts:18`; e os harnesses exportam `'true'`
   (`packages/e2e/scripts/run-e2e.ts:83`, `packages/e2e/playwright.config.ts:46`,
   `HANDOFF.md:32`). Um `CODEDM_E2E=1` **não** flipa nenhum desses seams: o daemon TS bootaria com
   `RedisExternalMediator` e sem `TestIngressController`, e o smoke da AC-0.5 falharia com um erro
   que **não aponta** para a variável. Portanto o guard Go **também** compara com `"true"`
   (`os.Getenv("CODEDM_E2E") == "true"`), e todo script/AC deste documento exporta
   `CODEDM_E2E=true`.

   **Por que essa forma e não outra** (para o executor não reabrir): (a) um `go test` provaria só o
   Go falando consigo mesmo — o ponto da fase é **cross-process sobre um arquivo**; (b) escrever a
   linha `CONNECTED` direto por SQL puraria o teste em "o SQLite funciona", não em "o gateway
   escreve e o daemon lê"; (c) publicar `GatewayConnectedEvent` no mediator interno também
   funcionaria, mas exige a `ChannelRegistry` populada (o handler cai no `ownerRemoteID` persistido
   com um `slog.Warn`, `channel_connected_handler.go:68-71`) — mais peças, mesmo resultado. Se por
   algum motivo o ingress HTTP não subir, o **fallback autorizado** é um `cmd` Go dedicado
   (`packages/api/go/cmd/smoke-connect/main.go`) que abre o mesmo `CODEDM_DATA_DIR` e faz
   `Find → SetConnected → Save` pelo repositório: **registrar no BUILD-LOG qual dos dois ficou e
   seguir** — não é decisão de founder.

**AC-0.1** `git grep -n "PGlite\|pglite\|NodePgDriver\|from 'pg'" -- packages/api/typescript packages/e2e packages/contracts` → **0 hits**; `git grep -n "@electric-sql/pglite\|\"pg\":" -- package.json '*/package.json' bun.lock` → **0 hits**.
**AC-0.2** `git grep -n "pgTable\|pgSchema\|pgEnum" -- packages/contracts/db` → **0 hits**; `packages/contracts/db/schema/`, `packages/contracts/db/migrations/` e `packages/contracts/db/drizzle.config.ts` **não existem mais**; `bun run contracts` roda 2× **verde** sem produzir diff (`git status --porcelain` vazio na segunda) — o que só é possível com o re-cabeamento do item 4 feito (`exports`, `drizzle:generate`, morte de `drizzle:migrate`, `migrations.ts` re-apontado, `migrate:dev` removido da raiz). `bun x tsc` de `packages/contracts` e o import `@codedm/contracts/db/migrations` resolvem.
**AC-0.3** Teste do driver (`core/src/db/drivers/SqliteDriver.test.ts`): aplica as migrations num arquivo temp, conta **25 tabelas** de domínio, reaplica e verifica **0 migrations aplicadas** na segunda passada.
**AC-0.4** Teste/script de **ledger cruzado**, commitado: o store Go migra um arquivo temp (`go test ./core/db/sqlite -run TestMigrate…` ou o binário com `CODEDM_DATA_DIR` scratch), o `SqliteDriver` TS abre **o mesmo arquivo** e aplica **0** migrations, lendo as 25 tabelas. Log commitado em `.specs/codedm/phase0-smoke/`.
**AC-0.5** **Boot smoke dos DOIS sidecars sobre UM arquivo, sem Postgres no ar** — script commitado (`packages/api/typescript/scripts/smoke-shared-store.ts`), exit code 0, saída commitada em `.specs/codedm/phase0-smoke/`. A sequência é **exatamente esta**, e ela prova **duas** transições cross-process, não uma leitura:
&nbsp;&nbsp;1. sobe gateway Go + daemon TS no **mesmo** `CODEDM_DATA_DIR` (`CODEDM_E2E=true` — o literal exato, item 7), sem Postgres no ar;
&nbsp;&nbsp;2. `POST /api/channel/channels/whatsapp` **no gateway** → daemon consulta e lê **`CREATED`** (primeira travessia);
&nbsp;&nbsp;3. `POST /api/channel/_test/connect` **no gateway** (item 7 acima) → `SetConnected` pelo caminho real da entidade;
&nbsp;&nbsp;4. daemon consulta **de novo** e lê **`CONNECTED`** (segunda travessia, agora sobre um UPDATE).
&nbsp;&nbsp;O script **falha** se qualquer um dos dois reads devolver o status errado, se o daemon devolver `DISCONNECTED` (o sintoma histórico do split-DB), ou se algum processo tocar Postgres.
&nbsp;&nbsp;**Comparação EXATA, nunca substring.** No script: `if (channel.status !== 'CONNECTED') fail()`. Em
shell: `jq -e '.channels[0].status == "CONNECTED"'`. **Nunca** `grep -q CONNECTED` — verificado:
`printf '{"status":"DISCONNECTED"}' | grep -q CONNECTED` sai **0**, ou seja, a asserção passaria
exatamente no sintoma que esta fase existe para matar. Vale para toda asserção de status em todas as fases.
**AC-0.6** **O daemon renderiza exatamente o status que o gateway escreveu, com pelo menos UMA transição observada cross-process** (`CREATED → CONNECTED` da AC-0.5). É isto que mata o split-DB, e a prova é o **smoke da AC-0.5**, não o e2e. **O e2e NÃO serve de prova aqui** e o executor não deve tentar usá-lo: `packages/e2e/utils/given/gateway.ts` sobe **só o daemon** e semeia a linha por um ingress **TS** — verde lá diria zero sobre o store compartilhado. O e2e continua rodando como gate de não-regressão (AC-0.9), com o seu seed TS intacto; se a tela de channels quiser cobertura de UI, isso é trabalho da Fase 7, **não** desta AC.
**AC-0.7** `git grep -n "CODEDM_DATA_DIR" -- packages/api/typescript/src packages/api/typescript/core/src` só aparece em `core/src/utils/Config.ts`, no construtor do driver e em `src/boot.ts` — **zero** em repositórios, use cases ou contextos.
**AC-0.8** `go build ./... && go vet ./... && go test ./...` verdes nos **dois** módulos (`packages/api/go` e `packages/api/go/core`) — confirmando que a metade Go segue intacta.
**AC-0.9** `bun tsc`, `bun lint`, `bun detect`, `bun run test` (rodado de `packages/api/typescript`) e **`bun e2e` executado de verdade** verdes; `git status` limpo. **Explicitamente incluídos em `bun run test`: `tests/architecture/context-map.test.ts` E `tests/architecture/enum-placement.test.ts` verdes** — são os **dois** rails dentro do gate que a deleção de `db/schema/` quebraria (itens 4a e 4d; (4b) é ferramental fora do gate, cobrado à parte pela AC-0.11(c)), e "verde" aqui significa passar com os parsers/constantes re-expressos, **não** por vacuidade: os dois testes de `context-map` que leem os contracts, e o CMPL-01 de `enum-placement` varrendo ≥ 9 arquivos de `db/schema-sqlite/`.
**AC-0.10** RSS do daemon **medido antes e depois** (mesmo cenário de boot) e registrado no BUILD-LOG. Esperado −50 a −100MB (heap wasm do PGlite). **É medição registrada, não gate** — se não cair, registrar o número e seguir.
**AC-0.11** **Os 4 rails/ferramentas que liam `packages/contracts/db/schema/` foram re-apontados ANTES da deleção** (item 4, sub-itens 4a/4b/4c/4d) — lista fechada, cada um com prova mecânica:
&nbsp;&nbsp;(a) `git grep -n "db/schema'\|db', 'schema'\|db/schema/\*" -- packages/api/typescript/tests scripts .claude/registry.yaml` → **0 hits** que apontem para o diretório pg (hits em `.plans/` e `.specs/` são registro histórico e estão **fora** do escopo — reescrever histórico é proibido, §8 regra 7). **Este grep casa DUAS declarações de `CONTRACTS_SCHEMA`, não uma** — `context-map.test.ts:29` e `enum-placement.test.ts:38`, ambas na forma `'db', 'schema'`; as duas têm de sair no mesmo passo (itens 4a e 4d);
&nbsp;&nbsp;(b) `packages/api/typescript/tests/architecture/context-map.test.ts` — a parity test compara os **9** prefixos deduplicados (`artifact, authentication, gateway, issue, owner, shared, terminal, thread, workspace`) contra `declared`, e a perna TABLE-READ resolve **≥1** dono de tabela (teste falha se `tableOwners()` vier vazio — a cegueira tem de ser um erro, não um silêncio);
&nbsp;&nbsp;(c) `bun test scripts/graph/tests/build.integration.test.ts` verde, com o caso `drizzle extractor emits db-table nodes` contando **25** tabelas;
&nbsp;&nbsp;(d) `.claude/registry.yaml` classifica um arquivo real: `bun scripts/detectors/registry-scan.ts packages/contracts/db/schema-sqlite/terminal.ts` roda **sem** `no such file` e sem `skill não encontrada`;
&nbsp;&nbsp;(e) `bun test packages/api/typescript/tests/architecture/enum-placement.test.ts` verde e **não-vacuoso** — os **três** testes do arquivo passam (CMPL-01, CMPL-02 e o fixture de `mkdtempSync`, que é o que prova que `scanSchemaMirrors` ainda flagra um mirror), e o CMPL-01 varre **≥ 9** arquivos de `db/schema-sqlite/` (as 9 namespaces; `index.ts`/`_enum.ts`/`drizzle.config.ts` ficam de fora pelo filtro novo). Um CMPL-01 que varre **0** arquivos é verde-por-vacuidade e **reprova** a AC.
**AC-0.12** **Baseline do `registry-scan` re-ratchetada nesta fase** (o item 5 apaga `PGliteDriver.ts` e `NodePgDriver.ts`, que carregam **3** chaves em `scripts/detectors/registry-scan.baseline.json` — verificado: `NodePgDriver.ts::universal#as-unknown`, `PGliteDriver.ts::universal#as-any`, `PGliteDriver.ts::universal#as-unknown`): rodar `bun detect:baseline`, commitar o arquivo, e provar que `git grep -c "PGliteDriver\|NodePgDriver" scripts/detectors/registry-scan.baseline.json` → **0**. Uma chave de baseline apontando para arquivo morto é permissão fóssil — o próximo arquivo que renascer com o mesmo caminho herda a supressão sem ninguém re-decidir.

> **Não abrir o contexto `agent` com esta fase em aberto.** Um contexto novo declarando schema
> enquanto o substrato migra escolhe o dono errado — e a lição registrada é não deixar refactor
> uncommitted numa árvore que outro workflow edita.

### Fase 1 — Contract lock (aditiva, zero mudança de comportamento)

Congelar **todo** o vocabulário que cruza fronteira, antes de qualquer implementação (Phase-0
Contract Lock do `CLAUDE.md`). Nasce, tudo aditivo, nenhum call-site migrado (`buildCommand`
continua vivo):

- `providers/{ProviderDef.ts, registry.ts, defs/{claude,codex,opencode}.ts}` com
  `PROVIDER_DEFS: Record<ProviderKind, ProviderDef>` (§4.7), incluindo os campos de MCP.
- `ProviderDetector` estendido para devolver `caps` (probe `helpArgs` × `capabilityFlags`).
- `types/AgentInput.ts` — `BaseAgentInputSchema` (com `ownerId: z.uuid()`), `AgentInputEnvelope`,
  `AgentInputSchemaConstraint` (§4.6) — e `z.agentInput()` em `core/src/utils/schema/ExtraTypes.ts`.
- `types/AgentMcpInvocation.ts` (§4.2) + a **assinatura** de `RunTokenService`
  (`mint`/`verify`/`revoke`, §4.4) — só o contrato nesta fase, a implementação nasce na Fase 6.
- `enums/TransportStopKind.ts` — o subtipo `AUTH_REQUIRED | SERVER_ERROR` do `StopKind` do wire
  (§4.3). **Não é enum novo**: é `type` + `as const` sobre o value-set já congelado.
- `events/` — `AgentMessageEvent`, `AgentToolCallEvent`, `AgentUsageEvent` e a união
  `AgentTurnFact` (§4.3), **antes** do codec.
- Wire: `agent-model-id.tsp` (`DEFAULT|SONNET|OPUS|HAIKU`) e `agent-stop-reason.tsp`
  (`END_TURN|MAX_TOKENS|STOP_SEQUENCE|TOOL_USE|PAUSE_TURN|REFUSAL|UNKNOWN`); `FactSource`
  (`DECLARED|INFERRED`); `AgentToolName` (as quatro tools `codedm__*`).
- **Contrato das tools MCP**: os quatro schemas Zod de input (§4.4), sem nenhum campo de identidade.
- `enums/AgentName.ts`.

**AC-1.1** Teste unitário por provider: `buildArgs` do claude produz **exatamente** o argv do spec
(`2026-07-26-agent-driving-stream-json.md:14-18`), incluindo: `--resume` e `--session-id` mutuamente
exclusivos; `--include-partial-messages` **só** quando `caps.partialMessages`; `--mcp-config` +
`--allowedTools` **só** quando `request.mcp` está presente **e** o def declara os flags; `--model`
**omitido** quando `AgentModelId.DEFAULT`.
**AC-1.2** `git grep -n "let \|Map(" -- packages/api/typescript/src/*/providers` não revela estado de
módulo mutável lido dentro de `buildArgs`; teste prova que duas chamadas com `caps` diferentes
produzem argvs diferentes **sem** nenhuma mutação global entre elas.
**AC-1.3** Teste de exaustividade: `Object.keys(PROVIDER_DEFS)` é igual ao value-set de
`ProviderKind` (3 valores hoje) — falha se alguém acrescentar um kind sem def.
**AC-1.4** **O buraco de tipo está fechado**: existe `packages/api/typescript/tests/architecture/agent-input.type-test.ts`
que declara um input schema via `z.agentInput({ … })` e **lê `input.cwd.length`, `input.ownerId` e
`input.issueId` sem cast**; `bun tsc` verde é a prova. `git grep -n "as any\|@ts-expect-error" -- packages/api/typescript/src/terminal` não cresce em relação ao HEAD da Fase 0.
**AC-1.5** `git grep -n "model?: string\|stopReason: string" -- packages/api/typescript/src` → **0
hits**; os dois tipos vêm de `@codedm/contracts-typescript/wire/enums`. `bun run contracts` +
`bun sdk` idempotentes 2× (`git status --porcelain` vazio na segunda).
**AC-1.6** Teste sobre o registry de tools: **nenhum** input schema contém `ownerId`, `issueId` ou
`threadId` (itera os schemas e asserta as chaves) — a identidade vem do run token (§4.4).
**AC-1.7** `AgentTurnFact` é união de **`BaseDomainEvent`**: teste com `instanceof` para cada
variante (esta é justamente a garantia que o fix do `EventHandler.ts` sustenta, §6.4).
**AC-1.8** Risco registrado no BUILD-LOG: se `codex`/`opencode` não têm modo JSONL, o def deles
declara `streamFormat: 'plain'` — **nunca** um branch no runner. Idem MCP: sem `mcpConfigFlag`.
**AC-1.9** Pin de 40 hex do medscall registrado em `.specs/codedm/source-map-and-decisions.md` (§6.1).
**AC-1.10** `bun tsc` + `bun lint` + `bun run test` + `bun e2e` verdes; **comportamento em runtime
inalterado** — nenhuma linha removida em `services/TerminalLLMRunner/`
(`git diff --stat <base-da-fase>..HEAD -- packages/api/typescript/src/terminal/services/TerminalLLMRunner`
mostra `0 deletions`). O `git diff --stat` da fase só pode conter arquivos **novos** mais esta
**allowlist explícita de arquivos existentes** — porque a própria fase manda editá-los:
| Arquivo existente | Por que aparece no diff |
|---|---|
| `src/terminal/services/ProviderDetector/**` | estendido para devolver `caps` (§4.7) |
| `core/src/utils/schema/ExtraTypes.ts` (+ `core/src/utils/schema/index.ts` se houver barrel) | ganha `agentInput()` (§4.6) |
| `src/terminal/enums/index.ts` · `src/terminal/events/index.ts` · `src/terminal/types/index.ts` | barrels dos artefatos novos |
| `packages/contracts/wire/**` + `packages/contracts/generated/**` | enums novos + regen |
| `packages/client/dist/**` | **a AC-1.5 EXIGE `bun sdk`**, que regenera a SDK a partir da openapi — reescrever arquivos rastreados aqui é consequência mecânica, não escolha. Conteúdo 100% de gerador; a prova é a idempotência 2×. |
| `.specs/codedm/**` | a AC-1.9 manda escrever o pin do medscall em `source-map-and-decisions.md` e a regra 7 da §8 manda uma entrada por fase no `BUILD-LOG.md` — **ambos arquivos existentes**. Sem isto a fase é impossível de cumprir. |
| `packages/api/typescript/package.json` | só se um dep novo entrar (não esperado) |
Qualquer arquivo existente **fora** desta lista aparecendo no diff é violação da AC — reverter ou
justificar no BUILD-LOG com o motivo estrutural.

> **Duas linhas desta allowlist (`client/dist/**` e `.specs/codedm/**`) foram acrescentadas DEPOIS da
> execução da Fase 1**, que provou a lista original auto-contraditória: as ACs 1.5 e 1.9 mandam tocar
> exatamente os caminhos que a AC-1.10 proibia. Registro em vez de correção silenciosa, porque a lição
> é a que vale: **uma allowlist de diff tem de ser derivada das outras ACs, não escrita por intuição.**
**AC-1.11** **O seam continua sem identidade** (§4.2) — **só a metade que EXISTE ao fim da Fase 1**:
`types/AgentMcpInvocation.ts` está definido; a assinatura de `RunTokenService` (`mint`/`verify`/`revoke`)
existe **sem implementação**; `AgentRunRequest` não declara `ownerId`/`issueId`/`threadId`; e
`git grep -nE "ownerId|issueId|threadId" -- packages/api/typescript/src/terminal/providers` → **0 hits**.
**A metade do runner NÃO roda aqui** e foi movida para a **AC-6.12**: `services/AgentRunner/` só nasce
na Fase 2/3 e `types/Agent.ts` só na Fase 5, então um pathspec sobre eles sairia `fatal:` (que **não**
é "0 hits") — grep com pathspec inexistente **não conta como AC cumprida** em lugar nenhum deste
documento.

### Fase 2 — `StreamJsonCodec` + `run()` por baixo do token antigo

Codec JSONL line-buffered (~150 LOC) + `StreamJsonAgentRunner.run()` + o
`StreamJsonToTurnFactAccumulator` (fold puro, §4.3). `TerminalLLMRunner.generate`/`stream` viram
**adaptadores finos** sobre `run()` — os dois consumidores atuais não mudam ainda.

> **EMENDA 27-jul (quarta correção de contrato) — "`generate`/`stream` viram adaptadores finos" é
> satisfazível para `generate`, e AUTOCONTRADITÓRIO para o `stream` interativo.** Descoberto ao
> implementar; registrado aqui porque a regra 2 da §8 proíbe reinterpretar AC em silêncio.
>
> **O que a frase pede, e onde ela colide consigo mesma.** `stream()` tem duas metades hoje:
> `streamOneShot` (pipes, providers não-claude) e `streamClaudeSession` (o motor PTY + tail de
> transcript). Rotear a metade PTY por `run()` **nesta fase** viola, ao mesmo tempo, as outras duas
> cláusulas desta mesma fase:
> - *"os dois consumidores atuais não mudam ainda"* — `RunTerminalSession` consome o union
>   `TerminalRuntimeEvent` (`session`, `killed`, `action`, `turn_completed`, `output`, `exit`). O
>   stream-json **não produz** `action` (não existe linha de TUI para parsear — o `--output-format
>   stream-json` é justamente o que deleta o parser de TUI) e o `TuiActionType` que o tipa só morre na
>   Fase 3. Trocar o transporte muda o conjunto de variantes que o consumidor observa, que **é** o seu
>   comportamento visível.
> - **AC-2.6, *"comportamento visível inalterado"*** — e mais concretamente: as 6 suítes do motor PTY
>   (`ClaudeCliTerminalLLMRunner.{,concurrent,crash,eviction,prewarm,trust-prompt}.test.ts`) exercitam
>   `stream()` com um spawner falso. Rotear a metade PTY as tornaria vermelhas em massa — e apagá-las
>   é, literalmente, entrega da **Fase 3** (*"Deletar … o subtree PTY inteiro"*).
>
> **Resolução, fixada — a fase entrega o adaptador ONDE ele é o transporte inteiro:**
> - **`generate()` vira adaptador COMPLETO sobre `run()`** — corpo inteiro substituído: monta o
>   request com `outputSchema`, draina `run()`, devolve `result.output`. É o caso que a §4.2 já
>   descreve verbatim (*"Classificação = `run({…, outputSchema, messages:[oneUserMessage]})`, sem
>   `mcp`"*). `IssueClassifier` **não muda** e continua recebendo objeto validado ou erro nomeado.
>   `extractJson` sai do caminho de execução (a deleção do símbolo continua sendo Fase 3).
> - **`stream()` NÃO é roteado nesta fase.** A metade PTY continua intacta até a Fase 3, que é a fase
>   contratualmente encarregada de virar `RunTerminalSession` para `AgentRuntimeEvent` **e** apagar o
>   subtree. Fazer as duas coisas juntas lá é uma mudança coerente; fazer meia aqui é uma quebra.
>
> **Por que isto NÃO é afrouxamento, e o teste que prova:** o risco real que a frase queria eliminar é
> "a fase constrói o codec e não pluga nada por baixo do token antigo", que foi exatamente a falha da
> primeira tentativa. Esse risco é fechado por `generate()`, e fechado com sujeito verificável —
> `ClaudeCliTerminalLLMRunner.generate.test.ts` asserta que a chamada agora sobe argv **stream-json**
> (`--input-format` / `--output-format stream-json` / `--verbose`), que o prompt vai por **stdin** como
> linha JSONL, e que os dois erros nomeados (`CLASSIFICATION_FAILED` / `TERMINAL_SPAWN_FAILED`)
> continuam sendo os mesmos que o consumidor já tratava. A frase da Fase 3 (*"`IssueClassifier` →
> `run({ outputSchema })`"*) continua valendo: lá o consumidor passa a chamar `run()` **direto** e o
> adaptador morre junto com `generate`.

> **EMENDA 27-jul — o gate JÁ RODOU (`bf217a2a`) e o resultado é vinculante.** O smoke real está
> commitado em `.specs/codedm/phase2-smoke/`; **não re-rodá-lo** e **não reabrir a taxonomia**. As
> divergências medidas foram dobradas no corpo do documento: §4.3 (taxonomia `AgentFrame`, regras 5,
> 8 e 9), AC-2.1 e AC-2.2. Ler §4.3 **depois** das emendas, não antes.
>
> **O orçamento de ~150 LOC continua valendo, mas cobre um passo a mais do que parecia:** o fan-out
> sobre `message.content[]` (D3). `tool_use`/`tool_result`/`text`/`thinking` são content blocks, não
> frames — se ao implementar o codec o fan-out estourar o orçamento, **o orçamento cede, a taxonomia
> não**. "~150 LOC" é estimativa, as regras da §4.3 são contrato.

**Decision gate obrigatório antes de codificar** (o padrão medscall de "validar o adapter upstream
antes de construir sobre ele"): script de smoke em **`.specs/codedm/phase2-smoke/`** que roda o
`claude` **instalado de verdade**, **num processo filho independente** (`child_process.spawn`, sem
herdar o ambiente da sessão que estiver executando este goal), e captura as sequências de frames de
que o codec vai depender. Se o shape divergir do spec, **registrar no commit e no BUILD-LOG** e
ajustar a taxonomia — o spec é estudo de produto de terceiro, não observação nossa.

> **Caminho de diretório: use `phase2-smoke/`.** O `.specs/codedm/phase10-smoke/` que existe no repo
> é **resíduo da numeração antiga de fases** (o plano `2026-07-22-phase10-foundation-terminal-extraction.md`),
> **não** é para ser reusado nem apagado. Convenção deste goal: `.specs/codedm/phase<N>-smoke/`,
> com o `<N>` da fase **deste** documento — `phase0-smoke/`, `phase2-smoke/`, `phase6-mcp-smoke/`.

**Regra de saída do smoke real (§8, regra 8-bis) — vale aqui integralmente.** Se o `claude` não
estiver no PATH, estiver deslogado, ou a invocação for barrada por aninhamento: registrar
**`ATTEMPT-FAILED`** no BUILD-LOG com o comando e o erro literais, seguir com os frames **enlatados
derivados do spec** (`2026-07-26-agent-driving-stream-json.md:14-25`), marcar **só a AC-2.1** como
`PARKED-com-findings`, e **continuar a fase**. AC-2.2 a AC-2.7 **não degradam** — elas rodam sobre
frames enlatados por construção e continuam sendo gate duro.

**AC-2.1** ✅ **CUMPRIDA em `bf217a2a`** (não credita a tentativa seguinte de codec; ver a nota de
reconciliação da §8 regra 1). Artefato de smoke commitado com frames **reais**, cobrindo no mínimo:
`system_init`, `assistant_text`, `tool_use`, `tool_result`, o `result` terminal com `stop_reason`,
**o agregado de `usage`** e um caso com **`parent_tool_use_id` não-nulo** vindo de um sub-agent real.
**Única AC degradável desta fase** — se o `claude` real não for alcançável, ver a regra de saída
acima: os frames enlatados passam a ser derivados do spec e **carimbados no cabeçalho do arquivo**
como `SOURCE: spec-derived (ATTEMPT-FAILED)`, nunca apresentados como observação nossa.

> **EMENDA 27-jul (D4/D5).** O texto original pedia um **frame `usage`** e chamava o sub-agent de
> `Task`. Os dois eram insatisfazíveis como escritos e foram corrigidos acima:
> **(a)** não existe frame `usage` — o que se exige é o **agregado** (`usage` no frame terminal
> `result`), e é isso que a captura tem;
> **(b)** o sub-agent é despachado por uma tool **emitida** com o nome `Agent`, enquanto
> `system/init.tools` anuncia `Task` (medido: `'Task' in tools` → `True`, `'Agent' in tools` →
> `False`, e o bloco `tool_use` emitido tem `name: "Agent"`). Nome anunciado e nome emitido
> **discordam** neste build. **Nada pode chavear em nenhum dos dois literais** — a relação de
> sub-agent é carregada por `parent_tool_use_id`, que é independente de nome.

**AC-2.2** Testes do codec sobre frames enlatados: turno normal; **fan-out de `content[]`** (um
frame `assistant` com vários blocos vira vários `AgentFrame`; `tool_result` sem `is_error` é
`ok: true`; `tool_result.content` aceita string **e** array); um sub-agent cujo trabalho **não**
fecha o run; `stopReason === TOOL_USE` não fecha; `tool_use` órfão vira `AgentToolCallEvent` FAILED
no `flush()`; JSON truncado a meio de linha; linha não-JSON ignorada sem derrubar o drain; **e frame
bem-formado de tipo DESCONHECIDO descartado em silêncio sem abortar o drain** (§4.3 regra 9 — usar
`system/hook_response` e `rate_limit_event`, que aparecem nas quatro capturas reais).

> **EMENDA 27-jul (D1/D5/D6) — três correções, e a primeira muda o que o teste prova.**
> **(a)** A parte "sub-agent cujo `end_turn` **não** fecha o run (guarda `parent_tool_use_id`)"
> descrevia um modo de falha que **não existe** neste build: o sub-agent **não emite frame `result`
> nenhum**, e `stop_reason` é `null` em **todos** os frames `assistant` do corpus. O risco real é o
> **oposto** — o run **nunca** fechar (§4.3 regra 5). O teste deve provar que o **escopo** do
> sub-agent não contamina o transcript do agent principal (chaveado por `parent_tool_use_id`) **e**
> que o único frame `result` fecha o turno. Manter também um caso sintético com
> `stopReason === TOOL_USE`, ciente de que ele é **não-falsificado** e não medido.
> **(b)** As fixtures **não podem** codificar `Task` como nome de tool (ver AC-2.1 emenda (b)).
> Nenhuma asserção pode chavear no nome — só em `parent_tool_use_id`.
> **(c)** O caso de frame desconhecido foi promovido de implícito a **exigido**: é a regra que
> mantém runs reais vivos em máquinas com hooks configurados.
**AC-2.3** Structured output validado no evento terminal; falha → `failed: true`, **nunca** throw —
teste que **drena até o fim** depois da falha e conta os eventos.
**AC-2.4** Guarda anti-double-publish testada: frames `tool_use`/`tool_result` com prefixo
`codedm__` produzem **frame e nenhum fato** (§4.3, regra 3).
**AC-2.5** O accumulator é **puro**. Dois passos, e o **primeiro não é opcional**:
   **(a) PRECONDIÇÃO DE EXISTÊNCIA** — `packages/api/typescript/src/terminal/services/StreamJsonCodec/`
   existe e contém, no mínimo, o codec (`LineBuffer` + `FrameDecoder` + `StreamJsonCodec`) e o
   `StreamJsonToTurnFactAccumulator`; **e** o `AgentRunner` com `run()` existe fora dessa pasta.
   **(b)** só então: `git grep -n "child_process\|spawn(\|fs\." -- packages/api/typescript/src/terminal/services/StreamJsonCodec` → **0 hits**.

> **EMENDA 27-jul — a AC-2.5 passava VACUAMENTE e por isso ganhou o passo (a).** Como escrita
> originalmente ela era só o `git grep` do passo (b), e um `git grep` sobre um diretório **inexistente**
> retorna 0 hits e **exit code 1**: uma fase que não construiu nada pontuava verde nela. Foi exatamente
> o que aconteceu na primeira tentativa da Fase 2, em que a pasta não existia. Pureza de um artefato
> ausente não é pureza — é ausência, e as duas **têm de** ser distinguíveis pelo checador. Regra geral
> que fica registrada para as demais fases: **toda AC cujo instrumento é um grep NEGATIVO precisa de
> uma precondição POSITIVA de existência do sujeito**; caso contrário ela mede o vazio.

**AC-2.6** `bun tsc` + `bun run test` + `bun e2e` verdes — comportamento visível inalterado.
**AC-2.7** *(acrescentada em 27-jul pela divergência D4; §4.3 regra 8)* **O fato de uso é cunhado uma
única vez e não é lossy.** Sobre uma sequência enlatada com **múltiplos** frames `assistant`, cada um
carregando seu próprio `message.usage`, mais o frame terminal com o agregado: o accumulator emite
**exatamente UM** `AgentUsageEvent`, e seus quatro campos são os do **agregado terminal** — nenhuma
soma das cópias por-assistant. O teste usa os números reais medidos
(`input_tokens: 2`, `cache_creation_input_tokens: 9188`, `cache_read_input_tokens: 15273`) e asserta
que **`cacheCreationInputTokens` e `cacheReadInputTokens` chegaram ao evento** — é a asserção que
falharia contra o contrato congelado na Fase 1 e que prova que a correção de D4 foi aplicada de
ponta a ponta, e não só no schema.

### Fase 3 — Virar os dois consumidores e matar o split

`IssueClassifier` → `run({ outputSchema })`. `RunTerminalSession` → consome `AgentRuntimeEvent`.
**Deletar** `generate`, `AgentGenerateRequest`, `extractJson`, `mergeLineStreams`, o parâmetro
`mode`, o subtree PTY inteiro, `SessionPrewarm`, os enums de TUI, `getSession`/`killSession`/
`prewarm`, `TerminalSessionIdleEvictedEvent`. Process-group kill + `shutdown()` declarado no seam.

**AC-3.1** `AgentRunner` tem **um** método de execução (`run`) + `shutdown`. Teste de reflexão sobre
a classe abstrata listando os membros; `git grep -n "generate(\|prewarm(\|getSession(\|killSession(" -- packages/api/typescript/src` → **0 hits**.
**AC-3.2** **O rail de import-graph isolation JÁ EXISTE e é ESTENDIDO — não se cria arquivo novo.**
Verificado: ele vive em **`packages/api/typescript/tests/architecture/pty-isolation.test.ts`**
(*"Import-graph isolation test (whatscode AC-13, adapted to the Fork-D2 rewrite)"*), está **vivo e
com enforcement**, e hoje confina duas famílias de literais — `FORBIDDEN_PTY_REFS =
['new Bun.Terminal', "from 'node-pty'"]` e `FORBIDDEN_PATH_REFS = ['~/.claude/projects', ".claude', 'projects'"]`
— a tudo que **não** está sob `ALLOWED_PREFIX = <SRC>/terminal/services/TerminalLLMRunner/ClaudeCliTerminalLLMRunner`,
varrendo `packages/api/typescript/src` (não-teste, pulando `node_modules`/`dist`/`__fixtures__`).
**Criar um `ImportGraphIsolation.test.ts` paralelo seria um rail duplicado com duas verdades — é
violação, não entrega.** O trabalho desta fase é editar **este** arquivo:
&nbsp;&nbsp;(a) **`ALLOWED_PREFIX` deixa de excusar o subtree PTY** (que morre nesta fase, AC-3.5) e
passa a apontar para **`<SRC>/terminal/services/AgentRunner`** — o caminho **da Fase 3, não o da
Fase 5**: o `git mv terminal → agent` só acontece na Fase 5, e é a **Fase 5 (AC-5.9)** que troca
essa constante para `<SRC>/agent/services/AgentRunner`. Escrever `agent/` aqui faria a AC
falhar por construção. As constantes de caminho ficam **todas juntas no topo do arquivo**
(`ALLOWED_PREFIX` + o `ALLOWED_SPAWN_PREFIXES` de (b)) — a Fase 5 troca `terminal/` por `agent/`
nesse bloco e em mais nada.
&nbsp;&nbsp;(b) **`node:child_process` entra como terceira família confinada** — nasce
`FORBIDDEN_SPAWN_REFS = ["from 'node:child_process'", "require('node:child_process')"]`. **Esta
família NÃO usa o `ALLOWED_PREFIX` das outras duas** — ela tem o seu próprio allowed-set, com
**dois** prefixos, e isso é decisão fechada aqui para o executor não ter de inventá-la às 3h:

```ts
// Spawn é uma capacidade mais larga que PTY: DOIS módulos legitimamente criam processo.
const ALLOWED_SPAWN_PREFIXES = [
	join(SRC, 'terminal/services/AgentRunner'),      // Fase 5 (AC-5.9): 'agent/services/AgentRunner'
	join(SRC, 'terminal/services/ProviderDetector'), // Fase 5 (AC-5.9): 'agent/services/ProviderDetector'
]
```

**Por que o `ProviderDetector` entra no allowed-set (e não vira exceção nomeada, nem se muda de
lugar):** ele importa `spawnSync` hoje (`SystemProviderDetector.ts:2`) e a §5.3 o marca **FICA** —
mais: a Fase 1 o **estende** para probar `helpArgs` × `capabilityFlags` e devolver `caps`, isto é,
ele **tem** de continuar spawnando, e spawna **antes** de qualquer run existir. Movê-lo para baixo de
`services/AgentRunner/` inverteria a dependência (o runner passaria a conter a detecção que o
precede) e uma exceção por-arquivo envelheceria em fóssil no primeiro rename. O invariante que o
rail protege continua verdadeiro e fica escrito no cabeçalho do teste: **`spawn` de um CLI de
provider só existe em dois lugares — quem DETECTA o binário e quem EXECUTA o turno.** Qualquer
terceiro arquivo importando `node:child_process` é violação.

Os outros dois importadores vivos hoje — `services/TerminalLLMRunner/oneshot.ts:13` e
`services/TerminalLLMRunner/ClaudeCliTerminalLLMRunner/spawner.ts:21` — **morrem nesta mesma fase**
(§5.3, AC-3.5), então o rail fecha em 0 violadores sem nenhum trabalho extra. (Verificado: os
comentários de `SystemProviderDetector.ts:83` e `oneshot.ts:11` mencionam `node:child_process` em
prosa, mas **não** casam os literais — o padrão é `from '…'`/`require('…')`, import real.)
Esta é a metade que o rail ainda **não** tinha, e é o que o critério 4 da §9 cobra.
&nbsp;&nbsp;(c) Escopo do walk **permanece** `packages/api/typescript/src` — não alargar para
`packages/app`/`packages/e2e` dentro deste teste (ele é re-rooted na `src` do pacote por
construção). A varredura repo-wide de `Bun.Terminal`/`node-pty`/`claude/projects` é um **grep de
AC**, não o teste: `git grep -nE "new Bun\.Terminal|from 'node-pty'|claude/projects" -- packages/api/typescript/src packages/api/typescript/core/src packages/app packages/e2e`
→ **0 hits**. `.specs/` e `.plans/` estão **fora do escopo**: são registro histórico (o
`BUILD-LOG.md` e o `.plans/2026-07-22-phase10-foundation-terminal-extraction.md` citam `node-pty` e
`Bun.Terminal` de propósito, e reescrever histórico é proibido).
&nbsp;&nbsp;Hoje as referências vivas em código são `terminal/registry.ts:17` (comentário) e
`SystemProviderDetector.ts:82` (comentário obsoleto, já previsto na §5.3) mais o subtree PTY
inteiro, que morre nesta fase. Note que o rail casa **`new Bun.Terminal`** (construção), não o nome
nu — docstrings que **descrevem** o engine Fork-D2 são legítimas e continuam sendo; o grep da AC usa
o mesmo padrão, para não divergir do teste.
&nbsp;&nbsp;**`node-pty` NÃO é dependência do repo** — verificado: `git grep -n "node-pty" -- '*package.json' bun.lock`
→ **0 hits** (o Fork D2 trocou por `Bun.Terminal` nativo). Portanto **não há dependência a remover**
do `package.json`/`bun.lock` nesta fase, e a §5.3 está correta ao listar só o subtree. Se o executor
encontrar `node-pty` no `package.json`, isso é drift novo — registrar no BUILD-LOG antes de mexer.
**AC-3.3** Cancelamento: teste que mata um run e prova que **nenhum descendente do grupo sobrevive**
(spawna um filho que spawna neto; asserta via `ps`/`process.kill(pid,0)` que ambos morreram).
**AC-3.4** Nenhum `as any` / `@ts-expect-error` **novo** (diff contra o HEAD da Fase 2); o
duck-typing do shutdown em `src/index.ts` sai — `git grep -n "await import(" -- packages/api/typescript/src/index.ts` → **0 hits** no passo de shutdown.
**AC-3.5** LOC do subtree PTY = 0: `packages/api/typescript/src/terminal/services/TerminalLLMRunner/ClaudeCliTerminalLLMRunner/` não existe.
**AC-3.6** `bun tsc` + `bun lint` + `bun run test` + `bun e2e` verdes. **A parte de gates é dura e
não degrada.** A segunda metade — **smoke registrado** em `.specs/codedm/phase3-smoke/` (mensagem
inbound → issue → reply, com `claude` real) — segue a **regra 8-bis** (§8): tentar; se falhar por
ausência/auth/aninhamento, registrar `ATTEMPT-FAILED` com o erro literal, marcar **só a metade de
smoke** desta AC como `PARKED-com-findings` e **continuar a fase**. O substituto obrigatório nesse
caso é o caminho determinístico equivalente pelo `E2eStubAgentRunner` (inbound → issue → reply sob
`CODEDM_E2E`), que **não** é degradável.

**AC-3.7** **Baseline do `registry-scan` re-ratchetada depois da deleção** — esta fase apaga ~4000
LOC e renomeia `usecases/RunTerminalSession.ts` → `usecases/RunIssueTurn.ts`, o que mata **2** chaves
de `scripts/detectors/registry-scan.baseline.json`
(`…/src/terminal/usecases/RunTerminalSession.ts::schema#bp-01` e `::usecase#bp-11`). Rodar
`bun detect:baseline`, commitar o arquivo, e provar
`git grep -c "RunTerminalSession" scripts/detectors/registry-scan.baseline.json` → **0** e
`bun detect` verde. Chaves **novas** que a re-baseline introduzir vão listadas no BUILD-LOG com o
motivo — ratchet só desce.
**AC-3.8** **Nenhum allowlist de liveness ficou fóssil**: `bun test packages/api/typescript/tests/architecture/allowlist-liveness.test.ts`
verde. (Verificado no HEAD da Fase 0: nem `slice-closure.allow.yaml` — hoje `allow: []` — nem os
`EXEMPTIONS` de `console`/`event-name`/`probe`/`tx-discipline` nem as `exceptions` do
`import-direction` citam `src/terminal/`, então **nada** deveria quebrar aqui. Se quebrar, é drift
novo: registrar no BUILD-LOG antes de mexer.)

### Fase 4 — Sessão durável e resume

`AgentSession` (rename + `model` + `lastMessageId` + `resumeDecision`), migration em
`db/schema-sqlite/`, repositório e queries.

**Esta fase é dona do rename de tabela (§5.1): UMA migration** faz
`terminal_terminal_llm_sessions → agent_agent_sessions`, `claudeSessionId → agentSessionId` e as duas
colunas novas. **A Fase 5 não emite migration** — lá é `git mv` de código e DI.

**AC-4.1** Testes de repositório (env `integration`, agora sobre `SqliteDriver` em memória) para as
colunas novas — `save`/`findByIssueId` cobrindo `agentSessionId`, `model`, `lastMessageId`.
**AC-4.2** Testes unitários das 4 guardas de invalidação, **uma por razão** (`model_changed`,
`cwd_changed`, `missing_cursor`, `conversation_advanced`).
**AC-4.3** **e2e multi-turno**: duas mensagens inbound na mesma issue; a segunda faz `--resume` do
`agentSessionId` persistido — provado por asserção sobre o argv (via stub) **e** pelo estado da linha.
**AC-4.4** Nenhum reset de sessão silencioso: teste provando que toda invalidação registra a razão
(log estruturado ou `AGENT_RESUME_INVALIDATED`).
**AC-4.5** `git grep -n "claudeSessionId\|listRecentForPrewarm" -- packages/api/typescript/src` → **0 hits**.
**AC-4.6** `bun tsc` + `bun run test` + `bun e2e` verdes. **E, se — e somente se — esta fase criar o
código `AGENT_RESUME_INVALIDATED`**, ela paga o ripple INTEIRO da §5.1 aqui, não duas fases depois:
`bun sdk` idempotente 2× + `react tsc` verde também. Motivo: as paradas 3 e 4 do ripple (locales +
regen da SDK) só são apanhadas por `react tsc`, que **não** está no gate padrão desta fase — sem esta
cláusula a Fase 4 fecha verde com o `react tsc` vermelho e o estrago só aparece no AC-6.8/AC-7.2. **A
saída preferida continua sendo não criar o código** (log estruturado, permitido pelo AC-4.4): aí nada
disso se aplica e o ripple inteiro vive na Fase 6 com os outros dois códigos.
**AC-4.7** **O rename de tabela fechou NESTA fase, em uma migration só**:
`git grep -n "terminal_terminal_llm_sessions" -- packages ':!*/migrations/*'` → **0 hits de código
vivo**; `agent_agent_sessions` existe em `db/schema-sqlite/`; e
`git diff --stat <base-da-fase>..HEAD -- packages/contracts/db/schema-sqlite/migrations`
mostra **exatamente um** arquivo SQL novo. A Fase 5 não pode acrescentar migration alguma.

> **CORREÇÃO DE CONTRATO (executor da Fase 4, 27-jul) — o grep original pedia `-- packages` sem
> exclusão, e isso é INSATISFAZÍVEL, não "quase satisfazível".** O nome antigo é criado pela migration
> `0000_flaky_carmella_unuscione.sql`, que é IMUTÁVEL por construção: o ledger `_sqlite_migrations` é
> chaveado por FILENAME e o gate de paridade byte-a-byte contra a cópia `//go:embed` do Go compara
> conteúdo — reescrever 0000 dessincronizaria todo banco já migrado e romperia o gate. Medido no
> fechamento da fase: **20 hits, todos em história imutável** — 4 em
> `contracts/db/schema-sqlite/migrations/0000_*.sql`, os mesmos 4 na cópia derivada
> `api/go/core/db/sqlite/migrations/0000_*.sql`, 5 em `meta/0000_snapshot.json` e 5 em
> `meta/0001_snapshot.json` (snapshots do drizzle-kit, reescrevê-los quebra o `generate` seguinte).
> Restam **2 hits fora de `migrations/`** e ambos são a frase *"renomeado de X para Y"* —
> `contracts/db/schema-sqlite/agent.ts` e `src/shared/contexts.ts` — deliberadamente mantidos: apagar
> o nome antigo do WHY de um rename é apagar a única pista de quem for ler o `0000` amanhã. O que a AC
> mede é **referência VIVA** (tabela lida/escrita pelo nome antigo), e é isso que o grep acima checa.

**AC-4.8 (nasceu do conserto da AC-4.7 — o pgSchema anda junto com a TABELA, não com a pasta)**
`CONTEXTS.terminal.pgSchema === 'agent'` já **nesta** fase, com a chave ainda `terminal`.

> **CORREÇÃO DE CONTRATO (executor da Fase 4, 27-jul).** A §5.1 alocava a linha inteira
> `CONTEXTS.terminal: { pgSchema: 'terminal' }` → `CONTEXTS.agent: { pgSchema: 'agent' }` à Fase 5,
> junto do `git mv`. Isso e a AC-4.7 são **mutuamente exclusivos**: dois rails de arquitetura cruzam
> `CONTEXTS[*].pgSchema` com a realidade e ficam VERMELHOS durante o intervalo inteiro entre as duas
> fases. Medido antes do conserto, com a tabela já renomeada e a `contexts.ts` intocada:
>
> ```
> ✗ pgSchema parity: declared CONTEXTS pgSchemas == contracts/db/schema-sqlite table-name prefixes
>     + "agent",   (em contracts, não declarado)
>     - "terminal" (declarado, sem nenhuma tabela `terminal_*` restante)
> ✗ every cross-schema table read has a declared TABLE_READ_EDGES entry
>     terminal/repositories/AgentSessionRepository/DrizzleAgentSessionRepository.ts:4
>       terminal → agent (table agentSessions)
> ```
>
> Nenhuma das duas saídas alternativas é aceitável: adicionar `agent` a `PENDING_PGSCHEMAS` deixaria
> `terminal` declarado sem tabela alguma (o rail exige conjunto IGUAL nos dois sentidos), e declarar um
> `TABLE_READ_EDGES` `terminal → agent` registraria como acoplamento cross-contexto o que é o contexto
> lendo a PRÓPRIA tabela. Então o rename se parte no eixo certo: **o VALOR `pgSchema` migra na fase em
> que a TABELA migra (4), a CHAVE migra na fase em que o DIRETÓRIO migra (5)**. A Fase 5 continua dona
> da chave, do `git mv`, do `ANNOTATED_CYCLES` e do `name: CONTEXTS.agent` — nada foi retirado dela.

**AC-4.9 (correção da assinatura de `resumeDecision` — §4.10)** A `ctx` carrega **três** campos:
`{ model: AgentModelId; cwd: string; cursor?: string }`.

> **CORREÇÃO DE CONTRATO (executor da Fase 4, 27-jul).** A §4.10 escreve
> `resumeDecision(ctx: { model, cwd })` e, duas linhas acima, exige que ESSE método decida as quatro
> razões. Com dois campos ele decide **duas**: `model_changed` e `cwd_changed` comparam `ctx` contra a
> linha, e `missing_cursor` é estado puro da linha (`lastMessageId` ausente) — mas
> `conversation_advanced` **não é decidível a partir de nada que a entidade veja**. Ela afirma que a
> conversa andou ALÉM do que a sessão do CLI consumiu, e "onde a conversa está agora" é observação de
> fora. Sem o terceiro campo a quarta guarda ou não existe ou vira um `return false` mudo — exatamente
> o reset silencioso que a AC-4.4 proíbe. `cursor` é a posição de onde ESTE turno continua: o último
> entry do transcript DA ISSUE antes da mensagem sendo alimentada, calculado por
> `RunTerminalSessionOnClassification.conversationCursor` (issue-scoped de propósito — uma mensagem
> roteada para uma issue irmã nunca chegou a esta sessão e não pode invalidá-la). `undefined` falha
> fechado, nunca resume por omissão.

**AC-4.10 (onde a "e2e multi-turno" da AC-4.3 mora, e por quê)** A prova multi-turno é
`packages/api/typescript/tests/flows/agent-session-resume.flow.test.ts`, no env `integration`.

> **CORREÇÃO DE CONTRATO (executor da Fase 4, 27-jul).** A AC-4.3 pede duas provas do mesmo fato — **o
> argv** e **o estado da linha** — e **nenhuma das duas é observável do navegador**. O harness
> Playwright fala com o daemon por HTTP; expor um argv ou uma linha de `agent_agent_sessions` na wire
> só para poder assertar sobre eles criaria superfície de API test-only que este goal não autoriza (e
> que a §8 regra 5 cobraria na OpenAPI). Então o "end to end" desta AC é o end-to-end do próprio
> daemon: repositório real, transcript real, handler real, `ProviderDef` real, SQLite real, e só o
> BINÁRIO estubado (§8 regra 8). O argv é construído passando a request capturada por
> `claudeProviderDef.buildArgs` — a mesma função que o `StreamJsonAgentRunner` chama — e não por
> asserção sobre `request.session`, que passaria mesmo se `buildArgs` engolisse a flag. A suíte
> Playwright segue em **5 passed / 2 skipped**, inalterada.

### Fase 4.5 — Um runner por CLI; `ProviderDef` morre (emenda do founder, 27-jul)

> **Por que existe.** O founder revisou a estrutura entregue nas Fases 1-3 e apontou erros. Dois são
> estruturais e têm de ser corrigidos **antes** da Fase 5, porque ela faz `git mv terminal → agent` e
> mover a estrutura errada para depois reestruturar é trabalho duplicado.

**(1) `providers/` e `mcp/` são pastas ilegais num bounded context.** A lista de cidadãos do repo
(`CLAUDE.md`) tem `services/`, não `providers/` nem `mcp/`. Ambas viram `services/`.

**(2) `ProviderDef` é a abstração errada e é REDUNDANTE com o `AgentRunner`.** O goal declarava duas
regras que **não coexistem**: *"diferença de capacidade vive em DADO, nunca como branch no runner"* e,
ao mesmo tempo, defs de `codex`/`opencode` com `streamFormat: 'plain'`. Formato de stream **não é
argv — é outro caminho de parsing**; um runner só não honra isso sem branchear, que a própria regra
proíbe. A contradição se resolve matando a abstração, não a regra.

O padrão "literal de dados" veio do open-design, onde paga por dirigir **26 CLIs homogêneos**. Aqui são
**3**, e dois precisam de parse diferente — a pré-condição do padrão não existe.

**A unidade de variação é o CLI, não o formato.** Nada de `StreamJsonAgentProvider` /
`PlainTextAgentProvider`: agrupar por transporte presume que dois CLIs cuspindo JSONL cospem o MESMO
JSONL, o que é falso (o claude tem `--session-id`/`--resume`, `--mcp-config` e as anomalias que a Fase 2
mediu; o codex terá as suas). Esse agrupamento reintroduziria `if (provider === …)` dentro da classe.

```
services/AgentRunner/
	AgentRunner.ts          # abstrata: run() + shutdown(), e nada mais
	ClaudeAgentRunner/      # argv, frames, sessão, mcp, caps — TUDO que é do claude
	CodexAgentRunner/       # quando aterrissar, com as particularidades DELE
	StubAgentRunner/  E2eStubAgentRunner/
```

`ProviderDef`, `PROVIDER_DEFS` e `defs/*` **somem**; o conteúdo (bin, fallbackBins, versionArgs, probe
de capacidade, `buildArgs`) vira campo/método da concreta. `ProviderKind` (wire) **fica** — é o
vocabulário do domínio para "qual agent"; a DI resolve kind → runner. Detecção de binário e probe de
`caps` também são por-CLI e acompanham (só o `ClaudeAgentRunner` sabe o que
`--include-partial-messages` significa).

**O comum vira UTILITÁRIO, nunca classe base.** Ler JSONL com buffer de linha é helper que as concretas
usam; herança contrabandearia de volta a generalização que estamos removendo.

**O que se perde, conscientemente:** um 4º CLI passa a exigir uma classe em vez de um literal. É
trabalho honesto para um produto genuinamente diferente — e o literal ia precisar de um branch de
qualquer jeito.

**AC-4.5.1** `git grep -n "ProviderDef\|PROVIDER_DEFS" -- packages/api/typescript/src` → **0 hits**.
**AC-4.5.2** `packages/api/typescript/src/terminal/{providers,mcp}` **não existem**; tudo sob `services/`.
**AC-4.5.3** Nenhum branch por identidade de provider dentro de um runner:
`git grep -nE "provider ?===|ProviderKind\.(CLAUDE|CODEX|OPENCODE)" -- packages/api/typescript/src/terminal/services/AgentRunner` → **0 hits** (a resolução acontece na DI).
**AC-4.5.4** O seam segue com **exatamente** `run` + `shutdown` (o teste de reflexão da Fase 3 continua verde).
**AC-4.5.5** As asserções de argv exato da AC-1.1 sobrevivem, agora sobre `ClaudeAgentRunner`.
**AC-4.5.6** Gates completos + e2e RUNTIME + os seis detectores não crescem. Refactor puro: **zero
mudança de comportamento observável** — provar pelo diff.

### Fase 5 — O bounded context `agent`

`git mv terminal → agent`; `CONTEXTS` + `context-map` + `BoundedContext.create({ name: CONTEXTS.agent })`;
`types/Agent.ts` (consumindo o constraint da Fase 1); `agents/ClassifyIssueAgent/` +
`agents/IssueWorkAgent/`; `services/IssueRouter/`; `OpenIssueRef` migra para `thread/`; tokens DI.
**Na mesma fase**: skill `agent` + verbo `bun cli agent` (§5.4).

> **EMENDA (founder, 27-jul) — o contexto `terminal` some INTEIRO, símbolos inclusive.** O `git mv`
> move o diretório, mas 10 símbolos ainda se chamam `Terminal*` e ficariam como resíduo de um contexto
> que deixou de existir. Eles se dividem em duas categorias e **só uma delas renomeia**:
>
> **(a) Fatos do RUN — renomeiam para `Agent*`** (são domain events INTERNOS, verificado: nenhum é
> nome congelado de wire): `TerminalSessionStartedEvent`, `TerminalSessionCompletedEvent`,
> `TerminalStopRaisedEvent`, `TerminalReplyDraftedEvent`, `TerminalRunOutcome`,
> `PublishTerminalIntegrationEvents`, e `RunTerminalSessionOnClassification` — este último já é
> mentira hoje, porque o use case que ele invoca virou `RunIssueTurn` na Fase 3.
>
> **(b) A SUPERFÍCIE DE SAÍDA — não renomeia por ora**: `StreamTerminalSession` (o endpoint SSE),
> `TerminalOutputAccumulator` e `TuiActionType` descrevem o *painel de terminal* que o operador olha,
> não o agent. Continuam sob `agent/` (o contexto é dono do stream dos próprios runs), e o
> vocabulário deles é assunto da **Fase 7**, que reescreve esse frame — renomear aqui e reescrever lá
> é trabalho duplicado.
>
> **Trave dura antes de renomear qualquer coisa que cruze a wire:** os nomes de integration event são
> **congelados** (§4.3). Verificar cada um contra `packages/contracts/wire/events/` e **não tocar** —
> renomear um domain event interno é livre; renomear um nome de wire é quebra de contrato. Se algum
> nome congelado contiver "terminal", ele **fica**, e o BUILD-LOG registra por quê.
>
> **AC-5.10a** `test ! -d packages/api/typescript/src/terminal` — o diretório **não existe**.
> **AC-5.11** `git grep -nP "\bTerminal(Session|Run|Reply|Stop)[A-Za-z]*" -- packages/api/typescript/src | grep -v StreamTerminalSession`
> → **0 hits** (a categoria (a) foi inteira). A categoria (b) sobrevive e é nomeada explicitamente na
> exclusão, para a AC ser falseável.
>
> **TRÊS CORREÇÕES DE CONTRATO neste bloco, feitas na execução da Fase 5 (27-jul), com evidência:**
> 1. **`-nE` → `-nP`.** `\b` **não existe** no ERE do `git grep` no macOS (Apple git 2.50.1): a AC como
>    estava escrita retornava `0 hits` VACUAMENTE. Medido no HEAD da Fase 4.5, ANTES de qualquer
>    rename: `git grep -nE "\bTerminal(Session|Run|Reply|Stop)[A-Za-z]*" -- …/src | wc -l` → **0**,
>    enquanto o **mesmo** padrão sem `\b` → **132**. Uma AC que passa numa árvore que a viola não é uma
>    AC. Com `-nP` (PCRE) o `\b` funciona — e é ele que exclui a categoria (b) sozinho, porque em
>    `StreamTerminalSession` não há fronteira de palavra antes de `Terminal`. O `grep -v` fica assim
>    mesmo, redundante e explícito, para a AC continuar legível sem conhecer PCRE.
> 2. **A regex NÃO cobre 2 dos 7 símbolos da categoria (a).** `PublishTerminalIntegrationEvents` e
>    `RunTerminalSessionOnClassification` carregam `Terminal` no MEIO do identificador, logo
>    `\bTerminal` nunca casa neles. O texto da emenda é normativo e os dois **foram renomeados**
>    (`PublishAgentIntegrationEvents`, `RunIssueTurnOnClassification`); a AC acima mede só os outros
>    cinco. Grep complementar, para a categoria (a) ficar inteiramente mecânica:
>    `git grep -n "PublishTerminalIntegrationEvents\|RunTerminalSessionOnClassification" -- packages/api/typescript/src`
>    → **0 hits**.
> 3. **Colisão de numeração:** a emenda criou uma `AC-5.10` quando já existia outra (a re-baseline do
>    `registry-scan`, mais abaixo). Renumerada aqui para **AC-5.10a**; a pré-existente segue **AC-5.10**.
>
> **NOMES ESCOLHIDOS na execução** (a emenda fixa o prefixo `Agent*`, não a grafia):
> `AgentRunStartedEvent` / `AgentRunCompletedEvent` / `AgentRunReplyDraftedEvent` /
> `AgentRunStopRaisedEvent` (`agent.run.*`), `AgentRunOutcome`, `PublishAgentIntegrationEvents`,
> `RunIssueTurnOnClassification`. `AgentRun*` e não `AgentSession*` porque `AgentSession` já é a LINHA
> DURÁVEL por issue (Fase 4) — um `AgentSessionCompletedEvent` leria como fato sobre a linha, não sobre
> o turno — e porque `AgentReplyDraftedEvent` já é o evento de wire CONGELADO para o qual o bridge
> republica. Os tipos `Terminal*Errors` viraram `Agent*Errors` (símbolos internos); os CÓDIGOS
> `TERMINAL_*` ficam, pela §5.1.
> **AC-5.12** `git log --follow` num arquivo movido mostra história anterior ao `git mv` — o move
> preserva história, não recria arquivo.

**AC-5.1** `bun detect` (registry-scan, import-direction, slice-closure) verde; ciclo anotado
reescrito para `['agent','thread']`.
**AC-5.2** `git grep -n "'terminal'\|@terminal/" -- packages/api/typescript/src packages/app` → **0
hits** como identidade de contexto (códigos de erro `TERMINAL_*` permanecem — são strings públicas,
não identidade de contexto).
&nbsp;&nbsp;**CORREÇÃO DE CONTRATO (execução, 27-jul):** o pathspec `packages/app` faz esta AC casar
**uma chave de conteúdo i18n da landing** —
`packages/app/astro/src/pages/[locale]/_components/TerminalMock.astro`, que lê
`t['router']['terminal']`, o texto do MOCK de terminal da home. Não é identidade de contexto: é copy
de marketing sobre um painel de terminal, do mesmo naipe da categoria (b) da emenda. A AC roda com a
exclusão explícita:
`git grep -n "'terminal'\|@terminal/" -- packages/api/typescript/src packages/app | grep -v TerminalMock.astro`.
&nbsp;&nbsp;E as URLs `/v1/terminal/*` **permanecem**: pela convenção de roteamento declarada na §5.1
o path é escrito por inteiro pelo controller e o router não prefixa nada — o nome do contexto é a TAG
OpenAPI e o label de log, nunca a URL. A tag SEGUIU o rename (`terminal` → `agent`, é o único delta do
`bun sdk` desta fase); renomear a URL seria quebra de wire para o cliente react, e as duas rotas são
justamente a superfície de PAINEL que a emenda deixa para a Fase 7.
**AC-5.3** Cada agent é token DI de classe nos três envs; **não existe** mapa nome→agent:
`git grep -n "AgentRegistry\|getAgent(\|agentsByName" -- packages/api/typescript/src` → **0 hits**.
**AC-5.4** `.claude/skills/agent/{SKILL.md,registry.yaml}` existem e `bun cli agent <ctx> <Name>`
scaffolda + wira o barrel — verificado por **`bun test:tooling`** verde.
**AC-5.5** `bun review --pr` sem finding `critical` no contexto novo. **É a única AC não
determinística do documento** (depende do rótulo de severidade de um LLM), então o modo de falha
está fechado aqui e **amarrado à regra 2** da §8: rodar → corrigir os `critical` → rodar de novo,
**fix loop ≤2**. Se ainda restar `critical` depois do segundo fix, **PARKEAR esta AC** com os
findings completos colados no BUILD-LOG e **seguir** — ela **não bloqueia a fase** e **não** entra
em loop. Findings `high`/`medium`/`low` são **advisory**: registrar, não corrigir agora.
**AC-5.6** `git log --follow` sobre um arquivo movido mostra história pré-rename (prova do `git mv`).
**AC-5.7** `bun tsc` + `bun lint` + `bun run test` + `bun e2e` verdes.
**AC-5.8** **Entry point público tipado, no formato fechado da §4.5**: `ClassifyIssueAgent` expõe
`classify(input)` cujo corpo é **exatamente** `return this.collect(input)`; `thread/usecases/ClassifyMessage`
chama `classify(...)` e **não** draina stream (`git grep -n "for await" -- packages/api/typescript/src/thread`
→ **0 hits**). `IssueWorkAgent` **não** expõe método público além de `run()` (herdado da base — ele
nem implementa `run()`). `collect()` continua `protected` (`git grep -n "public.*collect\|async collect" -- packages/api/typescript/src/agent`
→ só a declaração `protected` em `types/Agent.ts`). **E `run()` é template method, não hook**: os
dois agents implementam **`buildRequest`**, e nenhum sobrescreve `run()` —
`git grep -nE "^\s*(async )?\*?run\(|override .*run\(" -- packages/api/typescript/src/agent/agents`
→ **0 hits**; e `git grep -n "buildRequest" -- packages/api/typescript/src/agent/agents` mostra
**≥1 hit por agent, com exatamente UMA implementação em cada** (`ClassifyIssueAgent` e `IssueWorkAgent`).
**Não** cobrar o total literal "2 hits": um JSDoc citando `buildRequest`, ou um `override` em linha
própria, muda o número sem nada estar errado — o que a AC mede é *uma implementação por agent*. Isso é o
que sustenta a AC-6.12 (`.mint(` só em `types/Agent.ts`): um `run()` sobrescrito reabriria um segundo
lugar para cunhar token.
**AC-5.9** O rail `tests/architecture/pty-isolation.test.ts` (AC-3.2) foi **reapontado** para os
caminhos novos — **são duas constantes, não uma**: `ALLOWED_PREFIX` (famílias PTY + transcript-path)
resolve `src/agent/services/AgentRunner`, e `ALLOWED_SPAWN_PREFIXES` (família `node:child_process`)
resolve `[src/agent/services/AgentRunner, src/agent/services/ProviderDetector]` — o `ProviderDetector`
continua no allowed-set **de propósito** (§5.3 o mantém e a Fase 1 o estende para probar `caps`; ver
AC-3.2(b)). O teste está verde nas três famílias, e
`git grep -n "terminal/services\|src/terminal" -- packages/api/typescript/tests` → **0 hits**.
**Continua sendo UM arquivo**: `ls packages/api/typescript/tests/architecture/ImportGraphIsolation.test.ts`
→ **não existe** (rail duplicado reprova a AC).
**AC-5.10** **Baseline do `registry-scan` re-ratchetada depois do `git mv`** — no HEAD de hoje há
**6** chaves de `scripts/detectors/registry-scan.baseline.json` enraizadas em
`packages/api/typescript/src/terminal/` (`controllers/DetectProviders.ts` ×3,
`usecases/RunTerminalSession.ts` ×2, `services/TerminalSessionRegistry/TerminalSessionRegistry.ts`
×1 — esta última **já é fóssil hoje**: verificado, o diretório `services/TerminalSessionRegistry/`
não existe). **Quando esta AC roda, só sobraram 3**: a re-baseline da **AC-3.7** já regenera o
arquivo a partir de um scan vivo na Fase 3, e ali as 2 de `RunTerminalSession` (arquivo renomeado
para `RunIssueTurn.ts`) e a fóssil de `TerminalSessionRegistry` desaparecem sozinhas. Logo o que
**este** `git mv` invalida são as **3 de `DetectProviders.ts`** — se o executor encontrar mais que
isso, é drift entre as fases: registrar no BUILD-LOG antes de re-baselinar. Chave de baseline com
caminho morto é **permissão fóssil**: o próximo arquivo que
nascer sob o mesmo caminho herda a supressão sem ninguém re-decidir. Rodar `bun detect:baseline`,
commitar, e provar: `git grep -c "src/terminal/" scripts/detectors/registry-scan.baseline.json` →
**0**; `git grep -c "TerminalSessionRegistry" scripts/detectors/registry-scan.baseline.json` → **0**;
`bun detect` verde **depois** da re-baseline (a AC-5.1 roda antes, sobre a árvore renomeada). Se a
re-baseline **adicionar** chaves novas em vez de só remover, listá-las no BUILD-LOG com o motivo —
uma chave nova é dívida nova, não ratchet.

> **EMENDA 27-jul — `bun detect:baseline` foi RODADO e o resultado foi REJEITADO; a re-baseline que
> **entrou** no commit foi feita à mão. Registrado aqui, e não só no BUILD-LOG, porque a regra 2 da
> §8 proíbe reinterpretar AC em silêncio.** O comando existe e roda: a regeneração a partir de um
> scan vivo produz um arquivo onde as 3 chaves de `DetectProviders.ts` somem — mas junto com elas o
> scan também ABSORVE as ~40 findings **hoje gating** que ainda não têm entrada na baseline (react
> `component#bp-20`, `as-any` do tauri, `as-unknown` de contracts, `AgentStreamRegistry service#bp-03`,
> …). Commitar esse output deixaria `bun detect` verde por **anistia**, não por **ratchet** —
> exatamente o que esta própria AC proíbe duas linhas acima ("uma chave nova é dívida nova"). **O que
> a AC de fato exige, e o que foi feito no lugar do commit direto do regen:** editar
> `registry-scan.baseline.json` **à mão**, removendo só as **3** chaves de `DetectProviders.ts`
> enraizadas em `src/terminal/` que o `git mv` desta fase invalidou, sem tocar em nenhuma outra chave
> do arquivo. As provas continuam sendo as mesmas três que a AC já pedia — `git grep -c
> "src/terminal/"` → **0**, `git grep -c "TerminalSessionRegistry"` → **0**, `bun detect` verde — mais
> uma quarta que a edição manual torna necessária: `bun detect` **numericamente inalterado**
> (**39/0/37/33/3/2** antes e depois), prova de que nenhuma chave viva foi perdida nem anistiada.
> **Regra derivada para a próxima fase que re-baselinar:** rodar `bun detect:baseline` primeiro é
> sempre o passo 0 — é o que revela se o scan vivo diverge do esperado —, mas o **output** desse
> comando só vira commit se a diferença for **exclusivamente** remoção de chaves fósseis; qualquer
> chave nova no diff é motivo para editar a re-baseline à mão em vez de aceitar o regen inteiro.

### Fase 6 — O servidor MCP: o agent passa a DECLARAR (a inversão)

> ## ⚠️ EMENDA DE DESENHO (founder, 27-jul) — as tools são GERADAS, e são DOIS conjuntos
>
> O desenho original (quatro tools escritas à mão em `agent/mcp/tools/`) está **superseded**. O MCP
> passa a ser **mais um consumidor do mesmo contrato OpenAPI que já gera a SDK**, via
> **`@kubb/plugin-mcp`** — verificado no registry npm: existe, latest `4.39.2`, mesma linha do Kubb
> `4.37.9` que já usamos; descrição *"generating MCP-compatible tools and schemas from OpenAPI
> specifications"*. Consequência: o agent deixa de ser caso especial e vira **cliente de primeira
> classe da API**, na mesma pipeline contract-first do resto do repo, com **zero schema de tool
> mantido à mão**.
>
> **DOIS CONJUNTOS, declarados no contrato.** Não é superfície plana. Os conjuntos cortam
> **atravessado** as tags existentes (que são por bounded context, não por audiência), então precisam
> de um segundo eixo: a extensão de vendor **`x-mcp-scope`** na operação — o repo já usa `x-`
> (`x-error-codes`, `x-zod-refinements` em `core/src/utils/OpenAPI.ts:497,585`) — e o Kubb filtra por ela.
>
> | escopo | quem usa | conteúdo |
> |---|---|---|
> | `issue-handling` | o agent **enquanto executa uma issue** | criar issue · transicionar status · pedir approval · responder mensagem (`SendDirectMessage`, existe) · registrar artifact (`RecordArtifact`, existe) |
> | `system` | navegação e operação do sistema | `ui/*` (7 reads) · `workspace/*` · config de thread · leituras de issue · `owner/*` |
>
> **O default é NÃO EXPOSTO** — e é isso que justifica a extensão em vez de uma lista à parte: um
> controller novo **não** vira tool por acidente; alguém tem de declarar o escopo no próprio
> controller. Sem esse default, todo endpoint que nascer entra em silêncio no alcance de um modelo que
> lê mensagem de WhatsApp. O `--allowedTools` passa a ser **derivado** do escopo que o agent declara.
>
> **TRÊS OPERAÇÕES NÃO EXISTEM E NASCEM AQUI**, como controllers normais (schema Zod, entram na SDK e
> no spec como qualquer outro): **criar issue** (hoje issues só materializam da execução),
> **transicionar status** (só há `Archive`/`Restore`) e **pedir approval**. O que era
> `DeclareStop`/`DeclareIssueComplete` vira endpoint de verdade, não caminho paralelo.
>
> **A IDENTIDADE FICA MAIS FRACA — REGRESSÃO CONSCIENTE, COM MITIGANTE OBRIGATÓRIO.** A Fase 1
> congelou os schemas de tool **sem nenhum campo de identidade** (AC-1.6, verificada pelo juiz), o que
> tornava declarar na issue errada *inexprimível*. Tool gerada de controller carrega os params dele —
> **inclusive `issueId`** — então a garantia degrada de "impossível" para "o servidor valida". Portanto:
> o run token continua sendo a fonte da identidade; o router **rejeita** `issueId`/`threadId`/`ownerId`
> que não batam com o token; e existe **teste de tentativa cross-issue** (agent rodando na issue A
> tentando declarar na B → 403). **Sem esse teste a fase não fecha** — é por esse caminho que um prompt
> injection vindo de uma mensagem chegaria ao domínio.
>
> **Spec de origem:** o do `api-ts` (o daemon), nunca o do gateway.
>
> **AS AC-6.x ABAIXO PRECISAM DE RECONCILIAÇÃO** com esta emenda antes da Fase 6 começar — foram
> escritas para tools à mão. É **tarefa declarada**, não improviso de última hora; a Fase 6 está a
> quatro fases de distância e a reconciliação acontece antes dela.

É aqui que a fatia PARKED de materialização de issue destrava. Nasce `agent/mcp/`
(`router.ts`, `tools/*.ts`, `RunTokenService.ts`), as quatro tools (§4.4), **três** use cases de
declaração no `agent` (`DeclareIssueComplete`, `DeclareStop`, `AskOperator`) e o wiring de escopo por
agent. A quarta tool aterrissa no contexto dono da escrita: **`artifact/mcp/RecordArtifactTool.ts`**
despachando o `RecordArtifact` que já existe (§4.4 item (ii)) — **não** nasce `DeclareArtifact`.
**Nenhum integration event novo** — os congelados (`integration.issue.completed`,
`integration.issue.stop_raised`, `integration.artifact.recorded`) ganham origem explícita e tipada
pelos bridges que já existem, e **nenhum evento de domínio novo** é criado para servir tool
(§4.3, regra 7 — as classes existentes são reusadas).

**A única mudança de contrato desta fase, e ela é aditiva:** `detail: string` entra em
`packages/contracts/wire/events/issue-stop-raised.tsp`, com
`issue/handlers/MaterializeIssueFromExecution` repassando o `detail` e usando a **pergunta como
`title`** quando `kind === StopKind.HUMAN_REQUESTED` (§4.4 item (i)). Isso obriga `bun run contracts`
+ `bun sdk` + `react tsc` + `e2e tsc` — já são o gate da AC-6.8. **Isto é permitido pela regra 5:
campo aditivo, não value-set novo.**

**Também nesta fase: `RunIssueTurn` deixa de cunhar conclusão/stop de DOMÍNIO quando o agent
injetado tem escopo de tool não-vazio** (`agent.tools.length > 0`, §4.3 regra 7) — sem isso a AC-6.4
falha por double-publish. O predicado é o **escopo de tool**, não `request.mcp`: o use case não
enxerga o request, que é montado dentro do `Agent` (§4.2/§4.5), e as duas leituras são equivalentes
por construção (§4.3, regra 7). O **stop de TRANSPORTE** continua sendo cunhado sempre.

**E, para que `FactSource` tenha portador (§4.3, regra 6): `source: z.enum(FactSource)` entra no
schema de `AgentRunCompletedEvent` e `AgentRunStopRaisedEvent`** (eventos de domínio
**context-private** — zero custo de contrato, zero mudança no bridge, o campo não sobe para o
integration event). Sem esse campo, AC-6.4(c) e AC-6.7(a) assertam sobre algo que não existe.

Se o transporte HTTP não funcionar com o CLI instalado, **cair para o stub stdio** (§4.4), registrar
no BUILD-LOG e seguir — **não é decisão de founder, não bloqueia a fase**.

**AC-6.1** Smoke real commitado em `.specs/codedm/phase6-mcp-smoke/`: `claude` de verdade chamando
`codedm__complete_issue`, com o log da tool call **e** a linha da issue em `COMPLETED` depois.
Registrar qual transporte ficou (http | stdio). **AC degradável pela regra 8-bis (§8)**: se o
`claude` real não for alcançável (ausência/auth/aninhamento), registrar `ATTEMPT-FAILED` com o erro
literal, marcar **só esta AC** como `PARKED-com-findings`, anotar no BUILD-LOG que a escolha de
transporte ficou **indecidida por evidência** e que o padrão **HTTP** (§4.4) permanece — e
**continuar a fase**. Todas as demais ACs da Fase 6 rodam sobre o `E2eStubAgentRunner` (AC-6.2) e
**não degradam**: são gate duro mesmo sem `claude` no ar. Este é exatamente o motivo pelo qual a
AC-6.2 existe.
**AC-6.2** **e2e determinístico**: o `E2eStubAgentRunner` chama o endpoint MCP local (sem `claude`
no ar) e o e2e prova a cadeia inteira — inbound → issue aberta → `record_artifact` → artefato
**listado pela query que a UI já usa** → `complete_issue` → issue `COMPLETED` — **sem nenhum parse de
texto no caminho**. A perna do artefato só passa porque a tool despacha `RecordArtifact` no contexto
`artifact` (§4.4 item (ii)); se o executor a tiver implementado como publicação de integration event
sem consumidor, esta AC falha por construção — é o sintoma, e o conserto é a AC-6.11.
**AC-6.3** Zero heurística de texto para fato de domínio:
`git grep -nE "includes\('done'\)|/(complete|finished|approval)/i" -- packages/api/typescript/src/agent` → **0 hits**.
**AC-6.4** **Sem double-publish, nos DOIS caminhos** (§4.3, regras 3 e 7). **Os três casos são
montados pelo ESCOPO DE TOOL do agent injetado no `RunIssueTurn`** — que é o que o use case
enxerga (§4.3, regra 7) e portanto o que o teste controla: injeta-se um agent-duplo cujo
`readonly tools` é `[]` ou as quatro, e drena-se o `E2eStubAgentRunner`. **Não** tentar montar o
caso por `request.mcp`: o request é interno ao `Agent` e o teste não o alcança.
&nbsp;&nbsp;(a) uma tool call `codedm__complete_issue` produz **exatamente um**
`integration.issue.completed` no outbox — o accumulator ignora `codedm__*`;
&nbsp;&nbsp;(b) o **caso degenerado**: agent com `tools.length === 4` que declara
`codedm__complete_issue` **e também termina normalmente** (o `outcome` terminal chega `COMPLETED`)
produz **exatamente um** — porque `RunIssueTurn` só cunha a conclusão de domínio quando
`agent.tools.length === 0`;
&nbsp;&nbsp;(c) o espelho: agent com `tools.length === 0` que termina normalmente produz
**exatamente um**, e o `AgentRunCompletedEvent` correspondente carrega
**`payload.source === FactSource.INFERRED`** (o campo existe porque a Fase 6 o acrescentou, §4.3
regra 6); no caso (b) o evento carrega `DECLARED`.
&nbsp;&nbsp;Contagem sobre o **outbox**, não sobre log. Teste extra de guarda estrutural, para o
predicado não regredir para o campo inalcançável:
`git grep -n "request\.mcp" -- packages/api/typescript/src/agent/usecases` → **0 hits**, e
`git grep -n "\.tools\.length" -- packages/api/typescript/src/agent/usecases/RunIssueTurn.ts` →
**≥1 hit** (o predicado está onde a informação está).
**AC-6.5** Escopo por agent: teste de argv provando que `ClassifyIssueAgent` roda **sem**
`--mcp-config` e que `IssueWorkAgent` roda com `--allowedTools` contendo **exatamente** as quatro
tools.
**AC-6.6** Autorização: teste provando (a) tool call com token ausente/expirado/de run cancelado →
**401** e **nenhuma** escrita; (b) `ownerId`/`issueId` usados pelo use case vêm **do token**, e um
payload que tente injetá-los é rejeitado pelo schema (AC-1.6 garante que a chave nem existe).
**AC-6.7** Degradação visível, **com a separação transporte × domínio da §4.3**. O caso é montado
pelo **escopo de tool** (agent com `tools = []`), não por `request.mcp` (§4.3, regra 7). Teste
provando que esse run (a) fecha a issue e o `AgentRunCompletedEvent` persistido carrega
**`payload.source === FactSource.INFERRED`** — asserção sobre o **campo que a Fase 6 acrescenta ao
schema do evento de domínio** (§4.3, regra 6), lido do outbox/`shared_events`, nunca de log;
(b) **não** produz artefato nem stop de **domínio** (`APPROVAL_NEEDED`, `HUMAN_REQUESTED`,
`BLOCKED_BY_CLASSIFICATION` — só `raise_stop` os origina); (c) **ainda produz** stop de
**transporte** quando cabe — caso explícito: frames de re-auth do CLI →
`stop: { kind: AUTH_REQUIRED }`, virando um `AgentRunStopRaisedEvent` com
`payload.source === FactSource.INFERRED`, sem tool alguma (e o mesmo vale para um agent **com**
escopo de tool: o stop de transporte é cunhado do mesmo jeito). E que um agent que exige tools
contra provider sem `mcpConfigFlag` falha com `AGENT_TOOLS_UNSUPPORTED`. Teste de tipo junto:
`TransportStopKind` **não** admite os três kinds de domínio (`@ts-expect-error` no type-test **é
permitido**, é a asserção; a proibição da AC-3.4 vale para código de produção).
**AC-6.8** `bun run contracts` + `bun sdk` idempotentes 2×; **`react tsc` e `e2e tsc` verdes** (não é
"se mudou": o `detail` do item (i) muda o wire, então mudou). **Mais o fechamento da emissão**: o
router MCP **não** entra na OpenAPI —
`git grep -n "/mcp\|codedm__" -- packages/api/typescript/public/docs/openapi.json packages/client/dist`
→ **0 hits** (mesmo naipe do `TestIngressController`, §4.4), e a rota **responde** com o daemon no ar
(prova de que "não emitida" ≠ "não montada").
**AC-6.9** `bun tsc` + `bun lint` + `bun run test` + `bun detect` + `bun e2e` verdes.
**AC-6.10** **`codedm__ask_operator` exercitada** (§4.4), determinística, via `E2eStubAgentRunner`:
(a) a chamada **retorna antes** do operador responder — teste que asserta que a promessa do handler
resolve sem nenhum sinal externo e devolve `{ delivered: true }` (fire-and-forget provado, não
prometido); (b) ela produz **exatamente um** `integration.issue.stop_raised` no outbox com
`kind === StopKind.HUMAN_REQUESTED` e **`detail === question`** — satisfazível **porque** a fase
acrescentou `detail` ao `issue-stop-raised.tsp` (§4.4 item (i)); sem esse campo a AC é impossível, e
essa é a única leitura correta dela; (c) o `kind` é fixado **pelo handler** — um payload que tente
enviar `kind` é rejeitado pelo schema (a chave não existe, mesma disciplina da AC-1.6); (d) a issue
aparece em "Needs you" pelo caminho já existente, sem bridge novo, e o **card mostra a pergunta**:
`RaiseStop` recebe `title === question` (porque `kind === HUMAN_REQUESTED`) e `detail === question`,
não o `STOP_TITLES` genérico.
**AC-6.11** **A perna do artefato tem dono e aterrissa** (§4.4 item (ii)): (a)
`artifact/mcp/RecordArtifactTool.ts` existe e é o **único** caller novo de `RecordArtifact`;
(b) `git grep -n "DeclareArtifact" -- packages/api/typescript/src` → **0 hits**;
(c) teste provando que uma tool call `codedm__record_artifact` grava **exatamente uma** linha de
artefato (com `ref` e `meta` preservados — o que a rota via integration event perderia) e produz
**exatamente um** `integration.artifact.recorded` no outbox, publicado pelo bridge **que já existia**
(`artifact/handlers/PublishArtifactIntegrationEvents.ts`); (d) `artifact/handlers/external.ts`
continua **sem consumidor** — ou, se a escada da §4.4 item (ii) tiver descido até o **degrau 3**, ele
contém **só** `MaterializeArtifactFromAgent` e há um teste de **não-eco** (duas passadas → uma linha,
o segundo `RecordArtifact` no-op sem evento). **Registrar no BUILD-LOG em qual degrau (1, 2 ou 3)
parou, com a saída literal do rail que reprovou os anteriores** — parar no degrau 3 sem ter tentado
1 e 2 é violação da AC, porque paga mudança de contrato por um problema que duas declarações
resolvem.
**AC-6.12** **A metade de identidade que a AC-1.11 adiou, agora que runner e `types/Agent.ts`
existem**: `git grep -nE "ownerId|issueId|threadId" -- packages/api/typescript/src/agent/services/AgentRunner packages/api/typescript/src/agent/providers`
→ **0 hits**; `git grep -n "\.mint(" -- packages/api/typescript/src` → **só** `agent/types/Agent.ts`;
`git grep -n "\.revoke(" -- packages/api/typescript/src` → **só** o runner. Os três pathspecs
**existem** neste ponto — se algum sair `fatal:`, a AC **não** está cumprida.
**AC-6.13** **Os três códigos de erro novos fecharam o ripple de 4 paradas da §5.1** — grep por
código, para cada um de `AGENT_RESUME_INVALIDATED`, `AGENT_TOOLS_UNSUPPORTED` e
`AGENT_RUN_TOKEN_INVALID` (se o primeiro tiver virado só log estruturado na Fase 4, registrar no
BUILD-LOG e cobrar só os outros dois):
&nbsp;&nbsp;(a) `git grep -c "<CODE>" -- packages/api/typescript/src/agent/errors/index.ts` → **2**
(uma ocorrência na `*Errors` union, uma na chave de `registerErrorCodes`) — é literalmente o
conjunto-igual que `tests/architecture/error-coherence.test.ts` mede. **Cuidado:** `git grep -c` conta
LINHAS casadas, não ocorrências; o **2** só vale com a formatação canônica (união e chave em linhas
distintas). Se a união estiver numa linha só, o count cai para 1 **sem** que nada esteja errado — nesse
caso a prova é o próprio `error-coherence.test.ts` verde, que é a autoridade;
&nbsp;&nbsp;(b) `git grep -c "<CODE>" -- packages/app/react/src/locales/en.json packages/app/react/src/locales/pt.json`
→ **`en.json:1` e `pt.json:1`** — com múltiplos pathspecs o `git grep -c` imprime o count POR ARQUIVO,
nunca a soma; a AC é *"1 em cada catálogo, os dois presentes"*, não *"2"*;
&nbsp;&nbsp;(c) `git grep -c "<CODE>" -- packages/client/dist/typescript/src/error-codes/index.ts`
→ **1** (regenerado por `bun sdk`, nunca editado à mão) e
`git grep -c "<CODE>" -- packages/api/typescript/public/docs/openapi.json` → **≥1** (root
`x-error-codes`);
&nbsp;&nbsp;(d) `bun test packages/api/typescript/tests/architecture/error-coherence.test.ts` verde
**e** `react tsc` verde — este último é o que prova a parada 3, porque
`locales/error-codes.check.ts` (`pt.errors satisfies Record<ErrorCode, string>`) só compila com as
duas traduções presentes.

### Fase 7 — Frame SSE estruturado + fechamento

`TerminalActionFrameSchema` re-chaveado em `tool` (`z.string()`) + resumo de `input`; `bun sdk`;
painel do console mostrando a ferramenta real. Gates full. `OVERNIGHT-REPORT.md`.

**AC-7.1** OpenAPI emitida bate com o contrato; `bun sdk` **idempotente 2×**.
**AC-7.2** `react tsc` **e** `e2e tsc` verdes (a lição do ripple de enum `PlatformEnum`/`CONTACT`,
`2026-07-24-fundamentals-and-upstream.md:160-166`).
**AC-7.3** e2e cobre o frame novo end-to-end (não só compila: **roda**) — asserta que o painel
recebe o nome real da tool.
**AC-7.4** `git grep -n "TuiActionType\|TuiMarker\|TurnEndSignal" -- packages` → **0 hits**.
**AC-7.5** `OVERNIGHT-REPORT.md` com commits por fase, PARKED com findings completos, decisões
aguardando founder, e o número de RSS da AC-0.10.

---

## 8. Regras invioláveis

Herdadas de `OVERNIGHT-GOAL-2026-07-24-go-domain-port.md:68-91`, atualizadas ao novo alvo.

1. **Branch REAL, não worktree.** Sequencial, um committer, e2e contínuo. A Fase 0 fecha no
   **`sqlite-shared-store`** (a branch atual). As Fases 1–7 seguem em
   **`agent-abstraction`**, criada **a partir do HEAD do `sqlite-shared-store`** logo após o commit
   que fecha a Fase 0: `git checkout -b agent-abstraction sqlite-shared-store`. Nome fixado aqui de
   propósito — não é escolha do executor. Zero push; as duas branches ficam locais.

   **RECONCILIAÇÃO 27-jul — a regra foi violada duas vezes e a direção do conserto fica escrita
   AQUI.** Dois commits que pertencem às Fases 1–2 pousaram em `sqlite-shared-store` em vez de
   `agent-abstraction`: **`5db67af7`** (reparo do contrato da Fase 1) e **`bf217a2a`** (smoke do
   decision gate da Fase 2). O efeito foi grave, não cosmético: **o contract lock e o reparo A esse
   contract lock ficaram em branches opostas**, e a Fase 2 acabou despachada contra a branch que
   **não** tinha `terminal/types/`, `terminal/providers/`, `terminal/mcp/`, nem os enums e eventos de
   agent — isto é, contra uma árvore onde a fase era literalmente impossível. O executor daquela
   tentativa **parou em vez de recriar na branch errada os arquivos congelados**, e isso é o
   comportamento certo: recriá-los teria produzido uma segunda cópia divergente de um value-set
   deliberadamente congelado (o que a regra 5 proíbe) e um merge conflitado depois.

   **Direção fixada, sem ambiguidade: `agent-abstraction` é o tronco das Fases 1–7**, exatamente como
   esta regra já dizia — a regra não muda, o que muda é que a violação está registrada.
   `sqlite-shared-store` está **fechada na Fase 0** e não recebe mais commit. A reconciliação foi
   feita por **merge** (de `agent-abstraction`, `git merge sqlite-shared-store`; merge-base
   `7fda274f`, sem conflito), preservando a autoria dos dois commits desgarrados em vez de recriá-los.

   **Regra de despacho derivada, para que não se repita:** todo brief de fase nomeia a branch **e** o
   executor verifica o **ESTADO da árvore**, não só o nome — concretamente, que as entregas
   congeladas da fase anterior existem no `HEAD`. Nome certo com árvore vazia **é drift**, e drift
   descoberto **para a fase** (regra 10); nunca se contorna drift recriando artefato congelado.

   **Estado da árvore no início — não é violação, é o passo zero.** Este goal assume `git status`
   limpo **a partir do primeiro commit**, e esse primeiro commit é justamente o dos documentos de
   partida: **este arquivo** (`.specs/codedm/GOAL-agent-abstraction.md`, hoje modificado) e o plano
   irmão **`.plans/2026-07-26-daemon-sqlite-migration.md`** (hoje untracked). **Passo 0 da Fase 0:
   commitar os dois, por pathspec explícito** (regra 11), com mensagem `docs:` — e só então começar.
   Não tratar essas duas entradas como trabalho de outro processo, não `git stash`, não `git add -A`.
   Qualquer **outra** entrada em `git status` no início **é** drift: registrar no BUILD-LOG antes de
   tocar, e se for arquivo rastreado faltando na árvore, `git checkout HEAD -- <path>`.
2. **Fase substantiva = workflow:** builder + 2 juízes Opus adversariais, **bar ≥90 sem critical**,
   fix loop ≤2. Abaixo da barra após o fix extra → **PARKEAR** com findings completos no BUILD-LOG e
   seguir. **Nunca stubar, nunca inventar.**
3. **Todo componente nasce por skill + CLI, nunca à mão.** Tipo de artefato sem skill/verbo →
   criar skill e verbo **na mesma fase** (house rule do `CLAUDE.md`).
4. **Contrato antes de implementação.** Informação estrutural é declarada em contrato tipado antes
   do código que a consome. **`if (provider === 'x')` sobre convenção significa que o MODELO está
   errado** — a diferença vira campo de `ProviderDef`. Idem `model: string` e `stopReason: string`.
5. **OpenAPI wire-identity onde HTTP/SSE é tocado:** a OpenAPI emitida bate com o contrato (mesmo
   shape/enums/returns); enums de domínio **ALIAS** das wire enums, nunca redeclaração de value-set;
   `bun sdk` regenera; **`react tsc` + `e2e tsc` nos gates**. **Campo ADITIVO num evento congelado é
   permitido** (é o caso do `detail` em `issue-stop-raised.tsp`, §4.4 item (i)); o que a regra proíbe
   é **redeclarar value-set** e criar evento paralelo. O router MCP é HTTP mas **não é emitido na
   OpenAPI** (§4.4): o wire-identity dele é garantido pelos schemas Zod das tools + `AgentToolName`
   (AC-1.6), e a regra vale integralmente para o que a §4.9 muda no SSE.
6. **Gates por fase, com RUNTIME — não só `tsc`:** `go build/vet/test` (Fase 0), `bun tsc`,
   `bun run test` (rodado a partir de `packages/api/typescript`), `bun lint`, `bun detect`,
   `bun sdk` 2× idempotente, **`bun e2e` executado de verdade**, boot smoke.
7. **`--no-verify` só com gates à mão e justificados no commit.** **Pathspec staging**, nunca
   `git add -A`. **BUILD-LOG por fase.** Commits convencionais. `git mv` preserva história.
   **Tudo local: zero push/fetch.**

   **EMENDA 27-jul — o BUILD-LOG estava sendo perdido por um conflito ESTRUTURAL, não por
   desleixo.** Constatado: a última entrada era `2026-07-27 — BLOCO 5 (T32–T34)`, da Fase 0; nem o
   smoke da Fase 2 nem a tentativa abortada tinham entrada. A causa é que o harness dos agentes de
   fase **proíbe autorar arquivos `.md` de report/summary/findings**, então cada agente de fase
   redescobre o conflito e resolve pulando o BUILD-LOG — que é justamente o que o critério de
   conclusão 15 trata como falha de goal. Fica resolvido em três linhas:
   - **`.specs/codedm/BUILD-LOG.md` NÃO é um "report file". É um LEDGER RASTREADO e uma entrega
     contratual da fase**, no mesmo naipe do código. A proibição de report files não se aplica a ele,
     e o brief de despacho de cada fase **deve dizer isso literalmente** para desarmar a heurística.
   - **Fallback obrigatório se o executor ainda assim não puder escrevê-lo:** ele devolve a entrada
     **pronta, em texto, no relatório final**, e o **orquestrador** a escreve e commita. Fase sem
     entrada de BUILD-LOG **não fecha** — nem por esse caminho nem por nenhum outro.
   - Entrada de fase **PARKED/abortada também é entrada**: registra o que foi medido, por que parou e
     o que o próximo executor precisa saber. Foi a ausência dessa entrada que fez a mesma violação de
     branch (regra 1) passar despercebida por dois commits.
8. **Nenhum teste spawna um CLI de verdade.** O seam de DI por env já garante isso
   (`registry.ts:22-27`) e continua garantindo. O único contato com o binário real são os scripts de
   smoke das Fases 2, 3 e 6, commitados como artefato.

8-bis. **REGRA DE SAÍDA DO SMOKE REAL — nenhum smoke com `claude` de verdade bloqueia a noite.**
   Estes scripts eram chamados de "explicitamente manuais", o que numa noite sem ninguém é o mesmo
   que "impossível". Fica assim, no mesmo naipe do fallback de transporte MCP (§4.4):
   1. **Tentar de verdade**, num processo filho independente (`spawn`, ambiente próprio), com
      timeout. Sucesso → AC cumprida normalmente.
   2. **Falhou por (a) binário ausente do PATH, (b) não autenticado, (c) invocação aninhada barrada,
      ou (d) timeout** → gravar no BUILD-LOG uma entrada `ATTEMPT-FAILED` com **o comando literal, o
      exit code e o stderr**, seguir com o substituto determinístico definido na AC, marcar **apenas
      a AC de smoke** como `PARKED-com-findings`, e **continuar a fase**.
   3. **Nunca** fabricar output de smoke como se fosse real. Artefato derivado do spec vai carimbado
      `SOURCE: spec-derived (ATTEMPT-FAILED)` no cabeçalho.
   4. **Isto não é decisão de founder** e não vai para `OVERNIGHT-BLOCKED.md`.

   **ACs que degradam por esta regra — nominalmente, e só estas:** **AC-2.1** (substituto: frames
   enlatados derivados do spec; AC-2.2…AC-2.7 seguem duras), **a metade de smoke da AC-3.6**
   (substituto: o mesmo fluxo pelo `E2eStubAgentRunner`; a metade de gates segue dura) e **AC-6.1**
   (substituto: AC-6.2, que é determinística por construção; AC-6.2…AC-6.10 seguem duras). **A
   AC-0.5 NÃO degrada** — ela não usa `claude`, só os dois sidecars nossos, e é o gate da Fase 0.
   Nenhuma outra AC do documento pode ser degradada por esta regra.
9. **Nunca `git stash` atravessando um `bun sdk`/`bun contracts`** — os geradores reescrevem
   arquivos rastreados e o pop conflita silenciosamente.
10. **Decisão genuína de founder emergindo → `.specs/codedm/OVERNIGHT-BLOCKED.md` + BUILD-LOG,
    pular SÓ aquela fatia, continuar.** (Nota: o bloqueio de extração de reply registrado lá —
    opção 2, *"perde a sessão interativa única"* — é **resolvido** por este goal: stream-json
    bidirecional com `--session-id`/`--resume` remove o custo. Fechar a entrada, não escalar.)
    Escolha de transporte MCP (§4.4) **não** é decisão de founder: há fallback escrito.
11. **COMMIT COM PATHSPEC EXPLÍCITO — `git commit -m "…" -- <paths>` — sempre que um workflow
    estiver editando a árvore.** Aprendido na marra: um `git commit` pelado varre o índice inteiro e
    absorve arquivos de outro processo (foi assim que as deleções `pg_*` foram parar num commit de
    docs, `ed68c731`, tendo que ser explicadas depois em `149b6aa3`). Vale junto com a regra 7:
    **stage por pathspec, commit por pathspec.**
12. **Não tentar convergir runtime com o medscall** (D9/§6). Copiar julgamento, não arquivo. E o fix
    de `EventHandler.ts` (§6.4) **não se reverte** — o CodeDM está à frente, não atrás.

---

## 9. Critérios de conclusão (o avaliador verifica TODOS)

1. **Fase 0 fechada:** os dois sidecars leem/escrevem **UM** SQLite (`<dataDir>/codedm.db`); zero
   PGlite/pg no daemon; `go build/vet/test` verdes; boot smoke dos dois processos sobre um arquivo
   ok; e **o daemon lê exatamente o status que o gateway escreveu, com a transição
   `CREATED → CONNECTED` observada cross-process** (AC-0.5/AC-0.6) — split-DB eliminado. A prova é o
   smoke da AC-0.5, com o ingress de teste Go (`POST /api/channel/_test/connect`, guardado por
   `CODEDM_E2E=true`) fazendo `SetConnected` pelo caminho real da entidade. **Não** é o e2e: ele sobe só
   o daemon e semeia por ingress TS.
2. **Um método.** `AgentRunner` expõe `run(request)` (+ `shutdown`) — provado pelo teste de reflexão
   da AC-3.1 sobre a classe abstrata. E, **no escopo exato da AC-3.1**,
   `git grep -n "generate(\|prewarm(\|getSession(\|killSession(" -- packages/api/typescript/src` →
   **0 hits** (o pathspec é `packages/api/typescript/src`, não "o repo"; e a AC-3.1 é o texto que
   vence). `stream` não entra no grep porque `stream(` casa uso legítimo de stream fora do seam — a
   ausência dele é coberta pelo teste de reflexão, que é a asserção forte.
3. **Classificação e execução usam a MESMA chamada.** Grep prova que `ClassifyIssueAgent` e
   `IssueWorkAgent` chamam o mesmo `run()`; as únicas diferenças são `outputSchema` e `mcp` no
   request.
4. **Zero PTY no caminho do agent** — **no escopo exato da AC-3.2, que é o texto que vence**:
   `git grep -nE "new Bun\.Terminal|from 'node-pty'|claude/projects" -- packages/api/typescript/src packages/api/typescript/core/src packages/app packages/e2e`
   → **0 hits**. **`.specs/` e `.plans/` estão FORA do escopo** (registro histórico — o
   `BUILD-LOG.md` e o `.plans/2026-07-22-phase10-…` citam `node-pty`/`Bun.Terminal` de propósito), e
   docstring que **descreve** o engine Fork-D2 sem construir PTY também está fora (o padrão é
   `new Bun.Terminal`, construção — igual ao do rail). Mais: `TuiActionType`/`TuiMarker`/
   `TurnEndSignal` a **0 hits** em `packages` (AC-7.4). E o rail vivo
   `tests/architecture/pty-isolation.test.ts` — **estendido, não duplicado** — confina PTY e
   transcript-path a `src/agent/services/AgentRunner/`, e `node:child_process` ao allowed-set de
   **dois** prefixos `src/agent/services/{AgentRunner,ProviderDetector}` (o detector spawna por
   design, §5.3 + AC-3.2(b) — "só quem DETECTA o binário e quem EXECUTA o turno"). O texto que vence
   é AC-3.2(b) + AC-5.9; `tests/architecture/ImportGraphIsolation.test.ts` **não existe** (rail
   duplicado reprova).
5. **CLIs externos são literais de dado.** `PROVIDER_DEFS: Record<ProviderKind, ProviderDef>`
   exaustivo por tipo; nenhum `switch (provider)` fora dos defs; `caps` passado por parâmetro;
   capacidade de MCP declarada como campo.
6. **Fim de turno estrutural** (`stop_reason` + as duas guardas), com testes cobrindo o caso do
   sub-agent `Task`; watchdog de inatividade como backstop.
7. **Structured output nunca lança no meio do drain** — falha vira evento terminal `failed: true`,
   com teste.
8. **O buraco de tipo está fechado:** `AgentInputEnvelope` e `AgentInputSchemaConstraint` definidos e
   exportados, `z.agentInput()` existe, e o runner lê `ownerId`/`issueId`/`cwd` **sem cast** — com
   `bun tsc` verde e nenhum `as any`/`@ts-expect-error` novo.
9. **O agent DECLARA:** servidor MCP do CodeDM no ar com as quatro tools `codedm__*` (incluindo
   `ask_operator` **fire-and-forget** aterrissando em `integration.issue.stop_raised` /
   `HUMAN_REQUESTED`, AC-6.10); `AgentMcpInvocation` definido como tipo; identidade vem do run token
   — **cunhado pela base `Agent`, revogado pelo runner** — e **não** do payload; escopo por agent
   (classificador sem tools, worker com as quatro); **um** integration event por tool call (sem
   double-publish — inclusive no caso "declarou E terminou normalmente", AC-6.4); degradação sem
   tools marcada `FactSource.INFERRED`, com stops de **transporte** ainda possíveis e stops de
   **domínio** não; a fatia de materialização de issue **destravada** e provada por e2e
   determinístico. **Mais:** o texto sobrevive end-to-end (`detail` aditivo no
   `issue-stop-raised.tsp`, pergunta virando `title` em `HUMAN_REQUESTED`, AC-6.10); a perna do
   artefato **aterrissa numa linha listável** pelo contexto dono da escrita, sem `DeclareArtifact` e
   sem segundo publicador (AC-6.11); nenhum evento de **domínio** novo nasceu para servir tool; e o
   router MCP está montado **fora** da OpenAPI/SDK (AC-6.8).
10. **Sessão durável com resume nativo:** `agent_agent_sessions` com `agentSessionId`, `model`,
    `lastMessageId`; as 4 guardas de invalidação testadas; **e2e multi-turno verde**.
11. **Cancelamento por process group**, com teste provando que nenhum descendente sobrevive, e run
    token invalidado no cancelamento.
12. **Contexto `agent` existe** (renomeado de `terminal` por `git mv`), declarado em `CONTEXTS`,
    `BoundedContext.create({ name: CONTEXTS.agent })`, ciclo anotado atualizado, `bun detect` verde;
    agents registrados como tokens DI de classe, **sem** mapa nome→agent; agent com `outputSchema`
    expõe **um** método público de propósito de negócio delegando a `collect()` (AC-5.8), e
    `collect()` continua `protected`.
13. **Skill `agent` + verbo `bun cli agent` entregues** e exercitados por `bun test:tooling`.
14. **Gates full verdes:** `bun tsc`, `bun lint`, `bun run test`, `bun detect`, `bun sdk` 2×
    idempotente, `react tsc` + `e2e tsc`, **`bun e2e` executado**, boot smoke, OpenAPI wire-identity.
15. **BUILD-LOG por fase + `OVERNIGHT-REPORT.md` — os DOIS em `.specs/codedm/`** (caminhos pinados na
    abertura da §7; duplicata na raiz **reprova**); `git status` limpo; **zero push remoto**; nada
    PARKED sem findings completos; commits feitos **com pathspec explícito**. **Nota ao avaliador:**
    AC-2.1, a metade de smoke da AC-3.6, AC-6.1 e AC-5.5 podem estar `PARKED` **sem reprovar o
    goal**, desde que a entrada `ATTEMPT-FAILED` (regra 8-bis) ou os findings de review estejam no
    BUILD-LOG com o comando/erro literais e o substituto determinístico tenha rodado verde. Qualquer
    outra AC PARKED **reprova**.
16. **O goal antigo marcado como SUPERSEDED** por este documento (uma linha de cabeçalho apontando
    para `469eed5b` + este arquivo), sem apagá-lo.
17. **Nada de convergência de runtime com o medscall** foi tentado; o débito cross-repo do
    `EventHandler.ts` está **registrado e intacto** (§6.4).




