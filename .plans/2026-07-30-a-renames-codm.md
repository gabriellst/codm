# Frente A — renames + rebrand CODM — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`) syntax.
> Esta é a **ÚLTIMA frente do goal** (ordem: C8 → B3 → B4 → B5 → B2 → B1 → C → **A**). A Task final
> fecha o GOAL INTEIRO, não só esta frente.

**Goal:** Quatro renames mecânicos deixam o repo sem resíduo de nome: a pasta órfã
`packages/client/dist/http` some; o outDir gerado `error-codes` vira `errors`; a pasta de schema
Drizzle deixa de carregar o dialeto no nome (`schema-sqlite` → `schema`, convenção que sobe pro
template); e a identidade `codedm`/`CodeDM`/`CODEDM_*`/`@codedm` vira `codm`/`CODM`/`CODM_*`/`@codm`
por um codemod determinístico que, ao final, atualiza os próprios consts `scope`/`brand` do
`template.config.ts` — de modo que "o config é a fonte de verdade" continue verdadeiro depois da
rodada. Zero mudança de comportamento de negócio; toda verificação é por inventário de grep contado
antes e depois.

**Architecture:** Sete cortes em ordem obrigatória, cada um deixando os gates verdes e cada um com
inventário citável. (1) Higiene do `packages/client/dist` — o delete da pasta órfã e o
`error-codes → errors`, juntos porque são a mesma pergunta ("o nome da pasta gerada bate com o que
ela contém?"). (2) `schema-sqlite → schema`, com a convenção subindo pro template no mesmo commit.
(3) O **codemod** nasce ANTES de qualquer rebrand, com whitelist declarada e falseador — porque a
decisão difícil desta frente não é substituir string, é saber **onde não substituir** (o histórico em
`.plans`/`.specs`, as citações de `.specs/codedm/` dentro de docblocks de produção, e `x-error-codes`
que só *parece* um alvo). (4-7) O rebrand roda em **quatro passes por superfície**, não num único
`--all`: o npm scope (1900 ocorrências, atômico com `bun install`), a marca + crates Rust + identidade
Tauri (acopladas por `generate.ts` DSK), o prefixo de env + data-dir + nome do arquivo SQLite
(acoplados pelas rails ENV-01..04), e o texto residual — cada pass um commit verde. O passe é uma
**flag do mesmo script**, não quatro scripts: a determinismo da spec fica preservado e cada superfície
ganha o gate que sabe reprová-la.

**Tech Stack:** TypeScript (bun, drizzle, kubb), Go (fx, sqlc), Rust (Tauri v2, progenitor), TypeSpec,
Nx, bun:test / `go test` / `cargo test`, Playwright

**Spec:** `.specs/2026-07-29-renames-codm-design.md` (Status: Approved)
**Spec de referência (canônica, NUNCA modificar):** `.specs/2026-07-30-rust-wire-and-tauri-sdk-design.md`
**Tasks:** 8
**Estimated minutes:** 430

---

## Ground em HEAD `1f6b6f05` — o que a spec diz e o que o código diz

Toda linha abaixo foi verificada por grep/leitura em HEAD, **nas duas formas** (literal e símbolo),
não por memória. Contagens são **ocorrências** (`git grep -o … | wc -l`), não linhas — a spec conta
linhas em alguns pontos e isso explica parte da divergência.

| Afirmação da spec | Veredito | Prova |
|---|---|---|
| §Context 4 / US-4: "busca case-insensitive por `codedm` bate **~979** ocorrências no repo" | **FALSO — subcontagem de 2,6×.** `git grep -oi codedm -- .` → **3474** ocorrências em 1067 arquivos. Excluindo histórico (`.plans` + `.specs`) → **2516**. Quebra por forma (não-histórico): `codedm` minúsculo **2308**, `CODEDM` **132**, `CodeDM` **72**. | `git grep -oi codedm -- . ':!.plans' ':!.specs' \| wc -l` |
| §Context 4: "prefixo de env `CODEDM_*` (**14 variáveis**, ~243 refs)" | **FALSO nos dois números.** `git grep -oh "CODEDM_[A-Z_]*"` → **15 chaves distintas** (`E2E`, `DATA_DIR`, `MIGRATIONS_DIR`, `NODE_BIN`, `DESKTOP`, `DESKTOP_DEV`, `TOOL_PREFIX`†, `GATEWAY_API_KEY`†, `SMOKE_CLAUDE_BIN`, `GATEWAY_WHATSMEOW_URL`†, `RUN_TOKEN`, `ROOT`, `LOG`, `ISSUE_ID`, `AGENT_INACTIVITY_MS`) e **132** ocorrências não-históricas (não 243). † 3 delas (`TOOL_PREFIX`, `GATEWAY_API_KEY`, `GATEWAY_WHATSMEOW_URL`) só existem em prosa histórica/comentário de remoção — **12 chaves vivas**. | greps acima |
| §Decision 3 / AC-5: "`schema-sqlite` aparece em **~22 pontos de toque**" e a lista enumerada | **INCOMPLETA.** **61 ocorrências em 28 arquivos** não-históricos. A lista da spec **omite 9 arquivos**: `.claude/commands/install.md`, `.claude/registry.yaml`, `docs/BACKEND.md`, `packages/api/go/core/db/dbutil/sqlite.go`, `packages/api/go/core/db/sqlite/sqlc.yaml`, `packages/api/go/internal/channel/repositories/channel/sqlite_channel_repository.go`, `packages/api/typescript/scripts/smoke-shared-store.ts`, `packages/api/typescript/src/thread/repositories/ThreadRepository/DrizzleThreadRepository.ts`, `scripts/graph/tests/build.integration.test.ts` (**4º** teste com path hardcoded, além dos 3 que a spec cita). | `git grep -l schema-sqlite -- . ':!.plans' ':!.specs'` |
| AC-5: "`docs/CLAUDE.md` não contém mais `schema-sqlite`" | **FALSO — `docs/CLAUDE.md` NÃO EXISTE.** `ls docs/` → `AGENTIC_CODING.md BACKEND.md BOOTSTRAP.md CLI.md COMPONENTS.md CORRECTNESS.md ECOSYSTEM.md FRONTEND.md …`. Os arquivos reais com o literal são **`CLAUDE.md` na raiz** (2 hits, linhas 64 e 107) e **`docs/BACKEND.md`** (1 hit, linha 583). A AC lê-se contra esses dois. | `ls docs/`, `git grep -n schema-sqlite -- CLAUDE.md docs/` |
| §Decision 1: "sem colisão confirmada com um `errors` pré-existente no destino" | **VERDADEIRO.** `ls packages/client/dist/typescript/src/` → `error-codes go http index.ts typescript`. Não há `errors`. E o export `"./*": "./src/*/index.ts"` (dist/typescript/package.json:11) resolve `@…/client-typescript/errors` **sem editar package.json**. | leitura |
| §Decision 2: "`packages/client/dist/http` é órfã — zero consumidores" | **VERDADEIRO.** `git grep -n "client/dist/http"` → 5 hits, **todos dentro da própria spec**. Nenhum `package.json`/`tsconfig` a referencia; o `"./http"` de `dist/typescript/package.json:10` aponta para `./src/http/index.ts`, outra pasta. 3 arquivos, intocados desde `2dbc4994`. | greps acima |
| §Decision 4: "`go.mod` prefix continua `template/`; esta frente não o toca" (Open Question) | **VERDADEIRO e trivialmente provável.** `git grep -ci codedm -- '*go.mod' '*go.sum'` → **0**. Os 5 módulos são `template/core-go`, `template/api-go`, `template/client-go`, `template/contracts-go` e `bk-dash/scripts/graph/extractor`, com 4 `replace` (`core/go.mod:38`, `api/go.mod:5`, `api/go.mod:67`) — **nenhum carrega a marca**. O walker (`packages/api/go/core/pkg/openapi/walker.go`) casa `template/api-go/…/controllers`; nada nele muda. **Zero renames de módulo Go nesta frente.** | greps acima |
| §Decision 4: "codemod one-shot … contra o comentário do `template.config.ts`" | **VERDADEIRO, e o comentário fica MENTIROSO se não for atualizado.** `template.config.ts:3-6` diz literalmente "Rebranding a fork … é editar THIS file + regenerar — **never a codemod**". Se o founder sanciona o codemod, o comentário precisa passar a descrever o que aconteceu (ver D-E), senão a próxima sessão lê a regra e desfaz a decisão. | leitura |
| AC-9: "`tauri.conf.json` tem `identifier: app.codm.desktop` e `externalBin` `codm-*`" | **VERDADEIRO no destino, mas o caminho é OUTRO: o arquivo é GERADO.** `config/app.ts:19` = `` IDENTIFIER = `app.${REPO.brand}.desktop` ``; `config/generate.ts:65` = `` binName = `${REPO.brand}-${sidecar.role}` ``. Editar `tauri.conf.json` à mão é **vermelho DSK-01** (`generate.test.ts`). AC-9 fecha por `brand = 'codm'` + `bun desktop:generate`. | leitura |
| (a spec NÃO prevê) Crate names Rust derivam do brand | **DESCOBERTA — acoplamento duro.** `template.config.ts:38` = `rust: { cratePrefix: brand }`, e `config/generate.ts:173-178` **já checa** que `Cargo.toml [package] name == ${REPO.brand}-desktop` e `[lib] name == ${REPO.brand}_desktop_lib`. Trocar `brand` **sem** renomear os crates deixa `bun desktop:generate --check` VERMELHO. Superfície: 5 crates (`codedm-desktop`, `codedm_desktop_lib`, `codedm-client-rust`, `codedm-contracts-rust`, `codedm-client-rust-codegen`), 4 `Cargo.toml`, 2 `Cargo.lock`, **127 ocorrências** (99 delas só o path `::codedm_contracts_rust::` no `dist/rust/src/go/mod.rs` gerado). | `sed -n '170,180p' packages/app/tauri/config/generate.ts` |
| (a spec NÃO prevê) O nome do arquivo SQLite carrega a marca | **DESCOBERTA — 43 ocorrências de `codedm.db`.** Literal hardcoded em `packages/api/go/core/db/sqlite/store.go:44` (`dbFileName = "codedm.db"`) e citado em `DataDirLock.ts`, `LibsqlDriver.ts`, `LibsqlDriver.test.ts`, `store_test.go`, `.env.example`, skills e docs. AC-10 (zero `codedm` case-insensitive) **força** o rename para `codm.db`, e o efeito é o mesmo já sancionado por Decision 4: banco local pré-existente fica órfão, ambiente recomeça do zero. | `git grep -o 'codedm\.db' -- . ':!.plans' ':!.specs' \| wc -l` |
| (a spec NÃO prevê) A marca é o **MCP server key** — superfície voltada ao agente | **DESCOBERTA.** `packages/api/typescript/src/agent/mcp/wire.ts:18` = `export const MCP_SERVER_KEY = 'codedm'`, e `MCP_TOOL_WIRE_PREFIX = mcp__${MCP_SERVER_KEY}__`. Isso aparece como `mcp__codedm__AskOperator` etc. em **34 linhas do snapshot** `tests/architecture/__snapshots__/mcp-exposure.test.ts.snap` e em 5 arquivos de teste/serviço. Renomear muda o nome das ferramentas que o agente vê (sessão Claude retomada com `--allowedTools mcp__codedm__*` quebra) — aceitável pré-release, mas é **decisão**, não substituição cega. Ver D-F. | `git grep -n MCP_SERVER_KEY -- packages/` |
| (a spec NÃO prevê) A marca é o **fallback da tag de menção** | **DESCOBERTA.** `src/thread/schemas/MentionGate.ts:11` = `const FALLBACK_TAG = 'codedm'`, e `mintMentionTag('/…/pessoal/codedm')` → `'@codedm'`. O **diretório do repo continua se chamando `codedm`** (esta frente não renomeia o checkout), então após o rebrand a tag mintada ao vivo será `@codedm` enquanto o fallback será `@codm`. Os testes (14 hits em `MentionGate.test.ts`) são funções puras — renomear os dois lados os mantém verdes, mas os docblocks que afirmam "this repo's own packages are `@codedm/*`" viram fato datado. Ver D-G. | leitura |
| (a spec NÃO prevê) `REPO.rootEnvVar` e `REPO.repoUrl` são **literais**, não derivados | **DESCOBERTA.** `template.config.ts:172` = `rootEnvVar: 'CODEDM_ROOT'` e `:150` = `repoUrl: 'https://github.com/codedm/codedm'`. Nenhum dos dois deriva de `scope`/`brand`, logo trocar os consts **não** os move. `rootEnvVar` é lido por `scripts/graph/core/paths.ts:13`; `repoUrl` por 2 regras de eslint. | leitura |
| (a spec NÃO prevê) `bun install` é **obrigatório** e o workspace não resolve num estado parcial | **DESCOBERTA.** 12 `package.json` declaram `name: @codedm/*` e 11 deles são membros de `workspaces` (raiz `package.json`). `tsconfig` não tem `paths` para `@codedm/*` — **toda** resolução é por workspace link. Renomear os `name` sem renomear os 1900 specifiers (ou vice-versa) quebra a resolução do **workspace inteiro**, exatamente o modo de falha que o `CLAUDE.md` do template documenta. `bun.lock` (59 ocorrências) é reescrito pelo `bun install`, nunca à mão. | `git grep -n '@codedm' -- '*tsconfig*.json'` → 0 |
| (a spec NÃO prevê) `bun sdk` (kubb) tem `clean: false` | **CONFIRMADO NO CÓDIGO.** `packages/client/generators/typescript.ts:425` → `output: { …, clean: false }`. Saída **nunca é limpa**: o `dist/typescript/src/error-codes/` antigo **sobrevive** à troca do outDir do generator. O delete é explícito (`git rm -r`), não consequência da regen. | leitura |
| (a spec NÃO prevê) `check:generated` não vigia Rust nem Go dist | **CONFIRMADO.** `scripts/check-generated.ts:22-27` lista só `contractsGenTs`, `contractsGenGo`, `clientTsDist/src` e o `openapi.json` do api-ts. `packages/client/dist/rust/src` (101 ocorrências) e `packages/client/dist/go` ficam **fora do gate** → `git add` explícito em toda task que os toca. E o gate compara por `git status --porcelain`, logo **só passa PÓS-commit**. | leitura |
| (a spec NÃO prevê) Nenhum arquivo/pasta rastreada carrega a marca no NOME, fora do histórico | **VERDADEIRO e libertador.** `git ls-files \| grep -i codedm` → **50 caminhos, TODOS sob `.specs/codedm/`**. Fora do `error-codes`/`schema-sqlite` (decisões 1 e 3), o rebrand **não move nenhum arquivo** — é substituição de conteúdo pura. | grep acima |
| (a spec NÃO prevê) Docblocks de PRODUÇÃO citam `.specs/codedm/` | **DESCOBERTA — armadilha do codemod.** 11 arquivos fora de `.plans`/`.specs` citam o caminho histórico `.specs/codedm/…` em comentário (`ClaudeAgentRunner.ts:68,519`, `AgentFrame.ts`, `AgentUsageEvent.ts`, `ResumeInvalidationReason.ts`, `StreamJsonCodec.test.ts`, `buildArgs.test.ts`, `wire_identity_test.go`, `packages/app/tauri/README.md`, `config/build-sidecars.ts`, `docs/handoff/…`). Um replace cego reescreve `.specs/codm/…`, um caminho que **não existe**. Idem `.gitignore:72,77` (`!.specs/codedm/phase0-smoke/*.log` — quebrar isso muda o que é versionado). Ver D-D. | `git grep -ln '\.specs/codedm' -- packages/ scripts/ .claude/ docs/` |
| (a spec NÃO prevê) Nx é imune | **VERDADEIRO.** `git grep -i codedm -- '*project.json' 'nx.json'` → **0**. Os nomes de projeto (`api-typescript`, `app-react`, `client`, `e2e`, `app-tauri`…) são brand-free. Nenhum rename de projeto/target. `bun x nx reset` entra só como precaução pós-`bun install` (o graph cacheia `package.json`). | grep acima |
| `bun e2e` existe? | **EXISTE como alias** (`package.json` → `"e2e": "nx run e2e:test"`), mas a convenção estabelecida pelas frentes B1/C é **`cd packages/e2e && bun run test`**. Este plano usa a forma direta em todos os gates. | leitura |

**Cinco descobertas que a spec não previu e que este plano absorve:**

1. **A conta da spec (~979) está errada por 2,6×, e o erro é sistemático**: 75,5% de todas as
   ocorrências não-históricas (**1900 de 2516**) são o specifier `@codedm/` — a superfície mais
   mecânica e a que menos precisa de julgamento. Isso reordena o plano: o pass do scope é o maior em
   volume e o mais barato em risco; as superfícies pequenas (env, MCP key, cookie, crates) é que
   carregam a decisão.
2. **`brand` está acoplado a três coisas ao mesmo tempo** — `IDENTIFIER` do Tauri, nomes de binário
   de sidecar **e** nomes de crate Rust (com um check de drift já armado em `generate.ts:173-178`) —
   além do cabeçalho gerado do `.env.example` (`scripts/env/generate.ts:34`). Trocar `brand` isolado
   deixa **dois** gates vermelhos. Por isso o pass do brand é indivisível (T5).
3. **`x-error-codes` é um falso alvo com 12 ocorrências.** É a extensão OpenAPI que carrega o
   vocabulário de erros — renomeá-la quebraria o generator, o emissor e o gate de locales. É a
   primeira entrada da whitelist do codemod (T3) e o primeiro falseador do teste dele.
4. **Duas rails de arquitetura reprovam por construção durante o rebrand, e isso é RED esperado:**
   `packages/api/typescript/tests/architecture/env-model.test.ts` (ENV-01..04: paridade
   schema↔registry↔`.env.example`) fica vermelha entre a edição do `Config.ts` e o `bun env:generate`;
   `packages/app/tauri/config/generate.test.ts` (DSK-01/04/06, incluindo o check de nome de crate)
   fica vermelha entre a troca de `brand` e o `bun desktop:generate` + rename dos `Cargo.toml`.
   **Ambas fundam no mesmo commit da task que as quebra** — nunca ficam vermelhas atravessando um
   commit.
5. **A pasta `dist/typescript/src/error-codes/` não morre sozinha.** `clean: false` no kubb e um
   generator que só faz `mkdir`+`writeFile` significam que trocar o `outDir` **cria** `errors/` e
   **deixa** `error-codes/` para trás — dois diretórios, ambos com um `ERROR_CODES` exportado, e o
   segundo silenciosamente stale. O delete é um passo declarado.

---

## Decisões de desenho tomadas neste plano (grounded)

### D-A — O rebrand é **um script com quatro passes**, não um `--all`, e não quatro scripts

A spec pede "codemod one-shot determinístico". Determinismo vem do **script**, não de rodar tudo numa
invocação. Rodar `--all` produziria um único commit de ~2400 substituições em que nenhum gate
consegue apontar qual superfície quebrou. Rodar quatro scripts perderia a whitelist compartilhada
(a parte que exige julgamento) em quatro cópias.

Então: **um** `scripts/rebrand-codm.ts`, com `--pass=scope|brand|env|text`, `--dry-run` (imprime
contagem por arquivo, não escreve) e `--check` (exit 1 se o pass ainda tem trabalho a fazer).
Cada pass = uma task = um commit verde. O script é **idempotente**: rodar um pass duas vezes é
no-op, o que torna `--check` um gate honesto.

Os quatro passes são separados por **acoplamento de gate**, não por gosto:

| pass | o que move | por que é indivisível | gate que o prova |
|---|---|---|---|
| `scope` | `@codedm/` → `@codm/` + os 12 `name` de `package.json` + o const `scope` | resolução de workspace é all-or-nothing (Ground) | `bun install` + `bun tsc` + `bun test` |
| `brand` | const `brand` + crates Rust + `Cargo.lock` + regen `tauri.conf.json` + regen `.env.example` | `generate.ts:173-178` checa nome de crate contra `REPO.brand`; `env/generate.ts:34` renderiza o brand no `.env.example` | `bun desktop:generate --check` + `cargo build` ×3 + `env-model.test.ts` |
| `env` | `CODEDM_*` → `CODM_*`, `~/.codedm` → `~/.codm`, `codedm.db` → `codm.db`, `rootEnvVar` | ENV-01..04 exigem `Config.ts` + registry + `.env.example` + `config.go` no mesmo instante | `env-model.test.ts` + `go test` + e2e |
| `text` | `CodeDM` → `CODM`, `MCP_SERVER_KEY`, cookie de locale, URLs, prosa de docs/skills, snapshots | resto; é o pass que fecha AC-10 | `git grep -i codedm` com whitelist == 0 |

### D-B — O script morre com a frente

`scripts/rebrand-codm.ts` + `scripts/rebrand-codm.test.ts` nascem em T3 e são **deletados em T7**, o
último pass. Razão: é um artefato one-shot para uma identidade específica; mantê-lo em `scripts/`
convida a próxima sessão a rodá-lo de novo sobre um repo já renomeado. O registro permanente é a
sequência de commits + o artefato de fechamento. Enquanto vivem, ficam cobertos por `bun tsc:scripts`
(`tsconfig.scripts.json` inclui `scripts/**/*.ts`) e o teste roda explicitamente no gate de cada pass
— **deliberadamente NÃO adicionado a `test:tooling`**, para não deixar uma referência órfã no
`package.json` quando o script for deletado.

### D-C — Verificação é **inventário**, não teste de comportamento

Não há comportamento novo para testar em RED→GREEN. O falseador desta frente é o **grep contado**:
cada task declara `N` ocorrências antes, executa, e prova `0` ocorrências fora de whitelist depois.
A única exceção é T3, onde há código novo de verdade (o codemod) e vale TDD clássico: o teste do
codemod nasce vermelho contra fixtures que incluem os três casos-armadilha (`x-error-codes`,
`.specs/codedm/…` em docblock, `.plans/` no histórico).

### D-D — A whitelist é a parte cara, e ela é DECLARADA aqui, não descoberta pelo executor

Seis regras, nesta ordem de precedência:

1. **Caminhos históricos inteiros:** `.plans/**`, `.specs/**`. Renomear menções históricas
   falsifica o registro (`.specs/codedm/GOAL-agent-abstraction.md` diz o que o founder decidiu em
   23-jul; reescrever é fraude documental). **838 ocorrências** ficam onde estão.
2. **Linhas que citam um caminho histórico, em QUALQUER arquivo:** qualquer linha contendo
   `.specs/codedm` ou `.plans/` é preservada byte-a-byte mesmo em arquivo de produção. Cobre os 11
   docblocks do Ground e as 2 linhas do `.gitignore`. Implementação: filtro por LINHA, aplicado antes
   da substituição.
3. **`x-error-codes`** (12 ocorrências): extensão OpenAPI, não marca. Nunca tocada por nenhum pass
   (nem contém `codedm` — está aqui porque é o falso-alvo do T1, e o teste do codemod o exercita).
4. **Registros datados de handoff:** `HANDOFF.md`, `HANDOFF-2026-07-23-ORG.md`, `docs/handoff/*.md`
   (34 ocorrências somadas). Mesma natureza de `.plans`/`.specs`: são fotografias de um estado
   passado, assinadas e datadas. **Ver OQ-1** — se o founder decidir que handoff não é histórico,
   o pass `text` os inclui com uma linha de config.
5. **`bun.lock`** nunca é editado pelo script — é **regenerado** por `bun install` em T4.
6. **Artefatos não-rastreados** (`node_modules/`, `target/`, `.claude/audit/*.jsonl`,
   `.claude/worktrees/`): fora do universo, porque o script itera sobre `git ls-files`.

E, negativamente: **`.specs/2026-07-30-rust-wire-and-tauri-sdk-design.md` nunca é aberto** por
nenhuma task (é a spec canônica de referência) — já coberto pela regra 1, e reafirmado em cada
scope fence.

### D-E — O comentário do `template.config.ts` é ATUALIZADO, não deixado mentindo

`template.config.ts:3-6` diz "Rebranding a fork … é editar THIS file + regenerar — **never a
codemod**". Depois desta frente isso é falso pela metade: o mecanismo declarado (config como fonte de
verdade) **continua valendo** — 1900 das 2516 ocorrências são derivadas ou derivá-veis —, mas o
repo ganhou, de fato, resíduos que só um codemod alcança (env, crates, snapshots, prosa). O
comentário passa a dizer as duas coisas: o caminho normal é editar + regenerar; o que sobrou como
literal está enumerado (`rootEnvVar`, `repoUrl`, `MCP_SERVER_KEY`, `dbFileName`) e é o débito que a
próxima rebrandagem paga. Isso é T7, com o const `brand`/`scope` já em `codm`.

### D-F — `MCP_SERVER_KEY` renomeia, mas **continua um literal** com comentário-espelho

`wire.ts:11-15` argumenta explicitamente que o valor mora num arquivo-folha sem imports, para que uma
correção seja "ONE edit here". Fazê-lo importar `template.config.ts` arrastaria a raiz do repo para
dentro de `packages/api/typescript/src` — um pacote que o `docker/Dockerfile.api` empacota copiando
apenas alguns roots. Então: `MCP_SERVER_KEY = 'codm'`, com uma linha nova no docblock nomeando
`template.config.ts REPO.brand` como o valor que ele espelha (o mesmo padrão que
`packages/api/go/core/pkg/openapi/walker.go` já usa para `modulePrefix`). O snapshot
`mcp-exposure.test.ts.snap` é regenerado (`bun test -u`) **no mesmo commit**, nunca editado à mão.

### D-G — `MentionGate` renomeia o fallback e **admite** que o diretório não renomeou

`FALLBACK_TAG` vira `'codm'` (é brand). Os testes são funções puras e continuam verdes com os dois
lados renomeados. Mas o docblock de `MentionGate.ts:39-42` afirma um fato sobre ESTE repo ("its live
thread is bound to `/…/pessoal/codedm`") que continua verdadeiro depois do rebrand, porque o
**checkout não é renomeado**. Esse docblock é reescrito para dizer a verdade nova: o diretório do
repo permanece `codedm`, então a tag mintada ao vivo é `@codedm` enquanto o fallback é `@codm` — e é
exatamente por isso que a regra de fronteira (`/`) importa. Renomear o checkout está **fora de escopo**
(não é um arquivo rastreado).

### D-H — Ordem: o barato e disjunto primeiro, o scope antes das superfícies pequenas

T1 e T2 não tocam marca e podem falhar/rodar sozinhos. T3 (codemod) depende dos dois **só para que o
inventário do dry-run seja o final** — se rodasse antes, contaria um `error-codes` que vai virar
`errors`. T4 (scope) vem antes de T5-T7 porque é o maior volume e o mais mecânico: com ele fechado,
as superfícies restantes ficam pequenas o bastante para serem lidas linha a linha.

---

## Task T1: A higiene do `packages/client/dist` — a pasta órfã morre e `error-codes` vira `errors`

**Files to write:**
- Delete: `packages/client/dist/http/` (3 arquivos: `config.d.ts`, `index.d.ts`, `index.js`)
- Delete: `packages/client/dist/typescript/src/error-codes/` (o diretório antigo, após a regen criar o novo)
- Modify: `packages/client/generators/error-codes.ts` — `outDir` (linha 20) e os 3 docblocks que citam o caminho antigo (linhas 7-8, 41, 51)
- Modify: `packages/app/react/src/lib/errors.ts` — o specifier (linha 2) + a prosa da linha 13
- Rename + Modify: `packages/app/react/src/locales/error-codes.check.ts` → `packages/app/react/src/locales/errors.check.ts` (specifier na linha 7 + prosa na linha 3)
- Create (via regen): `packages/client/dist/typescript/src/errors/index.ts`

**Files to read:**
- `packages/client/generators/error-codes.ts` — o generator inteiro (55 linhas); onde `outDir` é montado e onde ele é ecoado no log
- `packages/client/dist/typescript/package.json` — confirmar que `"./*": "./src/*/index.ts"` cobre `errors` **sem** edição
- `packages/client/generators/typescript.ts:425` — `clean: false`, a razão do delete explícito

**Agent:** general-purpose · **Reviewer:** spec-compliance-reviewer · **Model:** sonnet · **Skills:** /sdk
**Depends on:** (none)
**Scope fence:** DONE: as duas pastas de `dist`, o generator, os 2 consumidores em `app-react`, o
rename do arquivo `.check`. OUT: **toda** a marca (`@codedm` permanece `@codedm` ao fim desta task —
o rename de scope é T4); `x-error-codes` em qualquer lugar; `packages/client/generators/error-codes.ts`
como NOME de arquivo (AC-1 o mantém); `packages/contracts/**`; `.specs`/`.plans`.
**Gate:** `bun sdk` (exit 0) · `cd packages/app/react && bun x tsc` (exit 0) · `bun tsc` (exit 0) ·
`bun lint` (exit 0) · `git grep -n "client/dist/http" -- . ':!.specs'` → vazio ·
`git grep -n "src/error-codes\|client-typescript/error-codes" -- . ':!.plans' ':!.specs'` → vazio ·
`git grep -o 'x-error-codes' -- . ':!.plans' ':!.specs' | wc -l` → **12** (inalterado)

### Step T1.1 — Inventário ANTES (números citáveis no commit)

- [ ] `git grep -o 'error-codes' -- . ':!.plans' ':!.specs' | wc -l` → esperado **29**
- [ ] `git grep -o 'x-error-codes' -- . ':!.plans' ':!.specs' | wc -l` → esperado **12** (whitelist dura — este número NÃO muda)
- [ ] `git grep -o 'generators/error-codes' -- . ':!.plans' ':!.specs' | wc -l` → esperado **3** (nome do generator, AC-1 o preserva — este número TAMBÉM não muda)
- [ ] `git grep -o 'client-typescript/error-codes' -- . ':!.plans' ':!.specs' | wc -l` → esperado **5** (o specifier: 1 import + 1 prosa em `lib/errors.ts`, 1 import + 1 prosa em `error-codes.check.ts`, 1 no docblock do generator)
- [ ] `git grep -o 'src/error-codes' -- . ':!.plans' ':!.specs' | wc -l` → esperado **3**
- [ ] `git ls-files packages/client/dist/http | wc -l` → esperado **3**
- [ ] Anotar os 6 números; eles vão no corpo do commit

### Step T1.2 — A pasta órfã morre

- [ ] `git rm -r packages/client/dist/http`
- [ ] Confirmar que nada apontava para ela: `git grep -n "dist/http" -- . ':!.specs'` → vazio (o `"./http"` de `dist/typescript/package.json:10` aponta para `./src/http/index.ts`, **outra** pasta — não confundir)

### Step T1.3 — O generator aponta para `errors`

- [ ] `packages/client/generators/error-codes.ts:20`: `'../dist/typescript/src/error-codes'` → `'../dist/typescript/src/errors'`
- [ ] Os 3 docblocks/logs que citam o caminho (linhas ~7-8, ~41, ~51) passam a dizer `errors` / `@codedm/client-typescript/errors` — **o scope permanece `@codedm` aqui**; T4 o troca
- [ ] O NOME do arquivo (`generators/error-codes.ts`) e a chave `x-error-codes` que ele lê ficam intactos — AC-1 nomeia o generator pelo caminho atual

### Step T1.4 — Regen + o delete que o `clean: false` não faz

- [ ] `bun sdk` → confirma no stdout `[error-codes] N codes from M service spec(s) → dist/typescript/src/errors/index.ts`
- [ ] `ls packages/client/dist/typescript/src/` → **ambas** `error-codes` e `errors` existem agora (a prova viva do `clean: false`)
- [ ] `git rm -r packages/client/dist/typescript/src/error-codes`
- [ ] `ls packages/client/dist/typescript/src/` → `errors go http index.ts typescript`

### Step T1.5 — Os dois consumidores em `app-react`

- [ ] `src/lib/errors.ts:2` → `import { ERROR_CODES } from '@codedm/client-typescript/errors'`; a prosa da linha 13 acompanha
- [ ] `git mv packages/app/react/src/locales/error-codes.check.ts packages/app/react/src/locales/errors.check.ts`
- [ ] Dentro dele: o `import type { ErrorCode }` (linha 7) e a prosa (linha 3) apontam para `.../errors`
- [ ] Confirmar que o rename não quebra import nenhum: `git grep -n "error-codes.check\|errors.check" -- . ':!.plans' ':!.specs'` → **zero importadores** (o arquivo é incluído pelo glob do tsconfig, é um contrato de tipo puro — medido em HEAD)

### Step T1.6 — Verificação DEPOIS

- [ ] `bun sdk` (2ª vez, idempotente) → sem diff novo em `git status`
- [ ] `cd packages/app/react && bun x tsc` → exit 0 (**este é o gate que prova o specifier**: um `errors` que não resolvesse daria `Cannot find module`)
- [ ] `bun tsc` · `bun lint` → exit 0
- [ ] `git grep -o 'x-error-codes' -- . ':!.plans' ':!.specs' | wc -l` → **12**, idêntico ao Step T1.1
- [ ] `git grep -n 'src/error-codes\|client-typescript/error-codes\|client/dist/http' -- . ':!.plans' ':!.specs'` → vazio

### Step T1.7 — Commit

```bash
git add packages/client/generators/error-codes.ts \
        packages/client/dist/typescript/src/errors \
        packages/app/react/src/lib/errors.ts \
        packages/app/react/src/locales/errors.check.ts
git add -u packages/client/dist packages/app/react/src/locales
git status --porcelain   # conferir: só os caminhos acima + os deletes
git commit -m "refactor(client,app-react): A T1 — dist/http orfao morre, error-codes vira errors

A pasta packages/client/dist/http (3 arquivos, intocada desde 2dbc4994, zero
consumidores no repo) some. O outDir do generator passa de
dist/typescript/src/error-codes para .../errors e os 2 consumidores do app-react
re-apontam; locales/error-codes.check.ts vira errors.check.ts (zero importadores,
e contrato de tipo puro).

O diretorio antigo NAO morre sozinho: kubb roda com clean: false
(generators/typescript.ts:425) e o generator so faz mkdir+writeFile, entao a
regen CRIA errors/ e DEIXA error-codes/ para tras — dois ERROR_CODES exportados,
o segundo stale. O delete e explicito.

x-error-codes (12 ocorrencias) NAO e alvo: e a extensao OpenAPI que carrega o
vocabulario de erros, lida pelo proprio generator. Contagem conferida antes e
depois: 12 → 12. O nome do arquivo generators/error-codes.ts fica (AC-1 o
nomeia assim). O scope @codedm segue intacto — T4 o troca.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task T2: `schema-sqlite` → `schema` — 61 ocorrências, 28 arquivos, e a convenção sobe pro template

**Files to write:**
- Rename: `packages/contracts/db/schema-sqlite/` → `packages/contracts/db/schema/` (30 arquivos rastreados, via `git mv`)
- Modify (contracts): `packages/contracts/package.json` (3 hits: 2 exports + o script `drizzle:generate`), `packages/contracts/db/migrations.ts` (6), `packages/contracts/db/schema/drizzle.config.ts` (3, auto-referências), `packages/contracts/db/schema/issue.ts` (1, comentário)
- Modify (api-ts): `packages/api/typescript/scripts/build.ts` (5), `packages/api/typescript/scripts/migrate.ts` (1), `packages/api/typescript/scripts/smoke-shared-store.ts` (1), `packages/api/typescript/src/thread/repositories/ThreadRepository/DrizzleThreadRepository.ts` (1), `packages/api/typescript/tests/architecture/context-map.test.ts` (3), `packages/api/typescript/tests/architecture/enum-placement.test.ts` (2), `packages/api/typescript/tests/kernel/concurrent-boot.test.ts` (1)
- Modify (api-go, **não previsto pela spec**): `packages/api/go/core/db/dbutil/sqlite.go` (1), `packages/api/go/core/db/sqlite/sqlc.yaml` (3), `packages/api/go/internal/channel/repositories/channel/sqlite_channel_repository.go` (1)
- Modify (tooling): `biome.jsonc` (2), `scripts/db/sync-sqlite-migrations.ts` (3), `scripts/db/sync-sqlite-migrations.test.ts` (2), `scripts/graph/core/config.ts` (1), `scripts/graph/adapters/ts/extractors/drizzle.ts` (1), `scripts/graph/tests/build.integration.test.ts` (1, **4º teste, não previsto**), `packages/app/tauri/config/build-sidecars.ts` (1), `docker/Dockerfile.api` (1)
- Modify (docs/skills): `.claude/skills/migrate/SKILL.md` (7 + a convenção nova), `.claude/registry.yaml` (1), `.claude/commands/install.md` (1), `.claude/hooks/classify-edit.test.ts` (3), `CLAUDE.md` (2), `docs/BACKEND.md` (1 + a convenção nova)

**Files to read:**
- `packages/contracts/db/migrations.ts` — as duas resoluções (fonte e `dist/`) e por que ambas mudam juntas
- `packages/api/typescript/scripts/build.ts:20-40` — o staging `dist/schema-sqlite/migrations` e o comentário sobre `import.meta.url` reescrito
- `.claude/skills/migrate/SKILL.md` — onde a convenção nova pousa

**Agent:** general-purpose · **Reviewer:** spec-compliance-reviewer → code-reviewer · **Model:** sonnet · **Skills:** /migrate, /db-modelling
**Depends on:** (none — disjunto de T1; declarado assim de propósito, pode rodar antes ou depois)
**Scope fence:** DONE: as 61 ocorrências não-históricas + o `git mv` da pasta + a convenção nas 2
superfícies de doutrina (`/migrate` SKILL.md e `docs/BACKEND.md`). OUT: qualquer marca (`codedm`
segue intacto); o CONTEÚDO dos arquivos de schema (nenhuma tabela/coluna muda); os `.sql` de
migração (só a pasta que os contém se move); `.plans`/`.specs`.
**Gate:** `cd packages/contracts && bun run drizzle:generate` (exit 0, **e nenhuma migração nova gerada** — o schema não mudou) · `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` · `cd packages/api/typescript && bun test` · `cd packages/api/typescript/core && bun test` · `cd packages/api/go && go build ./... && go -C core build ./...` · `bun tsc` · `bun lint` · `bun test:tooling` · `bun x nx run api-typescript:build` → artefato em `dist/schema/migrations` (AC-6) · `git grep -n 'schema-sqlite' -- . ':!.plans' ':!.specs'` → **vazio**

### Step T2.1 — Inventário ANTES

- [ ] `git grep -o 'schema-sqlite' -- . ':!.plans' ':!.specs' | wc -l` → esperado **61**
- [ ] `git grep -l 'schema-sqlite' -- . ':!.plans' ':!.specs' | wc -l` → esperado **28**
- [ ] `git ls-files packages/contracts/db/schema-sqlite | wc -l` → esperado **30**
- [ ] Registrar a lista de 28 arquivos; **9 deles não estão na spec** (Ground) — o commit os nomeia

### Step T2.2 — A pasta se move

- [ ] `git mv packages/contracts/db/schema-sqlite packages/contracts/db/schema`
- [ ] Verificar que os `migrations/*.sql` e `migrations/meta/` vieram junto: `git ls-files packages/contracts/db/schema | wc -l` → **30**

### Step T2.3 — Contracts (o dono) re-aponta

- [ ] `packages/contracts/package.json`: `"." ` e `"./db"` → `./db/schema/index.ts`; `drizzle:generate` → `--config=db/schema/drizzle.config.ts`
- [ ] `db/schema/drizzle.config.ts`: `schema`, `out` e o `url` do `.scratch` (3 hits — o `.scratch/codedm.db` mantém a marca por ora; T6 a troca)
- [ ] `db/migrations.ts`: as 6 menções, incluindo **as duas resoluções** — a de fonte (`<dirname>/schema/migrations`) e a de `dist/` (`dist/schema/migrations`), que precisam concordar com `build.ts`
- [ ] `db/schema/issue.ts`: o comentário que cita `schema-sqlite/thread.ts`

### Step T2.4 — api-ts: build, migrate, smokes e os 3 testes com path hardcoded

- [ ] `scripts/build.ts`: as 5 menções — `contractsMigrations` (:38), `stagedMigrations` (:39), a mensagem de sucesso (:118) e os 2 docblocks (:23-26). **`dist/schema-sqlite/migrations` → `dist/schema/migrations` é literalmente AC-6**
- [ ] `scripts/migrate.ts` (:10), `scripts/smoke-shared-store.ts` (:323), `src/thread/.../DrizzleThreadRepository.ts` (:221, comentário)
- [ ] `tests/architecture/context-map.test.ts` (:29 `CONTRACTS_SCHEMA`, :179 nome do teste, :223 comentário)
- [ ] `tests/architecture/enum-placement.test.ts` (:38 `CONTRACTS_SCHEMA`, :116 nome do teste)
- [ ] `tests/kernel/concurrent-boot.test.ts` (:56, o `join(...)` da pasta de migrações)
- [ ] **Falseador barato**: antes de corrigir os 3 testes, rodar `cd packages/api/typescript && bun test tests/architecture tests/kernel` — devem estar VERMELHOS (path inexistente) logo após o `git mv` do Step T2.2. Registrar quantos falham; depois da correção, verde. Isso prova que o path era vivo, não decorativo

### Step T2.5 — api-go (não previsto pela spec), tooling e docker

- [ ] `core/db/dbutil/sqlite.go:10`, `core/db/sqlite/sqlc.yaml:5,6,10`, `internal/channel/repositories/channel/sqlite_channel_repository.go:34` — todos comentários/documentação de caminho; **nenhum `sqlc` regen é necessário** (o `sqlc.yaml` cita o caminho em comentário, não em `schema:`) — confirmar isso lendo o arquivo antes de editar
- [ ] `biome.jsonc:40,75` (o include e o `!!.../migrations/meta`)
- [ ] `scripts/db/sync-sqlite-migrations.ts:5,8,37` (`SOURCE_DIR`) + `.test.ts:40,41`
- [ ] `scripts/graph/core/config.ts:177` (`DRIZZLE_SCHEMA_DIR`), `scripts/graph/adapters/ts/extractors/drizzle.ts:1`, `scripts/graph/tests/build.integration.test.ts:50`
- [ ] `packages/app/tauri/config/build-sidecars.ts:164`
- [ ] `docker/Dockerfile.api:57`

### Step T2.6 — Skills, registry, hooks e docs

- [ ] `.claude/skills/migrate/SKILL.md` — 7 menções de caminho
- [ ] `.claude/registry.yaml:145` — o padrão `db-schema` (`packages/contracts/db/schema/*.ts`)
- [ ] `.claude/commands/install.md:154`
- [ ] `.claude/hooks/classify-edit.test.ts:263-265` — os 3 hits são um teste do glob-matcher; renomear os dois lados o mantém honesto
- [ ] `CLAUDE.md:64,107` e `docs/BACKEND.md:583` — **estes são os arquivos que a AC-5 chama de "docs/CLAUDE.md", que não existe** (Ground)

### Step T2.7 — O que sobe pro template: `db/schema/` é neutro a dialeto

- [ ] `.claude/skills/migrate/SKILL.md` ganha uma linha normativa: a pasta canônica de schema Drizzle é `packages/contracts/db/schema/`, **sem sufixo de dialeto**. O dialeto é uma propriedade do driver e do `drizzle.config.ts`, não do nome da pasta — um fork que troque SQLite por Postgres troca o config, não move 30 arquivos
- [ ] `docs/BACKEND.md:583` acompanha, na frase que descreve a ownership do schema
- [ ] **Nada mais desta frente sobe pro template** (a spec é explícita): `error-codes → errors` e o delete do `dist/http` são limpezas locais; o rebrand é identidade deste fork

### Step T2.8 — Verificação DEPOIS

- [ ] `git grep -n 'schema-sqlite' -- . ':!.plans' ':!.specs'` → **vazio** (AC-4, AC-5)
- [ ] `git grep -c 'schema-sqlite' -- .plans .specs | awk -F: '{s+=$NF}END{print s}'` → **118** (o histórico ficou intacto — este número prova a whitelist)
- [ ] `ls packages/contracts/db/` → `migrations.ts schema` (não existe `schema-sqlite` — AC-4)
- [ ] `bun x nx run api-typescript:build && ls packages/api/typescript/dist/` → contém `schema/migrations`, **não** `schema-sqlite/migrations` (AC-6)
- [ ] `cd packages/contracts && bun run drizzle:generate` → "No schema changes" (o rename não gerou migração)
- [ ] Bateria de gates da task, toda verde

### Step T2.9 — Commit

```bash
git add -A packages/contracts/db packages/contracts/package.json
git add packages/api/typescript/scripts packages/api/typescript/src/thread/repositories \
        packages/api/typescript/tests packages/api/go/core/db packages/api/go/internal/channel/repositories \
        biome.jsonc scripts/db scripts/graph packages/app/tauri/config/build-sidecars.ts \
        docker/Dockerfile.api .claude/skills/migrate .claude/registry.yaml .claude/commands/install.md \
        .claude/hooks/classify-edit.test.ts CLAUDE.md docs/BACKEND.md
git status --porcelain
git commit -m "refactor(contracts): A T2 — db/schema-sqlite vira db/schema, e o nome para de citar o dialeto

61 ocorrencias em 28 arquivos, nao os ~22 pontos que a spec estimou: a lista da
spec omitia 9 arquivos (registry.yaml, commands/install.md, docs/BACKEND.md, 3
de api-go, smoke-shared-store.ts, DrizzleThreadRepository.ts e um QUARTO teste
com path hardcoded, scripts/graph/tests/build.integration.test.ts). A AC-5
tambem cita 'docs/CLAUDE.md', que nao existe — os arquivos reais sao CLAUDE.md
na raiz e docs/BACKEND.md.

dist/schema-sqlite/migrations vira dist/schema/migrations em build.ts e nas duas
resolucoes de db/migrations.ts, que precisam concordar (AC-6). Os 3 testes de
arquitetura/boot ficaram vermelhos logo apos o git mv, provando que o path era
vivo; verdes de novo apos a correcao.

Sobe pro template: db/schema/ e o nome canonico, neutro a dialeto — trocar de
SQLite para Postgres e trocar o drizzle.config.ts, nao mover 30 arquivos.
Registrado na skill /migrate e em docs/BACKEND.md.

Historico em .plans/.specs intocado: 118 ocorrencias de schema-sqlite continuam
la, e devem continuar.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task T3: O codemod nasce — com whitelist declarada e o falseador dos três falsos-alvos

**Files to write:**
- Create: `scripts/rebrand-codm.ts` — o script de 4 passes, `--dry-run`, `--check`, idempotente
- Create: `scripts/rebrand-codm.test.ts` — TDD: whitelist, idempotência, os 3 casos-armadilha

**Files to read:**
- `template.config.ts` — `scope`/`brand`/`LANG_CONFIG`/`rootEnvVar`/`repoUrl` e o comentário das linhas 3-6
- `scripts/env/generate.ts` — como `.env.example` é renderizado a partir de `REPO.env`
- `packages/app/tauri/config/generate.ts:60-80,165-185` — `binName` e o check de nome de crate
- `scripts/check-generated.ts` — quais roots o gate vigia (e quais NÃO)

**Agent:** general-purpose · **Reviewer:** spec-compliance-reviewer → code-reviewer · **Model:** sonnet · **Skills:** /test
**Depends on:** T1, T2
**Scope fence:** DONE: os 2 arquivos novos em `scripts/`. OUT: **nenhuma substituição é aplicada
nesta task** — o script só nasce e é falseado; `--dry-run` roda, `--pass` não. Nenhum arquivo fora de
`scripts/` é modificado. Nada em `.plans`/`.specs`.
**Gate:** `bun test scripts/rebrand-codm.test.ts` (exit 0) · `bun tsc:scripts` (exit 0) · `bun lint` ·
`bun scripts/rebrand-codm.ts --dry-run --pass=scope|brand|env|text` (os 4, exit 0, sem escrever) ·
`git status --porcelain` fora de `scripts/` → **vazio** (a prova de que a task não aplicou nada)

### Step T3.1 — RED: o teste antes do script

Escrever `scripts/rebrand-codm.test.ts` primeiro. Ele testa a função pura de reescrita
(`rewriteContent(path, text, pass)`), não o I/O — o walker sobre `git ls-files` é fiação trivial e
fica fora do teste.

Os `it(...)` obrigatórios, cada um um falseador de uma regra da whitelist (D-D):

- [ ] **`x-error-codes` sobrevive a todos os 4 passes.** Entrada: `"x-error-codes": ["FOO"]` → saída idêntica. (É a regra 3; e é o falso-alvo que o T1 já contou como 12 ocorrências imutáveis.)
- [ ] **Linha que cita `.specs/codedm/` sobrevive, mesmo num arquivo de produção que MUDA na mesma passada.** Entrada de 2 linhas: `` import x from '@codedm/core-typescript' `` + `` // ver .specs/codedm/2026-07-26-agent-driving-stream-json.md `` → saída: a 1ª vira `@codm/`, a 2ª **byte-idêntica**. (Regra 2 — a armadilha real, 11 arquivos em HEAD.)
- [ ] **Linha que cita `.plans/` sobrevive** — mesmo formato.
- [ ] **Arquivo sob `.plans/` ou `.specs/` é rejeitado inteiro** (o script nem o abre). (Regra 1.)
- [ ] **`HANDOFF.md` / `docs/handoff/*.md` são rejeitados inteiros** (regra 4; ver OQ-1 — se o founder inverter, é uma linha de config)
- [ ] **Idempotência**: `rewrite(rewrite(x)) === rewrite(x)` para os 4 passes, sobre uma fixture que contém todas as formas
- [ ] **Escopo por pass**: o pass `scope` toca `@codedm/` e NÃO toca `CODEDM_DATA_DIR`; o pass `env` toca `CODEDM_DATA_DIR` e NÃO toca `@codedm/`; `brand` toca `codedm-client-rust`/`codedm_contracts_rust`/`codedm-daemon` e não toca env; `text` toca `CodeDM` e o `codedm` solto
- [ ] **`CodeDM` → `CODM` (all-caps), não `Codm`** — a spec pede all-caps onde a marca aparece como nome próprio

### Step T3.2 — GREEN: o script

- [ ] `scripts/rebrand-codm.ts`: itera `git ls-files`, aplica `rewriteContent` por arquivo, escreve só o que mudou
- [ ] Flags: `--pass=<scope|brand|env|text>` (obrigatória, exceto sob `--dry-run` que aceita todas), `--dry-run` (imprime `arquivo: N substituições`, total, e **não escreve**), `--check` (exit 1 se o pass ainda tem trabalho — é o que cada task usa como gate de "acabou")
- [ ] As tabelas de substituição, por pass, **explícitas no código** (não regex genérica sobre `codedm`):
  - `scope`: `@codedm/` → `@codm/`
  - `brand`: `codedm-client-rust`→`codm-client-rust`, `codedm_client_rust`→`codm_client_rust`, `codedm-contracts-rust`→`codm-contracts-rust`, `codedm_contracts_rust`→`codm_contracts_rust`, `codedm-desktop`→`codm-desktop`, `codedm_desktop_lib`→`codm_desktop_lib`, `codedm-daemon`→`codm-daemon`, `codedm-gateway`→`codm-gateway`, `app.codedm.desktop`→`app.codm.desktop`, `codedm-plans`→`codm-plans`, `codedm-e2e-data-`→`codm-e2e-data-`
  - `env`: `CODEDM_`→`CODM_`, `~/.codedm`→`~/.codm`, `.codedm/data`→`.codm/data`, `codedm.db`→`codm.db`
  - `text`: `CodeDM`→`CODM`, `codedm_locale`→`codm_locale`, `github.com/codedm`→`github.com/codm`, e por fim o **catch-all** `codedm`→`codm` (que só roda no pass `text`, depois de todas as formas específicas terem passado)
- [ ] O const `scope` / `brand` do `template.config.ts` **não** é caso especial: `scope = '@codedm'` é pego pela tabela de `scope` (contém `@codedm`… — atenção: `'@codedm'` sem `/`. Adicionar `@codedm'` → `@codm'` explicitamente à tabela `scope`, e falsear isso com um `it`), e `brand = 'codedm'` cai no catch-all do pass `text`. **Este plano prefere o explícito**: `template.config.ts` é editado à mão nos passes que o exigem (T4 e T5), e o script apenas confirma via `--check`. Ver os Steps de T4/T5.

### Step T3.3 — Dry-run: o inventário que os 4 próximos commits citam

- [ ] `bun scripts/rebrand-codm.ts --dry-run --pass=scope` → esperado **~1900** (o valor exato é o que vai no commit de T4)
- [ ] `--dry-run --pass=brand` → esperado **~150** (127 de crate + `codedm-daemon` 6 + `codedm-gateway` 11 + `app.codedm.desktop` 4 + resíduos)
- [ ] `--dry-run --pass=env` → esperado **~180** (`CODEDM_` 132 + `codedm.db` 43 + `~/.codedm` 5)
- [ ] `--dry-run --pass=text` → o restante até fechar **2516** menos a whitelist
- [ ] **Somar os quatro e conferir contra `git grep -oi codedm -- . ':!.plans' ':!.specs' ':!docs/handoff' ':!HANDOFF.md' ':!HANDOFF-2026-07-23-ORG.md' | wc -l`.** Se sobrar diferença, ela é a whitelist da regra 2 (linhas com `.specs/codedm`) — **contá-la explicitamente** e registrar o número; ele é o resíduo esperado que o AC-10 vai precisar aceitar

### Step T3.4 — Commit

```bash
git add scripts/rebrand-codm.ts scripts/rebrand-codm.test.ts
git status --porcelain   # DEVE conter APENAS esses 2 arquivos
git commit -m "chore(scripts): A T3 — o codemod do rebrand nasce, com a whitelist falseada

Um script, quatro passes (--pass=scope|brand|env|text), --dry-run e --check.
Idempotente por construcao e provado assim no teste. Nada foi substituido nesta
task: o script so nasce e e falseado.

A parte cara do rebrand nao e substituir string, e saber onde NAO substituir. Sao
6 regras, e as tres primeiras tem falseador proprio:
  1. .plans/** e .specs/** inteiros (838 ocorrencias de historico ficam).
  2. QUALQUER linha que cite .specs/codedm ou .plans/ — inclusive dentro de
     docblock de producao. Sao 11 arquivos em HEAD (ClaudeAgentRunner, AgentFrame,
     wire_identity_test.go, .gitignore...); um replace cego produziria
     .specs/codm/, um caminho que nao existe.
  3. x-error-codes — extensao OpenAPI, nao marca. 12 ocorrencias, imutaveis.
  4. HANDOFF*.md e docs/handoff/* como registro datado (OQ-1).
  5. bun.lock e regenerado por bun install, nunca editado.
  6. so arquivos de git ls-files entram no universo.

Inventario do dry-run registrado para os 4 commits seguintes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task T4: Pass `scope` — `@codedm` → `@codm` (~1900 ocorrências, atômico com `bun install`)

**Files to write:**
- Modify: `template.config.ts` — `const scope = '@codm'` (linha 16). **`brand` NÃO muda aqui** (T5)
- Modify: os 12 `package.json` que declaram `name: '@codedm/*'` — raiz (`codedm` → `codm`), `packages/api/typescript{,/core}`, `packages/app/{astro,react,styles,tauri}`, `packages/client{,/dist/typescript}`, `packages/contracts{,/generated/typescript}`, `packages/e2e` — e toda `dependency`/`devDependency` `workspace:*` que os nomeia
- Modify: ~1900 ocorrências do specifier em `packages/api/typescript` (779 de `@codedm/`), `packages/client/dist/typescript` (359), `packages/contracts` (84), `packages/app/react`, `packages/e2e`, `scripts/`, `.claude/skills/**`, `docker/`, `docs/`
- Regenerate: `bun.lock`, `packages/client/dist/typescript/src/**`, `packages/contracts/generated/typescript/**`, `packages/api/typescript/public/docs/openapi.json`

**Files to read:**
- `package.json` (raiz) — o array `workspaces`, 11 membros
- `packages/client/dist/typescript/package.json` — **hand-mantido**, não gerado (não está em `GENERATED_ROOTS`)
- `packages/contracts/generated/typescript/package.json` — idem

**Agent:** general-purpose · **Reviewer:** spec-compliance-reviewer · **Model:** sonnet · **Skills:** /sdk
**Depends on:** T3
**Scope fence:** DONE: o const `scope`, os 12 `name`, todos os specifiers, `bun install`, a regen
completa. OUT: `brand` (T5), `CODEDM_*` (T6), texto/`CodeDM` (T7); `go.mod`/`go.sum` (**zero hits**,
Ground); `.plans`/`.specs`; o histórico dentro de docblocks (regra 2 da whitelist).
**Gate:** `bun install` (exit 0) · `bun x nx reset` · `bun tsc` (exit 0, `--skipNxCache`) ·
`bun lint` · `bun run test` · `bun test:tooling` · `cd packages/app/react && bun x tsc` ·
`cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` ·
`cargo build --manifest-path packages/client/dist/rust/Cargo.toml` (o crate lê o contrato; o scope TS
não o toca, mas é o gate barato que prova isso) · `bun scripts/rebrand-codm.ts --check --pass=scope` →
exit 0 · `bun check:generated` **PÓS-commit**

### Step T4.1 — Inventário ANTES

- [ ] `git grep -o '@codedm' -- . ':!.plans' ':!.specs' | wc -l` → registrar (esperado ~1900+15 do config)
- [ ] `git grep -ln '"name": "@codedm' -- '*package.json' | wc -l` → esperado **11** (+ a raiz, cujo `name` é `codedm` sem `@`) = **12** arquivos
- [ ] `git grep -o '@codedm/' -- packages/api/typescript | wc -l` → **779**; `-- packages/client/dist/typescript` → **359**; `-- packages/contracts` → **84**

### Step T4.2 — O const primeiro, e à mão

- [ ] `template.config.ts:16`: `const scope = '@codedm'` → `const scope = '@codm'`
- [ ] **Não** tocar `brand` (linha 17), `rootEnvVar` (:172) nem `repoUrl` (:150) — são T5/T6/T7
- [ ] Conferir que tudo que deriva segue: `sdkPackage`, `sdkSpecifier`, `corePackage`, `dbOrmSchemaSpecifier`, `sdkPackagePrefixes.typescript`, `LANG_CONFIG.typescript.packageScope` — **6 derivações**, nenhuma precisa de edição

### Step T4.3 — Os 12 `name` e o `bun install` que os religa

- [ ] Rodar `bun scripts/rebrand-codm.ts --pass=scope` (cobre os `name`, os `workspace:*` e os 1900 specifiers na mesma passada — é exatamente por isso que o pass é indivisível)
- [ ] `bun install` — regenera `bun.lock` (59 ocorrências viram `@codm`) e refaz os symlinks de `node_modules`
- [ ] `bun x nx reset` — o graph do Nx cacheia `package.json`; sem isso um target pode replayar um hash do nome antigo
- [ ] **Falseador de resolução**: `bun x nx run app-react:tsc --skipNxCache` deve passar. Se o pass tivesse renomeado os `name` mas não os specifiers (ou vice-versa), este é o comando que grita `Cannot find module '@codm/client-typescript'` — o modo de falha que o `CLAUDE.md` do template documenta

### Step T4.4 — Regen limpa, porque `bun sdk` é incremental

- [ ] `cd packages/contracts && bun run all` (contracts codegen: TS + Go + Rust)
- [ ] `bun emit-openapi` → `packages/api/typescript/public/docs/openapi.json`
- [ ] `bun sdk`
- [ ] **Verificação anti-incremental** (fato #1 do repo): `git grep -rn '@codedm' -- packages/client/dist packages/contracts/generated` → **vazio**. Se sobrar QUALQUER hit, forçar regen limpa: `rm -rf packages/client/dist/typescript/src && bun sdk`, e repetir o grep. `clean: false` no kubb (`generators/typescript.ts:425`) é a razão pela qual esta checagem não é opcional
- [ ] `git add` **explícito** de `packages/client/dist/rust` e `packages/client/dist/go` — `check:generated` não os vigia (Ground)

### Step T4.5 — Verificação DEPOIS

- [ ] `git grep -n '@codedm' -- . ':!.plans' ':!.specs' ':!docs/handoff' ':!HANDOFF.md' ':!HANDOFF-2026-07-23-ORG.md'` → **vazio**
- [ ] `git grep -o '@codedm' -- .plans .specs | wc -l` → inalterado frente ao Step T4.1 (histórico preservado)
- [ ] Bateria de gates completa
- [ ] `bun scripts/rebrand-codm.ts --check --pass=scope` → exit 0

### Step T4.6 — Commit (e o `check:generated` depois dele)

```bash
git add -u
git add packages/client/dist packages/contracts/generated packages/api/typescript/public/docs/openapi.json bun.lock
git status --porcelain
git commit -m "refactor(repo): A T4 — o npm scope vira @codm (pass 1/4 do rebrand)

~1900 ocorrencias, 75% de todo o rebrand — e a superficie mais mecanica e a de
menor risco. template.config.ts scope = '@codm'; as 6 derivacoes (sdkPackage,
sdkSpecifier, corePackage, dbOrmSchemaSpecifier, sdkPackagePrefixes.typescript,
LANG_CONFIG.typescript.packageScope) seguem sozinhas.

O pass e ATOMICO porque a resolucao de workspace e all-or-nothing: nao ha paths
no tsconfig para @codedm/*, tudo resolve por link de workspace. Renomear os 12
'name' sem os specifiers (ou o contrario) quebra o workspace INTEIRO — o modo de
falha que o CLAUDE.md do template documenta. Por isso os name, os workspace:*, os
specifiers, o bun install e o nx reset viajam juntos.

Regen NAO e incremental por sorte: kubb roda com clean: false, entao o
'git grep @codedm em dist/ e generated/' apos a regen e um gate, nao uma
formalidade. dist/rust e dist/go entraram por git add explicito — check:generated
nao os vigia.

brand continua 'codedm' (T5), CODEDM_* continua (T6), CodeDM continua (T7).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"

bun check:generated   # PÓS-commit — compara por git status; registrar a saída
```

---

## Task T5: Pass `brand` — a marca, os 5 crates Rust e a identidade Tauri (indivisíveis)

**Files to write:**
- Modify: `template.config.ts` — `const brand = 'codm'` (linha 17)
- Modify: `packages/app/tauri/src-tauri/Cargo.toml` — `[package] name`, `[lib] name`, as 2 path-deps
- Modify: `packages/client/dist/rust/Cargo.toml` — `[package] name`, a path-dep de contracts, 2 comentários
- Modify: `packages/contracts/generated/rust/Cargo.toml` — `[package] name`, 1 comentário
- Modify: `packages/client/generators/rust/codegen/Cargo.toml` — `[package] name`
- Modify: `packages/app/tauri/src-tauri/src/{main.rs,api/mod.rs,commands/mod.rs,commands/secrets.rs,sidecars/mod.rs,sidecars/gate.rs}` — `codedm_desktop_lib::run()`, `codedm_client_rust::Client`, os nomes de sidecar
- Modify: `packages/client/dist/rust/src/{go,typescript}/mod.rs` — 99 ocorrências de `::codedm_contracts_rust::` (**regeneradas**, não editadas)
- Regenerate: `packages/app/tauri/src-tauri/Cargo.lock`, `packages/client/generators/rust/codegen/Cargo.lock`, `packages/app/tauri/src-tauri/tauri.conf.json` (via `bun desktop:generate`), `.env.example` (via `bun env:generate`)
- Modify: `packages/app/tauri/config/{app.ts,build-sidecars.ts,generate.ts,sidecars.ts}` — só comentários que citam a marca literal
- Modify: `scripts/graph/outputs/html.ts` — 2 usos de `REPO.brand` (derivados, nenhuma edição) — **verificar, não editar**

**Files to read:**
- `packages/app/tauri/config/generate.ts:160-185` — o check `Cargo.toml [package] name must be '${REPO.brand}-desktop'`
- `packages/app/tauri/config/generate.test.ts` — DSK-01/04/06, a rail que fica vermelha no meio desta task
- `scripts/env/generate.ts:34` — `# ${REPO.brand} — root environment variables`, por que `.env.example` regenera aqui

**Agent:** general-purpose · **Reviewer:** spec-compliance-reviewer → code-reviewer · **Model:** sonnet · **Skills:** /sdk
**Depends on:** T4
**Scope fence:** DONE: `brand`, os 5 crates, os 2 `Cargo.lock`, a regen do `tauri.conf.json` e do
`.env.example`, os nomes de binário de sidecar. OUT: `CODEDM_*` (T6) — atenção: `.env.example`
regenera nesta task com o **cabeçalho** novo e as **chaves antigas**, e isso é correto; `CodeDM`/prosa
(T7); **edição à mão de `tauri.conf.json`** (é DSK-01 vermelho — o arquivo é gerado);
`packages/app/tauri/src-tauri/gen/**` se existir; `.plans`/`.specs`.
**Gate:** `bun desktop:generate --check` (exit 0) · `bun test packages/app/tauri/config` (DSK verde) ·
`cargo build --manifest-path packages/contracts/generated/rust/Cargo.toml` · `cargo test` idem ·
`cargo build --manifest-path packages/client/dist/rust/Cargo.toml` · `cargo test` idem ·
`cargo build --manifest-path packages/app/tauri/src-tauri/Cargo.toml` · `cargo test` idem ·
`bun env:generate && git diff --exit-code .env.example` (após o add) ·
`cd packages/api/typescript && bun test tests/architecture/env-model.test.ts` (ENV-04 verde) ·
`bun tsc` · `bun lint` · `bun test:tooling` ·
`bun scripts/rebrand-codm.ts --check --pass=brand` → exit 0

### Step T5.1 — Inventário ANTES, e o RED esperado

- [ ] `bun scripts/rebrand-codm.ts --dry-run --pass=brand` → registrar o total
- [ ] Por forma: `codedm-desktop` **2**, `codedm_desktop_lib` **2**, `codedm-client-rust` **9**, `codedm_client_rust` **5**, `codedm-contracts-rust` **10**, `codedm_contracts_rust` **99**, `codedm-daemon` **6**, `codedm-gateway` **11**, `app.codedm.desktop` **4**
- [ ] **Falseador da DSK, medido ao vivo**: trocar SÓ `brand = 'codm'` no `template.config.ts` e rodar
      `bun test packages/app/tauri/config` → deve ficar VERMELHO citando
      `Cargo.toml [package] name must be 'codm-desktop' (REPO.brand-derived)` e
      `[lib] name must be 'codm_desktop_lib'`. **Registrar a saída.** É a prova de que
      `generate.ts:173-178` não é decorativo e de que este pass é indivisível. (Não reverter — a
      task continua a partir daqui e funda o vermelho no mesmo commit.)

### Step T5.2 — Os 5 crates e o código Rust que os nomeia

- [ ] Rodar `bun scripts/rebrand-codm.ts --pass=brand` (cobre `Cargo.toml`, `.rs`, `.json` de config-fonte e os comentários)
- [ ] Conferir à mão os 4 `Cargo.toml`: `[package] name`, `[lib] name` e as **path-deps** (`codm-contracts-rust = { path = ... }`, `codm-client-rust = { path = ... }`) — uma path-dep com nome errado é erro de resolução do cargo, não de compilação
- [ ] `src-tauri/src/main.rs:5` → `codm_desktop_lib::run()`
- [ ] `src-tauri/src/api/mod.rs:24,55` → `codm_client_rust::Client`
- [ ] `src-tauri/src/sidecars/mod.rs:82,97` → `name: "codm-daemon"` / `"codm-gateway"`; `gate.rs:127-146` (6 hits nos testes de estado)

### Step T5.3 — Os 2 `Cargo.lock`

- [ ] `cargo build --manifest-path packages/contracts/generated/rust/Cargo.toml` → gera/atualiza
- [ ] `cargo build --manifest-path packages/client/dist/rust/Cargo.toml`
- [ ] `cargo build --manifest-path packages/app/tauri/src-tauri/Cargo.toml` → reescreve
      `src-tauri/Cargo.lock` (`[[package]] name` de `codm-desktop`, `codm-client-rust`,
      `codm-contracts-rust` + as arestas de dependência)
- [ ] `packages/client/generators/rust/codegen/Cargo.lock` — reescrito por
      `cargo build --manifest-path packages/client/generators/rust/codegen/Cargo.toml` **ou** pela
      própria regen do generator; confirmar por grep

### Step T5.4 — A regen do contrato Rust (99 das 127 ocorrências)

- [ ] `cd packages/contracts && bun run all` — reemite `generated/rust` com o crate name novo
- [ ] `bun sdk` — reemite `packages/client/dist/rust/src/{go,typescript}/mod.rs`, onde vivem as 99
      ocorrências de `::codedm_contracts_rust::`
- [ ] **Verificação anti-incremental**: `git grep -n 'codedm_contracts_rust\|codedm-contracts-rust' -- packages/client/dist packages/contracts/generated` → **vazio**. Se sobrar, regen limpa
- [ ] `git add` explícito de `packages/client/dist/rust` (não vigiado por `check:generated`)

### Step T5.5 — Tauri: o `tauri.conf.json` é GERADO, não editado

- [ ] `bun desktop:generate` → reescreve `src-tauri/tauri.conf.json` com
      `identifier: "app.codm.desktop"` (de `config/app.ts:19`, derivado de `REPO.brand`) e
      `externalBin: ["binaries/codm-daemon", "binaries/codm-gateway"]` (de `generate.ts:65`) — **AC-9**
- [ ] `bun desktop:generate --check` → exit 0
- [ ] `bun test packages/app/tauri/config` → verde (o vermelho do Step T5.1 fecha aqui)
- [ ] Confirmar por leitura que **nenhuma linha** de `tauri.conf.json` foi tocada à mão:
      `git diff packages/app/tauri/src-tauri/tauri.conf.json` mostra só `identifier` e `externalBin`

### Step T5.6 — `.env.example`: o brand aparece no cabeçalho

- [ ] `bun env:generate` — `scripts/env/generate.ts:34` renderiza `# codm — root environment variables`
- [ ] `cd packages/api/typescript && bun test tests/architecture/env-model.test.ts` → ENV-04 verde
      (committed == rendered). **As chaves `CODEDM_*` continuam aqui e isso é correto** — T6 as troca

### Step T5.7 — Verificação DEPOIS

- [ ] `git grep -n 'codedm-desktop\|codedm_desktop_lib\|codedm-client-rust\|codedm_client_rust\|codedm-contracts-rust\|codedm_contracts_rust\|codedm-daemon\|codedm-gateway\|app\.codedm\.desktop' -- . ':!.plans' ':!.specs' ':!docs/handoff' ':!HANDOFF*.md'` → **vazio**
- [ ] `grep -n 'identifier\|externalBin' -A3 packages/app/tauri/src-tauri/tauri.conf.json` → `app.codm.desktop`, `binaries/codm-*` (AC-9)
- [ ] `grep -n "brand\|modulePrefix" template.config.ts` → `brand = 'codm'` **e** `modulePrefix: 'template'` (AC-7 — o Go não se move)
- [ ] Bateria de gates completa (6 comandos `cargo` + DSK + env)

### Step T5.8 — Commit

```bash
git add template.config.ts packages/app/tauri packages/client/dist/rust packages/client/generators/rust \
        packages/contracts/generated/rust .env.example
git add -u
git status --porcelain
git commit -m "refactor(repo,app-tauri): A T5 — brand vira codm; os 5 crates e a identidade Tauri vao junto (pass 2/4)

Este pass e INDIVISIVEL e a spec nao previu por que: template.config.ts:38 diz
rust: { cratePrefix: brand }, e config/generate.ts:173-178 JA CHECA que
Cargo.toml [package] name == '\${REPO.brand}-desktop' e [lib] name ==
'\${REPO.brand}_desktop_lib'. Trocar brand sozinho deixa bun desktop:generate
--check vermelho — falseado ao vivo antes de comecar, com a saida nomeando os
dois campos. scripts/env/generate.ts:34 renderiza o brand no cabecalho do
.env.example, entao ENV-04 tambem entra na conta.

5 crates renomeados (codm-desktop, codm_desktop_lib, codm-client-rust,
codm-contracts-rust, codm-client-rust-codegen), 4 Cargo.toml, 2 Cargo.lock, as
path-deps (nome errado ali e erro de resolucao do cargo, nao de compilacao) e as
99 ocorrencias de ::codm_contracts_rust:: no dist/rust — essas REGENERADAS, com
grep anti-incremental depois.

tauri.conf.json NAO foi editado a mao (seria DSK-01): identifier
app.codm.desktop e externalBin binaries/codm-{daemon,gateway} sairam de
config/app.ts:19 e generate.ts:65, ambos derivados de REPO.brand — e assim que
AC-9 fecha.

go.mod continua template/ (AC-7): zero hits de codedm em *.go.mod/*.go.sum, os 5
modulos e os 4 replace ficam onde estao. CODEDM_* continua (T6).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task T6: Pass `env` — `CODEDM_*` → `CODM_*`, `~/.codm/data` e `codm.db`

**Files to write:**
- Modify: `template.config.ts` — a chave `CODEDM_DATA_DIR` → `CODM_DATA_DIR` (com `example: '~/.codm/data'` e o `doc` que cita `codm.db`), `CODEDM_E2E` → `CODM_E2E`, `PROJECT.example: 'codm'`, `CHANNEL_EVENT_GROUP_ID.example: 'codm-gateway'`, e o literal `rootEnvVar: 'CODM_ROOT'` (:172)
- Modify: `packages/api/typescript/core/src/utils/Config.ts` — `CODM_DATA_DIR: z.string().default('~/.codm/data')` (:31) + os comentários (:27, :46) — **AC-8**
- Modify: `packages/api/typescript/src/boot.ts` (6), `core/src/db/drivers/{DataDirLock.ts,LibsqlDriver.ts,LibsqlDriver.test.ts}`, `scripts/{migrate.ts,smoke-shared-store.ts,smoke-node-boot.ts,phase3-smoke.ts,phase6-mcp-smoke.ts}`, `src/shared/index.ts`, `src/agent/services/AgentRunner/ClaudeAgentRunner/*`, `tests/kernel/concurrent-boot.test.ts`, `tests/architecture/real-di-resolution.test.ts`
- Modify: `packages/api/go/core/config/{config.go,config_test.go}`, `packages/api/go/core/db/sqlite/{store.go,store_test.go}` (`dbFileName = "codm.db"`), `packages/api/go/internal/channel/module.go`, `packages/api/go/internal/channel/services/gateway/whatsapp/whatsmeow_store.go`
- Modify: `packages/e2e/playwright.config.ts` (5), `packages/e2e/scripts/run-e2e.ts` (8)
- Modify: `packages/contracts/db/schema/drizzle.config.ts` (`.scratch/codm.db`)
- Modify: `.claude/commands/install.md`, `.claude/skills/migrate/SKILL.md`, `docs/BACKEND.md`
- Regenerate: `.env.example` (via `bun env:generate`)

**Files to read:**
- `packages/api/typescript/tests/architecture/env-model.test.ts` — ENV-01..04: o que cada rail compara
- `packages/api/go/core/config/config.go:55-75` — ENV-03 (go reads ⊆ declared)
- `packages/api/typescript/core/src/utils/Config.ts` — `RawEnvSchema` e `KERNEL_ENV_KEYS`

**Agent:** backend-developer · **Reviewer:** spec-compliance-reviewer → code-reviewer · **Model:** sonnet · **Skills:** /test
**Depends on:** T5
**Scope fence:** DONE: as 12 chaves de env vivas, o data dir, o nome do arquivo SQLite,
`rootEnvVar`, e a regen do `.env.example`. OUT: `CodeDM`/prosa/`MCP_SERVER_KEY`/cookie (T7); qualquer
migração de dados existentes (**Decision 4 é explícita: não se migra, o ambiente recomeça do zero**);
`GRAPH_ROOT` (alias de CI, não carrega marca); `.plans`/`.specs`.
**Gate:** `cd packages/api/typescript && bun test tests/architecture/env-model.test.ts` (ENV-01..04 verde) ·
`cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` ·
`cd packages/api/typescript && bun test` · `cd packages/api/typescript/core && bun test` ·
`cd packages/api/go && go build ./... && go test ./... && go -C core build ./... && go -C core test ./...` ·
`bun env:generate && git diff --exit-code .env.example` · `bun tsc` · `bun lint` · `bun test:tooling` ·
`cd packages/e2e && bun run test` · `bun scripts/rebrand-codm.ts --check --pass=env` → exit 0

### Step T6.1 — Inventário ANTES, e o RED esperado das rails ENV

- [ ] `git grep -o 'CODEDM_' -- . ':!.plans' ':!.specs' | wc -l` → esperado **132**
- [ ] `git grep -oh 'CODEDM_[A-Z_]*' -- . ':!.plans' ':!.specs' | sort -u` → registrar as chaves **vivas** (esperado 12; `CODEDM_TOOL_PREFIX`, `CODEDM_GATEWAY_API_KEY` e `CODEDM_GATEWAY_WHATSMEOW_URL` só existem em prosa/comentário de remoção — confirmar)
- [ ] `git grep -o 'codedm\.db' -- . ':!.plans' ':!.specs' | wc -l` → esperado **43**
- [ ] `git grep -o '~/\.codedm\|\.codedm/data' -- . ':!.plans' ':!.specs' | wc -l` → esperado **5**
- [ ] **Falseador das rails**: editar SÓ `Config.ts:31` (`CODEDM_DATA_DIR` → `CODM_DATA_DIR`) e rodar
      `cd packages/api/typescript && bun test tests/architecture/env-model.test.ts` → VERMELHO em
      ENV-01 (kernel parity) nomeando a chave. Registrar a saída. Prova que as três camadas
      (schema Zod, registry, `.env.example`) estão de fato amarradas e que o pass é indivisível

### Step T6.2 — O registry e o `Config.ts` se movem juntos

- [ ] `bun scripts/rebrand-codm.ts --pass=env`
- [ ] Conferir à mão `template.config.ts`: as chaves `CODM_DATA_DIR` / `CODM_E2E`, o `example`
      (`~/.codm/data`), o `doc` (que cita `codm.db`), `PROJECT.example: 'codm'`,
      `CHANNEL_EVENT_GROUP_ID.example: 'codm-gateway'`, e o literal **`rootEnvVar: 'CODM_ROOT'`**
      (:172 — não deriva de nada, o script o pega pela tabela `CODEDM_` → `CODM_`; confirmar)
- [ ] `Config.ts:31` → `CODM_DATA_DIR: z.string().default('~/.codm/data')` — **AC-8 literal**
- [ ] `git grep -n 'CODEDM_DATA_DIR' -- packages/api/typescript` → vazio (segunda metade da AC-8)

### Step T6.3 — Go: config, store e o nome do arquivo

- [ ] `core/config/config.go:62,63,69` → `CODM_DATA_DIR`, `CODM_E2E`
- [ ] `core/db/sqlite/store.go:44` → `dbFileName = "codm.db"` (**o literal que a spec não previu**)
- [ ] `core/db/sqlite/store_test.go:38,112,143`, `internal/channel/module.go:32,419`,
      `internal/channel/services/gateway/whatsapp/whatsmeow_store.go:20`
- [ ] `go build ./... && go test ./...` nos dois módulos; ENV-03 (go reads ⊆ declared) é o que liga
      `config.go` ao registry

### Step T6.4 — e2e: o runner e o playwright config

- [ ] `packages/e2e/scripts/run-e2e.ts` — `CODM_NODE_BIN`, `CODM_E2E`, `CODM_DATA_DIR`, o prefixo de
      tmpdir `codm-e2e-data-` (:61) e a prosa que cita `codm.db` (:40)
- [ ] `packages/e2e/playwright.config.ts:29-50`
- [ ] `cd packages/e2e && bun run test` — **NUNCA `bun e2e`** (o alias existe no `package.json` mas a
      convenção das frentes B1/C é a forma direta)

### Step T6.5 — `.env.example` regenera

- [ ] `bun env:generate`
- [ ] `cd packages/api/typescript && bun test tests/architecture/env-model.test.ts` → ENV-01..04 todas
      verdes (o vermelho do Step T6.1 fecha aqui)

### Step T6.6 — Verificação DEPOIS

- [ ] `git grep -n 'CODEDM_\|codedm\.db\|\.codedm/' -- . ':!.plans' ':!.specs' ':!docs/handoff' ':!HANDOFF*.md'` → **vazio**
- [ ] `grep -n 'CODM_DATA_DIR' packages/api/typescript/core/src/utils/Config.ts` → default `'~/.codm/data'` (AC-8)
- [ ] `grep -n 'CODM_DATA_DIR' .env.example` → `CODM_DATA_DIR=~/.codm/data`
- [ ] Bateria completa de gates

### Step T6.7 — Commit

```bash
git add template.config.ts .env.example packages/api packages/e2e packages/contracts/db/schema/drizzle.config.ts \
        .claude/commands/install.md .claude/skills/migrate docs/BACKEND.md
git add -u
git status --porcelain
git commit -m "refactor(repo,api): A T6 — CODEDM_* vira CODM_*, ~/.codm/data e codm.db (pass 3/4)

12 chaves de env vivas (nao 14: TOOL_PREFIX, GATEWAY_API_KEY e
GATEWAY_WHATSMEOW_URL so existem em prosa/comentario de remocao) e 132
ocorrencias — nao as ~243 da spec.

Duas coisas que a spec nao previu entraram porque a AC-10 as forca:
  - o NOME do arquivo SQLite. dbFileName = 'codedm.db' era literal hardcoded em
    api/go/core/db/sqlite/store.go:44, citado em 43 pontos. Vira codm.db. Efeito
    ja sancionado por Decision 4: banco local pre-existente fica orfao, ambiente
    recomeca do zero.
  - REPO.rootEnvVar ('CODEDM_ROOT'), um literal do template.config.ts que NAO
    deriva de scope/brand e por isso nao se moveu no T4/T5. Lido por
    scripts/graph/core/paths.ts:13.

O pass e indivisivel porque ENV-01..04 amarram tres camadas: editar so o
Config.ts deixa env-model.test.ts vermelho nomeando a chave — falseado ao vivo
antes de comecar. Registry, Zod schema, config.go e .env.example gerado viajam
juntos.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task T7: Pass `text` — o resíduo de marca, o comentário que precisava virar verdade, e AC-10

**Files to write:**
- Modify: `packages/api/typescript/src/agent/mcp/wire.ts` — `MCP_SERVER_KEY = 'codm'` + a linha nova de docblock nomeando `template.config.ts REPO.brand` como o valor espelhado (D-F)
- Modify: `packages/api/typescript/tests/architecture/__snapshots__/mcp-exposure.test.ts.snap` — **regenerado** (`bun test -u`), 34 linhas
- Modify: `packages/api/typescript/src/thread/schemas/MentionGate.ts` — `FALLBACK_TAG = 'codm'` + o docblock reescrito (D-G) — e `MentionGate.test.ts` (14 hits)
- Modify: `packages/app/astro/src/i18n/index.ts` — `LOCALE_COOKIE = 'codm_locale'`; `src/pages/[locale]/_content/{home.en,home.pt}.json` (`github.com/codm`); `_content/loaders/plans.ts` (`codm-plans`); `packages/app/astro/CLAUDE.md`
- Modify: `template.config.ts` — `repoUrl` (:150) + **o comentário das linhas 3-6** (D-E)
- Modify: o restante da prosa em `.claude/skills/**`, `docs/**`, `CLAUDE.md`, `README.md`, `packages/*/README.md`, `packages/client/COMPLIANCE.md`, `scripts/detectors/*.test.ts`, `scripts/skill-evals/**`, `scripts/cli/backend/typescript/__fixtures__/*`
- Delete: `scripts/rebrand-codm.ts`, `scripts/rebrand-codm.test.ts` (D-B)

**Files to read:**
- `packages/api/typescript/src/agent/mcp/wire.ts` — o docblock inteiro (o argumento de "ONE edit here")
- `packages/api/typescript/src/thread/schemas/MentionGate.ts:8-45` — o docblock que afirma fatos sobre este repo
- `template.config.ts:1-18` — o comentário "never a codemod"
- `scripts/skill-evals/seeds/synthetic-fullstack-handoff/phases-1-3.patch` — **42 ocorrências dentro de um `.patch`**: confirmar que são linhas `+` (conteúdo adicionado), não linhas de contexto de um diff que precise casar com um arquivo real

**Agent:** general-purpose · **Reviewer:** spec-compliance-reviewer → code-reviewer · **Model:** sonnet · **Skills:** /test
**Depends on:** T6
**Scope fence:** DONE: todo o resíduo textual + as 3 decisões nomeadas (`MCP_SERVER_KEY`,
`FALLBACK_TAG`, o comentário do config) + o delete do codemod. OUT: `.plans/**`, `.specs/**`
(incluindo `.specs/codedm/**` e **especialmente**
`.specs/2026-07-30-rust-wire-and-tauri-sdk-design.md`); qualquer linha citando `.specs/codedm` ou
`.plans/` dentro de arquivo de produção (whitelist regra 2); `HANDOFF*.md` e `docs/handoff/*`
(whitelist regra 4, OQ-1); renomear o **diretório do checkout** (não é arquivo rastreado).
**Gate:** `cd packages/api/typescript && bun test` (snapshot regenerado, 0 fail) ·
`cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` · `bun tsc` · `bun lint` ·
`bun run test` · `bun test:tooling` · `cd packages/app/react && bun x tsc` ·
`cd packages/e2e && bun run test` · **AC-10**:
`git grep -i codedm -- . ':!.plans' ':!.specs' ':!docs/handoff' ':!HANDOFF.md' ':!HANDOFF-2026-07-23-ORG.md'`
→ apenas as linhas da whitelist regra 2, nominalmente listadas

### Step T7.1 — Inventário ANTES

- [ ] `git grep -oi 'codedm' -- . ':!.plans' ':!.specs' | wc -l` → o resíduo após T4/T5/T6 (registrar)
- [ ] `git grep -o 'CodeDM' -- . ':!.plans' ':!.specs' | wc -l` → esperado **72** (menos o que T5/T6 já levaram)
- [ ] `git grep -ln 'codedm' -- . ':!.plans' ':!.specs'` → a lista final de arquivos; **lê-la inteira antes de rodar o pass** (é o pass com mais prosa e menos mecânica)

### Step T7.2 — As três decisões nomeadas (feitas À MÃO, antes do pass)

- [ ] **`MCP_SERVER_KEY`** (D-F): `'codedm'` → `'codm'`, e o docblock ganha uma linha dizendo que
      este literal **espelha** `template.config.ts REPO.brand` e por que não o importa (o pacote é
      empacotado pelo `docker/Dockerfile.api` sem a raiz do repo) — o mesmo padrão que
      `packages/api/go/core/pkg/openapi/walker.go` usa para `modulePrefix`
- [ ] **`MentionGate`** (D-G): `FALLBACK_TAG = 'codm'`, e o docblock de `:39-42` reescrito para dizer
      a verdade nova — o **diretório do checkout continua `codedm`**, então a tag mintada ao vivo é
      `@codedm` enquanto o fallback é `@codm`, e é exatamente por isso que a regra de fronteira (`/`)
      importa. **Não** reescrever o path do teste `:10` para um diretório que não existe: manter
      `'/Users/work/Desktop/Projetos/pessoal/codedm'` como entrada (é um path real) e ajustar só a
      expectativa se o caso for o do fallback
- [ ] **O comentário do `template.config.ts`** (D-E): as linhas 3-6 passam a dizer as duas coisas — o
      caminho normal continua sendo editar o config + regenerar; e os literais que sobraram fora dele
      (`rootEnvVar`, `repoUrl`, `MCP_SERVER_KEY`, `dbFileName` em `store.go`) são enumerados como o
      débito que a próxima rebrandagem paga

### Step T7.3 — O pass, e a regen do snapshot

- [ ] `bun scripts/rebrand-codm.ts --pass=text`
- [ ] `cd packages/api/typescript && bun test tests/architecture/mcp-exposure.test.ts -u` — o snapshot
      (`mcp__codm__AskOperator` × 34) é **regenerado**, nunca editado à mão
- [ ] `git diff packages/api/typescript/tests/architecture/__snapshots__/` → só as 34 linhas de
      `mcp__codedm__` → `mcp__codm__`, nenhuma outra
- [ ] Conferir o `.patch` de skill-evals: `git diff scripts/skill-evals/seeds/synthetic-fullstack-handoff/phases-1-3.patch`
      — as 42 ocorrências devem estar todas em linhas `+`. Se alguma estiver em linha de contexto
      (` ` no início), **reverter aquele hunk** e registrar como whitelist (um patch que não aplica
      é pior que um nome velho)

### Step T7.4 — O codemod morre

- [ ] `git rm scripts/rebrand-codm.ts scripts/rebrand-codm.test.ts`
- [ ] `bun tsc:scripts` → exit 0 (o `tsconfig.scripts.json` inclui `scripts/**/*.ts`; nenhuma
      referência órfã)
- [ ] `git grep -n 'rebrand-codm' -- . ':!.plans'` → vazio (nunca foi adicionado a `test:tooling`,
      justamente para não deixar rastro no `package.json` — ver D-B)

### Step T7.5 — Verificação DEPOIS: AC-10 com a whitelist explícita

- [ ] Rodar o grep canônico de AC-10:
  ```bash
  git grep -i codedm -- . \
    ':!.plans' ':!.specs' ':!docs/handoff' ':!HANDOFF.md' ':!HANDOFF-2026-07-23-ORG.md'
  ```
- [ ] O resultado deve conter **apenas** linhas que citam `.specs/codedm/…` (whitelist regra 2).
      **Listar cada uma nominalmente** no corpo do commit — se aparecer qualquer linha que NÃO seja
      uma citação de caminho histórico, é resíduo real e volta pro Step T7.3
- [ ] `git grep -i codedm -- .plans .specs | wc -l` → inalterado desde HEAD `1f6b6f05`: **o histórico
      não foi tocado por nenhuma das 7 tasks**
- [ ] `git grep -i codedm -- bun.lock` → **vazio** (regenerado em T4)
- [ ] Bateria completa de gates

### Step T7.6 — Commit

```bash
git add -u
git status --porcelain
git commit -m "refactor(repo): A T7 — o residuo de marca some, e o comentario do config vira verdade (pass 4/4)

Fecha AC-10. Tres decisoes foram feitas a mao antes do pass, porque nenhuma delas
era substituicao de string:

  MCP_SERVER_KEY vira 'codm' e CONTINUA literal. wire.ts argumenta que o valor
  mora num arquivo-folha sem imports para que uma correcao seja 'ONE edit here';
  importar template.config.ts arrastaria a raiz do repo para dentro de um pacote
  que o Dockerfile.api empacota copiando so alguns roots. Ganhou a linha de
  docblock que o declara espelho de REPO.brand — mesmo padrao do walker.go. As 34
  linhas do snapshot mcp-exposure foram REGENERADAS (bun test -u), nunca editadas.

  MentionGate.FALLBACK_TAG vira 'codm', e o docblock passa a dizer a verdade nova:
  o DIRETORIO do checkout continua se chamando codedm, entao a tag mintada ao vivo
  e @codedm enquanto o fallback e @codm — e e por isso que a regra de fronteira (/)
  importa.

  template.config.ts:3-6 dizia 'rebranding … never a codemod'. Depois desta frente
  isso e falso pela metade: 75% do rebrand foi derivado do config, mas env, crates,
  snapshot e prosa so um codemod alcanca. O comentario agora diz as duas coisas e
  ENUMERA os literais que sobraram (rootEnvVar, repoUrl, MCP_SERVER_KEY, dbFileName)
  como o debito da proxima rebrandagem.

O codemod foi deletado: e um artefato one-shot para uma identidade especifica, e
mante-lo em scripts/ convida a proxima sessao a roda-lo sobre um repo ja
renomeado. O registro permanente sao os 4 commits + o artefato de fechamento.

Historico intocado: .plans/.specs mantem as mesmas ocorrencias de HEAD 1f6b6f05.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task T8: Artefato de fechamento — da frente A **e do GOAL inteiro**

**Files to write:**
- Create: `.plans/artifacts/2026-07-30-a-renames-codm-closure.md`

**Files to read:**
- `.plans/artifacts/2026-07-30-b1-health-readiness-closure.md` — o molde (§a bateria, §b mapa AC, §c falseadores, §d achados)
- `.plans/artifacts/2026-07-30-c-frontend-conformance-closure.md` — o molde da tabela de commits por task

**Agent:** general-purpose · **Reviewer:** spec-compliance-reviewer · **Model:** sonnet · **Skills:** (nenhuma)
**Depends on:** T1, T2, T3, T4, T5, T6, T7
**Scope fence:** DONE: **um** arquivo. OUT: qualquer código, qualquer config, qualquer skill. Se um
gate reprovar durante a medição, **não corrigir aqui** — abrir a correção como task nova e registrar.
**Gate:** a bateria completa do goal (as 8 linhas abaixo), toda com saída **citada** no artefato.

### Step T8.1 — A bateria completa do goal, em ordem, com a saída registrada

As 8 linhas de gates da condição 6 do goal. Cada linha expande nos comandos concretos; toda saída
vai citada no artefato, **nunca parafraseada**.

```bash
# 1 — api-typescript (build tsconfig + as duas suítes)
cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit
cd packages/api/typescript && bun test
cd packages/api/typescript/core && bun test

# 2 — type-check de todos os workspaces, fresh
bun x nx run-many -t tsc --skipNxCache
cd packages/app/react && bun x tsc          # explícito: rename de SDK/contrato exige o react

# 3 — lint
bun x nx run-many -t lint --skipNxCache

# 4 — testes de repo + tooling
bun x nx run-many -t test --exclude=e2e --skipNxCache
bun test:tooling

# 5 — Go (os dois módulos)
cd packages/api/go && go build ./... && go -C core build ./...
cd packages/api/go && go test  ./... && go -C core test  ./...

# 6 — Rust (os 3 manifests, por --manifest-path: a shell está fora de bun tsc/test) + a config gerada
cargo build --manifest-path packages/contracts/generated/rust/Cargo.toml
cargo test  --manifest-path packages/contracts/generated/rust/Cargo.toml
cargo build --manifest-path packages/client/dist/rust/Cargo.toml
cargo test  --manifest-path packages/client/dist/rust/Cargo.toml
cargo build --manifest-path packages/app/tauri/src-tauri/Cargo.toml
cargo test  --manifest-path packages/app/tauri/src-tauri/Cargo.toml
bun desktop:generate --check

# 7 — e2e (NUNCA `bun e2e`)
cd packages/e2e && bun run test

# 8 — os dois gates de estado do repo (check:generated é PÓS-COMMIT por construção)
bun check:generated
bun detect
```

- [ ] Rodar as 8 linhas em ordem. Para cada uma: **citar a saída literal** no artefato
- [ ] Toda falha é classificada como **regressão desta frente** ou **pré-existente/ambiental**, com
      prova (`git log -- <arquivo>` mostrando que a última mudança é anterior a T1). O flake do
      `redis-bridge.integration.test.ts` (contenção de porta 6379 com o container do repo irmão
      `medscall-monorepo-redis`) e os ~60 findings de `packages/api/**` no `bun detect` **já estão
      documentados no artefato da frente C** — se reaparecerem, referenciar, não re-diagnosticar

### Step T8.2 — Mapa AC-1..AC-11 → evidência

- [ ] Uma linha por AC da spec, cada uma apontando para o commit + o grep/gate que a prova
- [ ] **AC-5 é registrada com a correção do Ground**: a spec cita `docs/CLAUDE.md`, que não existe;
      a evidência é `CLAUDE.md` (raiz) + `docs/BACKEND.md`
- [ ] **AC-10 é registrada com a whitelist explícita** e a lista nominal das linhas remanescentes
      (citações de `.specs/codedm/…`), mais o número de ocorrências históricas preservadas

### Step T8.3 — Inventário final: o antes-e-depois de cada rename

Uma tabela com os 4 renames, coluna "ANTES (HEAD `1f6b6f05`)" e "DEPOIS", números medidos:

| rename | antes (não-hist) | depois | whitelist justificada |
|---|---|---|---|
| `dist/http` | 3 arquivos | 0 | — |
| `error-codes` → `errors` | 29 occ / 12 arq | `x-error-codes` 12 + `generators/error-codes` 3 | ambos são falsos-alvos declarados |
| `schema-sqlite` → `schema` | 61 occ / 28 arq | 0 | 118 occ em `.plans`/`.specs` |
| `codedm` → `codm` (case-ins.) | 2516 occ | (medido) | `.plans`/`.specs` 958 + handoffs + citações de caminho histórico |

### Step T8.4 — O fechamento do GOAL inteiro

- [ ] `git log --oneline` provando o commit de fechamento de **cada uma das 8 frentes**, na ordem em
      que rodaram, com os SHA reais medidos nesta sessão:

| # | frente | commit de fechamento (medido em HEAD `1f6b6f05`) |
|---|---|---|
| 1 | **C8** — e2e stale specs | `d0bd78ce` fix(agent,e2e): C8 — whisper-turn não forka + workers=1; suíte e2e verde |
| 2 | **B3** — activation semantics | `e6dd28d7` docs(plans): B3 — artefato de fechamento |
| 3 | **B4** — aggregate boundaries | `20a510cf` docs(plans): B4 — artefato de fechamento |
| 4 | **B5** — browser events removal | `ec8f419d` docs(plans): B5 — artefato de fechamento |
| 5 | **B2** — mcp core service | `838db52b` docs(plans): B2 T10 — a saída real de check:generated |
| 6 | **B1** — health/readiness | `f1abd5d4` docs(plans): B1 T7 — artefato de fechamento |
| 7 | **C** — frontend conformance | `1f6b6f05` docs(plans): C — closure artifact precision update |
| 8 | **A** — renames CODM | *(o commit deste artefato)* |

- [ ] Comando citado no artefato:
  ```bash
  git log --oneline --grep='artefato de fechamento' --grep='closure' --all-match=false -i | head -20
  git log --oneline 1f6b6f05..HEAD
  ```
- [ ] Uma seção curta "o que o goal entregou", 8 linhas — uma por frente, o que mudou de verdade
- [ ] Confirmar explicitamente: **nenhuma task de nenhuma frente tocou
      `.specs/2026-07-30-rust-wire-and-tauri-sdk-design.md`**; `git log --oneline -- .specs/2026-07-30-rust-wire-and-tauri-sdk-design.md`
      mostra só o commit que a criou
- [ ] Confirmar `git stash list` — se houver entrada, ela é **anterior** a esta sessão (o artefato da
      frente C documenta uma entrada `lint-staged automatic backup` de 29/07 00:32); **nenhum stash
      foi criado ou aplicado por esta frente** (fato #3 do repo: nunca `git stash` através de regen)

### Step T8.5 — Achados da frente

- [ ] Registrar, no mínimo: o erro de contagem de 2,6× da spec e sua causa; as 4 premissas
      contradichas do Ground; o acoplamento `brand`→crate que `generate.ts:173-178` já vigiava; o
      literal `dbFileName`; o `MCP_SERVER_KEY` como superfície voltada ao agente; a whitelist regra 2
      (`.specs/codedm` dentro de docblock de produção) como a armadilha real; e a razão de `bun sdk`
      com `clean: false` exigir grep pós-regen

### Step T8.6 — Commit

```bash
git add .plans/artifacts/2026-07-30-a-renames-codm-closure.md
git status --porcelain   # DEVE conter APENAS este arquivo
git commit -m "docs(plans): A — artefato de fechamento da frente e do GOAL inteiro

Bateria completa (8 linhas de gates) com saida citada, mapa AC-1..AC-11 →
evidencia, inventario antes/depois dos 4 renames com whitelist justificada, e o
git log provando o commit de fechamento das 8 frentes na ordem em que rodaram
(C8, B3, B4, B5, B2, B1, C, A).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Open Questions

- **OQ-1 (whitelist de handoffs) — precisa de decisão do founder antes de T7.** `HANDOFF.md` (16
  occ), `HANDOFF-2026-07-23-ORG.md` (2) e `docs/handoff/*.md` (~16) são registros datados de sessões
  passadas, da mesma natureza de `.plans`/`.specs`. **Recomendação deste plano: whitelist** (regra 4
  de D-D) — reescrever um handoff datado falsifica o registro tanto quanto reescrever um `.plans`.
  Se o founder decidir o contrário, é uma linha de config no codemod e a AC-10 fica com o grep sem
  a exclusão. **O plano assume whitelist**; T7 registra a decisão no commit.
- **OQ-2 (`repoUrl`).** `template.config.ts:150` = `https://github.com/codedm/codedm`, consumido por
  2 regras de eslint (`ESLintUtils.RuleCreator`, só para URL de doc). Renomear para
  `https://github.com/codm/codm` aponta para um repo que pode não existir. **Recomendação: renomear**
  (é marca, e AC-10 o alcança); a URL de doc de regra de lint quebrada é cosmética. Idem os 2 hits de
  `github.com/codedm` no conteúdo do astro (`home.en.json`, `home.pt.json`). Confirmar no review.
- **OQ-3 (a bateria literal da condição 6).** Este plano reconstrói as 8 linhas de gates a partir da
  bateria de `T7.1` do plano B1 e da §(a) do artefato da frente C — as duas execuções mais recentes e
  mais completas do goal. **Se o texto literal do goal enumerar diferente, T8 usa a lista do goal** e
  registra a divergência no artefato.
- **OQ-4 (diretório do checkout).** O repo vive em `/Users/work/Desktop/Projetos/pessoal/codedm` e
  esta frente **não o renomeia** (não é arquivo rastreado; renomear quebraria worktrees, paths
  absolutos em configs de ferramenta e a própria sessão em curso). Consequência viva: `mintMentionTag`
  produz `@codedm` no ambiente do founder mesmo após o rebrand (D-G documenta isso no docblock). Se o
  founder quiser o diretório renomeado, é uma operação de shell fora do repo, posterior ao merge.

---

## O que sobe pro template

- **`db/schema/` — nome canônico da pasta de schema Drizzle, neutro a dialeto** (T2, Step T2.7).
  Registrado em `.claude/skills/migrate/SKILL.md` e `docs/BACKEND.md`. Trocar de SQLite para Postgres
  passa a ser trocar o `drizzle.config.ts`, não mover 30 arquivos.
- **Nada mais.** A spec é explícita: `error-codes → errors` e o delete do `dist/http` são limpezas
  locais deste fork; o rebrand é identidade deste fork — o mecanismo (`template.config.ts` + regen)
  **já era** a convenção do template, e esta frente apenas o executa e registra, em D-E, os quatro
  literais que ele não alcança (`rootEnvVar`, `repoUrl`, `MCP_SERVER_KEY`, `dbFileName`).

---

## Resoluções do orquestrador (OQ-1..OQ-4, 30/07)

**OQ-1 (handoffs):** whitelist CONFIRMADA — `HANDOFF*.md` e `docs/handoff/*` são registro histórico, mesma natureza de `.plans`/`.specs`. Não renomeiam.

**OQ-2 (repoUrl):** RENOMEAR para a forma `codm` — é a direção do rebrand da spec; o repo remoto de destino não existir é irrelevante para um repo local-only (goal: tudo local, sem push). Registrar no fechamento como follow-up do founder: criar/ajustar o remoto quando publicar.

**OQ-3 (bateria do goal):** a lista literal da condição 6 do goal, para o T8 usar verbatim: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` · `cd packages/api/typescript && bun test` · `bun tsc` · `bun run test:tooling` · `bun check:generated` · `cd packages/contracts && bun test codegen/` · `cd packages/api/go && go build ./... && go test ./...` · `cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts --check` · `cd packages/e2e && bun run test` · e, como a frente muda SDK/contrato: `cd packages/app/react && bun x tsc`. Somam-se os gates extra-goal que as frentes B1/C acrescentaram ao repo: `cargo build`+`cargo test` por `--manifest-path` (client Rust, contracts Rust, src-tauri) e `bun desktop:generate --check`.

**OQ-4 (diretório do checkout):** NÃO renomeia nesta frente (é o cwd vivo da sessão e de todos os worktrees; renomear quebraria a própria execução). Consequência D-G (mentionTag `@codedm` mintada ao vivo) fica documentada no artefato de fechamento como follow-up manual do founder: renomear a pasta e re-clonar quando conveniente.
