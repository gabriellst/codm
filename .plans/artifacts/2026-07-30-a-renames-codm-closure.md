# Frente A — renames + rebrand CODM — Artefato de Fechamento (e fechamento do GOAL inteiro)

**Plano:** `.plans/2026-07-30-a-renames-codm.md` (spec `.specs/2026-07-29-renames-codm-design.md`; spec de
referência canônica, nunca aberta nesta sessão nem por nenhuma Task de A: `.specs/2026-07-30-rust-wire-and-tauri-sdk-design.md`).
**Commits da frente:** `e233f388` (plano+OQ-1..4) · `5d690cde` (T1) · `c87876fe` (T2) · `479f341e` (T3) ·
`70498b98` (T4) · `61641887` (T5) · `2868b603` (T6) · `7fbc4bec` (T7) · este artefato (T8).
**HEAD no início desta sessão:** `7fbc4bec` (T1–T7 já commitados; branch `agent-abstraction`).
**Natureza deste documento:** measure-only, **duas seções**. Seção 1 fecha a frente A (Step T8.1-T8.5 do
plano). Seção 2 fecha o GOAL inteiro (8 frentes: C8 → B3 → B4 → B5 → B2 → B1 → C → A), por instrução
explícita — esta é a última Task da última frente. Nenhum arquivo de código, config ou skill foi tocado
por esta Task; todo comando de teste de `packages/api/typescript` rodou com
`REDIS_URL=redis://localhost:6390` no ambiente (o skip DESENHADO da suíte `redis-bridge.integration`
ativado de propósito — o codedm/codm não tem Redis próprio no compose, o único ouvindo em 6379 local é o
container do repo irmão `medscall-monorepo-redis`; precedente `c87876fe`, repetido em `479f341e` e
`2868b603`).

---

# SEÇÃO 1 — Fechamento da frente A

## (a) Números reais dos passes — antes/depois, citados dos commits reais (não do plano)

O plano estimava os quatro passes em `~1900 / ~150 / ~180 / o restante`. Os números que realmente
fecharam cada commit (medidos pelo próprio `scripts/rebrand-codm.ts --dry-run`, citados nos corpos dos
commits `70498b98`/`61641887`/`2868b603`/`7fbc4bec`, confirmados por leitura de `git log -1 --format=%B`
nesta sessão) são:

| pass | Task/commit | dry-run (occ / arquivos) | aplicado | nota |
|---|---|---|---|---|
| `scope` | T4 `70498b98` | **1842 / 900** (excluindo o 1 hit do const `template.config.ts`, editado à mão) | 1842 | **+2 fixes mecânicos**: `context-map.test.ts:252` e `union-parity.test.ts:426` tinham o specifier com barra REGEX-ESCAPADA (`@codedm\/contracts\/db`, `@codedm\/client-typescript\/`) — invisível ao replace literal do codemod (que casa `@codedm/` com barra literal). Corrigidos à mão, mesma substituição semântica |
| `brand` | T5 `61641887` | **148 / 30** | 148 | falseador DSK-01/02 fundido no commit (trocar só `brand` deixa `bun test packages/app/tauri/config` vermelho nomeando os dois campos — não revertido, o pass completo fechou o vermelho no mesmo commit); achado de infra: os binários sidecar em `src-tauri/binaries/` (gitignored, fora do universo do codemod) continuavam com o nome velho — `build.rs` do tauri-build valida `externalBin` em qualquer `cargo build`, então o próprio gate de T5 falhava sem rebuildar os 2 binários (`bun x nx run app-tauri:sidecars`) |
| `env` | T6 `2868b603` | **169 / 66** | **168** (o falseador já tinha convertido `CODM_DATA_DIR` em `Config.ts` manualmente antes do apply) | falseador ENV-01 fundido no commit (editar só `Config.ts` derruba `env-model.test.ts` com `Kernel env drift`, não revertido) |
| `text` | T7 `7fbc4bec` | **247 / 118** (não 251/120 do dry-run de T3 — os 2 fixes mecânicos do T4 já tinham deslocado o residual) | 247, com 3 decisões feitas à mão ANTES do pass (`MCP_SERVER_KEY`, `MentionGate.FALLBACK_TAG`, comentário do `template.config.ts`) | **o catch-all cego clobberou os 2 fatos preservados como o plano já previa** (D-G): o path real do teste `MentionGate.test.ts:10` (`/Users/work/Desktop/Projetos/pessoal/codedm`) e 2 linhas do docblock que descrevem fato real do repo — revertidos à mão, por linha, depois do pass, confirmado por `git diff` zero-residual nessas linhas antes do commit |

**T3 (codemod, `479f341e`) — TDD com dois RED, não um:**

1. RED#1 — módulo ausente: 0 pass / 1 fail (trivial, script nem existia).
2. RED#2 (o que importa) — stub deliberadamente ingênuo (replace cego `/codedm/gi`, **sem** whitelist):
   **12 pass / 22 fail**, sobre a suíte de 34 testes — prova de que a suíte não é vácua e de que a
   whitelist é a parte cara do rebrand.
3. GREEN — implementação real (7 regras de whitelist, a 7ª nova e não prevista pelo plano: o codemod
   exclui A SI MESMO, senão o pass `scope` reescreveria `@codedm/` dentro da própria tabela de
   substituição e todo `--check` posterior ficaria vacuamente verde): **34 pass / 0 fail / 99 expects**.

**O falseador da whitelist inteira (`--dry-run --falsify-whitelist`, que o script recusa fora de
`--dry-run` — é medição, nunca escrita), citado no corpo de `479f341e`:**

```
Com whitelist (real):     scope 1843 · brand 148 · env 169 · text 251  → TOTAL 2411
Whitelist desligada:      scope 2129 (+286) · brand 231 (+83) · env 420 (+251) · text 905 (+654) → TOTAL 3685
```

**3685 fecha ao byte contra `git grep -oi codedm` sobre o repo INTEIRO** (2516 não-históricas + 1169
históricas em HEAD `479f341e`). O custo declarado da whitelist é exatamente `1169 + 59 (bun.lock) + 32
(handoffs) + 14 (regra 2, linhas de citação histórica) = 1274`, e `3685 − 1274 = 2411` — a mesma soma dos
quatro passes com whitelist ligada. **Duas correções que T3 fez ao plano, medidas ao vivo:**

- A marca tem **quatro** casings em HEAD, não três: além de `codedm`/`CODEDM`/`CodeDM` existe `Codedm`
  (4×: `isCodedmTool` em `agent/mcp/wire.ts` + o consumidor em `StreamJsonToTurnFactAccumulator.ts`), não
  coberta pela tabela do plano. Vira `Codm` (casing de identificador — `isCODMTool` não é forma que
  alguém escreveria).
- A regra `'@codedm'` → `'@codm'` (sem barra) do pass `scope` foi FIXADA em `template.config.ts` — o
  `@codedm` sem barra em qualquer outro lugar do repo é a MENTION TAG (`MentionGate.test.ts` afirma
  `mintMentionTag('/…/pessoal/codedm') === '@codedm'`, derivado do nome da PASTA, que OQ-4 mantém).
  Reescrever essa expectativa no pass `scope` — com a pasta e o `FALLBACK_TAG` ainda parados — deixaria
  uma rail viva vermelha no meio do rebrand; a tag anda no pass `text`, junto com `FALLBACK_TAG` (D-G).

## (b) AC-10 — o grep final, rodado AGORA, ao vivo, citado por inteiro

```
$ git grep -i codedm -- . ':!.plans' ':!.specs' ':!docs/handoff' ':!HANDOFF.md' ':!HANDOFF-2026-07-23-ORG.md'
```

**21 linhas, exatamente as mesmas que `7fbc4bec` já tinha citado em T7 — re-medidas nesta sessão, não
copiadas do commit — em 4 categorias, nenhuma linha fora delas:**

**Categoria 1 — 14 linhas citando `.specs/codedm/…` ou `.plans/…` (whitelist regra 2, D-D):**

```
.gitignore:# This has already bitten silently once: .specs/codedm/phase10-smoke/real-smoke-run.log sits on
.gitignore:!.specs/codedm/phase0-smoke/*.log
packages/api/go/internal/channel/events/wire_identity_test.go:// Wire-identity proof for the flat-events migration (.specs/codedm — flat-events phase).
packages/api/typescript/src/agent/enums/ResumeInvalidationReason.ts: * (`.specs/codedm/2026-07-26-agent-driving-stream-json.md:34-36`), and they exist because a resume
packages/api/typescript/src/agent/events/AgentUsageEvent.ts: * The Fase-2 smoke (`.specs/codedm/phase2-smoke/`, divergence D4) measured that there is no `usage`
packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.test.ts:// ── Canned frames, shaped from `.specs/codedm/phase2-smoke/raw/` ─────
packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.ts: * (`.specs/codedm/2026-07-26-agent-driving-stream-json.md`):
packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.ts: * `.specs/codedm/phase3-smoke/raw/vertical.json`): asked to classify an inbound message with an
packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/buildArgs.test.ts:		// .specs/codedm/2026-07-26-agent-driving-stream-json.md:14-18 — with every optional segment
packages/api/typescript/src/agent/services/StreamJsonCodec/StreamJsonCodec.test.ts: * below is copied from the REAL capture committed at `.specs/codedm/phase2-smoke/raw/`, so the shapes
packages/api/typescript/src/agent/types/AgentFrame.ts: * `.specs/codedm/phase2-smoke/raw/s1-text.jsonl`: `input_tokens: 2` next to
packages/api/typescript/src/agent/types/AgentFrame.ts: * `.specs/codedm/phase2-smoke/`) corrected three things the earlier taxonomy got wrong, and the
packages/app/tauri/README.md:  `tauri dev` acceptance is parked in `.specs/codedm/OVERNIGHT-BLOCKED.md`.
packages/app/tauri/config/build-sidecars.ts: * proved (.specs/codedm/2026-07-23-fork-d2-spike.md), with a different package: `@libsql/client`
```

**Categoria 2 — 3 linhas, o fato D-G do `MentionGate` (o diretório do checkout continua `codedm`, OQ-4):**

```
packages/api/typescript/src/thread/schemas/MentionGate.test.ts:		expect(mintMentionTag('/Users/work/Desktop/Projetos/pessoal/codedm')).toBe('@codedm')
packages/api/typescript/src/thread/schemas/MentionGate.ts: * codemod, and this founder's live thread is still bound to `/…/pessoal/codedm`, minting `@codedm`
packages/api/typescript/src/thread/schemas/MentionGate.ts: * `codedm.ts`.
```

(A 3ª linha é o exemplo do docblock explicando por que o matcher é WORD-BOUNDARY, não `.includes` — cita
`codedm.ts` como o nome de arquivo hipotético que o `.` da fronteira precisa tratar.)

**Categoria 3 — 3 linhas, o resíduo aceito do `.mcp.json` (path absoluto do checkout, mesma natureza D-G/OQ-4):**

```
packages/client/dist/typescript/src/typescript/mcp/scopes/issue-handling/.mcp.json:  "args": ["tsx", "/Users/work/Desktop/Projetos/pessoal/codedm/packages/client/dist/typescript/src/typescript/mcp/scopes/issue-handling/server.ts"]
packages/client/dist/typescript/src/typescript/mcp/scopes/orchestration/.mcp.json:  "args": ["tsx", "/Users/work/Desktop/Projetos/pessoal/codedm/packages/client/dist/typescript/src/typescript/mcp/scopes/orchestration/server.ts"]
packages/client/dist/typescript/src/typescript/mcp/scopes/system/.mcp.json:  "args": ["tsx", "/Users/work/Desktop/Projetos/pessoal/codedm/packages/client/dist/typescript/src/typescript/mcp/scopes/system/server.ts"]
```

**Categoria 4 — 1 linha, o comentário-narrativa do `template.config.ts` (D-E, lê como mensagem de commit):**

```
template.config.ts:// The 2026-07-30 codedm→codm rebrand (`.plans/2026-07-30-a-renames-codm.md`) needed
```

**Total: 14 + 3 + 3 + 1 = 21, batendo exatamente com o count ao vivo (`| wc -l` → 21) e com o que `7fbc4bec`
já tinha citado.** Zero linha fora dessas quatro categorias.

**Histórico intocado — 945 = 945, re-medido AGORA:**

```
$ git grep -i codedm -- .plans .specs | wc -l
945
$ git grep -i codedm 479f341e -- .plans .specs | wc -l    # HEAD antes de T4
945
```

`bun.lock`: `git grep -i codedm -- bun.lock` → **0** (regenerado em T4, confirmado limpo nesta sessão).

## (c) Achados da frente — registrados nos corpos dos commits, confirmados nesta sessão

1. **Erro de contagem de 2,6× da spec.** §Context 4/US-4 da spec original dizia "~979 ocorrências";
   o Ground do plano mediu **3474** (case-insensitive, repo inteiro) / **2516** (excluindo histórico).
   75,5% disso (1900 de 2516) era só o specifier `@codedm/` — a superfície mais mecânica.
2. **Quatro premissas do Ground contradisseram a spec**: a contagem de env (spec dizia 14 chaves/~243
   refs; real eram 12 chaves vivas/132 occ), a lista de `schema-sqlite` (spec citava ~22 pontos; real
   eram 61 occ/28 arquivos, 9 arquivos que a spec nunca citou), a existência de `docs/CLAUDE.md` (não
   existe — os arquivos reais são `CLAUDE.md` da raiz + `docs/BACKEND.md`), e a superfície de
   `tauri.conf.json` (a spec descrevia edição direta; o arquivo é GERADO, editar à mão seria DSK-01).
3. **Specifiers regex-escapados são invisíveis ao matcher literal do codemod** (achado do T4, não do
   plano): `@codedm\/contracts\/db` e `@codedm\/client-typescript\/` dentro de `new RegExp(...)` em dois
   testes de arquitetura sobreviveram ao pass `scope` porque o replace casa a barra LITERAL, não a
   escapada. 2 fixes mecânicos, mesma substituição semântica.
4. **O acoplamento `brand` → nome de crate Rust** que `config/generate.ts:173-178` já vigiava
   (`[package] name == '${REPO.brand}-desktop'`, `[lib] name == '${REPO.brand}_desktop_lib'`) não estava
   na spec — descoberto no Ground, falseado ao vivo no início de T5 (trocar só `brand` derruba DSK-01/02).
5. **O literal `dbFileName = "codedm.db"`** em `api/go/core/db/sqlite/store.go:44` — não derivado de
   `scope`/`brand`, citado em 40 pontos, forçado pelo AC-10 (não pela spec original).
6. **`MCP_SERVER_KEY`** — a marca é a chave que nomeia as ferramentas MCP expostas ao agente
   (`mcp__codedm__AskOperator` → `mcp__codm__AskOperator`); não estava na spec, é superfície voltada ao
   agente (sessões retomadas com `--allowedTools mcp__codedm__*` quebram — aceitável pré-release).
7. **A whitelist regra 2 (linha que cita `.specs/codedm` dentro de docblock de PRODUÇÃO) é a armadilha
   real do codemod**, não as regras de arquivo inteiro. 14 arquivos em HEAD citam o caminho histórico em
   comentário; um replace cego produziria `.specs/codm/…`, um caminho que não existe.
8. **`bun sdk` com `clean: false` no kubb (`generators/typescript.ts:425`) exige grep pós-regen.** A
   pasta antiga não morre sozinha — o generator só faz `mkdir`+`writeFile`; T1 precisou de
   `git rm -r` explícito, e T4/T5 precisaram do "grep anti-incremental" (`git grep '@codedm'`/
   `'codedm_contracts_rust'` em `dist/`/`generated/` pós-regen) porque uma regen incremental deixaria o
   nome velho sobrevivendo ao lado do novo.
9. **`PROJECT=codedm` no `.env` local desde antes desta sessão** (achado de T7, não do plano):
   `Config.name = \`${PROJECT}-${SERVICE}\`` lê `process.env.PROJECT` em runtime; o `.env` local
   (não rastreado, fora do universo do codemod por design — regra 6 de D-D) continuava com
   `PROJECT=codedm`, invisível a qualquer grep porque só aparece DEPOIS de `bun sdk` consumir a env var
   — o `openapi.json` `title` e os 3 `.mcp.json`/`server.ts` gerados carregavam `codedm-backend` desde
   T4. Corrigido: `PROJECT=codm` no `.env` pessoal (fora do repo versionado) + `bun x nx reset` (o
   `emit-openapi` estava cacheado) + regen completa. Não é correção de código do repo — é higiene de
   ambiente local necessária para o próprio build gerar output correto.
10. **`bun.lock` rebuild em T7 trouxe Playwright 1.61.1 → 1.62.1 junto** (browsers reinstalados),
    confirmado nesta sessão comparando `git show 61641887:bun.lock` / `2868b603:bun.lock` (ambos
    `playwright@1.61.1`) contra `7fbc4bec:bun.lock` (`playwright@1.62.1`) — `bun.lock` mudou
    `1196` linhas no diff de T7 (`261 insertions(+), 935 deletions(-)`), efeito colateral não documentado
    no corpo do commit; nenhuma referência a `codedm` sobrevive nele (`git grep -i codedm -- bun.lock` →
    0).
11. **Binários sidecar gitignored continuavam com o nome velho** (achado de T5): `src-tauri/binaries/`
    está fora do universo do codemod (não rastreado); `build.rs` do `tauri-build` valida a existência dos
    `externalBin` para o target triple em QUALQUER `cargo build`, não só no bundle — o próprio gate
    `cargo build --manifest-path .../src-tauri/Cargo.toml` de T5 falhava sem rebuildar os 2 binários sob
    o nome novo (`bun x nx run app-tauri:sidecars`); os 2 antigos (artefato local, nunca rastreado) foram
    removidos.
12. **A marca tem uma 4ª grafia que o plano perdeu: `Codedm`** (não `codedm`/`CODEDM`/`CodeDM`) — 4
    ocorrências (`isCodedmTool` em `wire.ts` + o consumidor em `StreamJsonToTurnFactAccumulator.ts`),
    pega pela regra mista `Codedm→Codm` do próprio pass `text`, sem precisar de edição à mão.
13. **`noMisplacedAssertion` pré-existente (biome), suprimido em fixture, exposto por colateral do
    rename** (achado de T4): o codemod tocou uma linha de import de
    `scripts/skill-evals/seeds/synthetic-l5-handoff-continuity/entities/Coupon.test.ts` (fixture
    sintética do harness skill-evals, fora de `bun lint`), o que trouxe o arquivo para o `lint-staged` do
    pre-commit hook e expôs 2 violações PRÉ-EXISTENTES desde `aa034844` (anterior a qualquer Task desta
    sessão) num helper compartilhado fora de `it()`. Suprimidas com `biome-ignore` nominal — zero mudança
    de comportamento de teste.
14. **O `name` bare da raiz (`"codedm"`, sem `@`) só é alcançado pelo catch-all do pass `text`** — não é
    alvo do pass `scope` (T4) porque não é referenciado como dependência por nenhum outro `package.json`;
    ficou registrado explicitamente no corpo de `70498b98` para não ser confundido com um dos 12 `name`
    do Ground.

## (d) Mapa AC-1..AC-11 → evidência (re-verificado ao vivo nesta sessão)

| AC | Evidência | Confirmação ao vivo |
|---|---|---|
| AC-1 | T1 `5d690cde` — `generators/error-codes.ts` outDir `.../errors`; `bun sdk` exit 0 | `ls packages/client/dist/typescript/src/` → `errors go http index.ts typescript` |
| AC-2 | T1 — `lib/errors.ts` + `locales/errors.check.ts` importam `@codm/client-typescript/errors` (specifier pós-T4) | `grep -n "client-typescript/errors"` nos dois arquivos → 4 hits, todos `@codm/` |
| AC-3 | T1 — `packages/client/dist/http` deletado | `git grep -n "client/dist/http" -- . ':!.plans' ':!.specs'` → **0**; `git ls-files packages/client/dist/http` → **0** |
| AC-4 | T2 `c87876fe` — `git mv db/schema-sqlite db/schema` | `ls packages/contracts/db/` → `migrations.ts schema` |
| AC-5 | T2 — 61 occ/28 arquivos corrigidos (9 além dos que a spec citava); a AC cita `docs/CLAUDE.md`, que não existe — evidência real é `CLAUDE.md` (raiz) + `docs/BACKEND.md` | `git grep -n schema-sqlite -- . ':!.plans' ':!.specs'` → **0** |
| AC-6 | T2 — `dist/schema/migrations`, não `dist/schema-sqlite/migrations` | `bun x nx run api-typescript:build && ls packages/api/typescript/dist/schema/` → `migrations` |
| AC-7 | T4 (`scope`) + T5 (`brand`) | `grep -n "^const scope\|^const brand\|modulePrefix:" template.config.ts` → `scope = '@codm'`, `brand = 'codm'`, `go: { modulePrefix: 'template' }` |
| AC-8 | T6 `2868b603` — `Config.ts:31` | `grep -n CODM_DATA_DIR packages/api/typescript/core/src/utils/Config.ts` → `CODM_DATA_DIR: z.string().default('~/.codm/data')` |
| AC-9 | T5 — `bun desktop:generate` regenera `tauri.conf.json` | `grep -n identifier -A0 / externalBin -A3 packages/app/tauri/src-tauri/tauri.conf.json` → `app.codm.desktop`, `binaries/codm-daemon`, `binaries/codm-gateway` |
| AC-10 | T7 `7fbc4bec` | grep canônico → 21 linhas, 4 categorias, ver §(b) acima |
| AC-11 | T4/T5 regen (`bun run all`, `bun sdk`, `bun contracts`) | `packages/client/dist/typescript/package.json` e `packages/contracts/generated/typescript/package.json` → `@codm/` presente; regen completa confirmada verde em `bun check:generated` (Seção 2(a), item 5) |

---

# SEÇÃO 2 — Fechamento do GOAL inteiro (8 frentes)

## (a) A bateria literal da Resolução OQ-3 — rodada AGORA, em sequência, saída citada

OQ-3 resolveu a divergência entre o texto original da condição 6 do goal e o rascunho do Step T8.1 do
plano: **usar a lista literal abaixo, verbatim**, mais os gates extra que B1/C acrescentaram ao repo
(cargo ×3 por `--manifest-path` + `bun desktop:generate --check`). Todo comando de teste de
`packages/api/typescript` rodou com `REDIS_URL=redis://localhost:6390` (skip desenhado da suíte
`redis-bridge.integration`, precedente `c87876fe`). HEAD permaneceu `7fbc4bec` do início ao fim da
bateria — nenhum código foi tocado.

**1. `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`**
Exit 0, sem output.

**2. `cd packages/api/typescript && bun test`** (com `REDIS_URL=redis://localhost:6390`)
```
911 pass
3 skip
0 fail
1 snapshots, 2177 expect() calls
Ran 914 tests across 144 files.
```

**3. `bun tsc`** (raiz)
```
nx run app-astro:tsc [existing outputs match the cache, left as is] → astro check: Result (30 files): 0 errors, 0 warnings, 0 hints
nx run api-typescript:tsc [existing outputs match the cache, left as is]
nx run e2e:tsc [existing outputs match the cache, left as is]
nx run api-go:tsc [existing outputs match the cache, left as is] → go vet ./... && go -C core vet ./...
NX   Successfully ran target tsc for 7 projects
Nx read the output from the cache instead of running the command for 7 out of 7 tasks.
```

**4. `bun run test:tooling`**
```
422 pass
0 fail
1095 expect() calls
Ran 422 tests across 26 files.
```

**5. `bun check:generated`**
```
[check:generated] regenerating SDK (openapi + kubb)…
nx run api-go:emit-openapi → go run ./cmd/openapi → openapi: wrote public/docs/openapi.json
nx run client:generate → bun run generate
  [typescript] mcp scope 'issue-handling': 6 tools · 'orchestration': 5 tools · 'system': 23 tools
  rust-codegen: wrote .../packages/client/dist/rust/src/go/mod.rs
  rust-codegen: wrote .../packages/client/dist/rust/src/typescript/mod.rs
  [error-codes] 79 codes from 1 service spec(s) → dist/typescript/src/errors/index.ts
NX   Successfully ran target generate for project client and 2 tasks it depends on
✓ generated output in sync (contracts bindings, SDK dist, openapi.json)
```
`git status --porcelain` imediatamente depois → **vazio** (confirmado nesta sessão — os artefatos
commitados em T1–T7 são bit-a-bit o que o gerador produz agora).

**6. `cd packages/contracts && bun test codegen/`**
```
92 pass
0 fail
396 expect() calls
Ran 92 tests across 9 files.
```

**7. `cd packages/api/go && go build ./... && go test ./...`**
Build: exit 0, sem output. Test: todos os pacotes com teste reportam `ok` (mistura de cached e fresh —
`template/api-go/pkg/openapi` rodou fresh, `4.122s`); zero pacote `FAIL`.

**8. `cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts --check`**
```
✔ schema.sql matches the migrations
```

**9. `cd packages/e2e && bun run test`** (nunca `bun e2e`)
```
✓ 07-issue-archive-restore.spec.ts › issue archive → restore
- 08-stop-resolve.spec.ts (skipped)
- 09-sse-pill.spec.ts (skipped)
✓ 10-terminal-tool-frame.spec.ts › the console panel receives the REAL tool name...
2 skipped
6 passed (15.0s)
```
Scratch dir removido ao final: `codm-e2e-data-d99qaz` — confirma o rename do prefixo (T5/T6) vivo em
runtime.

**10. `cd packages/app/react && bun x tsc`** (extra: a frente muda SDK/contrato)
Exit 0, sem output.

**Gates extra-goal que B1/C acrescentaram ao repo (cargo ×3 por `--manifest-path`, `desktop:generate --check`):**

**11. `cargo build --manifest-path packages/contracts/generated/rust/Cargo.toml`**
`Compiling codm-contracts-rust v0.0.1 ... Finished \`dev\` profile [unoptimized + debuginfo] target(s) in 0.63s`

**12. `cargo test --manifest-path packages/contracts/generated/rust/Cargo.toml`**
`tests/roundtrip.rs`: 3 passed. `tests/slot.rs`: 4 passed. `tests/slots_meta.rs`: 1 passed. Doc-tests: 0.
**Total 8 passed, 0 failed.**

**13. `cargo build --manifest-path packages/client/dist/rust/Cargo.toml`**
`Compiling codm-contracts-rust ... Compiling codm-client-rust v0.0.1 ... Finished \`dev\` profile ... in 2.79s`

**14. `cargo test --manifest-path packages/client/dist/rust/Cargo.toml`**
`tests/builder.rs`: 3 passed (inclui `contract_enums_are_the_wire_crate_types`). `tests/live_smoke.rs`:
0 passed, **1 ignored** (by design — "needs live backends on :3030/:3032"). `tests/message_received_union.rs`:
5 passed. Doc-tests: 0. **Total 8 passed, 0 failed, 1 ignored.**

**15. `cargo build --manifest-path packages/app/tauri/src-tauri/Cargo.toml`**
`Compiling codm-contracts-rust ... Compiling codm-client-rust ... Compiling codm-desktop v0.1.0 ... Finished \`dev\` profile ... in 4.77s`

**16. `cargo test --manifest-path packages/app/tauri/src-tauri/Cargo.toml`**
```
unittests src/lib.rs — 5 tests: sidecars::gate::tests::{every_sidecar_ready_reveals_the_main_window_exactly_once,
the_last_arrival_always_reveals_something, a_single_failure_reveals_the_error_splash_and_never_main,
stderr_is_retained_bounded_and_tail_first} ok, commands::export_bindings::export_typescript_bindings ok
tests/no_raw_http.rs — 2 tests: raw_reqwest_is_confined_to_the_api_module ok, hand_rolled_http_is_confined_to_the_api_module ok
```
**Total 7 passed, 0 failed.**

**17. `bun desktop:generate --check`**
```
✓ desktop shell config in sync (2 files)
```

**Resultado: 17/17 comandos verdes, zero regressão, zero achado ambiental novo (o único flake conhecido
do goal — `redis-bridge.integration.test.ts`/porta 6379 compartilhada com o repo irmão medscall — nem
chegou a rodar, porque `REDIS_URL` apontado à porta morta ativa o skip desenhado, mesmo padrão que
`c87876fe`/`479f341e`/`2868b603` já tinham documentado). `git status --porcelain` → vazio antes, durante
e depois da bateria inteira; HEAD permaneceu `7fbc4bec`.**

## (b) `git log` provando os commits de fechamento das 8 frentes, na ordem em que rodaram

**Comando literal do plano (Step T8.4) — reproduzido e CORRIGIDO nesta sessão:**

```
$ git log --oneline --grep='artefato de fechamento' --grep='closure' --all-match=false -i | head -20
fatal: unrecognized argument: --all-match=false
```

`--all-match=false` não é sintaxe válida do git (`--all-match` é uma flag booleana, não aceita `=false`;
sua AUSÊNCIA já produz OR entre os `--grep`, que é o comportamento pretendido). **Desvio do plano,
corrigido e re-rodado:**

```
$ git log --oneline -i --grep='artefato de fechamento' --grep='closure' --regexp-ignore-case
1f6b6f05 docs(plans): C — closure artifact precision update on the redis-bridge flake
2fed1a40 docs(plans): C — artefato de fechamento (bateria + AC map + falseadores re-medidos)
f1abd5d4 docs(plans): B1 T7 — artefato de fechamento (greps citados + falseadores + mapa AC->teste)
3e757cea docs(plans): B2 — artefato de fechamento (greps citados + falseadores + mapa AC->teste)
ec8f419d docs(plans): B5 — artefato de fechamento (greps citados + mapa AC->teste)
20a510cf docs(plans): B4 — artefato de fechamento (greps citados + mapa AC->teste)
e6dd28d7 docs(plans): B3 — artefato de fechamento (greps citados + mapa AC→teste)
[... commits mais antigos de outros goals, fora do range deste GOAL ...]
```

```
$ git log --oneline 1f6b6f05..HEAD
7fbc4bec refactor(repo): A T7 — o residuo de marca some, e o comentario do config vira verdade (pass 4/4)
2868b603 refactor(repo,api): A T6 — CODEDM_* vira CODM_*, ~/.codm/data e codm.db (pass 3/4)
61641887 refactor(repo,app-tauri): A T5 — brand vira codm; os 5 crates e a identidade Tauri vao junto (pass 2/4)
70498b98 refactor(repo): A T4 — o npm scope vira @codm (pass 1/4 do rebrand)
479f341e chore(scripts): A T3 — o codemod do rebrand nasce, com a whitelist falseada
c87876fe refactor(contracts): A T2 — db/schema-sqlite vira db/schema, e o nome para de citar o dialeto
5d690cde refactor(client,app-react): A T1 — dist/http orfao morre, error-codes vira errors
e233f388 docs(plans): A — plano de implementacao (8 tasks, renames+codm) + resolucoes OQ-1..4
```
8 commits — confirma a frente A inteira (plano + 7 Tasks) fechando exatamente sobre o tip de C
(`1f6b6f05`), sem nenhum commit estranho entre elas.

**Tabela consolidada — primeiro e último SHA de cada frente, medidos ao vivo nesta sessão via
`git log --format="%h %ai %s"` (timestamps confirmam a ordem cronológica C8 → B3 → B4 → B5 → B2 → B1 → C → A,
sem sobreposição):**

| # | frente | primeiro commit | último commit (= fechamento) | nº commits | como fechou |
|---|---|---|---|---|---|
| 1 | **C8** — e2e stale specs | `76f15ee4` 23:25 test(e2e): C8 — specs 04/05 assertam a semântica shipped do composer | `d0bd78ce` 23:37 fix(agent,e2e): C8 — whisper-turn não forka + workers=1; suíte e2e verde | 2 | **por commits** — sem artefato de fechamento dedicado (plano: `.plans/2026-07-29-c8-e2e-stale-specs.md`) |
| 2 | **B3** — activation semantics | `837a4158` 00:36 refactor(thread,core): B3 — a entrega no canal é um comando durável | `e6dd28d7` 01:19 docs(plans): B3 — artefato de fechamento | 6 (T1-T6) + 1 fechamento | artefato `.plans/artifacts/2026-07-29-b3-activation-closure.md` |
| 3 | **B4** — aggregate boundaries | `cfe25861` 02:22 docs(plans): B4 — plano da frente | `20a510cf` 06:23 docs(plans): B4 — artefato de fechamento | plano + T1-T10 | artefato `.plans/artifacts/2026-07-30-b4-aggregate-boundaries-closure.md` |
| 4 | **B5** — browser events removal | `a471d168` 06:56 docs(plans): B5 — plano da frente | `ec8f419d` 07:29 docs(plans): B5 — artefato de fechamento | plano + T1-T4 | artefato `.plans/artifacts/2026-07-30-b5-browser-events-removal-closure.md` |
| 5 | **B2** — mcp core service | `ae5f1c51` 08:54 docs(plans): B2 — plano da frente | `838db52b` 11:31 docs(plans): B2 T10 — a saída real de check:generated | plano + T1-T10 | artefato `.plans/artifacts/2026-07-30-b2-mcp-core-service-closure.md` (T9 `3e757cea` é o corpo; T10 `838db52b` registra o `check:generated` pós-commit, 65s depois) |
| 6 | **B1** — health/readiness | `52c6f485` 12:17 docs(plans): B1 — plano de implementacao | `f1abd5d4` 13:32 docs(plans): B1 T7 — artefato de fechamento | plano + T1-T7 | artefato `.plans/artifacts/2026-07-30-b1-health-readiness-closure.md` |
| 7 | **C** — frontend conformance | `6f2acf0a` 13:56 docs(plans): C — plano de implementacao | `1f6b6f05` 15:58 docs(plans): C — closure artifact precision update | plano + T1/E-C2/T2-T8 + 2 commits de fechamento | artefato `.plans/artifacts/2026-07-30-c-frontend-conformance-closure.md` (`2fed1a40` o corpo, `1f6b6f05` uma correção de precisão sobre o flake do redis-bridge) |
| 8 | **A** — renames CODM | `e233f388` 16:25 docs(plans): A — plano de implementacao | `7fbc4bec` 18:22 refactor(repo): A T7 (e **este commit**, T8, fecha A e o GOAL) | plano + T1-T7 + T8 (este) | este artefato |

Todos os timestamps são `2026-07-29`/`2026-07-30`, contíguos e sem sobreposição entre frentes — cada
frente começou depois que a anterior fechou. **O que o goal entregou, uma linha por frente:**

1. **C8** — a suíte e2e para de flakar sobre specs desatualizadas (`whisper-turn` não forka mais, e o
   e2e roda com `workers: 1` por decisão explícita, documentada como achado C8 no B3).
2. **B3** — a entrega de mensagem no canal e a resposta do orquestrador viram COMANDOS duráveis
   (outbox), não side-effects imediatos; `ChannelDeliveryRequestedEvent` morre.
3. **B4** — `Thread` vira o agregado dono de citações, entries e stops; `TranscriptRepository` morre,
   os 4 writers passam pelo agregado; a tabela de stops muda de dono no schema.
4. **B5** — os 3 eventos `browser.*` e o `BrowserFrameEnricher` morrem; o front passa a escutar
   `integration.thread.message_ingested` cru.
5. **B2** — MCP vira capacidade do CORE: o controller se auto-declara (`static mcpScopes`), 7 estruturas
   paralelas de manifesto morrem, a checagem de identidade do agente vira obrigatória no destino.
6. **B1** — health/readiness dos sidecars via SDK tipada (não `TcpStream` cru); o shell Tauri só revela
   a janela principal quando TODOS os sidecars estão prontos, nunca em falha parcial.
7. **C** — os 3 dialogs divergentes do front passam a ser dirigidos por `useDialogStore`; primitivos de
   `ui/` estendem `ComponentProps` da raiz; `availability.tsx` (1051 linhas mortas) deletado.
8. **A** — o repo perde todo resíduo de nome: `dist/http` órfão morre, `error-codes`→`errors`,
   `schema-sqlite`→`schema` (convenção sobe pro template), e `codedm`/`CodeDM`/`CODEDM_*`/`@codedm` vira
   `codm`/`CODM`/`CODM_*`/`@codm` por um codemod de 4 passes, cada um com falseador próprio.

**Confirmações finais do Step T8.4:**

- `git log --oneline -- .specs/2026-07-30-rust-wire-and-tauri-sdk-design.md` → **4 commits, todos
  ANTERIORES ao range do goal** (`3a45d8bc`, `c9f91ecd`, `864e492c`, `6edcffac` — trabalho de contratos
  F1/F3, nenhum dentro de `1f6b6f05..HEAD` nem de nenhuma das 8 frentes). **Nenhuma Task de nenhuma
  frente tocou a spec canônica.**
- `git stash list` → `stash@{0}: lint-staged automatic backup` — **1 entrada, a mesma já documentada
  pelo artefato da frente C** (datada de 29/07 00:32, ANTERIOR a C8/B3/B4/B5/B2/B1/C/A). **Nenhum stash
  foi criado ou aplicado por esta sessão** (T8 não editou nenhum arquivo além deste artefato).

## (c) Ponteiros para os 8 artefatos de fechamento

| frente | artefato | confirmado |
|---|---|---|
| C8 | *(nenhum — fechou por commits)* | `76f15ee4`, `d0bd78ce` (ver §(b)) |
| B3 | `.plans/artifacts/2026-07-29-b3-activation-closure.md` | existe, 234 linhas |
| B4 | `.plans/artifacts/2026-07-30-b4-aggregate-boundaries-closure.md` | existe, 386 linhas |
| B5 | `.plans/artifacts/2026-07-30-b5-browser-events-removal-closure.md` | existe, 374 linhas |
| B2 | `.plans/artifacts/2026-07-30-b2-mcp-core-service-closure.md` | existe, 538 linhas |
| B1 | `.plans/artifacts/2026-07-30-b1-health-readiness-closure.md` | existe, 182 linhas |
| C | `.plans/artifacts/2026-07-30-c-frontend-conformance-closure.md` | existe, 458 linhas |
| A | `.plans/artifacts/2026-07-30-a-renames-codm-closure.md` | **este arquivo** |

`ls .plans/artifacts/ | sort` confirmado nesta sessão — os 6 pré-existentes (b1, b2, b3, b4, b5, c) mais
este (a) somam os 7 artefatos; C8 fecha por commits, não por artefato, por decisão do próprio plano de
C8 (fora do escopo desta Task revisitar essa decisão).

## (d) Lista consolidada de follow-ups do founder — agregada dos 6 artefatos de fechamento anteriores + achados desta frente

Nenhum destes virou Task em nenhuma frente — são decisões explicitamente do founder, registradas para
não se perderem. Agrupados por origem:

**De B1 (`.plans/artifacts/2026-07-30-b1-health-readiness-closure.md`, §d):**

1. **Paths Go sem `/api` no spec OpenAPI** — nenhum dos 38 paths emitidos pelo Go carrega o prefixo
   `/api` (`RegisterControllers` monta `/api` + contexto só em runtime; o emitter devolve `meta.Path`
   cru com `servers: null`). Resolvido OPERACIONALMENTE por convenção de base-URL (a shell Tauri aponta
   o sub-client Go para `http://127.0.0.1:{port}/api`), não pelo emitter — decisão de contrato
   (fazer os paths do spec Go já carregarem `/api`, com o proxy ajustado para não duplicar) é
   **follow-up do founder**.
2. **`check:generated` não vigia `packages/client/dist/rust/src` nem `packages/client/dist/go`** —
   `scripts/check-generated.ts` vigia só `contractsGenTs`, `contractsGenGo`, `clientTsDist/src` e o
   openapi TS. Confirmado ainda verdadeiro nesta sessão (item 5 de §2(a) — o regen tocou `dist/rust`
   como efeito colateral do gerador, mas a checagem final não teria pego uma divergência ISOLADA ali).
   Toda Task desta frente que tocou Rust precisou de `git add packages/client/dist/rust` explícito.
3. **`app-tauri` não tem targets Nx `test`/`tsc`** — reconfirmado nesta sessão: `bun tsc` (item 3 de
   §2(a)) rodou 7 projetos, nenhum é `app-tauri`; todo o Rust é gate por `--manifest-path` isolado
   (itens 11-16 de §2(a)), nunca coberto por `bun x nx run-many`. **Follow-up**: `project.json` custom
   targets (`cargo build`/`test`/`clippy`) para `app-tauri` entrar em `bun x nx affected`.
4. **Tipos `Status`/`Status2` na SDK TS gerada — colisão de nome de componente OpenAPI (`cc-bp-13`)** —
   enums inline não roteados por um enum canônico compartilhado em `packages/contracts`; debt de
   legibilidade, não quebra nada hoje.
5. **`X-Owner-Id: "local"` (shell Tauri) vs. a convenção `ownerId: z.uuid()` (TS)** — mismatch latente,
   ainda não exercitado (o único método que a shell chama hoje, `health()`, não tem `ctx.ownerId`). O
   dia em que a shell chamar um segundo endpoint que exige UUID, `"local"` falha a validação.

**De B2 (`.plans/artifacts/2026-07-30-b2-mcp-core-service-closure.md`, §e/§h):**

6. **`AGENT_RUN_TOKEN_HEADER` declarado duas vezes** (`core/src/types/AgentIdentity.ts` +
   `packages/client/dist/typescript/.../mcp/context/index.ts`), pinado por um teste de igualdade em vez
   de single-sourced — corrigir exigiria `packages/client` depender de `core`, decisão de topologia de
   pacotes fora do escopo de qualquer frente até agora.
7. **`core/`, `api-typescript` e `api-go` estão fora do `bun lint`** — só 3 projetos (`app-styles`,
   `app-react`, `app-astro`) têm target `lint` no Nx.
8. **`core/` e `<ctx>/mcp/**` são pontos cegos do `bun review`** — `CLASSIFICATION_RULES` em
   `scripts/review.ts` não casa nenhum dos dois; `packages/api/typescript/src/agent/mcp/exposure.ts`
   fica NÃO CLASSIFICADO quando passado ao review.
9. **`buildOperation` em `OpenAPI.ts` recebe `HttpMethod` widened para `string`** — violação
   pré-existente, exposta (não introduzida) pelo B2; a correção real cascateia em `buildOperationId` →
   `operationIdOf`.
10. **`phase6-mcp-smoke.ts` fica fora de AMBOS os `tsconfig`** — `tsconfig.build.json` não inclui
    `scripts/**`; `tsconfig.json` aponta para `packages/api/scripts` (um nível ACIMA do real
    `packages/api/typescript/scripts/`), um diretório que não existe. Nenhum erro de tipo em
    `scripts/**` seria pego por `bun tsc`.
11. **CLI sem flag para `static mcpScopes`** — `bun cli controller --mcp-scope=<scope>` não existe; a
    ausência é o default seguro (exposição zero), mas a flag pouparia o próximo controller MCP-exposto.
12. ~~**`real-di-resolution.test.ts` cobrindo `McpDoorController`**~~ — **JÁ RESOLVIDO no próprio B2 (T9)**:
    o rail ganhou um `it` que resolve `McpDoorController` pelo container e assevera que `identities` está
    definido (falseador provado: construtor apagado → `3 pass/1 fail`; restaurado → `4 pass/0 fail`).
    Citado aqui só para registro de que NÃO é mais um follow-up aberto.

**De B4 (`.plans/artifacts/2026-07-30-b4-aggregate-boundaries-closure.md`, §h):**

13. **Rename físico `issue_stops` → `thread_stops`** (a tabela mudou de DONO no schema em B4, mas o
    NOME físico da tabela + o `sqlc` que a lê continuam com o nome antigo) — candidato a frente própria,
    migração destrutiva.
14. **CLI sem `bun cli service --seam`** (sufixo dedicado, no idioma de `bun cli handler`) — descoberto
    ao escrever o plano de B4, não aberto.
15. **`Thread.setStatus` sem call site** — candidato a remoção junto da coluna `threads.status`, migração
    destrutiva, decisão do founder.
16. **`gateway_remotes` — contrato de colunas disjuntas honrado pelo agregado, quebrado pelo `Save`
    largo da projeção Go** (6 colunas reclamadas no `ON CONFLICT DO UPDATE`) — registrado em
    `bp-GO-REPO-10`, corrigir o código é fora de escopo.
17. **4 writers de `gateway_remote_memberships` gerados por sqlc, zero chamadores** (dead code de
    codegen) — não tocado.
18. **AC-9 de B4 sem teste automatizado** — gap encontrado durante a medição de fechamento de B4, não
    coberto por nenhuma Task.

**De B5 (`.plans/artifacts/2026-07-30-b5-browser-events-removal-closure.md`, §e/notas):**

19. **A task graph do Nx (`emit-openapi`/`client:generate`) provavelmente tem `inputs` mal declarados** —
    não captura a dependência cruzada em `packages/contracts/generated/typescript/src` como input do
    hash, causando cache stale (mordeu B5 duas vezes: T1 e preventivamente em T2). Recomendado abrir
    follow-up para consertar os `inputs`, em vez de mais rodadas de `--skip-nx-cache` manual.
20. **`packages/app/react/CLAUDE.md:226-234` descreve `BrowserFrameEnricher` como padrão ATIVO** — ficou
    stale depois de B5 deletá-lo; precisa de reescrita de conteúdo, não um s/nome/nome/.

**De C (`.plans/artifacts/2026-07-30-c-frontend-conformance-closure.md`, §d):**

21. **`nx run app-react:tsc` não cobre `tests/**`** — `packages/app/react/tsconfig.json` exclui
    `tests/**/*.test.ts`; as 3 rails de arquitetura (`dialog-store`, `form-field`, `primitive-props`)
    rodam só via `bun test` (transpilação Bun, sem checagem de tipo completa), nunca via `tsc`.
22. **`codm` (à época `codedm`) sem Redis próprio no compose — contaminação do repo irmão medscall na
    porta 6379.** O teste `redis-bridge.integration.test.ts` é skip-gated mas CONECTA com sucesso no
    Redis do medscall e falha por timeout de contenção. Confirmado FLAKY (não determinístico) em C;
    contornado nesta sessão e em toda a frente A via `REDIS_URL` apontado a uma porta morta — **o
    contorno funciona, mas não é a correção**: dar ao repo um Redis próprio no compose, ou namespacear
    os streams, é follow-up do founder (já citado também no corpo de `c87876fe`).
23. **9→8 `universal#eslint-disable`, 6 `component#bp-14` (literal vs enum), 1 `component#bp-06` (cores
    hardcoded)** — findings do `bun detect` em `app-react`, todos justificados por comentário/decisão,
    a regra é cega à justificativa; não corrigidos, fora de escopo de C.

**De B3 (`.plans/artifacts/2026-07-29-b3-activation-closure.md`, §d — O2-O5 seguem abertas):**

24. **Ordenação intra-batch da lane de outbox** — sem owner-skip, um predecessor que falha não segura o
    sucessor; a spec responde "consumidores deduplicam", um degrau a mais é decisão do founder.
25. **A citação (`quotedMessageId`) nunca chega ao wire** — `DeliverChannelMessage` nunca passa o campo
    ao `sender.send()`; carregado no comando, descartado no envio. Ativar é mudança de comportamento
    fora de B3.
26. **`@doc` mentiroso no enum `outbox-source.tsp`** — afirma que o Go `SqlExternalMediator` claima
    `integration`, falso desde que o gêmeo Go virou egress-only (e mais falso ainda depois de B3, que fez
    o TS também produzir ali). Corrigir mexe em arquivos gerados + `contracts.openapi.yaml`.
27. **`shutdown()` não fecha o `CommandQueue`** — `src/index.ts:127-144` não tem passo para a fila; o
    lease de 60s cobre um comando interrompido no meio, mas um `close()` gracioso pouparia uma tentativa
    queimada por deploy.
28. **30s de backoff no PRIMEIRO retry do outbox** (achado C8, fora das Decisions de B3) —
    `DrizzleOutboxDispatcher.finalizeFailure` retém o lease como backoff; uma falha transiente custa 30s
    de latência de materialização — foi o que estourou o poll de 20s do e2e e levou C8 a fixar
    `workers: 1`. Candidato a backoff menor/jitter no primeiro retry.

**Desta frente (A), novos, não cobertos por nenhum artefato anterior:**

29. **Renomear a pasta do checkout (`/…/pessoal/codedm` → `/…/pessoal/codm`) + re-clone** — decisão
    explícita de OQ-4: não acontece nesta frente (é o cwd vivo da sessão e de todos os worktrees, e
    renomear quebraria a própria execução). Consequência viva: `MentionGate` minta `@codedm` ao vivo
    enquanto o `FALLBACK_TAG` é `@codm` (D-G); os 3 `.mcp.json` gerados embutem o path absoluto do
    checkout. **Follow-up do founder**: operação de shell fora do repo, posterior ao merge — renomear a
    pasta e re-clonar (ou `git worktree` para um path novo).
30. **`repoUrl` (`template.config.ts:150`) → criar/ajustar o remoto `codm` quando publicar** — resolução
    OQ-2: renomeado para a forma `codm` (`github.com/codm/codm`) mesmo sem o repo remoto existir ainda,
    porque o goal é local-only (sem push). Follow-up: criar o remoto (ou apontar para o real) na hora de
    publicar.
31. **`PROJECT=codedm` no `.env` local** — já corrigido NESTA sessão de execução de T7 (não é mais um
    follow-up aberto, listado aqui só para registro de que era um risco de higiene de ambiente que
    qualquer outro clone/worktree do founder pode repetir se o `.env` dele também datar de antes de T4).

---

## Notas finais

- **`bun e2e` não foi usado nesta Task** — `cd packages/e2e && bun run test`, conforme a convenção das
  frentes B1/C, reafirmada pela OQ-3.
- **Nenhum código de produção, config ou skill foi tocado por esta Task** — só este documento foi
  escrito. Todas as mutações de falseador citadas na Seção 1(a) são HISTÓRICAS (dos commits T3-T7,
  já commitadas em sessões anteriores), não reproduzidas nem revertidas nesta sessão — T8 é
  measure-only por scope fence do próprio plano.
- **`.specs/2026-07-30-rust-wire-and-tauri-sdk-design.md` nunca foi aberto** por esta Task nem por
  nenhuma das 7 Tasks de A — confirmado em §2(b).
- **O stash (`lint-staged automatic backup`) é anterior a esta sessão e a todo o goal** — não foi criado,
  aplicado, nem tocado por esta Task.
- **`git status --porcelain`** → vazio antes desta Task começar, vazio durante toda a bateria de
  Seção 2(a) (inclusive depois do `bun check:generated`, que regenera e depois confirma sincronismo), e
  será vazio de novo depois do commit deste artefato (único arquivo novo: este próprio documento).

**Estado final:** frente A fechada (8 commits: plano + T1-T7), GOAL inteiro fechado (8 frentes, 2
fechando por commits — C8 — e 6 por artefato dedicado — B3/B4/B5/B2/B1/C — mais este, o 7º artefato,
fechando A). Nenhuma regressão encontrada na bateria completa da Resolução OQ-3 (17/17 comandos verdes).
