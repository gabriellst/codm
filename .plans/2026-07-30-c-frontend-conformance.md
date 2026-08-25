# Frente C — frontend conformance (dialogs, primitivos e rails) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`) syntax.
> Each Task wraps ONE observable behavior in an outer RED→GREEN cycle.

**Goal:** Os três dialogs que ainda donos do próprio `open` passam a ser conteúdo puro dirigido por `useDialogStore`; o campo `path` do `AddWorkspaceDialog` vira `form.Field` validado pelo schema da SDK; os dois composers duplicados viram UM bloco da CLI e o shape save-on-change do `ThreadSettingsDialog` vira uma recipe; os primitivos de `components/ui/` param de declarar interface fechada; e as três regras resultantes nascem como **rails que falham em vermelho contra a violação real que existe hoje** — 3 dialogs, 5 inputs fora de `form.Field`, 19 violações de props em 10 primitivos —, de modo que a próxima peça fora do padrão quebra o teste em vez de passar. No caminho, os **47 findings de `bun detect` que são a MESMA regra (component bp-20) no `app-react`** saem do vermelho, e a guidance morta do `packages/app/react/CLAUDE.md` (o `BrowserFrameEnricher`, morto desde a frente B5) é reescrita contra o código real.

**Architecture:** Oito cortes. A ordem não é estética: cada rail só pode nascer VERDE depois que os ofensores dela morreram, e cada rail é escrita **antes** dos ofensores morrerem para provar que ela sabe falhar (número citado). (1) Rail A + os 3 dialogs migram para a store — a `ConnectChannelDialog` é o corte difícil porque hoje o `open` local também **arma as queries** (`enabled: open`) e dispara `startPairing()`; sob a store, "montado" É "aberto". (2) `AddWorkspaceDialog` vira create-form com `addWorkspaceMutationRequestSchema`. (3) A CLI ganha o bloco `composer` e os dois composers migram. (4) A CLI ganha a recipe `live-settings`, cujo shape de referência é o `ThreadSettingsDialog` já migrado no corte 1. (5) Rail B (`Input`/`Textarea`/`Select` fora de `form.Field`) — só agora, porque a whitelist dela **é** o resultado dos cortes 1–4. (6) Rail C + os 10 primitivos de `components/ui/*.tsx`. (7) A varredura bp-20 nos 29 arquivos que o detector `component-props` já acusa. (8) Skills, `docs/CLI.md` e a reescrita do `CLAUDE.md` do react.

**Tech Stack:** React 19 + TanStack Router/Start/Form/Query, Base UI, Zustand, Tailwind 4, `bun:test` + happy-dom (`packages/app/react/tests/setup.ts`), scaffolder TS (`scripts/cli/frontend/`), registries YAML (`.claude/skills/**`)

**Spec:** `.specs/2026-07-29-frontend-conformance-design.md` (contrato fechado)
**Spec de referência (canônica, NUNCA modificar):** `.specs/2026-07-30-rust-wire-and-tauri-sdk-design.md`
**Tasks:** 8
**Estimated minutes:** 620

**Territórios PROIBIDOS nesta frente** (nenhuma task pode escrevê-los): `packages/api/**`, `packages/client/**`, `packages/app/tauri/src-tauri/**`, `.specs/2026-07-30-rust-wire-and-tauri-sdk-design.md`, o stash. **A SDK não muda.** Se alguma task descobrir que precisa de um endpoint, um schema ou um enum que não existe → **PARE COM ACHADO**, não invente.

---

## Ground em HEAD `f1abd5d4` — o que a spec diz e o que o código diz

Toda linha abaixo foi verificada por leitura/grep/execução em HEAD, não por memória.

| Afirmação da spec | Veredito | Prova |
|---|---|---|
| Problem: `AddWorkspaceDialog` tem `useState(false)` na l.24, `path` na l.25, `Input` na l.78 | **VERDADEIRO, linha a linha.** | leitura do arquivo |
| Problem: `ThreadSettingsDialog` l.36 `open`, l.108 `Input`, l.115 `saveGate(true, tag)` no `onBlur` | **VERDADEIRO, linha a linha.** | leitura |
| Problem: `ConnectChannelDialog` l.41 `useState(false)` + `handleOpenChange` | **VERDADEIRO — e a spec subestima o acoplamento.** O `open` local não é só "aberto": ele **arma as duas queries** (`useGetOrCreateChannel(..., { query: { enabled: open } })` l.47, `useGetChannel(..., { enabled: open && ... })` l.63), **dispara o efeito de connect** (l.58 `if (open && channelId && connectIsIdle)`) e o `handleOpenChange` chama `startPairing()` na abertura e `connect.reset()` no fechamento. Migrar para a store não é trocar um `useState` — é trocar "aberto" por "montado". Ver D-B. | `sed -n '41,96p'` do arquivo |
| Problem: `ChangePasswordDialog` é o único dos 5 no padrão | **VERDADEIRO.** Devolve `DialogContent` puro, lê `hide` de `useDialogStore(s => s.hide)` (l.32), e o call site em `SecuritySection/index.tsx:96` é `onClick={() => show(<ChangePasswordDialog />)}`. É o molde. | leitura |
| Decisão 5: "cinco primitivos" (`availability`, `confirm-dialog`, `currency-selector`, `info-hint`, `metric-delta`) | **VERDADEIRO mas INCOMPLETO — são 10 arquivos / 19 violações.** Varredura fresca (AC-14) em `components/ui/*.tsx`: **10 declarações `*Props` fechadas** (sem `ComponentProps`/`SVGProps`/`*.Props`/`VariantProps`) em 8 arquivos — `availability` ×3 (`AvailabilityProps:31`, `DayColumnProps:607`, `DraggableTimeSpanProps:799`), `combobox:16`, `confirm-dialog:5`, `currency-input:40`, `currency-selector:102`, `info-hint:7`, `metric-delta:5`, `select:14` — **mais 9 `className?: string` à mão** (`availability:43`, `combobox:30`, `currency-input:52`, `currency-selector:106`, `date-picker:32`, `info-hint:12`, `metric-delta:10`, `select:28`, `toggle-group:29`). União = **10 arquivos**: os 5 da spec + `combobox`, `currency-input`, `date-picker`, `select`, `toggle-group`. `pagination.tsx` e `ToggleGroupEnumProps` **passam** (estendem `ComponentProps`/`VariantProps`). | probe executado sobre `components/ui/*.tsx` |
| Problem: "inputs soltos fora de `form.Field` em 5 pontos" | **VERDADEIRO, e o universo inteiro são 8.** Todos os `<Input`/`<Textarea`/`<Select`/`<Combobox` sob `-components/`: `ChangePasswordDialog` ×3 (l.68/85/102, **dentro** de `form.Field` ✓), `Composer:52`, `IssueDetailSection:214`, `ThreadSettingsDialog:108`, `AddWorkspaceDialog:78`, `ContactStep:61`. Fora de `-components/`: `components/DataTable/DataTablePagination.tsx:30` (`<Combobox>`, fora do escopo da rail) e `routes/styleguide/index.tsx` ×4 (excluído pela spec). | `grep -rn '<Input\|<Textarea\|<Select\|<Combobox' routes components` |
| Decisão 4: `ContactStep` "já está correto e serve de exemplo canônico" | **VERDADEIRO como desenho, FALSO como estado do gate.** `bun detect` acusa `ContactStep/index.tsx:36 [error] route#bp-03 — Using useState for state that should be in the URL`, porque o `detect` da regra é o literal `const\s*\[\s*search\s*,\s*setSearch\s*\]\s*=\s*useState` (`.claude/skills/route/react/registry.yaml:324`). E o `CLAUDE.md` do react (l.166-167) lista "search text" como caso 2 → **route search params**. O exemplo canônico da spec é reprovado pela regra do próprio repo. Ver D-F. | `/tmp/detect-out.txt` + registry |
| Decisão 6: "três rails … teste estilo i18n-coherence … em `app-react`" | **O ESTILO existe; o ENDEREÇO que a analogia sugere é proibido.** `i18n-coherence.test.ts` mora em `packages/api/typescript/tests/architecture/` — território **proibido** nesta frente. `packages/app/react` **não tem** nenhum teste de arquitetura hoje (6 arquivos de teste, todos de comportamento). O alvo é `packages/app/react/tests/architecture/` (pasta nova), que o target `test` do `project.json` já cobre (`inputs` inclui `{projectRoot}/tests/**/*`, comando `bun test` com `cwd` no pacote). Isso **fecha a Open Question da spec**. | `find`, `project.json`, `bunfig.toml` |
| Decisão 6(c): "todo primitivo em `components/ui/` estende ComponentProps" é regra nova | **PARCIALMENTE FALSO — existe um detector que faz exatamente isso e que EXCLUI `ui/` de propósito.** `scripts/detectors/component-props.ts:51` — `const EXCLUDE = /(\.stories\.|\.test\.|\/ui\/)/`, com o docblock dizendo "scope: routes/** -components/ + src/components/, **excluding ui/ primitives**". A rail (c) é literalmente o escopo que o detector recusa. Ver D-G. | leitura do detector |
| Decisão 7 / AC-13: as 3 skills "ganham" as regras | **1 de 3 JÁ EXISTE, 1 existe como `pattern` e não como `bad_practice`, 1 é lacuna real.** `component/react/registry.yaml:911` já tem **bp-24** ("Legacy dialog API or dialog-selection useState in a component", severity critical) com exatamente a regra da decisão 1. `primitive/react/registry.yaml:36` tem **PRM-04** (`when: always`, "interface Props extends React.ComponentProps<'el'> or Primitive.Root.Props") — mas em `patterns:`, **não** em `bad_practices:` (os bp-01..bp-04 de primitive são data-slot, cores, forwardRef e inline-style). `form/react/registry.yaml` **não tem nenhuma regra sobre busca** (o único hit de "search" é bp sobre *schemas* de filtro). | greps nos três registries |
| "Nada disso está codificado como regra automatizada" | **FALSO para bp-20 e bp-24.** bp-20 é `mechanical` e é varrido repo-wide por `component-props` (33 findings gating hoje) + pelo hook `classify-edit`; bp-24 está declarada em `component/react`. O que **não** existe é rail mecânica para dialog→store, para input-fora-de-`form.Field` e para primitivo em `ui/`. | detect + registries |
| Decisão 3 / AC-6: "a CLI ganha um bloco `composer` em `scripts/cli/frontend/blocks/`" | **VERDADEIRO e o mecanismo é híbrido.** Um bloco = arquivo TS em `blocks/` (a lógica condicional) + fragmento YAML em `.claude/skills/component/react/registry.yaml` sob `blocks:` (as strings de saída), lidos por `renderBlock()` (`blocks/fragments.ts`). `blocks/search.ts` (10 linhas) é o molde mínimo. `docs/CLI.md:361` já normatiza o procedimento. | leitura de `fragments.ts`, `blocks/search.ts`, `docs/CLI.md` §10 |
| Decisão 2 / AC-4: "recipe `live-settings` em `scripts/cli/frontend/recipes/`" | **VERDADEIRO, mesmo mecanismo híbrido.** `recipes/index.ts` exporta um record estático de 4 (`plain`, `section`, `card`, `empty-state`) e `loadRecipe(name,'react')` lê `recipes:` do MESMO registry.yaml. Só `section` tem fragmento `host` hoje. `component.ts:85-88` valida o nome contra o record. | leitura |
| AC-5: o schema do `path` vem da SDK | **VERDADEIRO, existe.** `addWorkspaceMutationRequestSchema` em `packages/client/dist/typescript/src/typescript/zod/addWorkspaceSchema.ts:19`. Nada precisa ser regenerado. | grep |
| AC-14: "`bun tsc` e `bun lint` passam limpos" (pré-condição) | **VERDADEIRO em HEAD.** `bun tsc` → exit 0 (7 projetos). `bun x nx run app-react:test` → **32 pass / 0 fail** em 6 arquivos. | execução |

**Cinco descobertas que a spec não previu e que este plano absorve:**

1. **`availability.tsx` (1051 linhas) é CÓDIGO MORTO.** `grep -rn "Availability"` em `packages/app/react/src` + `packages/e2e` devolve **um único hit: o próprio arquivo**. Sem consumidor, sem story (não há `availability.stories.tsx` entre as 36 stories), sem rota. É resíduo de template (grade de agenda clínica) num produto de terminal-agent. A spec manda refatorá-lo; o plano executa a spec por default e registra a alternativa (deleção) como Open Question — ver OQ-1.
2. **`components/ui/icons/` (125 arquivos) não é território de primitivo, e o repo já diz isso.** `.claude/registry.yaml:237` mapeia `packages/app/react/src/components/ui/*.tsx` (glob de UM nível) para a skill `primitive` — `icons/` fica de fora por construção. Os ícones são `export default React.forwardRef(function X(props: SVGProps<SVGSVGElement>, ref) …)` com `{...props}` no `<svg>`: já são spread-compliant, só via `SVGProps` em vez de `ComponentProps<'svg'>`. Uma rail ingênua sobre `**/*.tsx` acusaria **136 arquivos**; a rail correta, ancorada no glob do registry, acusa **10**. O número 136 é o falseador do escopo errado.
3. **Os 3 dialogs migrados MATAM a prop `trigger`, e isso muda 4 call sites.** `ConnectChannelDialog` é usada **duas vezes** (`ChannelsSection:27` como `action={<ConnectChannelDialog />}` e `ChannelsSection:67` com `trigger={<button…>}`), `ThreadSettingsDialog` uma (`SessionHeader:146`, `trigger={<Button…>}`), `AddWorkspaceDialog` uma (`WorkspacesSection:22`, `action={<AddWorkspaceDialog />}`). Sob a store, quem monta o botão é o pai; o `DialogTrigger` some junto com o `<Dialog>` wrapper.
4. **`packages/app/tauri/commands/bindings.ts` é GERADO** (`// @ts-nocheck` + "generated by tauri-specta. Do not edit this file manually"). Seus 2 findings de `registry-scan` **não contam** na triagem — código gerado não é trabalho de conformidade.
5. **`component-props.baseline.json` NÃO EXISTE.** O detector referencia `scripts/detectors/component-props.baseline.json` (l.47) e o diretório tem só `go-enum-literals`, `registry-scan` e `slice-closure` baselines. Logo `loadBaseline()` devolve conjunto vazio e **os 33 findings gatilham todos** ("33 finding(s), 33 gating", sem sufixo de baseline). Zerá-los é o único caminho verde — baselinar não é opção honesta aqui, porque é a MESMA regra que a Decisão 5 desta spec manda aplicar.

---

## Triagem MEDIDA do `bun detect` em HEAD `f1abd5d4`

Execução real (`bun detect > /tmp/detect-out.txt; EXIT=1`). Os números reportados por lotes anteriores (38 e 75) **não batem com nenhum recorte**; o total real é **128**.

| detector | findings | gating | território |
|---|---|---|---|
| `registry-scan` | 50 (33 error) | 50 | 15 em `packages/api/**`, **31 em `packages/app/react`**, 1 astro, 2 tauri (GERADO), 1 contracts/codegen |
| `import-direction` | 3 | 3 | 3 em `packages/api/typescript` |
| `slice-closure` | 37 | — | 37 em `packages/api/**` |
| `component-props` | 33 | **33** | **33 em `packages/app/react`** |
| `projection-shape` | 3 | 3 | 3 em `packages/api/go` |
| `go-enum-literals` | 2 | 2 | 2 em `packages/api/go` |
| **total** | **128** | | |

**Recorte por território** (verificado por `grep -c`): `packages/app/react` = **64**; `packages/api/**` = **60**; astro = 1; `packages/app/tauri/commands/bindings.ts` = 2 (**gerado — não conta**); `packages/contracts/codegen` = 1.

**Os 64 do `app-react`, por regra:**

| regra | n | disposição |
|---|---|---|
| `CP-01 (component#bp-20)` | 28 | **DENTRO — T7** |
| `component#bp-20` (warning, registry-scan) | 14 | **DENTRO — T7** (mesma regra, mesmos arquivos) |
| `CP-02 (component#bp-20)` | 5 | **DENTRO — T7** |
| `universal#eslint-disable` | 9 | **FOLLOW-UP** — cada um carrega justificativa em comentário (`-- brand wordmark, never localized`, `-- SVG <title> is the icon semantic name`, …). A regra é cega a justificativa; removê-los reintroduziria defeitos reais de i18n. 1 deles mora em `routes/styleguide/` (fora de qualquer varredura por decisão da spec) e 1 em `components/ui/availability.tsx` (morre junto se OQ-1 for deleção). |
| `component#bp-14` (literal em vez de enum) | 6 | **FOLLOW-UP** — território da skill `enum`, não desta frente, **e há risco de invenção**: 5 dos 6 têm enum na SDK (`ThreadStatusEnum`, `ArtifactKindEnum`, `ProviderStatusEnum`, `ThreadModeEnum` — todos sob o subpath `/go`), mas `TranscriptBubble:18` (`entry.kind === 'ACTION'`) **não tem** `TranscriptEntryKindEnum` na SDK. Fechar 5 de 6 e deixar 1 é pior que abrir um follow-up nomeado. |
| `component#bp-06` (cores hardcoded) | 1 | **FOLLOW-UP** — `ConnectChannelDialog:141`, `bgColor="#ffffff" fgColor="#000000"` no QR, com comentário explicando que a placa branca é o que mantém o código escaneável em dark mode. É correto e a regra é cega. |
| `route#bp-03` | 1 | **DENTRO — T8** — `ContactStep:36`, o exemplo canônico da Decisão 4 reprovado pela regra do próprio repo. Ver D-F. |

**Fora do `app-react`:** os **60** de `packages/api/**` são **território proibido** nesta frente (nenhuma task pode escrevê-los) → follow-up nomeado. `packages/app/astro/src/pages/index.astro:29` (`as unknown`) e `packages/contracts/codegen/emit-wire-ts.ts:552` estão fora do escopo da spec (que é `app-react` + `scripts/cli`) → follow-up. Os 2 de `bindings.ts` são gerados → não contam.

**Efeito medido esperado ao fim da frente:** `component-props` cai de **33 → 0**; `registry-scan` no `app-react` cai de **31 → 16** (14 bp-20 + 1 route#bp-03 resolvidos). Total do repo: **128 → 113**. `bun detect` **continua exit 1** por causa dos 60 de `packages/api/**` — isso é esperado e declarado, não é falha desta frente.

---

## Decisões de desenho tomadas neste plano (grounded)

### D-A — As rails moram em `packages/app/react/tests/architecture/`, e é isso que fecha a Open Question da spec

Três razões medidas: (1) o endereço que a analogia "estilo i18n-coherence" sugere — `packages/api/typescript/tests/architecture/` — é **território proibido** nesta frente; (2) AC-10/11/12 dizem literalmente "existe um teste em `packages/app/react`"; (3) o target `test` do `app-react` (`project.json`) roda `bun test` com `cwd` no pacote e declara `{projectRoot}/tests/**/*` nos `inputs` — a pasta é coberta por `bun run test` e pelo cache do Nx sem uma linha de configuração nova. O `bunfig.toml` do pacote pré-carrega `./tests/setup.ts` (happy-dom); rails que só leem o filesystem não se importam, e o custo é zero.

### D-B — Na `ConnectChannelDialog`, "aberto" vira "MONTADO", e é isso que preserva a máquina de QR (AC-2)

O `open` local dessa componente carrega quatro empregos, não um: gate das duas queries (`enabled: open`), guarda do efeito de connect (`if (open && channelId && connectIsIdle)`), gatilho de `startPairing()` na abertura e de `connect.reset()` no fechamento. A store não tem "open" para o conteúdo consultar — ela **monta e desmonta** o conteúdo (`hide()` limpa `content` após `CLOSE_ANIMATION_MS`). Logo a tradução correta, campo a campo:

| hoje | depois |
|---|---|
| `enabled: open` | `enabled: true` (default — a query só existe porque o componente montou) |
| `if (open && channelId && connectIsIdle)` | `if (channelId && connectIsIdle)` |
| `handleOpenChange(true) → startPairing()` | o mount já é o começo: `attempt` nasce `0` e o efeito de connect dispara sozinho |
| `handleOpenChange(false) → setExpired(false); connect.reset()` | desmontagem — o estado morre com o componente, que é o ponto do padrão |
| `<DialogClose render={<Button>fechar</Button>} />` | `<Button onClick={hide}>` |

`attempt`, `expired`, o TTL de 3 min, o polling de 2 s e as cinco ramificações de `body` ficam **byte-idênticos**. AC-2 é satisfeito por construção: nada da máquina muda, só quem é dono do "aberto".

### D-C — O bloco `composer` é um bloco, não uma recipe; a `live-settings` é uma recipe, não um bloco

A distinção já está normatizada em `docs/CLI.md:34` — *"Recipe (for component) = a preset bundle of blocks"*. Um composer é **um pedaço de JSX + um handler** que entra numa componente maior (o `IssueSteerComposer` vive DENTRO de `IssueDetailSection`) → bloco. `live-settings` é **a forma da tela inteira** (seções com `SectionLabel`, controles que salvam no próprio `onChange`/`onBlur`, ausência deliberada de botão "Salvar") → recipe, com `blocks: [element, skeleton]` e um fragmento `host`. Trocar os dois faria a CLI emitir um composer que não cabe em lugar nenhum e uma recipe que não é uma tela.

### D-D — A whitelist da rail B é uma tabela no arquivo de teste, com o PORQUÊ ao lado, e ela é DERIVADA dos cortes 1–4

Quatro entradas, nenhuma delas "legado": `Composer` e `IssueDetailSection` (bloco `composer` — o textarea é rascunho transitório, não campo de dado: não tem submit, não tem validação, `Enter` envia), `ThreadSettingsDialog` (recipe `live-settings` — o input da tag salva no `onBlur`, não existe submit para um `form.Field` pendurar), `ContactStep` (busca — filtra uma lista em memória, nunca é enviada). Por isso a rail B é o corte **5** e não o **1**: escrita antes de T2/T3, sua whitelist teria que listar `AddWorkspaceDialog` como exceção — e ele não é exceção, é defeito.

### D-E — A rail C ancora o escopo no glob do `.claude/registry.yaml`, não num glob inventado

`.claude/registry.yaml:237` declara `packages/app/react/src/components/ui/*.tsx` como o universo da skill `primitive`. A rail usa **esse** glob, literalmente um nível. Consequência medida: `icons/` (125 arquivos, `SVGProps` + forwardRef + spread) fica fora sem precisar de uma exceção escrita, e a rail acusa 10 arquivos em vez de 136. O predicado aceita `ComponentProps<…>`, `SVGProps`, um `*.Props` de Base UI e `VariantProps` — os quatro vocabulários que o próprio `primitive/react` PRM-04/PRM-P01 já nomeia.

### D-F — `ContactStep` ganha um marcador declarado, e `route#bp-03` ganha o `detect_skip` correspondente

O conflito é real: a Decisão 4 abençoa `ContactStep` como exemplo canônico, e `registry-scan` o reprova por `route#bp-03`, cujo `detect` é o literal `const [search, setSearch] = useState`. As três saídas possíveis: (a) baselinar — o baseline é JSON sem comentário e `--update-baseline` faz **snapshot de tudo**, congelando os outros 49 findings junto; (b) deixar vermelho — a frente terminaria contradizendo a própria spec; (c) tornar a exceção **legível e mecânica**. Escolhida (c): `ContactStep` ganha um comentário `// STATE-LOCAL-FILTER: …` explicando que a busca filtra uma lista já carregada dentro de um passo de wizard (não é deep-linkável, não sobrevive ao passo), e `route/react` bp-03 ganha `detect_skip: 'STATE-LOCAL-FILTER'`. Um mecanismo, greppável, auto-documentado, e a mesma frase serve de comentário na whitelist da rail B. `CLAUDE.md` do react (regra de state placement, caso 2) ganha a mesma ressalva em uma linha.

### D-G — A rail C **complementa** o detector `component-props`, e o docblock dela diz isso em voz alta

Não é duplicação: `component-props.ts:51` exclui `/ui/` **de propósito e documentadamente** ("scope: routes/** -components/ + src/components/, excluding ui/ primitives"), e o predicado dele (CP-01) só dispara em raiz JSX minúscula — o que deixaria `ConfirmDialog` (raiz `<DialogContent>`, maiúscula) passar, embora seja um dos ofensores nomeados pela spec. Aplicando a lógica exata do detector a `components/ui/` colhem-se **10 findings**; aplicando o predicado da rail C, **19**. A rail é mais forte no seu território; o detector segue dono do dele. A alternativa — estender o detector — foi descartada porque AC-12 pede um teste em `packages/app/react` e porque mover a fronteira do detector mexeria no gate dos outros 33 findings no meio da varredura de T7.

### D-H — T7 (varredura bp-20) vem DEPOIS de T1–T3, por conflito de arquivo, não por dependência lógica

Cinco dos 29 arquivos da varredura são reescritos por T1–T3 (`Composer/index.tsx`, `IssueDetailSection/index.tsx`, `SessionHeader/index.tsx`, `ChannelsSection/index.tsx`, `WorkspacesSection/index.tsx`). Rodar a varredura antes significaria dois agentes editando os mesmos arquivos e um rebase manual no meio da frente.

---

## Task T1: os 3 dialogs param de ser donos do próprio `open` — e a rail A prova que sabe acusá-los

**Files to write:**
- Create: `packages/app/react/tests/architecture/dialog-store.test.ts` — a rail A (varredura + whitelist central comentada)
- Modify: `packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx` — remove `<Dialog>`/`DialogTrigger`/`open`; devolve `DialogContent`; `hide()` da store no sucesso e no cancelar (o `path` continua `useState` NESTA task — T2 é quem o transforma em `form.Field`)
- Modify: `packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx` — `action={<AddWorkspaceDialog />}` vira um `<Button onClick={() => show(<AddWorkspaceDialog />)}>` com o ícone e o label de hoje
- Modify: `packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx` — cai a prop `trigger`, cai o `<Dialog>`; `ThreadSettingsBody` deixa de ser condicionado a `open` (montar É abrir); save-per-campo intocado
- Modify: `packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx` — o `<Button>` que hoje é `trigger=` vira `onClick={() => show(<ThreadSettingsDialog threadId={threadId} />)}`
- Modify: `packages/app/react/src/routes/(app)/channels/-components/ConnectChannelDialog/index.tsx` — cai a prop `trigger`, cai o `<Dialog>`, cai `handleOpenChange`; os quatro empregos do `open` traduzidos conforme D-B; `DialogClose` vira `<Button onClick={hide}>`
- Modify: `packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx` — os DOIS call sites (l.27 `action=`, l.67 `trigger=`) viram `onClick={() => show(<ConnectChannelDialog />)}`

**Files to read:**
- `packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/{index.tsx,ChangePasswordDialog.tsx}` — o molde canônico (call site + conteúdo)
- `packages/app/react/src/stores/useDialogStore.tsx` — `show`/`hide`/`confirm` e o `CLOSE_ANIMATION_MS`
- `.claude/skills/component/react/registry.yaml:911-927` — bp-24, a regra que esta task torna mecânica

**Agent:** frontend-developer · **Reviewer:** spec-compliance-reviewer → code-reviewer · **Model:** opus · **Skills:** /component, /store
**Depends on:** (none)
**Scope fence:** DONE: a rail A, os 3 dialogs, os 4 call sites. OUT: o `path` do `AddWorkspaceDialog` continua `useState<string>` (T2); os composers (T3); qualquer arquivo em `components/ui/` (T6); qualquer `.claude/skills/**` (T8). **Nenhuma mudança de comportamento visível ao usuário além de "quem abre o modal"** — mesmos textos, mesmas mutations, mesmas queries, mesmo QR.
**Gate:** `cd packages/app/react && bun test tests/architecture/dialog-store.test.ts` (exit 0) · `bun x nx run app-react:tsc` (exit 0) · `bun x nx run app-react:test` (exit 0) · `bun tsc` raiz · `bun lint` · `bun run test` · `cd packages/e2e && bun run test` (NUNCA `bun e2e`) · `git status --porcelain packages/api packages/client` → **vazio**

### Step T1.1 — RED primeiro: a rail A, escrita contra os 3 ofensores que existem hoje

**Files to write:** Create `packages/app/react/tests/architecture/dialog-store.test.ts`

```ts
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * RAIL A — todo dialog de rota é conteúdo puro dirigido por `useDialogStore`.
 *
 * A regra já existe como doutrina (component react bp-24, e o "Dialogs — useDialogStore only" do
 * CLAUDE.md deste pacote). O que faltava era ela FALHAR: três dos cinco dialogs do app carregavam o
 * próprio `useState` de `open` e ninguém ficou vermelho. Esta rail é a metade mecânica.
 *
 * O predicado tem três metades porque cada uma sozinha é contornável:
 *   1. o arquivo REFERENCIA `useDialogStore`         — sem isso não há store nenhuma
 *   2. o arquivo NÃO tem `onOpenChange`               — a prop é o sintoma do wrapper <Dialog> local
 *   3. o arquivo NÃO declara `const [open|isOpen, …]` — importar a store e manter o useState é o
 *      caminho mais provável de regressão
 *
 * Escopo: qualquer `.tsx` sob `-components/` cujo CAMINHO contenha "Dialog" — a pasta conta tanto
 * quanto o basename, porque o padrão do repo é `<Name>Dialog/index.tsx`. `routes/styleguide/` fica
 * fora da varredura (decisão da spec: é vitrine, não app).
 */

const REACT_SRC = resolve(import.meta.dirname, '../../src')

/** Ficheiros isentos, cada um com o PORQUÊ. Vazia é o estado correto — uma entrada aqui é dívida. */
const WHITELIST: Record<string, string> = {
	// (vazia — nenhum dialog de rota tem motivo para ser dono do próprio `open`)
}

async function dialogFiles(): Promise<string[]> {
	const out: string[] = []
	for await (const entry of new Bun.Glob('routes/**/-components/**/*.tsx').scan({ cwd: REACT_SRC, onlyFiles: true })) {
		if (entry.startsWith('routes/styleguide/')) continue
		if (/\.(test|stories)\.tsx$/.test(entry)) continue
		if (!entry.includes('Dialog')) continue
		out.push(entry)
	}
	return out.sort()
}

describe('rail A — dialog de rota é dirigido por useDialogStore (component bp-24)', () => {
	it('todo *Dialog* em -components/ referencia useDialogStore', async () => {
		const offenders = (await dialogFiles()).filter(f => {
			if (WHITELIST[f]) return false
			return !readFileSync(join(REACT_SRC, f), 'utf8').includes('useDialogStore')
		})
		expect(offenders).toEqual([])
	})

	it('nenhum dialog de rota declara open/onOpenChange local — a store é a dona do aberto', async () => {
		const offenders: string[] = []
		for (const f of await dialogFiles()) {
			if (WHITELIST[f]) continue
			const source = readFileSync(join(REACT_SRC, f), 'utf8')
			if (/\bonOpenChange\b/.test(source)) offenders.push(`${f} (onOpenChange)`)
			if (/const\s*\[\s*(open|isOpen)\s*,/.test(source)) offenders.push(`${f} (useState de open)`)
		}
		expect(offenders).toEqual([])
	})

	it('a varredura vê os dialogs que existem — a rail não pode passar por não achar nada', async () => {
		const files = await dialogFiles()
		expect(files.length).toBeGreaterThanOrEqual(4)
		expect(files.some(f => f.includes('ChangePasswordDialog'))).toBe(true)
	})
})
```

- [ ] `cd packages/app/react && bun test tests/architecture/dialog-store.test.ts` → **VERMELHO**, e o output nomeia **exatamente 3** ofensores no primeiro teste: `routes/(app)/channels/-components/ConnectChannelDialog/index.tsx`, `routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx`, `routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx` — e **6** entradas no segundo (3 × `onOpenChange` + 3 × `useState de open`). Se o número for outro, PARE: a varredura está errada, não o app.

### Step T1.2 — `AddWorkspaceDialog` vira conteúdo puro (o `path` fica como está — T2 o transforma)

**Files to write:** Modify `AddWorkspaceDialog/index.tsx`, `WorkspacesSection/index.tsx`

- [ ] Remover o import de `Dialog`, `DialogTrigger`, `DialogClose`; manter `DialogContent`/`Header`/`Title`/`Description`/`Footer`
- [ ] Remover `const [open, setOpen] = useState(false)`; `const hide = useDialogStore(s => s.hide)`
- [ ] `onSuccess`: `invalidateQueries` → `hide()` (o `setPath('')` some — o componente desmonta e o estado morre com ele, que é o ponto do padrão)
- [ ] O botão "Cancelar" que era `DialogClose render={<Button variant="ghost">}` vira `<Button variant="ghost" onClick={hide}>`
- [ ] `return` passa a ser o `<DialogContent>` direto (sem wrapper)
- [ ] `WorkspacesSection/index.tsx`: `action={<AddWorkspaceDialog />}` vira `action={<Button onClick={() => show(<AddWorkspaceDialog />)}><IconPlus data-icon="inline-start" />{t('workspaces.addFolder')}</Button>}`, com `const show = useDialogStore(s => s.show)` no corpo — o mesmo shape de `SecuritySection:96`

### Step T1.3 — `ThreadSettingsDialog` vira conteúdo puro, save-per-campo intocado (AC-3)

**Files to write:** Modify `ThreadSettingsDialog/index.tsx`, `SessionHeader/index.tsx`

- [ ] Assinatura: `export function ThreadSettingsDialog({ threadId }: { threadId: string })` — a prop `trigger: ReactElement` e o import de `ReactElement` somem
- [ ] `useState(false)` e o wrapper `<Dialog>`/`<DialogTrigger>` somem; o `return` é o `<DialogContent className="max-w-lg">`
- [ ] `{open && <ThreadSettingsBody threadId={threadId} />}` vira `<ThreadSettingsBody threadId={threadId} />` — a montagem lazy que o `open` dava agora é dada pela store, que só renderiza o conteúdo depois do `show()`
- [ ] **NADA em `ThreadSettingsBody` muda**: `Switch` salvando no `onCheckedChange`, `Input` da tag salvando no `onBlur` (l.115), pills de buffer salvando no `onClick` — é o shape que T4 vai transformar em recipe. Zero botão "Salvar" (AC-3)
- [ ] `SessionHeader:146`: o `<Button variant="outline" size="icon" aria-label={t('session.threadSettings')} …>` sai do slot `trigger=` e vira um botão irmão com `onClick={() => show(<ThreadSettingsDialog threadId={threadId} />)}`

### Step T1.4 — `ConnectChannelDialog`: só o dono do "aberto" muda (AC-2), pela tabela do D-B

**Files to write:** Modify `ConnectChannelDialog/index.tsx`, `ChannelsSection/index.tsx`

- [ ] Aplicar a tradução do **D-B**, campo a campo. Docblock novo no topo do arquivo dizendo, em uma frase, que **"aberto" agora é "montado"** e que é por isso que os `enabled: open` viraram default — para que o próximo leitor não ache que o gate das queries foi perdido
- [ ] `attempt`, `expired`, `QR_TTL_MS`, `POLL_INTERVAL_MS`, `startPairing`, os dois `useEffect` e as **cinco** ramificações de `body` ficam **idênticos** (o revisor deve conseguir ver isso num diff de contexto)
- [ ] `DialogClose render={<Button>{t('common.close')}</Button>}` (ramo `isConnected`) vira `<Button onClick={hide}>{t('common.close')}</Button>`
- [ ] `ChannelsSection`: o `action={<ConnectChannelDialog />}` (l.27) vira `<Button onClick={() => show(<ConnectChannelDialog />)}>{t('channels.connectChannel')}</Button>`; o `trigger={<button …>}` (l.67) vira o mesmo `<button …>` com `onClick={() => show(<ConnectChannelDialog />)}`. O comentário de l.162-163 sobre `button-needs-handler` **migra junto** — agora o handler é explícito e o comentário deve dizer isso

### Step T1.5 — Verde e os números

- [ ] `cd packages/app/react && bun test tests/architecture/dialog-store.test.ts` → **3 pass / 0 fail**, `WHITELIST` **vazia**
- [ ] `cd packages/app/react && bun test` → **35 pass / 0 fail** (os 32 de HEAD + os 3 da rail)
- [ ] `bun x nx run app-react:tsc` → exit 0
- [ ] `grep -rn "onOpenChange" packages/app/react/src/routes` → **vazio**
- [ ] `grep -rn "DialogTrigger" packages/app/react/src/routes` → **vazio** (o primitivo `components/ui/dialog.tsx` continua exportando; ninguém em rotas usa)
- [ ] `bun tsc` · `bun lint` · `bun run test` · `cd packages/e2e && bun run test` → exit 0
- [ ] `git status --porcelain packages/api packages/client` → **vazio** (a SDK não muda nesta frente)

### Step T1.6 — Commit

```bash
git add packages/app/react/tests/architecture/dialog-store.test.ts \
        "packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx" \
        "packages/app/react/src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx" \
        "packages/app/react/src/routes/(app)/threads/\$threadId/-components/ThreadSettingsDialog/index.tsx" \
        "packages/app/react/src/routes/(app)/threads/\$threadId/-components/SessionHeader/index.tsx" \
        "packages/app/react/src/routes/(app)/channels/-components/ConnectChannelDialog/index.tsx" \
        "packages/app/react/src/routes/(app)/channels/-components/ChannelsSection/index.tsx"
git commit -m "refactor(app-react): C T1 — os 3 dialogs divergentes passam a ser dirigidos por useDialogStore

A regra ja era doutrina (component bp-24 + o CLAUDE.md deste pacote) e mesmo
assim tres dos cinco dialogs carregavam o proprio useState de open. A rail A
nasce VERMELHA contra os tres e so fica verde quando eles migram.

Na ConnectChannelDialog o open local tinha QUATRO empregos, nao um: armava as
duas queries (enabled: open), guardava o efeito de connect, disparava
startPairing na abertura e connect.reset no fechamento. Sob a store, 'aberto'
e 'montado' — os enabled viram default e a desmontagem faz o reset. A maquina
de QR (attempt, expired, TTL de 3min, poll de 2s, os cinco ramos de body) fica
identica: so o dono do aberto muda.

A ThreadSettingsDialog continua salvando por campo, sem botao Salvar."
```

---

## Task T2: o `path` do `AddWorkspaceDialog` vira `form.Field` validado pelo schema da SDK

**Files to write:**
- Modify: `packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx` — `useState<string>` sai, `useForm` + `form.Field` + `Field/FieldLabel/FieldError` entram; `addWorkspaceMutationRequestSchema` como `validators.onChange`

**Files to read:**
- `packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx` — o molde de form-em-dialog do repo (`FieldGroup` → `form.Field` → `form.Subscribe` no submit)
- `packages/client/dist/typescript/src/typescript/zod/addWorkspaceSchema.ts` — o schema (LEITURA apenas; `packages/client/**` é proibido para escrita)
- `packages/app/react/src/routes/attach/-components/ContactStep/index.tsx:38-46` — o padrão de `useForm` + schema da SDK já em uso

**Agent:** frontend-developer · **Reviewer:** spec-compliance-reviewer → code-reviewer · **Model:** opus · **Skills:** /form
**Depends on:** T1
**Scope fence:** DONE: um arquivo. OUT: qualquer outro dialog, qualquer rail, o `useFilePicker` **continua exatamente como está** (ele preenche o campo — o que muda é que passa a chamar `form.setFieldValue('path', picked)` em vez de `setPath(picked)`). Nenhuma mudança na SDK, nenhum endpoint novo.
**Gate:** `bun x nx run app-react:tsc` · `bun x nx run app-react:test` · `bun tsc` · `bun lint` · `bun run test` · `cd packages/e2e && bun run test` · `git status --porcelain packages/api packages/client` → vazio

### Step T2.1 — O form

- [ ] `const form = useForm({ defaultValues: { path: '' }, validators: { onChange: addWorkspaceMutationRequestSchema }, onSubmit: async ({ value }) => { … } })`
- [ ] `onSubmit` chama `addWorkspace.mutate({ data: value }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: listWorkspacesQueryKey() }); hide() } })`
- [ ] O `<Input>` (hoje l.78) passa a viver dentro de `<form.Field name="path">{field => (<Field><FieldLabel htmlFor={field.name}>…</FieldLabel><Input id={field.name} value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} />{field.state.meta.errors[0] && <FieldError>…</FieldError>}</Field>)}</form.Field>` — o `className="font-mono"` e o `placeholder` de hoje permanecem
- [ ] O `onKeyDown` Enter→submit some: o `<Input>` passa a viver dentro de um `<form onSubmit={…}>` e Enter submete nativamente (é o que `ChangePasswordDialog` faz)
- [ ] `pickFolder` passa a fazer `form.setFieldValue('path', picked)`; o gate de capability (`filePicker.supportsFolderPicker()` + `canPickFolder`) fica **intocado** — `ServicesProvider.test.tsx:90` documenta essa exata sequência de chamadas e não pode quebrar
- [ ] O botão de submit vira `<form.Subscribe selector={s => [s.canSubmit, s.isSubmitting] as const}>` disparando `type="submit"`, no lugar do `disabled={!path.trim() || addWorkspace.isPending}`

### Step T2.2 — Verde e os números

- [ ] `grep -n "useState" "packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx"` → **1 hit apenas** (`canPickFolder`, o gate de capability — estado local transitório legítimo, caso 5 do CLAUDE.md)
- [ ] `grep -n "form.Field" …/AddWorkspaceDialog/index.tsx` → **1 hit** (AC-5)
- [ ] `cd packages/app/react && bun test` → **35 pass / 0 fail**
- [ ] `bun x nx run app-react:tsc` · `bun tsc` · `bun lint` · `bun run test` · `cd packages/e2e && bun run test` → exit 0

### Step T2.3 — Commit

```bash
git add "packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx"
git commit -m "refactor(app-react): C T2 — AddWorkspaceDialog vira create-form com o schema da SDK

O path era um useState<string> com validacao por !trimmed no submit. Agora e um
form.Field do TanStack Form validado por addWorkspaceMutationRequestSchema — a
mesma fonte que o controller valida, sem sincronizacao manual.

O picker de pasta continua sendo o mesmo PORT com o mesmo gate de capability
(ServicesProvider.test.tsx documenta a sequencia exata de chamadas); so o
destino do valor mudou de setPath para form.setFieldValue."
```

---

## Task T3: a CLI ganha o bloco `composer`, e os dois composers duplicados param de ser dois

**Files to write:**
- Create: `scripts/cli/frontend/blocks/composer.ts` — o `BlockFn` (molde: `blocks/search.ts`)
- Create: `scripts/cli/frontend/blocks/__fixtures__/thread-composer.tsx.txt` — o golden do bloco
- Modify: `.claude/skills/component/react/registry.yaml` — um fragmento novo sob `blocks:` (`composer:`), ao lado de `search:`
- Modify: `scripts/cli/frontend/blocks/index.ts` — uma linha de import + uma entrada no record `blocks`
- Modify: `scripts/cli/frontend/blocks/fragments.test.ts` — um `describe` novo para o bloco + o golden
- Modify: `packages/app/react/src/routes/(app)/threads/$threadId/-components/Composer/index.tsx` — o corpo passa a ser o shape do bloco
- Modify: `packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx` — `IssueSteerComposer` (l.191-241) idem

**Files to read:**
- `scripts/cli/frontend/blocks/{search.ts,fragments.ts,types.ts,index.ts}` — o mecanismo bloco-TS + fragmento-YAML
- `scripts/cli/frontend/blocks/fragments.test.ts` — o padrão de golden (`componentGenerator` → fixture byte-idêntico)
- `.claude/skills/component/react/registry.yaml:416-461` — a seção `blocks:`
- `packages/app/react/src/routes/(app)/threads/$threadId/-components/Composer/Composer.test.tsx` — **o contrato que não pode quebrar** (`data-testid="composer"`, `data-mode`, e "renders exactly one button")
- `docs/CLI.md` §3 e §10 — o que "um bloco novo" obriga a atualizar

**Agent:** frontend-developer · **Reviewer:** spec-compliance-reviewer → code-reviewer · **Model:** opus · **Skills:** /component
**Depends on:** T1
**Scope fence:** DONE: o bloco na CLI (TS + fragmento + registro + teste) e as duas migrações. OUT: a recipe `live-settings` (T4); as rails (T5/T6); `docs/CLI.md` (T8 escreve a documentação dos dois de uma vez). O bloco **não** inventa flag nova de CLI além de `--block=composer` no caminho já existente de `--state`/blocos; se o assembler não suportar o bloco sem uma flag nova, **PARE COM ACHADO** antes de mexer no parser.
**Gate:** `bun test:tooling` (exit 0) · `cd packages/app/react && bun test src/routes` (Composer.test.tsx verde) · `bun x nx run app-react:tsc` · `bun tsc` · `bun lint` · `bun run test` · `cd packages/e2e && bun run test`

### Step T3.1 — RED primeiro: o teste do bloco antes do bloco

**Files to write:** Modify `scripts/cli/frontend/blocks/fragments.test.ts`

Um `describe('composer block')` com três asserts, no idioma dos que já existem no arquivo:
- `renderBlock('composer', 'react', { mutationHook: 'useSteerIssue' }).imports` contém `Textarea`, `Button`, `IconArrowUp` e o hook interpolado a partir de `{{sdkPackage}}`
- `.jsxBody` contém `onKeyDown` com `e.key === 'Enter' && !e.shiftKey` e `e.preventDefault()`
- `.declarations`/`.hookCalls` trazem o `send()` com `text.trim()` e o guard `|| pending`

- [ ] `bun test scripts/cli/frontend/blocks/fragments.test.ts` → **VERMELHO** (`renderBlock('composer', …)` devolve `{}` — não há fragmento)

### Step T3.2 — O fragmento no registry + o `BlockFn`

**Files to write:** Modify `.claude/skills/component/react/registry.yaml`; Create `scripts/cli/frontend/blocks/composer.ts`

O fragmento (sob `blocks:`, ao lado de `search:`), interpolando `{{sdkPackage}}` e `{{mutationHook}}`:

```yaml
    composer:
      imports:
        - "import { useState } from 'react'"
        - "import { IconArrowUp } from '@tabler/icons-react'"
        - "import { {{mutationHook}} } from '{{sdkPackage}}'"
        - "import { Button } from '@/components/ui/button'"
        - "import { Textarea } from '@/components/ui/textarea'"
      hookCalls:
        - "const [text, setText] = useState('')"
        - "const {{mutationVar}} = {{mutationHook}}()"
      declarations:
        - |-
          	const send = () => {
          		const trimmed = text.trim()
          		if (!trimmed || {{mutationVar}}.isPending) return
          		{{mutationVar}}.mutate(
          			{ /* TODO: request */ },
          			{ onSuccess: () => { setText(''); /* TODO: invalidate */ } },
          		)
          	}
      jsxBody: |-
        			<div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2">
        				<Textarea
        					value={text}
        					onChange={e => setText(e.target.value)}
        					onKeyDown={e => {
        						if (e.key === 'Enter' && !e.shiftKey) {
        							e.preventDefault()
        							send()
        						}
        					}}
        					placeholder={t('{{i18nPrefix}}.placeholder')}
        					className="min-h-10 flex-1 resize-none border-0 bg-transparent focus-visible:ring-0"
        				/>
        				<Button size="icon" aria-label={t('{{i18nPrefix}}.send')} disabled={!text.trim() || {{mutationVar}}.isPending} onClick={send}>
        					<IconArrowUp />
        				</Button>
        			</div>
      i18nSlots: [placeholder, send]
```

`scripts/cli/frontend/blocks/composer.ts`, no molde exato de `search.ts` (a lógica condicional fica no TS, as strings no YAML):

```ts
// `--block composer` — textarea + Enter-to-send + mutation.
//
// Existe porque o shape foi escrito à mão DUAS vezes (o Composer do thread e o
// IssueSteerComposer dentro do IssueDetailSection) com a mesma armadilha em cada:
// `Enter` sem `shift` envia, `Enter` com `shift` quebra linha, e o botão de envio
// morre com o texto vazio OU com a mutation pendente. Um dos dois esquecer o
// `|| pending` é um duplo-envio.

import type { BlockFn } from './types'
import { renderBlock } from './fragments'
import { toCamelCase } from '../util/naming'

export const composerBlock: BlockFn = ctx => {
	if (!ctx.mutationHook) return {}
	return renderBlock('composer', 'react', {
		mutationHook: ctx.mutationHook,
		mutationVar: toCamelCase(ctx.mutationHook.replace(/^use/, '')),
		i18nPrefix: ctx.i18nPrefix ?? '',
	})
}
```

- [ ] Registrar em `blocks/index.ts` (`import { composerBlock } from './composer'` + `composer: composerBlock`)
- [ ] `bun test scripts/cli/frontend/blocks/fragments.test.ts` → **VERDE**

### Step T3.3 — O golden

**Files to write:** Create `scripts/cli/frontend/blocks/__fixtures__/thread-composer.tsx.txt`

- [ ] Gerar via `componentGenerator` no teste (mesmo padrão do `describe('assembler golden equivalence')` já existente), capturar o output e commitar como fixture; o assert é byte-a-byte

### Step T3.4 — As duas migrações

**Files to write:** Modify `Composer/index.tsx` e `IssueDetailSection/index.tsx`

- [ ] `Composer`: o `send()`, o `<Textarea>` e o `<Button>` passam a ser **exatamente** o shape do bloco. O que é do produto e **não** entra no bloco fica onde está: o `data-testid="composer"`/`data-mode={mode}` na raiz, o `mode === 'STEER' ? steer : direct`, e o `<p>` de hint. `Composer.test.tsx` **não muda** — ele é o falseador desta migração (`buttons).toHaveLength(1)` reprova se o bloco introduzir um segundo botão)
- [ ] `IssueSteerComposer` (l.191-241): idem, com `useSteerIssue` e `getIssueDetailQueryKey`
- [ ] Um comentário de uma linha em cada um apontando o bloco de origem (`bun cli component … --block composer`), para que o próximo leitor saiba que o shape tem dono

### Step T3.5 — Verde e os números

- [ ] `bun test:tooling` → exit 0
- [ ] `cd packages/app/react && bun test` → **35 pass / 0 fail** (`Composer.test.tsx` inclusive: 3 testes, o de "exactly one button" entre eles)
- [ ] `grep -c "e.key === 'Enter' && !e.shiftKey" packages/app/react/src/routes -r` → **2** (os dois composers; a duplicação de SHAPE morreu, as duas instâncias continuam existindo por design)
- [ ] `bun x nx run app-react:tsc` · `bun tsc` · `bun lint` · `bun run test` · `cd packages/e2e && bun run test` → exit 0

### Step T3.6 — Commit

```bash
git add scripts/cli/frontend/blocks/composer.ts \
        scripts/cli/frontend/blocks/index.ts \
        scripts/cli/frontend/blocks/fragments.test.ts \
        scripts/cli/frontend/blocks/__fixtures__/thread-composer.tsx.txt \
        .claude/skills/component/react/registry.yaml \
        "packages/app/react/src/routes/(app)/threads/\$threadId/-components/Composer/index.tsx" \
        "packages/app/react/src/routes/(app)/threads/\$threadId/-components/IssueDetailSection/index.tsx"
git commit -m "feat(cli): C T3 — bloco composer, e os dois composers duplicados param de ser dois

O shape 'textarea + Enter-to-send + mutation' foi escrito a mao duas vezes com a
mesma armadilha em cada: Enter sem shift envia, e o botao precisa morrer com o
texto vazio OU com a mutation pendente. Agora e um bloco da CLI.

Composer.test.tsx nao muda de proposito: ele e o falseador da migracao — o
assert de 'renders exactly one button' reprova se o bloco introduzir controle
novo, e o data-mode prova que a decisao de modo continua vindo do servidor."
```

---

## Task T4: a CLI ganha a recipe `live-settings` — o shape save-on-change que o `ThreadSettingsDialog` já é

**Files to write:**
- Create: `scripts/cli/frontend/recipes/live-settings.ts` — a `Recipe` (molde: `recipes/section.ts`)
- Modify: `.claude/skills/component/react/registry.yaml` — fragmento `live-settings:` sob `recipes:`, com `host`
- Modify: `scripts/cli/frontend/recipes/index.ts` — import + entrada no record `recipes`
- Modify: `scripts/cli/frontend/blocks/fragments.test.ts` — um `describe` para a recipe (AC-4: "exercitada por pelo menos um teste do próprio `scripts/cli`")

**Files to read:**
- `scripts/cli/frontend/recipes/{index.ts,section.ts,plain.ts}` — `Recipe`, `loadRecipe`, `renderBody`
- `.claude/skills/component/react/registry.yaml:472-485` — a única recipe com fragmento (`section`)
- `packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx` (pós-T1) — **a referência viva do shape**: `SectionLabel` com hairline, `Switch` salvando no `onCheckedChange`, `Input` salvando no `onBlur`, pills salvando no `onClick`, `invalidate()` compartilhado, e **nenhum** botão de submit
- `scripts/cli/frontend/artifacts/component.ts:84-127` — a validação do nome de recipe e a resolução dos blocos

**Agent:** frontend-developer · **Reviewer:** spec-compliance-reviewer → code-reviewer · **Model:** sonnet · **Skills:** /component
**Depends on:** T1
**Scope fence:** DONE: a recipe (TS + fragmento + registro + teste). OUT: **nenhum arquivo de `packages/app/react`** — o `ThreadSettingsDialog` já é o shape depois de T1, e reescrevê-lo a partir do scaffold seria churn sem ganho. OUT também: `docs/CLI.md` (T8). Se a recipe precisar de um bloco que não existe, ela **compõe os que existem** (`element`, `skeleton`) — inventar um bloco novo aqui é escopo de T3, não daqui.
**Gate:** `bun test:tooling` (exit 0) · `bun tsc` · `bun lint` · `bun run test`

### Step T4.1 — RED: o teste da recipe antes da recipe

- [ ] Em `fragments.test.ts`, um `describe('live-settings recipe')`: `loadRecipe('live-settings', 'react')` devolve `blocks: ['element', 'skeleton']`, `defaultElement: 'div'`, e um `host` que contém `onCheckedChange` e **não** contém `type="submit"` nem `handleSubmit`
- [ ] Um segundo assert gerando de verdade: `componentGenerator(['(app)/threads/$threadId', 'ThreadPrefs'], { recipe: 'live-settings', i18n: 'session.prefs', 'no-i18n-write': 'true', print: 'true' })` e checando que o corpo emitido tem um `Switch` com save-on-change e **zero** botões de submit — este é o falseador de AC-4 (uma recipe que emitisse um form com "Salvar" passaria no primeiro assert e reprovaria neste)
- [ ] `bun test scripts/cli/frontend/blocks/fragments.test.ts` → **VERMELHO**: `[recipes] no recipe "live-settings" in react registry`

### Step T4.2 — A recipe

- [ ] Fragmento `recipes.live-settings` no registry com `blocks: [element, skeleton]`, `defaultElement: div`, `requiresI18n: true`, e um `host` que emite: um `SectionLabel` local (h3 com `border-b`), uma `<section>` com `<Switch checked={…} onCheckedChange={value => save(value)} />`, e um comentário `{/* save-on-change: cada controle chama a mutation no proprio onChange/onBlur — esta tela NAO tem botao Salvar */}`
- [ ] `recipes/live-settings.ts` no molde de `section.ts` (`renderBody` faz `loadRecipe('live-settings','react')` + `interpolate(host, { i18nPrefix })`)
- [ ] Registrar em `recipes/index.ts`
- [ ] `bun test scripts/cli/frontend/blocks/fragments.test.ts` → **VERDE**

### Step T4.3 — Verde e os números

- [ ] `bun x scripts/cli.ts component '(app)/threads/$threadId' ThreadPrefs --recipe=live-settings --i18n=session.prefs --print` → imprime sem erro, e o corpo **não** contém `type="submit"`
- [ ] `bun x scripts/cli.ts component x y --recipe=nope` → erro listando `plain, section, card, empty-state, live-settings` (prova o registro)
- [ ] `bun test:tooling` · `bun tsc` · `bun lint` · `bun run test` → exit 0

### Step T4.4 — Commit

```bash
git add scripts/cli/frontend/recipes/live-settings.ts \
        scripts/cli/frontend/recipes/index.ts \
        scripts/cli/frontend/blocks/fragments.test.ts \
        .claude/skills/component/react/registry.yaml
git commit -m "feat(cli): C T4 — recipe live-settings (save-on-change, sem botao Salvar)

O ThreadSettingsDialog salva por campo de proposito: um toggle de 'so responder
quando mencionado' que exige confirmar num botao e um toggle mentiroso. O shape
existia so na cabeca de quem escreveu — agora a CLI o emite.

O teste falseia pelo lado certo: uma recipe que emitisse type=submit passaria
no assert de forma e reprovaria no de comportamento."
```

---

## Task T5: rail B — nenhum `Input`/`Textarea`/`Select` fora de `form.Field` sob `-components/`

**Files to write:**
- Create: `packages/app/react/tests/architecture/form-field.test.ts` — a rail B com a whitelist central comentada

**Files to read:**
- `packages/app/react/tests/architecture/dialog-store.test.ts` (T1) — o idioma da rail neste pacote
- Os 8 sítios medidos no Ground (para conferir que a varredura vê todos)

**Agent:** frontend-developer · **Reviewer:** spec-compliance-reviewer → code-reviewer · **Model:** opus · **Skills:** /form, /component
**Depends on:** T2, T3
**Scope fence:** DONE: um arquivo de teste. OUT: **qualquer** arquivo de produto — se a rail acusar um sítio que T1–T3 deveriam ter fechado, o conserto é uma correção na task de origem, não uma entrada de whitelist. `routes/styleguide/` e `components/DataTable/` ficam fora do escopo por decisão da spec (o primeiro) e por não estarem sob `-components/` (o segundo).
**Gate:** `cd packages/app/react && bun test tests/architecture/form-field.test.ts` (exit 0) · `bun x nx run app-react:test` · `bun tsc` · `bun lint` · `bun run test`

### Step T5.1 — RED contra a violação real: a rail com a whitelist VAZIA

**Files to write:** Create `packages/app/react/tests/architecture/form-field.test.ts`

```ts
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * RAIL B — um campo de dado sob `-components/` vive dentro de um `form.Field`.
 *
 * O que a rail protege não é estilo: um `<Input>` fora do form é um campo sem validação, sem
 * `handleBlur`, sem erro renderizado e sem o schema da SDK por trás — a sincronização manual que o
 * TanStack Form existe para matar. Quatro sítios NÃO são campos de dado e estão na whitelist com o
 * porquê; qualquer quinto é defeito até prova em contrário.
 *
 * O predicado de "dentro de form.Field" é contagem de aberturas menos fechamentos antes do índice do
 * match — o mesmo raciocínio de um parser, sem parser. É suficiente porque `form.Field` no repo é
 * sempre render-prop com abertura e fechamento explícitos.
 */

const REACT_SRC = resolve(import.meta.dirname, '../../src')
const FIELD_TAGS = /<(Input|Textarea|Select|Combobox|CurrencyInput)\b/g

/**
 * Sítios isentos — cada um com o motivo pelo qual NÃO é um campo de formulário.
 * Uma entrada nova aqui precisa de uma frase que sobreviva à pergunta "então por que não é um form?".
 */
const WHITELIST: Record<string, string> = {
	'routes/(app)/threads/$threadId/-components/Composer/index.tsx':
		'bloco `composer` da CLI — rascunho de mensagem: sem submit, sem validação, Enter envia e o texto morre no sucesso.',
	'routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx':
		'bloco `composer` da CLI (IssueSteerComposer) — mesmo shape, escopado à issue.',
	'routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx':
		'recipe `live-settings` — o input da tag salva no onBlur; não existe submit para um form.Field pendurar.',
	'routes/attach/-components/ContactStep/index.tsx':
		'busca: filtra uma lista já carregada dentro de um passo de wizard (STATE-LOCAL-FILTER). Busca nunca é form — form react.',
}

async function componentFiles(): Promise<string[]> {
	const out: string[] = []
	for await (const entry of new Bun.Glob('routes/**/-components/**/*.tsx').scan({ cwd: REACT_SRC, onlyFiles: true })) {
		if (entry.startsWith('routes/styleguide/')) continue
		if (/\.(test|stories)\.tsx$/.test(entry)) continue
		out.push(entry)
	}
	return out.sort()
}

/** Aberturas de `<form.Field` menos `</form.Field>` antes de `index` — >0 significa "dentro". */
function insideFormField(source: string, index: number): boolean {
	const before = source.slice(0, index)
	const opens = before.split('<form.Field').length - 1
	const closes = before.split('</form.Field>').length - 1
	return opens > closes
}

describe('rail B — campo de dado sob -components/ vive dentro de form.Field', () => {
	it('nenhum Input/Textarea/Select fora de form.Field, exceto a whitelist', async () => {
		const offenders: string[] = []
		for (const file of await componentFiles()) {
			if (WHITELIST[file]) continue
			const source = readFileSync(join(REACT_SRC, file), 'utf8')
			for (const match of source.matchAll(FIELD_TAGS)) {
				if (insideFormField(source, match.index ?? 0)) continue
				offenders.push(`${file}:${source.slice(0, match.index).split('\n').length} <${match[1]}>`)
			}
		}
		expect(offenders).toEqual([])
	})

	it('a varredura vê os campos que existem — e os do ChangePasswordDialog passam por estarem no form', async () => {
		let seen = 0
		for (const file of await componentFiles()) seen += [...readFileSync(join(REACT_SRC, file), 'utf8').matchAll(FIELD_TAGS)].length
		expect(seen).toBeGreaterThanOrEqual(8)
	})

	it('toda entrada de whitelist ainda existe — uma isenção órfã é dívida invisível', async () => {
		const files = new Set(await componentFiles())
		expect(Object.keys(WHITELIST).filter(f => !files.has(f))).toEqual([])
	})
})
```

- [ ] **Falseador (obrigatório, executado e registrado):** comentar as 4 entradas da `WHITELIST` e rodar → o primeiro teste falha nomeando **exatamente 4** sítios (`Composer:52`, `IssueDetailSection:214`, `ThreadSettingsDialog:108`, `ContactStep:61`). Restaurar. Se o número for 5, T2 não fechou o `AddWorkspaceDialog` — volte para T2, não adicione whitelist.

### Step T5.2 — Verde e os números

- [ ] `cd packages/app/react && bun test tests/architecture/form-field.test.ts` → **3 pass / 0 fail** com a whitelist de **4** entradas
- [ ] `cd packages/app/react && bun test` → **38 pass / 0 fail**
- [ ] `bun tsc` · `bun lint` · `bun run test` → exit 0

### Step T5.3 — Commit

```bash
git add packages/app/react/tests/architecture/form-field.test.ts
git commit -m "test(app-react): C T5 — rail B, campo de dado sob -components/ vive em form.Field

Quatro isencoes, cada uma com o motivo pelo qual NAO e um campo de formulario:
dois composers (rascunho, sem submit), a tela live-settings (salva no onBlur) e
a busca do ContactStep (filtra lista em memoria).

Provado por falseamento: com a whitelist comentada a rail acusa exatamente esses
quatro. Se acusar cinco, e porque o AddWorkspaceDialog voltou a ser input solto."
```

---

## Task T6: rail C — primitivo em `components/ui/*.tsx` estende `ComponentProps` — e os 10 ofensores medidos

**Files to write:**
- Create: `packages/app/react/tests/architecture/primitive-props.test.ts` — a rail C
- Modify: `packages/app/react/src/components/ui/confirm-dialog.tsx` — `ConfirmDialogProps extends ComponentProps<typeof DialogContent>` + spread na raiz
- Modify: `packages/app/react/src/components/ui/info-hint.tsx` — `extends ComponentProps<typeof TooltipTrigger>`
- Modify: `packages/app/react/src/components/ui/metric-delta.tsx` — `extends ComponentProps<'span'>`
- Modify: `packages/app/react/src/components/ui/currency-selector.tsx` — `extends ComponentProps<typeof ComboboxPrimitive.Trigger>`
- Modify: `packages/app/react/src/components/ui/currency-input.tsx` — idem, sobre a raiz real
- Modify: `packages/app/react/src/components/ui/combobox.tsx` — `ComboboxEnumProps` deixa de hand-typar `className`
- Modify: `packages/app/react/src/components/ui/select.tsx` — `SelectEnumProps` idem
- Modify: `packages/app/react/src/components/ui/toggle-group.tsx` — remove o `className?: string` (a interface já tem `VariantProps`)
- Modify: `packages/app/react/src/components/ui/date-picker.tsx` — idem
- Modify: `packages/app/react/src/components/ui/availability.tsx` — **ver OQ-1 antes de começar**

**Files to read:**
- `packages/app/react/src/components/ui/{card.tsx,label.tsx,skeleton.tsx}` — o molde `PRM-P01` já correto no repo
- `.claude/skills/primitive/react/registry.yaml:36-60` — PRM-04 e PRM-P01
- `.claude/registry.yaml:234-239` — o glob que define o universo `primitive`
- `scripts/detectors/component-props.ts:45-55` — por que `/ui/` é excluído lá (o docblock da rail precisa citar isso)
- As 4 stories afetadas: `components/ui/stories/{currency-selector,currency-input,info-hint,metric-delta}.stories.tsx` + `components/StatCard/StatCard.stories.tsx`

**Agent:** frontend-developer · **Reviewer:** spec-compliance-reviewer → code-reviewer · **Model:** opus · **Skills:** /primitive, /storybook
**Depends on:** (none — território disjunto de T1–T5)
**Scope fence:** DONE: a rail C e os 10 arquivos de `components/ui/*.tsx`. OUT: `components/ui/icons/**` (125 arquivos, fora do glob `primitive` do registry — ver D-E); `components/ui/stories/**` só é tocado se `tsc`/`storybook:build` exigir; qualquer arquivo em `routes/` (T7). **Nenhuma mudança de comportamento visual** — só a assinatura de props e o spread.
**Gate:** `cd packages/app/react && bun test tests/architecture/primitive-props.test.ts` (exit 0) · `bun x nx run app-react:tsc` · `cd packages/app/react && bun run storybook:build` (exit 0 — a spec toca stories) · `bun x nx run app-react:test` · `bun tsc` · `bun lint` · `bun run test`

### Step T6.1 — RED: a rail C contra os 19 ofensores medidos

**Files to write:** Create `packages/app/react/tests/architecture/primitive-props.test.ts`

```ts
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * RAIL C — todo primitivo de `components/ui/` estende as props do seu elemento raiz.
 *
 * Um primitivo com interface fechada é um beco: o consumidor não passa `className`, não passa
 * `aria-*`, não passa `data-testid`, e o próximo dev copia o primitivo em vez de compô-lo. A regra
 * já é doutrina (primitive PRM-04 / PRM-P01); faltava falhar.
 *
 * POR QUE AQUI E NÃO NO DETECTOR: `scripts/detectors/component-props.ts` varre bp-20 repo-wide e
 * EXCLUI `/ui/` de propósito (l.51, com o docblock dizendo "excluding ui/ primitives"), e o predicado
 * dele (CP-01) só dispara em raiz JSX minúscula — o que deixaria passar `ConfirmDialog`, cuja raiz é
 * `<DialogContent>`. Esta rail é o complemento no território que o detector recusa, com um predicado
 * mais forte: a DECLARAÇÃO de props é que precisa referenciar o vocabulário, não a raiz.
 *
 * ESCOPO: `components/ui/*.tsx`, UM nível — o glob literal que `.claude/registry.yaml` usa para
 * mapear a skill `primitive`. `icons/` fica fora por construção: os 125 ícones são
 * `forwardRef(function X(props: SVGProps<SVGSVGElement>, ref))` com spread no `<svg>`, já
 * compliant por outro vocabulário. Uma varredura `**\/*.tsx` acusaria 136 arquivos; esta acusa 10.
 */

const UI = resolve(import.meta.dirname, '../../src/components/ui')
/** Os quatro vocabulários que PRM-04 aceita como "estende a raiz". */
const EXTENDS_ROOT = /ComponentProps\s*<|SVGProps|\.Props\b|VariantProps/

/** Primitivos isentos, com o PORQUÊ. Vazia é o estado correto. */
const WHITELIST: Record<string, string> = {}

async function primitiveFiles(): Promise<string[]> {
	const out: string[] = []
	for await (const entry of new Bun.Glob('*.tsx').scan({ cwd: UI, onlyFiles: true })) {
		if (/\.(test|stories)\.tsx$/.test(entry)) continue
		out.push(entry)
	}
	return out.sort()
}

/** O texto da declaração `XProps`, até a próxima declaração de topo. */
function declarationBody(source: string, start: number, matchLength: number): string {
	const after = source.slice(start + matchLength)
	const next = after.search(/^(?:export |function |const |interface |type |\/\*\*)/m)
	return next === -1 ? after : after.slice(0, next)
}

describe('rail C — primitivo de components/ui/ estende as props da raiz (primitive PRM-04)', () => {
	it('nenhuma declaração *Props fechada', async () => {
		const offenders: string[] = []
		for (const file of await primitiveFiles()) {
			if (WHITELIST[file]) continue
			const source = readFileSync(join(UI, file), 'utf8')
			for (const m of source.matchAll(/^(?:export\s+)?(?:interface|type)\s+([A-Z][A-Za-z0-9]*Props)\b/gm)) {
				if (EXTENDS_ROOT.test(declarationBody(source, m.index ?? 0, m[0].length))) continue
				offenders.push(`${file}:${source.slice(0, m.index).split('\n').length} ${m[1]}`)
			}
		}
		expect(offenders).toEqual([])
	})

	it('nenhum `className?: string` à mão — quem estende a raiz já ganhou className', async () => {
		const offenders: string[] = []
		for (const file of await primitiveFiles()) {
			if (WHITELIST[file]) continue
			const source = readFileSync(join(UI, file), 'utf8')
			for (const m of source.matchAll(/className\?:\s*string/g)) {
				offenders.push(`${file}:${source.slice(0, m.index).split('\n').length}`)
			}
		}
		expect(offenders).toEqual([])
	})

	it('o escopo é o glob do registry — um nível, sem icons/', async () => {
		const files = await primitiveFiles()
		expect(files.length).toBeGreaterThanOrEqual(38)
		expect(files.some(f => f.startsWith('icons/'))).toBe(false)
	})
})
```

- [ ] `cd packages/app/react && bun test tests/architecture/primitive-props.test.ts` → **VERMELHO** com **10** ofensores no primeiro teste (`availability` ×3, `combobox`, `confirm-dialog`, `currency-input`, `currency-selector`, `info-hint`, `metric-delta`, `select`) e **9** no segundo (`availability:43`, `combobox:30`, `currency-input:52`, `currency-selector:106`, `date-picker:32`, `info-hint:12`, `metric-delta:10`, `select:28`, `toggle-group:29`). **19 violações em 10 arquivos.** Número diferente = varredura errada; PARE e confira antes de editar qualquer primitivo.

### Step T6.2 — Os 10 primitivos, um por um

Padrão comum (o molde `PRM-P01` que `card.tsx` já usa): `interface XProps extends ComponentProps<'root'> { …próprias… }` e `function X({ …próprias…, className, ...props }: XProps)` com `<root className={cn('…', className)} {...props}>`.

- [ ] `metric-delta.tsx` — raiz `<span>`: `interface MetricDeltaProps extends ComponentProps<'span'> { pct: number; onColor?: boolean }`, spread no `<span>`
- [ ] `info-hint.tsx` — raiz é o `<TooltipTrigger>`: `extends ComponentProps<typeof TooltipTrigger>`, spread nele (o `children` continua sendo o conteúdo do tooltip, então `children` fica **fora** do spread — documentar em uma linha)
- [ ] `confirm-dialog.tsx` — raiz `<DialogContent>`: `extends ComponentProps<typeof DialogContent>`, spread nela. `useDialogStore.confirm()` (o único consumidor) passa exatamente as props de hoje; nada no store muda
- [ ] `currency-selector.tsx` — raiz visível é `ComboboxPrimitive.Trigger`: `extends ComponentProps<typeof ComboboxPrimitive.Trigger>` menos as chaves que a componente controla; `className` sai da interface própria
- [ ] `currency-input.tsx` — mesma cirurgia sobre a raiz real
- [ ] `combobox.tsx` / `select.tsx` / `toggle-group.tsx` / `date-picker.tsx` — remover o `className?: string` à mão, herdando-o da raiz (em `toggle-group` a interface já tem `VariantProps`; é uma linha)
- [ ] `availability.tsx` — **ler OQ-1 antes.** Default do plano (o que a spec manda): `AvailabilityProps extends ComponentProps<'div'>`, `DayColumnProps`/`DraggableTimeSpanProps` idem, spread nas três raízes, `className?: string` removido

### Step T6.3 — Verde e os números

- [ ] `cd packages/app/react && bun test tests/architecture/primitive-props.test.ts` → **3 pass / 0 fail**, `WHITELIST` **vazia**
- [ ] `bun x nx run app-react:tsc` → exit 0 (as 5 stories consumidoras compilam; se alguma quebrar, o conserto é na story, e ele entra nesta task)
- [ ] `cd packages/app/react && bun run storybook:build` → exit 0
- [ ] `cd packages/app/react && bun test` → **41 pass / 0 fail**
- [ ] `bun tsc` · `bun lint` · `bun run test` → exit 0

### Step T6.4 — Commit

```bash
git add packages/app/react/tests/architecture/primitive-props.test.ts \
        packages/app/react/src/components/ui/
git commit -m "refactor(app-react): C T6 — primitivos de ui/ estendem ComponentProps da raiz

A varredura fresca (AC-14) achou 19 violacoes em 10 arquivos, nao os 5 do
snapshot da spec: alem de availability/confirm-dialog/currency-selector/
info-hint/metric-delta, tambem combobox, currency-input, date-picker, select e
toggle-group hand-typavam className.

A rail ancora o escopo no glob que o .claude/registry.yaml ja usa para a skill
primitive — components/ui/*.tsx, um nivel. icons/ fica fora por construcao: os
125 icones sao forwardRef(SVGProps) com spread, compliant por outro vocabulario.
Uma varredura ingenua acusaria 136 arquivos; esta acusa 10."
```

---

## Task T7: a varredura bp-20 — `component-props` cai de 33 findings gating para 0

**Files to write:**
- Modify: os **29 arquivos** listados abaixo, cada um ganhando `ComponentProps<root>` + `cn(..., className)` + `{...props}` na raiz

```
src/components/console/{AgentsRunningPill,AppChrome,Logo,PageHeader,StatusDot,ThreadAvatar}.tsx
src/routes/(app)/channels/-components/ChannelsSection/index.tsx
src/routes/(app)/dashboard/-components/{HomeDashboard,HomeSection,SetupChecklist}/index.tsx
src/routes/(app)/issues/-components/IssuesOverviewSection/index.tsx
src/routes/(app)/settings/-components/{GeneralSection,ProvidersSection,SettingsSection,StopCriteriaSection}/index.tsx
src/routes/(app)/threads/$threadId/-components/{ArtifactsSection,Composer,IssueDetailSection,SessionChatSection,SessionHeader,SessionIssuesSection,TranscriptBubble}/index.tsx
src/routes/(app)/workspaces/-components/WorkspacesSection/index.tsx
src/routes/attach/-components/{AttachThreadWizard,StepHeading}/index.tsx
src/routes/onboarding/-components/{ControlSlide,HowItWorksSlide,OnboardingFlow,ValueSlide}/index.tsx
```

**Files to read:**
- `scripts/detectors/component-props.ts` — o predicado exato (CP-01: raiz JSX minúscula sem `ComponentProps`; CP-02: `className?: string` à mão)
- `packages/app/react/CLAUDE.md:96-102` — a formulação canônica da regra neste pacote
- `.claude/skills/component/react/registry.yaml:803-841` — bp-20 e as suas isenções

**Agent:** frontend-developer · **Reviewer:** spec-compliance-reviewer → code-reviewer · **Model:** sonnet · **Skills:** /component
**Depends on:** T1, T2, T3
**Scope fence:** DONE: exclusivamente a assinatura de props + o spread na raiz dos 29 arquivos. OUT: **qualquer** outra mudança neles — não renomear, não extrair, não corrigir os 6 `component#bp-14` (enum literal, follow-up nomeado), não tocar os `eslint-disable` (follow-up nomeado), não tocar `components/ui/` (T6), não criar `component-props.baseline.json` (baselinar é o caminho desonesto — ver descoberta 5). Se algum arquivo **não** puder estender `ComponentProps` sem mudar comportamento, **PARE COM ACHADO** e reporte o arquivo em vez de forçar.
**Gate:** `bun scripts/detectors/component-props.ts` → **"33 finding(s)" vira "0 finding(s)"**, exit 0 · `bun x nx run app-react:tsc` · `bun x nx run app-react:test` · `bun tsc` · `bun lint` · `bun run test` · `cd packages/e2e && bun run test`

### Step T7.1 — RED é o próprio detector

- [ ] `bun scripts/detectors/component-props.ts` → **33 finding(s), 33 gating**, exit 1. Registrar a lista completa antes de editar (é o baseline mental da varredura)

### Step T7.2 — A varredura

- [ ] Para cada arquivo: raiz DOM minúscula → `export function X({ className, ...props }: ComponentProps<'div'>)` com `<div className={cn('…', className)} {...props}>`; componente-folha que recebe item → `interface XProps extends ComponentProps<'div'> { item: T }`
- [ ] `Logo.tsx`, `PageHeader.tsx`, `StatusDot.tsx` (×2), `ThreadAvatar.tsx` têm CP-02 além de CP-01: o `className?: string` à mão sai e passa a vir da raiz
- [ ] **Contratos que não podem quebrar** (asserção do revisor): `Composer` mantém `data-testid="composer"` e `data-mode` na raiz (`Composer.test.tsx` reprova o contrário); `SessionHeader`/`ChannelsSection`/`WorkspacesSection` mantêm os `onClick` de `show(...)` que T1 instalou

### Step T7.3 — Verde e os números

- [ ] `bun scripts/detectors/component-props.ts` → **`0 finding(s), 0 gating`**, exit 0
- [ ] `bun detect 2>&1 | grep -c "packages/app/react"` → **31 → 17** (14 warnings bp-20 do `registry-scan` caem junto, porque são os mesmos arquivos; sobram 9 `eslint-disable` + 6 `bp-14` + 1 `bp-06` + 1 `route#bp-03`, este último fechado por T8)
- [ ] `cd packages/app/react && bun test` → **41 pass / 0 fail**
- [ ] `bun x nx run app-react:tsc` · `bun tsc` · `bun lint` · `bun run test` · `cd packages/e2e && bun run test` → exit 0

### Step T7.4 — Commit

```bash
git add packages/app/react/src/components/console packages/app/react/src/routes
git commit -m "refactor(app-react): C T7 — bp-20 em 29 arquivos; component-props sai de 33 findings para 0

Era a MESMA regra que a decisao 5 desta spec manda aplicar nos primitivos, so
que no territorio que o detector ja varre: 28 CP-01 + 5 CP-02, todos gating (o
component-props.baseline.json nao existe, entao nada estava anistiado).

Baselinar teria sido a saida barata e desonesta: congelar como divida a regra
que a propria frente esta aplicando em ui/. Os 29 arquivos foram corrigidos.

Nada alem da assinatura de props e do spread mudou — o data-testid do composer
e os onClick de show() do T1 continuam onde estavam."
```

---

## Task T8: as skills, o `docs/CLI.md` e a guidance MORTA do `CLAUDE.md` do react

**Files to write:**
- Modify: `.claude/skills/form/react/registry.yaml` — `bad_practice` novo "busca vira form" com `ContactStep` como snippet correto (AC-8) + referência à recipe `live-settings`
- Modify: `.claude/skills/primitive/react/registry.yaml` — `bad_practice` novo (bp-05) "primitivo com interface fechada", `mechanical: true` com `detect`, espelhando PRM-04 (AC-13)
- Modify: `.claude/skills/component/react/registry.yaml` — bp-24 ganha um `mechanical:`/ponteiro para a rail A (a regra já existe — ver Ground); e o bloco `composer` entra na `scaffold:` da skill
- Modify: `.claude/skills/route/react/registry.yaml` — bp-03 ganha `detect_skip: 'STATE-LOCAL-FILTER'` (D-F)
- Modify: `packages/app/react/src/routes/attach/-components/ContactStep/index.tsx` — **uma linha de comentário** `// STATE-LOCAL-FILTER: …` acima do `useState('')` (l.36)
- Modify: `docs/CLI.md` — §3 (bloco `composer` no mental model), §7 (tabela de recipes ganha `live-settings`), §6 `component` (tabela de flags)
- Modify: `packages/app/react/CLAUDE.md` — reescrita da seção "Real-time" (l.220-237) e uma ressalva de uma linha no caso 2 do "State placement"

**Files to read:**
- `packages/api/typescript/src/ui/controllers/ListenEvents.ts:20-110` — **a verdade do wire** (leitura apenas; `packages/api/**` é proibido para escrita)
- `packages/app/react/src/hooks/useServerEvents.ts` — `useServerEventSource` + `useServerEvents`, o envelope `{ name, ownerId, payload }`
- `packages/app/react/src/routes/(app)/threads/$threadId/-hooks/useThreadRealtime.ts` — o mapa de invalidação real pós-B5
- `packages/app/react/src/hooks/useTerminalStream.ts` — **a ressalva que evita a reescrita errada** (ver T8.3)
- `.claude/skills/form/react/registry.yaml:769-1093` — o formato de `bad_practices` desta skill

**Agent:** frontend-developer · **Reviewer:** spec-compliance-reviewer → code-reviewer · **Model:** opus · **Skills:** /review
**Depends on:** T3, T4, T5, T6, T7
**Scope fence:** DONE: os 4 registries, os 3 docs e a linha de comentário no `ContactStep`. OUT: **nenhum** outro arquivo de produto; nenhuma regra nova que não seja uma das três decisões da spec (4, 5, 1) ou o `detect_skip` do D-F. Não reescrever o `CLAUDE.md` raiz. Não tocar `docs/FRONTEND.md`.
**Gate:** `bun test:tooling` (exit 0 — `skill-examples.test.ts` e `taxonomy-parity.test.ts` vigiam esses YAML) · `bun detect 2>&1 | grep "ContactStep"` → **vazio** · `bun tsc` · `bun lint` · `bun run test` · `cd packages/e2e && bun run test`

### Step T8.1 — As três regras de skill (AC-8, AC-13)

- [ ] **`form/react`** — `bad_practice` novo: *"Busca modelada como campo de formulário"*. `wrong`: `<form.Field name="search">` para filtro de lista. `right`: o trecho literal de `ContactStep:36+48+61` (`useState('')` + `contacts.filter(...)` + `<Input value={search}>`), com a frase "busca é filtro sobre dado já carregado ou parâmetro de URL — nunca um campo com validação e submit". Uma linha citando que a recipe `live-settings` é o outro caso de "controle sem submit"
- [ ] **`primitive/react`** — `bad_practice` bp-05 *"Primitivo com interface de props fechada"*, `severity: critical`, `mechanical: true`, `detect: ['className\\?:\\s*string']`, `wrong` = o `InfoHintProps` de antes, `right` = `extends ComponentProps<typeof TooltipTrigger>`. Referência cruzada a PRM-04 e à rail C
- [ ] **`component/react`** — bp-24 ganha um campo apontando a rail A como enforcement mecânico (`packages/app/react/tests/architecture/dialog-store.test.ts`); a linha `scaffold:` ganha `[--block=composer]`
- [ ] **`route/react`** bp-03 ganha `detect_skip: 'STATE-LOCAL-FILTER'`, com uma `note:` de uma frase dizendo que a isenção é para busca que filtra lista já carregada dentro de wizard/dialog (não deep-linkável), e que ela **exige** o marcador escrito no código

### Step T8.2 — `ContactStep` declara a isenção, e `bun detect` para de acusá-lo

- [ ] Uma linha acima de `const [search, setSearch] = useState('')` (l.36): `// STATE-LOCAL-FILTER: filtra `contacts` já carregado, dentro de um passo de wizard — não é deep-linkável e não sobrevive ao passo, então não vai para search params (route bp-03).`
- [ ] `bun scripts/detectors/registry-scan.ts 2>&1 | grep ContactStep` → **vazio**

### Step T8.3 — A guidance MORTA do `CLAUDE.md` do react

Verificado contra o código, não contra a memória: `ListenEvents.ts:26-27` e `:101` declaram que **o `BrowserFrameEnricher` e os frames `browser.*` do SSE estão MORTOS desde B5** — o broadcaster re-emite o envelope cru; `useServerEvents.ts:33` faz `document.dispatchEvent(new CustomEvent(result.data.name, …))` com o nome do contrato, sem enriquecimento. Mesmo assim `packages/app/react/CLAUDE.md:224-228` ainda ensina *"A `browser.*` frame is added to `BrowserFrameEnricher` ONLY when…"*.

**A ressalva que evita a reescrita errada:** `browser.*` **não morreu inteiro**. `useTerminalStream.ts:11` define `TerminalActionFrame = Extract<TerminalStreamFrame, { name: 'browser.terminal_action_detected' }>` e `IssueDetailSection:171` o consome. Esse é o **stream do terminal (PTY)**, um canal diferente do SSE. Um `sed` de "browser.* está morto" quebraria a doutrina de um canal vivo.

- [ ] Substituir o bullet de l.224-228 por um que diga o que é verdade: **o front assina o nome do contrato** (`integration.*`), o envelope é `{ name, ownerId, payload }`, e **não existe enriquecimento server-side** — se um fato não carrega o escopo que a tela precisa (`threadId`), a resposta é o payload do contrato ganhar o campo, não um frame sintético
- [ ] Uma frase nova distinguindo os DOIS canais: SSE (`useServerEvents`, nomes `integration.*`) vs terminal (`useTerminalStream`, frames `browser.terminal_action_detected`), para que `browser.*` continue legível onde ainda vive
- [ ] O bullet de l.233-237 (*"A subscription to the wrong fact fails silently"*) é **história verdadeira e a lição continua valendo** — reescrever só o tempo verbal para deixar claro que `browser.thread_status_changed` não existe mais, mantendo o método (montar o hook e disparar o CustomEvent) intacto
- [ ] "State placement", caso 2 (l.166-167): acrescentar a ressalva do D-F em uma linha — busca que filtra lista já carregada dentro de wizard/dialog é caso 5, com o marcador `STATE-LOCAL-FILTER`
- [ ] **Verificação obrigatória:** `grep -n "BrowserFrameEnricher" packages/app/react/CLAUDE.md` → **vazio**; `grep -rn "BrowserFrameEnricher" packages/app/react/src` → só os comentários históricos que já existem em `useThreadRealtime.ts:19` e `AgentsRunningPill.tsx:13` (esses são narrativa de commit, não instrução, e **ficam**)

### Step T8.4 — `docs/CLI.md`

- [ ] §3 (mental model): `composer` na enumeração de blocos
- [ ] §7 (tabela de recipes): linha `live-settings | element, skeleton | toggle/pill que salva no próprio onChange/onBlur, sem botão Salvar`
- [ ] §6 `component`: `--block=composer` na tabela de flags, com o exemplo de invocação

### Step T8.5 — Verde e os números

- [ ] `bun test:tooling` → exit 0
- [ ] `bun detect 2>&1 | grep -c "packages/app/react"` → **16** (9 `eslint-disable` + 6 `bp-14` + 1 `bp-06` — os três follow-ups nomeados na triagem)
- [ ] `bun detect 2>&1 | tail -3` → continua exit 1 **apenas** por `packages/api/**`, `packages/app/astro` e `packages/contracts` (declarado, não regressão)
- [ ] `bun tsc` · `bun lint` · `bun run test` · `cd packages/e2e && bun run test` → exit 0

### Step T8.6 — Commit

```bash
git add .claude/skills/form/react/registry.yaml \
        .claude/skills/primitive/react/registry.yaml \
        .claude/skills/component/react/registry.yaml \
        .claude/skills/route/react/registry.yaml \
        packages/app/react/src/routes/attach/-components/ContactStep/index.tsx \
        packages/app/react/CLAUDE.md \
        docs/CLI.md
git commit -m "docs(skills,app-react): C T8 — as tres regras nas skills, e a guidance morta do react some

Ground: 1 das 3 regras da decisao 7 JA existia (component bp-24), 1 existia como
pattern e nao como bad_practice (primitive PRM-04) e 1 era lacuna real (busca
nunca e form). Este commit fecha as duas metades que faltavam sem duplicar a
que ja estava la.

O ContactStep era abencoado pela spec como exemplo canonico E reprovado pelo
route bp-03 do proprio repo. Resolvido por marcador declarado
(STATE-LOCAL-FILTER) + detect_skip: um mecanismo, greppavel, com o porque no
codigo — em vez de baseline JSON sem comentario.

O CLAUDE.md do react ainda mandava adicionar frames ao BrowserFrameEnricher,
morto desde B5. Reescrito contra ListenEvents.ts e useServerEvents.ts. A
ressalva importante: browser.terminal_action_detected continua VIVO no stream
do terminal (useTerminalStream) — sao dois canais, e agora o doc diz isso."
```

---

## Caminho crítico e paralelismo

```
T1 (dialogs → store, rail A)
 ├─► T2 (AddWorkspaceDialog → form) ─┐
 ├─► T3 (bloco composer + migrações) ─┼─► T5 (rail B) ──┐
 └─► T4 (recipe live-settings) ───────┘                 │
                                       T3 ─► T7 (varredura bp-20) ─┼─► T8 (skills + docs)
T6 (rail C + primitivos) ─── independente ──────────────────────────┘
```

**Caminho crítico: T1 → T3 → T7 → T8** (T2 e T4 são folgas curtas penduradas em T1; T5 fecha antes de T7 mas não bloqueia; T6 é disjunto e pode rodar em paralelo com tudo desde o minuto zero).

**Paralelizável desde o início:** T6 (só toca `components/ui/`). **Depois de T1:** T2, T3 e T4 são disjuntos entre si (T2 = 1 arquivo de rota; T3 = CLI blocks + 2 rotas; T4 = CLI recipes, zero rotas).

---

## Open Questions

**OQ-1 — `availability.tsx` (1051 linhas) é código morto. Refatorar ou deletar?**
Medido: zero consumidores em `packages/app/react/src` e `packages/e2e`; nenhuma story entre as 36; nenhuma rota. É uma grade de agenda semanal com drag-and-drop (`TimeSpan { week_day, start_time, end_time }`) — resíduo do template de clínica num produto de terminal-agent. A spec (Decisão 5, AC-9) manda estendê-lo com `ComponentProps`; o plano executa isso por default em T6. **Recomendação:** deletar o arquivo (e o `eslint-disable` que ele carrega, um dos 9 findings de `universal#eslint-disable`) — é ~1050 linhas a menos de superfície e 4 das 19 violações da rail C somem sem trabalho. Precisa da palavra do founder porque contradiz uma AC escrita. Se a resposta for "deletar", T6 encolhe para 9 arquivos e a rail C nasce vermelha com 15 violações em vez de 19.

**OQ-2 — os 6 `component#bp-14` (literal em vez de enum) entram nesta frente?**
O plano diz **não** (follow-up nomeado), por dois motivos: é território da skill `enum`, e 1 dos 6 (`TranscriptBubble:18`, `entry.kind === 'ACTION'`) **não tem enum correspondente na SDK** — fechar 5 e deixar 1 é pior que abrir um follow-up. Se a resposta for "entra", é uma task nova **e** a decisão sobre o sexto precisa vir junto (o que exigiria mexer no contrato → território proibido).

**OQ-3 — os 9 `universal#eslint-disable` do `app-react`.**
Todos carregam justificativa em comentário (wordmark de marca, `<title>` semântico de SVG, "h" como símbolo de duração). A regra `universal#eslint-disable` é cega a justificativa. O plano não os toca. A saída limpa seria a regra passar a aceitar `-- <motivo>` como sufixo obrigatório em vez de proibir o disable — mas isso é mudança de detector, escopo de outra frente.

---

## O que sobe pro template

- **Rails de conformidade de frontend** (`packages/app/react/tests/architecture/`): três varreduras de filesystem com whitelist comentada — dialog→store, campo→`form.Field`, primitivo→`ComponentProps`. Nenhuma delas conhece nada do codedm; o que muda por produto é a whitelist. É a primeira pasta `tests/architecture/` do lado do frontend, espelhando a que o backend já tem.
- **CLI:** bloco `composer` e recipe `live-settings` — dois shapes que o template inteiro repete (caixa de mensagem, tela de preferências que salva sozinha).
- **Skills:** `form/react` ganha "busca nunca é form"; `primitive/react` promove PRM-04 a `bad_practice` mecânica; `route/react` ganha o marcador `STATE-LOCAL-FILTER` como mecanismo genérico de isenção declarada (útil muito além desta regra).
- **Doutrina:** o par "detector varre o que é repo-wide / rail varre o que é do pacote" fica documentado no docblock da rail C, com o motivo de a fronteira estar onde está.

---

## Emendas (30/07, pós-lote T1/T2 — orquestrador)

**E-C1 — T3 AMPLIADO (achado do executor: o assembler não suporta o bloco sem extensão).** Medido: não existe caminho `--block=` (`grep -rn "'block'\|--block" scripts/cli/` → 0 hits; blocos ativam por `recipe.blocks`, pelo CSV hardcoded de `--state` ou por flags dedicadas) e `BlockContext` não tem `mutationHook` (campos reais: `pascal, camel, kebab, routePath, sdk?, storeName?, i18nPrefix?`). Resolução pela house rule do CLI ("if you wrote it, the CLI should write it"): T3 passa a incluir `scripts/cli/frontend/blocks/types.ts` (campo `mutationHook?`) e o parser em `scripts/cli/frontend/artifacts/component.ts` — **flag dedicada** seguindo o idioma existente (`--variants`/`--labels`/`--i18n`; grafia recomendada `--mutation=<Hook>`, ou flag única que ativa+alimenta o composer — o executor segue o vizinho mais próximo), NUNCA um registro genérico de blocos. `docs/CLI.md` ganha a linha da flag. Verificação: rodar a invocação real de scaffold do T3 e citar a saída. Proibido substituir `ctx.mutationHook` por `ctx.sdk` (reinterpretação semântica — os dois podem coexistir num mesmo componente).

**E-C2 — Rail A: predicado #1 aperta para IMPORT real (achado: passava por prosa).** O `.includes('useDialogStore')` aceita docblock — o `ThreadSettingsDialog` satisfez por comentário. O predicado #1 passa a exigir import de fato (regex de import, não substring solta); `ThreadSettingsDialog` entra na whitelist da rail A com motivo honesto: "conteúdo puro sem afordância própria de fechar — dismissal roteia pelo host (X do DialogContent/Esc/backdrop)". O "WHITELIST vazia" de T1.5 fica supersedido: whitelist com 1 entrada verdadeira > predicado que aceita prosa. A whitelist da rail B (T5) herda a mesma entrada com o mesmo motivo. Falseador: mutação removendo a entrada da whitelist → rail vermelha citando o arquivo.

**E-C3 — `availability.tsx` DELETADO, não refatorado (ratificação do founder, 30/07, chat: "remova o availability.tsx").** Supersede a letra do AC-9 para este arquivo. Medido no Ground: zero consumidores, zero stories, 1051 linhas. `git rm packages/app/react/src/components/ui/availability.tsx` (confirmar o caminho real no ato) na task que abre o território de `components/ui/` (T6), commit citando a ratificação. Consequência: os números nascidos-vermelhos da rail C (19 violações / 10 arquivos) e o sweep do T7 encolhem — o executor RE-MEDE e cita os números reais; os do plano ficam stale neste ponto. O artefato de fechamento registra: AC-9 supersedido por ratificação, −1051 linhas.
