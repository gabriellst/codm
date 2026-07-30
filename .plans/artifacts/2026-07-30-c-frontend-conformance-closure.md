# Frente C — frontend conformance (dialogs, primitivos e rails): artefato de fechamento

Frente `.plans/2026-07-30-c-frontend-conformance.md` (spec `.specs/2026-07-29-frontend-conformance-design.md`).
Medição feita em `5f125cd3` (T8, HEAD atual), depois do commit deste artefato ela vira o novo tip. Este
documento só MEDE — nenhuma linha de código de produção foi alterada por ele (T8 já estava commitado; os
falseadores desta rodada mutaram e restauraram arquivo-a-arquivo, `git diff` zero-residual confirmado após
cada um antes de qualquer commit).

Commits da frente:

| Task | SHA | Mensagem |
|---|---|---|
| T1 | `ee7bf2ee` | refactor(app-react): C T1 — os 3 dialogs divergentes passam a ser dirigidos por useDialogStore |
| E-C2 | `1d1be4b6` | test(app-react): C E-C2 — rail A exige IMPORT de useDialogStore, nao a mencao |
| T2 | `512f5d42` | refactor(app-react): C T2 — AddWorkspaceDialog vira create-form com o schema da SDK |
| T3 | `6968d974` | feat(cli): C T3 — bloco composer, e os dois composers duplicados param de ser dois |
| T4 | `2086e07a` | feat(cli): C T4 — recipe live-settings (save-on-change, sem botao Salvar) |
| T5 | `5ee7e660` | test(app-react): C T5 — rail B, campo de dado sob -components/ vive em form.Field |
| T6 | `54aa0903` | refactor(app-react): C T6 — primitivos de ui/ estendem ComponentProps da raiz; availability.tsx deletado |
| T7 | `f8f70533` | refactor(app-react): C T7 — bp-20 em 29 arquivos; component-props sai de 33 findings para 0 |
| **T8** | **`5f125cd3`** | **docs(skills,app-react): C T8 — as tres regras nas skills, e a guidance morta do react some** |

**Retomada de T8.** O executor anterior parou com 7 arquivos modificados e não commitados (trabalho em
andamento legítimo, não uma mutação de falseador esquecida — essa já tinha sido restaurada pelo
orquestrador antes desta sessão começar). Esta sessão: (1) leu o diff dos 7 contra o que T8 manda —
6 dos 7 estavam completos e corretos; 1 (`docs/CLI.md`) tinha a tabela de recipes/mental-model mas não o
"exemplo de invocação" que o Step T8.4 pede, então ganhou um `#### 6.7 Worked example — composer block`
novo, validado rodando a invocação real com `--print`; (2) refez TODOS os falseadores da frente com
números re-medidos (§c); (3) escreveu este artefato; (4) commitou T8 (`5f125cd3`, os 7 arquivos, nenhum
outro).

---

## (a) A bateria completa — saída citada

Todas re-executadas em `5f125cd3` (pós-T8), a maioria com `--skipNxCache` para eliminar dúvida de cache
(a lição do B5 §e — ver achado sobre o Redis abaixo, mesma classe de "cache pode mentir sobre o presente").

### `bun tsc` (raiz, `nx run-many -t tsc --skipNxCache`)

```
$ bun x nx run-many -t tsc --skipNxCache
Result (30 files): 0 errors, 0 warnings, 0 hints   [app-astro]
Successfully ran target tsc for 7 projects
```
**PASS** — 7/7 projetos, fresh (não-cache).

### `bun lint` (raiz, `nx run-many -t lint --skipNxCache`)

```
$ bun x nx run-many -t lint --skipNxCache
Checked 2 files in 10ms. No fixes applied.   [app-styles, biome]
Checked 1 file in 25ms. No fixes applied.    [app-astro, biome]
eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0   [app-react]
Successfully ran target lint for 3 projects
```
**PASS** — 3/3, fresh.

### `bun run test` (`nx run-many -t test --exclude=e2e --skipNxCache`)

```
Ran 41 tests across 9 files.    [app-react]      41 pass, 0 fail
Ran 206 tests across 30 files.  [core-typescript] 206 pass, 0 fail
Ran 92 tests across 9 files.    [contracts]       92 pass, 0 fail
Ran 912 tests across 144 files. [api-typescript]  911 pass, 1 fail (ver achado Redis abaixo)
cargo test (client, rust):  9 total, ok (1 ignored — needs live backends, documented)
go test ./... (api-go + core-go): ok, 0 failed
```
**5/6 projetos PASS limpos. 1 (`api-typescript`) com 1 falha AMBIENTAL, não-regressão — ver achado
"Redis compartilhado entre repos irmãos" abaixo.** `bun run test` normal (com cache Nx) reproduz o
resultado histórico verde porque o hash de conteúdo de `packages/api/typescript` não mudou desde a última
rodada fresh bem-sucedida — o `--skipNxCache` é o que expôs a flakiness ambiental atual.

### `bun test:tooling`

```
$ bun test:tooling
422 pass
0 fail
Ran 422 tests across 26 files.
```
**PASS** — cobre `skill-examples.test.ts` e `taxonomy-parity.test.ts`, que vigiam os 4 registries que T8
tocou. Nenhum deles reprovou o novo YAML (bp-33, bp-05, `rail:`, `detect_skip`).

### `bun x nx run app-react:tsc --skipNxCache`

```
Successfully ran target tsc for project app-react
```
**PASS** — 0 erros.

### react test (`bun x nx run app-react:test --skipNxCache`)

```
41 pass
0 fail
Ran 41 tests across 9 files.
```
**PASS.** Mesmo número desde T7 (T8 não adiciona teste de comportamento — só a linha de comentário no
`ContactStep`, que não muda contagem de teste).

### `cd packages/e2e && bun run test` (NUNCA `bun e2e`)

```
✓ 07-issue-archive-restore.spec.ts › issue archive → restore
- 08-stop-resolve.spec.ts (skipped)
- 09-sse-pill.spec.ts (skipped)
✓ 10-terminal-tool-frame.spec.ts › the console panel receives the REAL tool name...

2 skipped
6 passed (30.4s)
```
**PASS** — 6 passed, 0 failed. Os 2 skipped são `test.skip(true, ...)` PRÉ-EXISTENTES (infra do stub
`AgentRunner`, documentados desde B5), não relacionados a esta frente.

### `bun detect`

```
$ bun detect
─── registry-scan ───
34 finding(s) (31 error), 58 baselined, 975 file(s) scanned
─── import-direction ───
3 finding(s) (3 error, 0 warning), 0 suppressed, 851 file(s) scanned
─── slice-closure ───
37 finding(s) — SCW-01a/error: 1, SCW-01b/info: 12, SCW-01c/info: 1, SCW-01c/warning: 21, SCW-03/error: 1, SCW-03/warning: 1
─── component-props ───
0 finding(s), 0 gating
─── projection-shape ───
3 finding(s), 3 gating
─── go-enum-literals ───
2 finding(s), 2 gating (0 baselined)

detect: 5/6 detector(s) reported findings — registry-scan, import-direction, slice-closure, projection-shape, go-enum-literals
error: script "detect" exited with code 1
```

`component-props` — **0 finding(s), 0 gating** (T7's territory, confirmed still zero). `bun detect
2>&1 | grep -c "packages/app/react"` → **15** (não 16 — ver §(b) AC-9/AC-13 e a nota abaixo). `bun detect
2>&1 | grep "ContactStep"` → **vazio**. `bun detect 2>&1 | grep -c "packages/api/"` → **60**, exatamente
o número declarado no plano ("~60 de packages/api/**") — território proibido desta frente, exit 1
continua por causa dele, **não é regressão**.

**A discrepância 16→15 já estava prevista pelo próprio commit de T7** (`f8f70533`): "Efeito colateral
medido no registry-scan (não gate desta task, conferido para T8): app-react cai de 31 para 16 findings
... sobram 8 eslint-disable justificados ... 6 bp-14 ... e 1 route#bp-03 (ContactStep, T8) — todos
follow-ups nomeados". Ou seja, o "16" do Step T8.5 do plano é o número **pré-T8** (com `ContactStep`
ainda vermelho); ao fechar `route#bp-03` do `ContactStep` (T8.2), o número cai para **15** — exatamente
o que T7 já previu e o que esta rodada mede. `git status --porcelain packages/api packages/client` →
**vazio**.

---

## (b) Mapa AC-1..AC-15 → evidência

| AC | Evidência |
|---|---|
| AC-1 | T1 (`ee7bf2ee`) — `AddWorkspaceDialog`, `ThreadSettingsDialog`, `ConnectChannelDialog` sem `useState`/`onOpenChange` local; rail A (`dialog-store.test.ts`) prova mecanicamente |
| AC-2 | T1, D-B aplicado campo a campo — `attempt`/`expired`/TTL/poll/os 5 ramos de `body` da `ConnectChannelDialog` byte-idênticos; só `enabled: open`→`enabled: true` (default) e `handleOpenChange`→mount/unmount mudaram |
| AC-3 | T1 — `ThreadSettingsBody` não condicionado a `open`; save-per-campo intocado. T4 (`2086e07a`) usa esse exato shape como referência viva da recipe `live-settings` |
| AC-4 | T4 — `recipes/live-settings.ts` + fragmento `recipes.live-settings` no registry, exercitado por `fragments.test.ts` (`describe('live-settings recipe')`, 2ª asserção gera via `componentGenerator` e checa 0 `type="submit"`) |
| AC-5 | T2 (`512f5d42`) — `AddWorkspaceDialog` usa `useForm` + `validators.onChange: addWorkspaceMutationRequestSchema`; `grep -n "useState"` → 1 hit (`canPickFolder`, gate de capability, legítimo) |
| AC-6 | T3 (`6968d974`) — `blocks/composer.ts` + fragmento `blocks.composer`, exercitado por `fragments.test.ts` (`describe('composer block')`) + golden `thread-composer.tsx.txt` |
| AC-7 | T3 — `Composer/index.tsx` e `IssueSteerComposer` (dentro de `IssueDetailSection`) usam o shape do bloco; `Composer.test.tsx` não mudou e continua verde (falseador da migração: "exactly one button") |
| AC-8 | **T8 (`5f125cd3`)** — `form/react` registry ganha `bp-33` "Search modeled as a form field", `right:` cita `ContactStep` literal (`useState('')` + `contacts.filter(...)` + `<Input value={search}>`), `note:` referencia `live-settings` como o outro caso de "controle sem submit" |
| AC-9 | **SUPERSEDIDO por ratificação do founder (E-C3, 30/07, chat: "remova o availability.tsx")** — `availability.tsx` (1051 linhas, zero consumidores/stories/rotas) foi **deletado**, não estendido, em T6 (`54aa0903`). Os outros 4 nomeados pela AC (`confirm-dialog`, `currency-selector`, `info-hint`, `metric-delta`) **estendem `ComponentProps` normalmente** — `confirm-dialog.tsx extends ComponentProps<typeof DialogContent>`, `info-hint.tsx extends Omit<ComponentProps<typeof TooltipTrigger>, 'children'>`, `metric-delta.tsx extends ComponentProps<'span'>`, `currency-selector.tsx`/`currency-input.tsx` estendem a raiz real (Trigger/InputGroup). −1051 linhas de superfície |
| AC-10 | T1 — `packages/app/react/tests/architecture/dialog-store.test.ts` existe, 3/3 pass, `WHITELIST` com 1 entrada verdadeira (E-C2) |
| AC-11 | T5 (`5ee7e660`) — `packages/app/react/tests/architecture/form-field.test.ts` existe, 3/3 pass, `WHITELIST` com 4 entradas comentadas |
| AC-12 | T6 — `packages/app/react/tests/architecture/primitive-props.test.ts` existe, 3/3 pass, `WHITELIST` vazia |
| AC-13 | **Estado real, não a letra original.** `component/react` bp-24 **já existia** (pré-frente); T8 acrescentou o campo `rail:` apontando para `dialog-store.test.ts` como a metade mecânica repo-wide, e `scaffold:` passou a citar `--mutation=<Hook>` (a flag real do T3/E-C1, não `--block=composer`, que nunca existiu como caminho de CLI). `primitive/react` ganhou **bp-05** novo (`mechanical: true`, `detect: className?:\s*string`, promovendo PRM-04 de `pattern` para `bad_practice`) — falseado ao vivo em §(c). `form/react` ganhou **bp-33** novo (`mechanical: false`, doutrina — não há regex que distinga "busca" de "campo de dado" sem julgamento semântico, coerente com a heurística: a rail B, mecânica, já cobre o caso estrutural via whitelist) |
| AC-14 | Confirmado nesta rodada (§a) — `bun tsc` e `bun lint` passam limpos, fresh, sem cache |
| AC-15 | Honrado durante toda a frente — Ground (linhas 21-83 do plano) re-executou a varredura em HEAD `f1abd5d4` em vez de confiar no snapshot da spec (29-jul), e cada Task subsequente (T6/T7/T8) re-mediu no próprio commit quando o número do plano ficou stale (availability.tsx deletado, ContactStep fechado) |

---

## (c) Falseadores — números REAIS de toda a frente, re-medidos nesta rodada

Todos os falseadores desta seção que envolveram mutação de arquivo de PRODUÇÃO ou de TESTE foram
restaurados byte-a-byte imediatamente após a medição — `git diff`/`git status --porcelain` confirmado
vazio para cada arquivo tocado, antes de qualquer commit.

### Rail A (T1) — nasceu 3+6, aperta para 1 com E-C2

**Nascimento (T1, Step T1.1, histórico — citado do commit `ee7bf2ee` e do texto do plano, não
reproduzível hoje sem reverter a migração):** contra os 3 dialogs pré-migração, o primeiro teste
("todo *Dialog* IMPORTA useDialogStore") nomeava exatamente **3** ofensores
(`ConnectChannelDialog`, `ThreadSettingsDialog`, `AddWorkspaceDialog`); o segundo ("nenhum open/
onOpenChange local") nomeava **6** (3× `onOpenChange` + 3× `useState de open`).

**Aperto E-C2 (achado: o predicado 1 aceitava PROSA — `.includes('useDialogStore')` passava com um
docblock que só AFIRMAVA seguir o padrão, sem import real).** Re-medido agora, ao vivo:

```
$ cd packages/app/react && bun test tests/architecture/dialog-store.test.ts   # baseline
3 pass / 0 fail

# WHITELIST esvaziada (mutação)
$ bun test tests/architecture/dialog-store.test.ts
- []
+ ["routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx"]
2 pass / 1 fail

# WHITELIST restaurada
$ bun test tests/architecture/dialog-store.test.ts
3 pass / 0 fail
```

**2 pass / 1 fail, citando exatamente `ThreadSettingsDialog/index.tsx`** — bate com o que o commit
`1d1be4b6` já documentou ("a rail fica vermelha nomeando exatamente 1 arquivo").

### Rail B (T5) — mutação = exatamente 4 acusados

```
$ cd packages/app/react && bun test tests/architecture/form-field.test.ts   # baseline
3 pass / 0 fail

# WHITELIST esvaziada (mutação)
$ bun test tests/architecture/form-field.test.ts
+ "routes/(app)/threads/$threadId/-components/Composer/index.tsx:65 <Textarea>"
+ "routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx:222 <Textarea>"
+ "routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx:110 <Input>"
+ "routes/attach/-components/ContactStep/index.tsx:63 <Input>"
2 pass / 1 fail

# WHITELIST restaurada
$ bun test tests/architecture/form-field.test.ts
3 pass / 0 fail
```

**Exatamente os 4 sítios do plano** (`Composer`, `IssueDetailSection`, `ThreadSettingsDialog`,
`ContactStep`). Os números de linha mudaram frente ao commit original de T5 (`Composer:53`→`:65`,
`IssueDetailSection:215`→`:222`) porque T7 (bp-20, posterior) acrescentou `ComponentProps`/spread
nesses dois arquivos, deslocando linhas — os ARQUIVOS acusados são idênticos, só a posição mudou.
`ContactStep:61`→`:63` pela mesma razão (T8 acrescentou o comentário `STATE-LOCAL-FILTER`, 2 linhas).

### Rail C (T6) — números pós-deleção do `availability.tsx`

**Re-medido do commit `54aa0903` (T6), que já fez essa conta ao vivo contra o estado real, não contra
o snapshot da spec:** "15 violações em 9 arquivos, não as 19/10 do plano" — `combobox`, `confirm-dialog`,
`currency-input`, `currency-selector`, `info-hint`, `metric-delta`, `select` (7× declaração `Props`
fechada) + `combobox`, `currency-input`, `currency-selector`, `date-picker`, `info-hint`,
`metric-delta`, `select`, `toggle-group` (8× `className` à mão). 7+8=15, confirmando a aritmética do
próprio OQ-1 do plano (19−4=15 violações, 10−1=9 arquivos, os 4 que `availability.tsx` sozinho
carregava: `AvailabilityProps`, `DayColumnProps`, `DraggableTimeSpanProps`, 1× `className` à mão).

**Falseador ao vivo desta rodada** (arquivo real, mutação cirúrgica em `metric-delta.tsx` — removida a
extensão de `ComponentProps<'span'>`, hand-typado `className?: string`):

```
$ cd packages/app/react && bun test tests/architecture/primitive-props.test.ts   # baseline
3 pass / 0 fail

# MetricDeltaProps não estende ComponentProps + className à mão (mutação)
$ bun test tests/architecture/primitive-props.test.ts
+ "metric-delta.tsx:6 MetricDeltaProps"
+ "metric-delta.tsx:11"
1 pass / 2 fail

# metric-delta.tsx restaurado
$ bun test tests/architecture/primitive-props.test.ts
3 pass / 0 fail
```

### T7 (`component-props` detector) — 33→0, confirmado ainda 0, falseado ao vivo

Histórico (`f8f70533`): RED medido pré-edição "33 finding(s), 33 gating"; GREEN pós-edição "0
finding(s), 0 gating". **Confirmado nesta rodada** (`bun scripts/detectors/component-props.ts` → `0
finding(s), 0 gating`, ver §a). Falseador ao vivo, mutação cirúrgica em `StatusDot.tsx` (`Dot` deixou de
estender `ComponentProps<'span'>`, `className?: string` hand-typado, `{...props}` removido):

```
$ bun scripts/detectors/component-props.ts   # baseline
0 finding(s), 0 gating

# Dot sem ComponentProps (mutação)
$ bun scripts/detectors/component-props.ts
StatusDot.tsx:14 [error] CP-01 (component#bp-20) — Dot renders a <span> root without extending ComponentProps<'span'>...
StatusDot.tsx:14 [error] CP-02 (component#bp-20) — hand-typed `className?: string`...
2 finding(s), 2 gating

# StatusDot.tsx restaurado
$ bun scripts/detectors/component-props.ts
0 finding(s), 0 gating
```

### Golden do CLI (jsxBody) — 19/1 na medição original, re-medido para 22/1

**Medição original (T3, commit `6968d974`):** o arquivo `fragments.test.ts` tinha **20** `it(...)` no
momento do commit de T3 (confirmado via `git show 6968d974:scripts/cli/frontend/blocks/fragments.test.ts
| grep -c 'it('` → 20). Com a linha de agregação `if (o.jsxBody) jsxBodies.push(o.jsxBody)` removida, o
golden `thread-composer.tsx.txt` reprovava — **19 pass / 1 fail**, o único teste vermelho sendo o de
equivalência do golden do composer (o `<div>` inteiro do bloco desaparecia do arquivo emitido).

**Re-medido nesta rodada** (T4 acrescentou 3 `it(...)` desde então → **23** no arquivo atual):

```
$ bun test scripts/cli/frontend/blocks/fragments.test.ts   # baseline
23 pass / 0 fail

# `if (o.jsxBody) jsxBodies.push(o.jsxBody)` removida de component.ts (mutação)
$ bun test scripts/cli/frontend/blocks/fragments.test.ts
✗ assembler golden equivalence (composer block) > mutation: --mutation=useSteerThread --i18n=session (thread-composer)
  Expected - 17 (todo o <div className="flex items-end gap-2..."> desaparece)
  Received + 0
22 pass / 1 fail

# component.ts restaurado
$ bun test scripts/cli/frontend/blocks/fragments.test.ts
23 pass / 0 fail
```

**22 pass / 1 fail — a mesma proporção do original (N−1 pass / 1 fail), a diferença de 19→22 é
exatamente os 3 testes que T4 acrescentou depois.** O falseador ainda prova a mesma coisa: `jsxBody` é
fiação viva, não decoração.

### Os falseadores do T8 (rules novas desta task)

Duas regras mecânicas nasceram NESTA task (`bp-05` em `primitive/react`, `detect_skip` em `route/react`
bp-03) — nenhuma delas tinha um falseador provado antes. Provados ao vivo nesta rodada:

**`primitive#bp-05`** (mutação em `info-hint.tsx` — `className?: string` reintroduzido à mão):

```
$ bun scripts/detectors/registry-scan.ts packages/app/react/src/components/ui/info-hint.tsx   # baseline
0 finding(s) (0 error), 1 file(s) scanned

# className?: string reintroduzido (mutação)
$ bun scripts/detectors/registry-scan.ts packages/app/react/src/components/ui/info-hint.tsx
info-hint.tsx:15 [error] primitive#bp-05 — PRM-04 promoted from pattern to bad_practice...
1 finding(s) (1 error), 1 file(s) scanned

# info-hint.tsx restaurado
$ bun scripts/detectors/registry-scan.ts packages/app/react/src/components/ui/info-hint.tsx
0 finding(s) (0 error), 1 file(s) scanned
```

**`route#bp-03` `detect_skip: STATE-LOCAL-FILTER`** (mutação em `ContactStep/index.tsx` — o comentário
`STATE-LOCAL-FILTER` removido, `useState` exposto de novo à regra):

```
$ bun scripts/detectors/registry-scan.ts ".../ContactStep/index.tsx"   # baseline
0 finding(s) (0 error), 1 file(s) scanned

# marcador removido (mutação)
$ bun scripts/detectors/registry-scan.ts ".../ContactStep/index.tsx"
ContactStep/index.tsx:37 [error] route#bp-03 — Using useState for state that should be in the URL
1 finding(s) (1 error), 1 file(s) scanned

# marcador restaurado
$ bun scripts/detectors/registry-scan.ts ".../ContactStep/index.tsx"
0 finding(s) (0 error), 1 file(s) scanned
```

Ambos os 0→1 confirmam que as duas regras novas de T8 SABEM falhar, não só documentar.

---

## (d) Achados da frente inteira

1. **Rail A passava por prosa (E-C2).** `.includes('useDialogStore')` era satisfeito por um docblock
   que só AFIRMAVA seguir o padrão — o `ThreadSettingsDialog` passou assim, sem import real. Corrigido
   trocando o predicado por um regex de import de fato; `ThreadSettingsDialog` entrou na whitelist com
   motivo honesto (conteúdo puro, dismissal roteado pelo host).
2. **O assembler da CLI não tinha caminho `--block=`** (achado do executor de T3, `grep -rn "'block'\|
   --block" scripts/cli/` → 0 hits antes de T3). Resolvido com uma flag DEDICADA (`--mutation=<Hook>`),
   no idioma dos vizinhos (`--sdk`, `--variants`, `--consts`), nunca um registro genérico de blocos —
   E-C1 do plano já registrou essa decisão; T8 só teve que garantir que a doc (`scaffold:` de bp-24 e
   `docs/CLI.md`) refletisse a flag REAL, não a `--block=composer` que a letra original do plano citava.
3. **`BlockOutput.jsxBody` era fiação morta desde o dia zero.** O tipo existia, um bloco podia
   preenchê-lo, mas o assembler nunca agregava `jsxBody` no arquivo emitido — um fragmento perfeito que
   não pousava em lugar nenhum. Consertado em T3; o golden `thread-composer.tsx.txt` é o falseador dessa
   fiação (§c acima).
4. **`declarations` é module-scope, não function-scope.** No assembler, o array `declarations` é
   emitido ANTES da `propsInterface` (topo do módulo); `jsxBefore` é emitido DENTRO da função, depois dos
   hooks. É por isso que `send()` (que fecha sobre `text`/`setText`, estado local dos hooks) precisa
   viajar em `jsxBefore`, não em `declarations` — colocá-lo em `declarations` geraria uma função de
   módulo referenciando variáveis que só existem dentro de outra função. Confirmado lendo
   `component.ts:225-246` diretamente.
5. **A recipe `live-settings` emite `<Switch>` sem importar `Switch`** — sancionado pelo próprio §1 do
   `docs/CLI.md` ("Philosophy: a scaffolder, not a generator" — "resolving missing imports ... is the
   agent's job after scaffolding"). Não é bug: os blocos que a recipe compõe (`element`, `skeleton`) não
   têm razão de importar um primitivo de controle que só o `host` da recipe usa; o próximo agente que
   rodar `bun cli component ... --recipe=live-settings` resolve o import como faria com qualquer símbolo
   SDK não resolvido.
6. **`nx run app-react:tsc` não cobre `tests/**` (follow-up, não corrigido nesta frente).**
   `packages/app/react/tsconfig.json` tem `"exclude": [..., "tests/**/*.test.ts"]` — as 3 rails
   (`dialog-store.test.ts`, `form-field.test.ts`, `primitive-props.test.ts`) rodam via `bun test`
   (transpilação do Bun, sem checagem de tipo completa) mas NÃO são type-checked por `tsc`. Um erro de
   tipo dentro de uma rail (ex.: um `Bun.Glob` mal tipado) não apareceria no gate `bun x nx run
   app-react:tsc`, só em `bun test` se quebrar em runtime. Gap real, não coberto por nenhuma Task desta
   frente — registrado aqui, não uma regressão introduzida por C.
7. **`packages/app/react/tsconfig.json` ganhou o `exclude: "tests/**/*.test.ts"` em T1** (`ee7bf2ee`),
   não antes — confirmado via `git log --oneline -- packages/app/react/tsconfig.json`. É a causa direta
   do achado #6: a exclusão foi necessária para manter `tsc` limpo quando as rails nasceram (tipos do
   `bun:test`/`Bun.Glob` sob um `tsconfig` de app estrito), mas o efeito colateral (rails fora do runtime
   de tsc) não foi revisitado depois.
8. **Os greps de verificação do Ground/dos gates são imprecisos, e isso é esperado.** `grep -rn
   "onOpenChange" packages/app/react/src/routes` (literal do gate de T1.5) NÃO devolve vazio hoje — bate
   em `routes/(app)/route.tsx:38` (`<Dialog open={open} onOpenChange={...}>`, o HOST que a store
   controla — é o ÚNICO `open`/`onOpenChange` legítimo do app, o ponto que renderiza `content` do
   `useDialogStore`) e em `routes/styleguide/index.tsx` (vitrine, fora de escopo por decisão da spec). A
   RAIL A em si não erra — ela só varre `-components/**/*.tsx`, o que exclui ambos por construção — mas
   o grep de prosa do plano exige julgamento humano para não confundir "host legítimo" e "vitrine fora de
   escopo" com "ofensor real". Mesma imprecisão em `grep -rn "DialogTrigger" .../routes` (só
   `styleguide/index.tsx`, também fora de escopo).
9. **Follow-ups nomeados do `bun detect` (nenhum tocado por esta frente):**
   - **9→8 `universal#eslint-disable`** em `app-react` — cada um com justificativa em comentário
     (wordmark, `<title>` semântico de SVG). A regra é cega a justificativa; 1 dos 9 originais morreu
     junto com `availability.tsx` (E-C3), sobram 8.
   - **6 `component#bp-14`** (literal em vez de enum) — território da skill `enum`, e 1 dos 6
     (`TranscriptBubble:18`) não tem enum correspondente na SDK; fechar 5 de 6 seria pior que abrir
     follow-up.
   - **1 `component#bp-06`** (cores hardcoded) — `ConnectChannelDialog:138`, `bgColor="#ffffff"
     fgColor="#000000"` no QR, comentário explicando que a placa branca mantém o código escaneável em
     dark mode. Correto e a regra é cega.
   - **~60 de `packages/api/**`** — território PROIBIDO desta frente por definição do plano; `bun
     detect` continua exit 1 por causa deles, declarado desde o Ground, não regressão.
10. **Redis compartilhado entre repos irmãos causa 1 falha ambiental em `api-typescript:test`
    (`redis-bridge.integration.test.ts`), não relacionada a esta frente.** O teste é `SKIP-GATED`
    (deveria pular se Redis não estiver acessível), mas há um container Redis de OUTRO repo
    (`medscall-monorepo-redis`, `docker ps` confirma) escutando na mesma porta `6379` do host — o teste
    CONECTA com sucesso mas o `waitUntil` do fluxo Go→TS nunca vê o fato esperado (consumer group /
    stream provavelmente contaminado por outro processo usando a mesma porta), e falha por timeout
    (20s) consistentemente em 2 tentativas. `git log -- .../redis-bridge.integration.test.ts` mostra a
    última mudança em B4 (`839ee162`), nada a ver com o diff desta frente (7 arquivos, todos fora de
    `packages/api/**`). `bun run test` COM cache Nx (o caminho normal, inclusive o do pre-commit hook)
    não reexecuta esse teste porque o hash de conteúdo de `packages/api/typescript` não mudou — só
    `--skipNxCache` expôs a falha ambiental. Não é uma regressão desta frente; é infraestrutura de
    desenvolvimento compartilhada entre repos irmãos brigando pela mesma porta.

---

## Notas finais

- **`bun e2e` não foi usado** — `cd packages/e2e && bun run test`, conforme a nota do plano.
- **Nenhuma Task tocou** `.specs/2026-07-30-rust-wire-and-tauri-sdk-design.md`, `packages/api/**`,
  `packages/client/**`, `packages/app/tauri/src-tauri/**`, `packages/app/expo/**` — confirmado por `git
  diff --name-only` contra cada território antes do commit. **O stash não foi tocado**: `git stash list`
  mostra 1 entrada (`lint-staged automatic backup`, datada de 29/07 00:32, ANTERIOR a esta sessão —
  criada por um hook de commit de uma sessão passada, não por este trabalho); o commit de T8 desta sessão
  não empilhou stash novo (lint-staged só empilha quando precisa reverter um estado, e neste commit as
  modificações do lint-staged foram aplicadas e mantidas com sucesso).
- **`git status --porcelain packages/api packages/client`** → vazio, confirmado nesta rodada e depois do
  commit de T8.
- **Todos os falseadores desta rodada mutaram arquivos reais** (`dialog-store.test.ts`,
  `form-field.test.ts`, `primitive-props.test.ts`, `metric-delta.tsx`, `StatusDot.tsx`,
  `component.ts`, `info-hint.tsx`, `ContactStep/index.tsx`) **e foram restaurados byte-a-byte antes de
  qualquer commit** — `git diff`/`git status --porcelain` confirmado vazio arquivo por arquivo.
- **A frente inteira fecha com 9 commits** (T1, E-C2, T2, T3, T4, T5, T6, T7, T8) — nenhum squash, cada
  um um snapshot 100% verde no momento em que foi feito (pre-commit hook nunca pulado com `--no-verify`).
- **O caminho crítico do plano (T1 → T3 → T7 → T8) fechou na ordem prevista**; T6 rodou disjunto como
  esperado (não bloqueou nada); T2/T4/T5 penduraram em T1/T3 como folgas curtas.
