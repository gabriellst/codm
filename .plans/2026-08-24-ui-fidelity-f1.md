# UI Fidelity F1 — produzir a verdade do codm.pen — Implementation Plan

> **For agentic workers:** Execute via `/build`. Cada Task embrulha um comportamento
> observável. **Precondição humana em T2/T3:** Pen.app aberto com `design/codm.pen` ATIVO —
> se o bridge não alcançar, o Task retorna BLOCKED com a instrução, nunca contorna.

**Goal:** A verdade do design extraída e commitada — `pencil-export.ts` versionado,
`design/system/pen/` (tokens + specs + manifesto), 39 targets PNG, e um piloto de medição
com score real no scoreboard.

**Architecture:** O bridge fala JSON-RPC via stdio com o binário MCP do Pencil
(`--app desktop`), alvo explícito por `PEN_FILE` em todo `execute` (armadilha 38 do cânon —
ver `docs/UI-FIDELITY.md`). Descoberta de telas pela estrutura do documento (áreas
"Mesclado / *" → frame "Screens*" → artboards); o resultado congela no manifesto commitado
— stories referenciam slug, nunca nodeId. Targets exportados em staging e renomeados
(`Export` nomeia `<nodeId>.png` — fato medido). O piloto marca a primeira story de tela
(dashboard = "Início") e produz o primeiro score real.

**Tech Stack:** TypeScript, Bun, JSON-RPC/stdio, pngjs, Storybook 10, MSW (@/storybook)

**Spec:** .specs/2026-08-24-extracao-ui-fidelity.md (§5.2 — adendo F1)
**Tasks:** 4
**Estimated minutes:** 120

---

## Task T1: Bridge de exportação versionado (`bun design:export`)

**Files to write:**
- Create: `packages/app/react/scripts/pencil-export.ts`
- Create: `packages/app/react/scripts/pencil-export.test.ts`
- Modify: `package.json` — script raiz `"design:export": "bun packages/app/react/scripts/pencil-export.ts"` (após `design:lint`)

**Files to read:**
- `packages/app/react/scripts/generate-tokens.ts` (shape `TokensJson` que o tokens.json deve satisfazer)
- `packages/app/react/scripts/design-lint.ts` (shape de spec que o lint consome: árvore de nós com `children`/`fill`/`stroke`/`$tokens`)

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** (none)
**Scope fence:** OFFLINE — este Task NÃO fala com o Pen (nem em teste): as partes puras são
testadas com fixtures; o transporte é exercitado só em T2/T3. NÃO tocar nos scripts de F0,
NÃO criar `design/system/**` (T2), NÃO tocar stories (T4).
**Gate:** `cd packages/app/react && bun test scripts/pencil-export.test.ts && bun x tsc --noEmit`

### Step T1.1 — Escrever o bridge

Create `packages/app/react/scripts/pencil-export.ts`. Contrato de comportamento (o worker
implementa; fatos de protocolo abaixo são MEDIDOS, não os re-derive):

**CLI:** `bun design:export [--tokens] [--specs] [--targets]` — sem flags = os três, na
ordem tokens → specs → targets. Toda saída termina com `design:export: ok=<N> fail=<F>` por
etapa; `fail>0` → exit 1.

**Env (defaults):** `PEN_FILE` = `<repo>/design/codm.pen` (caminho ABSOLUTO passado como
`filePath` em TODO tools/call — nunca confiar no documento ativo); `PENCIL_MCP_BIN` =
`~/.pencil/mcp/visual_studio_code/out/mcp-server-darwin-arm64`; `PENCIL_APP` = `desktop`.

**Transporte (classe `PencilBridge`):** spawn de `PENCIL_MCP_BIN --app $PENCIL_APP --agent
claudeCodeCLI` via `Bun.spawn` (stdin pipe, stdout pipe); JSON-RPC 2.0 delimitado por
newline: (1) `initialize` `{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{...}}`,
(2) notificação `notifications/initialized`, (3) `tools/call` com
`{name:'execute',arguments:{filePath,input}}`. Respostas casadas por `id` (parser
incremental de linhas JSON no stdout — função PURA `parseJsonRpcLines(chunk)` exportada).
`result.content[0].text` carrega as linhas após `## Print output`; `error` do JSON-RPC ou
`isError` → falha da etapa. Timeout por call: 60s (cap do transporte MCP). Um processo por
execução do script, calls SEQUENCIAIS.

**Snippets `execute` (sem comentários — exigência do runtime do Pencil):**
- tokens: `Print(JSON.stringify(GetVariables()))`.
- discovery: visitor que colhe as áreas top-level cujo `name` começa com `Mesclado` e, com
  `Get(<areaId>,{depth:2})`, os filhos dos frames `Screens*` — devolvendo por tela
  `{id,name,area,width,height}` via `Print`.
- spec por tela: `Print(JSON.stringify(Get('<id>')))` (árvore completa, `$tokens`
  preservados — NÃO passar `resolveVariables`).
- target por tela: `Export(['<id>'],'png','<stagingDir>',{scale:1})` — **`outputPath` é
  DIRETÓRIO; o arquivo sai `<stagingDir>/<id>.png`** (fato medido); o script renomeia para
  `targets/screens/<slug>.png` e lê width/height com `pngjs` (devDep já presente).

**Saídas:**
- `design/system/pen/tokens.json` — EXATAMENTE o shape `TokensJson` de `generate-tokens.ts`
  (`{variables: {name: {type, value}}}`), JSON estável (chaves ordenadas) para
  idempotência.
- `design/system/pen/screens/<slug>.json` — spec por tela (uma linha, como o Pencil emite).
- `design/system/pen/screens.manifest.json` — `{generatedFrom:'design/codm.pen',
  screens:[{id,slug,area,name,width,height,exportNodeId?}]}`, ordenado por slug.
- `design/fidelity/targets/screens/<slug>.png`.

**Slug (funções PURAS exportadas):** `slugify(name)` — minúsculas, acentos removidos,
tudo-que-não-é-alfanumérico vira `-`, colapsa/apara; `assignSlugs(screens)` — colisão
resolve prefixando a área slugificada; colisão residual ganha sufixo `-2`, `-3`…
determinístico pela ordem do documento.

**Recorte (`exportNodeId`):** se a entrada do manifesto tiver `exportNodeId`, o Export usa
esse nó no lugar do frame da tela (a política é decidida POR MEDIÇÃO em T3 — o script só
oferece o mecanismo; manifesto existente é RELIDO e `exportNodeId` preservado numa
re-extração).

### Step T1.2 — Teste offline das partes puras

Create `packages/app/react/scripts/pencil-export.test.ts` — cobre com fixtures (sem
processo, sem Pen): `slugify` (acentos, "Screen 1 — Início (cheio)" → `screen-1-inicio-cheio`),
`assignSlugs` (colisão entre áreas → prefixo de área; dedup determinístico),
`parseJsonRpcLines` (chunk com 2 JSONs + um parcial → 2 mensagens e resto guardado),
montagem do manifesto a partir de uma árvore fake (ordenação por slug, preservação de
`exportNodeId` de manifesto pré-existente), e serialização estável do tokens.json
(mesma entrada → bytes iguais).

### Step T1.3 — Verificar e wiring

Modify `package.json` (raiz): adicionar `"design:export"` após `"design:lint"`.
Run: `cd packages/app/react && bun test scripts/pencil-export.test.ts && bun x tsc --noEmit`
Expected: testes PASS; tsc 0 erros. `bun design:export --tokens` SEM Pen aberto deve
falhar com mensagem clara de conexão (não stack trace cru) — conferir manualmente e citar
a mensagem no relatório.

### Step T1.4 — Commit

```bash
git add packages/app/react/scripts/pencil-export.ts packages/app/react/scripts/pencil-export.test.ts package.json
git commit -m "feat(fidelity): bridge versionado de exportacao do Pencil — bun design:export (Task T1)"
```

## Task T2: Sessão de extração — tokens + specs + manifesto

**Files to write:**
- Create: `design/system/pen/tokens.json`
- Create: `design/system/pen/screens.manifest.json`
- Create: `design/system/pen/screens/*.json` (39)

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** (none)
**Depends on:** T1
**Consumes (frozen):** `bun design:export --tokens --specs` (T1); shape `TokensJson` de
`generate-tokens.ts`; `runDesignLint`/`bun design:lint` (F0) como verificador dos specs.
**Scope fence:** PRECISA do Pen.app com `codm.pen` ativo — se o bridge falhar, BLOCKED com
a instrução "abra o codm.pen no Pen.app e traga à frente", nunca contornar nem trocar de
arquivo. NÃO exportar targets (T3). NÃO editar o bridge (bug achado = BLOCKED com
diagnóstico; o orquestrador decide o fix).
**Gate:** `bun design:export --tokens --specs` termina `ok=40 fail=0` (1 tokens + 39
specs); `git status` mostra APENAS os arquivos de `design/system/pen/`; segunda execução é
no-op de conteúdo (idempotência — `git diff` vazio); `bun design:lint` roda sobre os specs
reais e os findings são REPORTADOS (não são gate — cânon 37: defeito de autoria vira
backlog de design-ops).

### Step T2.1 — Extrair

Run: `bun design:export --tokens --specs`
Expected: `ok=40 fail=0`; 43 variáveis no tokens.json; 39 entradas no manifesto (7 áreas:
Início 4 · Conversa 4 · Tarefa & Config 4 · Projetos & Canais 8 · Tarefas/Config/Conta 5 ·
Onboarding/Login/Attach 11 · Site público 3).

### Step T2.2 — Idempotência + lint de design

Run: `bun design:export --tokens --specs && git status --short design/ && bun design:lint`
Expected: re-execução não muda byte nenhum (`git status` igual); design-lint imprime os
findings dos specs REAIS — listar TODOS no relatório do Task, classificados por regra
(R1–R5), como backlog de design-ops para o founder.

### Step T2.3 — (commit pelo orquestrador após review)

## Task T3: Targets — 39 PNGs com política de recorte medida

**Files to write:**
- Create: `design/fidelity/targets/screens/*.png` (39)
- Modify: `design/system/pen/screens.manifest.json` — `exportNodeId` onde a medição mandar

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** (none)
**Depends on:** T2
**Consumes (frozen):** `bun design:export --targets` (T1); manifesto de T2; fato da spec
§5.2: o artboard "Início (cheio)" contém caption ("01 · Início — cheio") e chrome de
janela além do conteúdo do app.
**Scope fence:** Pen aberto (mesma regra de BLOCKED de T2). A decisão de recorte é POR
MEDIÇÃO (inspecionar a árvore de 2-3 telas representativas via spec JSON já commitado em
T2: o frame compõe [caption, janela]? o conteúdo do app é um nó filho identificável?) —
aplicada UNIFORMEMENTE via `exportNodeId` no manifesto. Se as telas não tiverem estrutura
uniforme, exportar o frame INTEIRO (sem exportNodeId) e registrar a decisão + evidência no
relatório — o orquestrador arbitra. NÃO editar o bridge.
**Gate:** `bun design:export --targets` termina `ok=39 fail=0`; manifesto com
width/height > 0 em todas; spot-check visual de 3 PNGs (Read) descrito no relatório;
`git status` mostra apenas targets + manifesto.

### Step T3.1 — Decidir o recorte pela árvore

Ler os specs `screens/*.json` de: `screen-1-inicio-cheio` (ou slug real), um onboarding e
uma tela do site público. Determinar se existe nó interno uniforme (a "janela"/conteúdo)
— se sim, popular `exportNodeId` das 39 entradas com o nó equivalente; se não, frame
inteiro. Registrar a evidência (nomes/ids dos nós inspecionados) no relatório.

### Step T3.2 — Exportar e verificar

Run: `bun design:export --targets`
Expected: `ok=39 fail=0`; PNGs em `design/fidelity/targets/screens/`; Read de 3 deles
confirmando conteúdo de tela real (não vazio/caption solto).

### Step T3.3 — (commit pelo orquestrador após review)

## Task T4: Piloto — a primeira tela medida (Início/dashboard)

**Files to write:**
- Create: `packages/app/react/src/routes/(app)/dashboard/dashboard.stories.tsx`

**Files to read:**
- `packages/app/react/src/routes/(app)/dashboard/index.tsx` (a rota e sua composição)
- `packages/app/react/src/storybook/index.ts` (connected, mocks tipados)
- `.claude/skills/storybook/SKILL.md` (connected stories — padrão da casa)
- `design/system/pen/screens.manifest.json` (slug e dimensões da tela Início)

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /storybook
**Depends on:** T3
**Consumes (frozen):** slug + width/height da tela "Início (cheio)" no manifesto (T2);
target correspondente (T3); decorator `fidelity.kind` do preview (F0): `parameters.fidelity
= { slug, kind: 'screens', viewport: {width,height} }` + `layout: 'fullscreen'`;
mocks tipados de `@/storybook` (`connected`, `mockQuery`, `mockSession`).
**Scope fence:** UMA story connected da tela do dashboard com dados mockados que espelhem o
CONTEÚDO do target (títulos/números do design reproduzidos no mock — princípio
"foto-fixture": conteúdo reproduzido, nunca fabricado). NÃO perseguir score: zero ajuste de
CSS/componente neste Task (isso é F3) — o piloto prova o PIPE, não a fidelidade. NÃO tocar
em outros arquivos.
**Gate:** `bun fidelity` mede o slug do piloto: scoreboard ganha a entrada com score real
(número reportado HONESTAMENTE — baixo é esperado), `design/fidelity/report.html` mostra o
trio target|atual|delta; rail `stories-smoke` continua verde
(`cd packages/app/react && bun test tests/architecture/stories-smoke.test.tsx`); tsc limpo.

### Step T4.1 — Story connected marcada

Compor a story da rota do dashboard com `connected()` + mocks tipados (queries que a tela
dispara — descobrir pelos componentes da rota), `layout: 'fullscreen'`, e o bloco
`parameters.fidelity` com slug/viewport do manifesto. Comentários de story ACIMA do
`export const` (nunca do meta — armadilha 16 do cânon).

### Step T4.2 — Medir

Run: `bun fidelity`
Expected: a entrada do piloto no scoreboard com `score` numérico e lanes; relatar o score,
os 3 piores tiles e o que o delta sugere (SEM corrigir nada).

### Step T4.3 — (commit pelo orquestrador após review)

## Final Validation

- [ ] `bun tsc` — clean
- [ ] `bun lint` — clean
- [ ] `cd packages/app/react && bun run test` — suíte verde (inclui pencil-export.test.ts e stories-smoke)
- [ ] `bun design:export` idempotente (T2.2) e `ok=N fail=0` em todas as etapas
- [ ] AC mapping:
  - AC-F1-1 → gate T2 (`ok=40 fail=0`, idempotência)
  - AC-F1-2 → gate T3 (`ok=39 fail=0`, dimensões no manifesto)
  - AC-F1-3 → `packages/app/react/scripts/pencil-export.test.ts` (T1)
  - AC-F1-4 → Step T2.2 (findings do design-lint reportados)
  - AC-F1-5 → gate T4 (scoreboard com entrada real + trio no report)
  - AC-F1-6 → Final Validation acima + `git status` por Task

## Notes

- **Precondição humana:** T2 e T3 exigem o Pen.app com `design/codm.pen` ATIVO. O
  orquestrador confirma com o founder antes de despachar T2 (hoje o arquivo ativo era o
  `bk-products.pen` — é um clique para trocar).
- **PNGs no git:** ~3-5 MB no total esperado (medido: 118 KB o Início) — na faixa do que o
  bk-products commita.
- Targets re-exportados invalidam fixtures que recortam deles (armadilha 34) — irrelevante
  em F1 (não há fixtures ainda), mas o manifesto já carrega o campo para o futuro.
- E2E não se aplica (nenhuma jornada de produto nova).
