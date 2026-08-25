# Readequação codm ↔ template — plano de implementação (pós-grill)

**Status:** Approved (2026-08-14) — o founder colar o GOAL 1 (frentes F2–F4) É a aprovação. Os
ADRs 0001/0002/0003 já constavam como `aceito` desde o grill; as duas specs do escopo
(`2026-08-14-pare-e-reporte-t1-familia-pg.md`, `2026-08-14-relatorio-t1-linha-eixos.md`) são
relatórios de medição, não portadores de decisão, e por isso não carregam campo de status.
**Escopo aprovado agora: F2, F3 e F4.** F5–F8 seguem descritas aqui como roteiro e dependem do
GOAL 2 — em particular a F5, cujo defeito de desenho (`external`) continua ABERTO.

> **Para workers agênticos:** os passos usam checkbox (`- [ ]`). Fases 1–4 estão detalhadas para
> execução direta. Fases 5–8 são o roteiro sequenciado e **exigem plano próprio** antes de rodar —
> ver §"Escopo deste plano".

**Goal:** Levar o codm a passar integralmente os gates, rails e testes do template, e devolver ao
template o que o codm faz melhor — sob o desenho que o grill de 2026-08-14 estabeleceu, não sob o
desenho da spec original.

**Architecture:** A nuvem é dona da identidade e da tenancy (`auth` + `owner`, cloud-only, Postgres);
o desktop é dono do trabalho local (8 contextos, SQLite compartilhado com o sidecar Go); `shared` é
o único contexto que vive nos dois e a única fronteira de família. A composição deixa de ser efeito
colateral de import e passa a ser uma tabela por contexto, cobrada pelo compilador.

**Tech Stack:** Bun · TypeScript · tsyringe-neo · Drizzle (libsql + pg) · Go (sqlc/sqlite, fx) ·
React + TanStack Router · Tauri v2 · Playwright · eslint (regras locais) · detectores próprios.

**Specs que este plano implementa:**
- `.specs/2026-08-14-prompt-migracao-codm.md` — o briefing original (as 17 decisões)
- `docs/adr/0001-identidade-vem-da-nuvem.md`
- `docs/adr/0002-tabela-de-alocacao-por-contexto.md`
- `docs/adr/0003-className-vale-para-componente-privado.md`
- `.specs/2026-08-14-pare-e-reporte-t1-familia-pg.md` — por que a T1 original parou
- `.specs/2026-08-14-relatorio-t1-linha-eixos.md` — o que foi entregue e o defeito aberto
- `CONTEXT.md` — glossário (Owner, Operator, Sessão, Device Token, Channel × Release Track)

## Global Constraints

- **Exit code sem pipe.** `cmd > arquivo 2>&1; echo "EXIT=$?"`. Nunca `| tee`, `| tail`, `| grep`
  entre o comando e a captura — o código de saída capturado seria o do último filtro.
- **Todo gate entra com testemunha que reprova.** Rode o falseador ANTES do fix e cole a saída.
- **Artefato gerado se regenera, nunca se edita à mão.**
- **Ausente no HEAD ≠ nunca existiu.** `git log --all --diff-filter=A -- <caminho>` antes de
  concluir que algo não foi construído.
- **`.env` intocável.**
- **Sem gambiarra.** Se a adequação exigir `if` de caso especial, cast ou camada nova: PARE e
  reporte. A abstração provavelmente está errada e o codm acabou de provar.
- **Caminho absoluto em todo comando**, e `pwd` antes de agir — os dois repos têm estrutura quase
  idêntica e já se perdeu uma sessão inteira por âncora errada.
- **Nada pushed.** Commits locais apenas.
- Repos: template `/Users/work/Desktop/Projetos/pessoal/template-fullstack` (branch
  `feat/upstream-harness`) · codm `/Users/work/Desktop/Projetos/pessoal/codm` (branch
  `feat/eixo-ambiente-go`).

---

# OS INVIOLÁVEIS — valem em toda onda, e os goals citam esta seção

1. **Sem gambiarra.** Se a adequação exigir `if` de caso especial, cast ou camada nova: **PARE e
   reporte**. A abstração provavelmente está errada e o repo acabou de provar — e esse achado vale
   mais que o workaround.
2. **Nenhum gate entra sem testemunha que reprova.** Rode o falseador ANTES do fix e cole a saída.
   Corolário aprendido nesta sessão: **gate que entra e acha ZERO precisa dizer por que zero é o
   número certo aqui** — senão é afirmação, não resultado.
3. **Artefato gerado se regenera, nunca se edita à mão.**
4. **Ausente no HEAD ≠ nunca existiu** — `git log --all --diff-filter=A -- <caminho>` antes de
   concluir que algo não foi construído.
5. **`.env` intocável.**
6. **Antes de teorizar sobre lentidão ou flakiness, MEÇA.** As stories do `FullDiskAccessCard` são
   flaky ~25% e já falsearam um bisect nesta sessão — medição instável falsifica conclusão estável.
7. **Perguntas em prosa ou `AskUserQuestion`** (≤4 por rodada, recomendação primeiro).
8. **Caminho absoluto em todo comando, e `pwd` antes de agir.** Os dois repos têm estrutura quase
   idêntica; já se perdeu uma sessão inteira por âncora errada.

---

# A BATERIA CANÔNICA — a lista que os goals citam

Exit code sempre capturado sem pipe: `cmd > arquivo 2>&1; echo "EXIT=$?"`. Nunca `| tee`, `| tail`
ou `| grep` entre o comando e a captura.

**codm** (12):
```
bun tsc · bun lint · bun run test · bun detect · bun test:tooling · bun check:generated
bun sync:check · bun e2e
cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit
cd packages/contracts && bun test codegen/
cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts --check
cd packages/api/go && go build ./... && go test ./...
```

**template** (5): `bun tsc` · `bun lint` · `bun run test` · `bun test:tooling` · `bun detect`

**Três nuances que valem mais que a lista:**

1. **No codm, `bun run test` e `bun detect` estão VERMELHOS no HEAD** por dívida pré-existente (3
   falhas de frontend, 1 finding de `go-enum-literals`). Compare removendo o diff antes de atribuir
   qualquer vermelho à onda. **No template não há dívida vermelha**: ele fechou 5/5 em `bc7bda61b`,
   então lá vermelho é da onda.
2. **`bun tsc` pode ser verde POR CACHE do nx.** Medido nesta sessão: a bateria dava `EXIT=0`
   enquanto o código tinha 2 erros reais, e só apareceram quando um diff invalidou o cache. Rode
   `bun tsc --skip-nx-cache` ao menos uma vez por onda.
3. **Onda que mexe em contrato/SDK** ganha `cd packages/app/react && bun x tsc` como gate extra.

---

# A auditoria das 17 decisões — o que sobreviveu ao contato

Isto é o coração da re-derivação. A spec original foi escrita **lendo** código; o grill e a
primeira execução **rodaram** código. Sete decisões mudaram de forma ou morreram.

| # | Decisão original | Veredito | Por quê |
|---|---|---|---|
| 1 | codm é libsql; pg entra para a nuvem. Duas famílias vivas. | **SOBREVIVE, reformada** | pg deixa de ser "a segunda família de todo contexto" e passa a ser a família **do deployment de nuvem**. Só `shared` roda nas duas. |
| 2 | O conjunto duplo é `auth`+`owner`+`shared` | **MORREU** | `auth` e `owner` são **cloud-only** (ADR 0001) — não são duais, são exclusivos. O conjunto duplo é `{shared}`. |
| 3 | Nuvem autoritativa, local é cache de leitura, sem reconciliação | **SOBREVIVE, e só agora é coerente** | Owner não existe localmente, então não há dois criadores e não há o que reconciliar. Antes, `CreateOwner` montava local e a decisão era falsa na prática. |
| 4 | Família é módulo que se compõe, não escolha em runtime | **SOBREVIVE intacta** | Continua sendo o que torna `PgUoW + LibSqlRepo` inexprimível. |
| 5 | `InfraChoices` é a única declaração de eixos; `InfraModules` deriva | **SOBREVIVE** | Já construído em `src/shared/deployment.ts` (commit `f423a750`), com falseador (a) medido. |
| 6 | Critérios são registro aberto; `planFor` total | **SOBREVIVE, reforçada** | O ADR 0002 fortalece: a tabela não pode cravar `deployment` como eixo. |
| 7 | `tier` não é critério de composição | **SOBREVIVE** | Régua inalterada. |
| 8 | Plano é tabela exaustiva: `local` sem `Partial`, `cloud` `Partial` | **MUDOU (ADR 0002)** | Com `auth`/`owner` cloud-only, "local monta todos" ficou falso. A exaustividade migra para uma tabela **por contexto**; os planos por deployment passam a ser derivados. |
| 9 | Composição explícita; `ContextDescriptor`; `create` muda de dono | **SOBREVIVE** | Nada no grill a contradiz. |
| 10 | `cloud-profile.ts` é apagado | **SOBREVIVE, parcialmente feito** | `CLOUD_CONTEXTS` já é derivado de `PLANS.cloud`. `isCloudProfile` e `filterRoutersForCloudProfile` morrem com a composição explícita. |
| 11 | Um `registry.ts` por contexto, `INFRA` nos três duais | **MUDOU** | Só `shared` é dual. E há **defeito aberto**: `external` não tem binding de família nenhum (`expandBindings([])`), mas `InfraChoices` exige `db`. |
| 12 | Amarra bidirecional no boot | **SOBREVIVE, mas BLOQUEADA** | Depende de resolver o defeito do `external` (§Fase 5, Task 5.1). |
| 13 | Go é sidecar local-only; sqlc segue sqlite; ganha disciplina, não código | **SOBREVIVE, e cresceu** | Medido: o sqlc do codm gera **dentro do kernel** (`core/db/sqlite/gen/`), com 7 contextos de produto — inversão de direção de dependência. E não há gate de paridade. |
| 14 (i) | Perfil cloud sobe e 404 nos demais | **SOBREVIVE** | Fica mais barato: contexto não montado nem carrega. |
| 14 (ii) | Perfil local sobe com os **10** contextos + sidecar Go | **MUDOU** | São **8** (os 10 menos `auth` e `owner`). |
| 14 (iii) | O mesmo e2e do `owner` nas DUAS famílias | **MORREU** | `owner` passa a existir em uma composição só. Substituído por 4 testemunhas (Fase 8). |
| 15 | Demos são artefato; codm adota o `demo-gate` | **SOBREVIVE** | A tabela do codm tem 4 alvos (sem expo). |
| 16 | Os 10 e2e existentes são a lista de fluxos | **SOBREVIVE** | |
| 17bis | **VERTICAL primeiro** — `owner` sozinho, ponta a ponta | **MORREU** | Medido: `routers.ts` é `satisfies Record<ContextModule, Router>` (exaustivo) e importá-lo executa os 10 `BoundedContext.create`. Tirar só `owner` quebra o `tsc`; deixá-lo mantém o efeito colateral. **O corte é por CAMADA, não por contexto.** |

**Decisões novas, do grill** (`docs/adr/`): identidade vem da nuvem e `auth` é cloud-only (0001);
tabela por contexto, aberta a critérios (0002); `className` vale para componente module-private
(0003).

---

# Escopo deste plano

**Fases 1–4 estão detalhadas para execução.** São independentes entre si, mecânicas, de alto valor
e não dependem de nenhuma pergunta aberta.

**Fases 5–8 estão especificadas como entregável + testemunha + gates, e exigem plano próprio.**
Cada uma é um subsistema: a composição (5) toca os 10 contextos e o boot; a identidade (6) muda a
fronteira de autenticação e a SDK; a família pg (7) toca kernel, contracts e migrações; a validação
(8) depende das três. Detalhá-las aqui em passos de 2–5 minutos produziria um documento que
ninguém lê e que envelhece antes de ser executado — e a Fase 5 ainda tem um defeito de desenho
aberto (o `external`) cuja resolução muda a forma das tasks seguintes.

---

# Estrutura de arquivos

**Já existentes, a modificar:**
- `packages/api/typescript/src/shared/deployment.ts` — a linha de eixos. Existe; será **reescrita**
  na forma do ADR 0002 (Fase 5).
- `packages/api/typescript/src/shared/cloud-profile.ts` — `CLOUD_CONTEXTS` já derivado; o arquivo
  inteiro morre na Fase 5.
- `packages/api/typescript/src/routers.ts` — vira `manifest.ts` (descritores) na Fase 5.
- `packages/api/typescript/src/server.ts` — ganha o laço de composição na Fase 5.
- `packages/api/go/core/db/sqlite/**` — sai do kernel na Fase 4.
- `scripts/detectors/run-all.ts` — ganha `gate-vacuity` na Fase 3.

**A criar:**
- `scripts/lib/repo-files.ts`, `scripts/lib/strip-comments.ts` — pré-requisitos do `gate-vacuity`.
- `scripts/detectors/gate-vacuity.ts` + `.test.ts`.
- `scripts/detectors/projection-shape.test.ts`, `scripts/detectors/run-all.test.ts`.
- `scripts/sqlc-parity.test.ts`.
- `packages/api/typescript/src/manifest.ts` (Fase 5).
- `packages/api/typescript/src/shared/middlewares/CloudSessionMiddleware.ts` (Fase 6).

---

# FASE 0 — o que já está feito (não refazer)

- [x] **Coerência**: briefing auditado contra os dois repos —
  `template-fullstack/.specs/2026-08-14-coerencia-briefing-vs-repos.md`.
- [x] **T0 no template** (`63536017d`): 14 registries Go repontados para `packages/api/go/**`,
  `examples/citizens/` apagado (44 arquivos), 4ª ref morta removida. Bateria 5/5 verde. Falseador
  com saída colada.
- [x] **Linha de eixos v1 no codm** (`f423a750`): `InfraChoices`/`InfraModules`/`PLANS`/`planFor`,
  `CLOUD_CONTEXTS` derivado. Falseador (a) medido (`EXIT=2`). **Será reescrita na Fase 5.**
- [x] **ADRs + glossário** (`23921651`).
- [ ] **Fase 1 abaixo** — em voo no momento em que este plano foi escrito.

---

# FASE 1 — `className` para componente module-private (codm)

**Contexto:** ADR 0003. A regra `local/component-props` só avaliava componentes exportados; 36
componentes module-private renderizavam root sem `className`, 25 deles em 4 arquivos.

**Files:**
- Modify: `scripts/eslint-rules/component-props.ts` (população + docblock; remoção de
  `exportedNames`/`isDefaultExported`)
- Modify: `scripts/eslint-rules/component-props.test.ts` (a testemunha)
- Modify: 11 arquivos em `packages/app/react/src/**`

**Interfaces:**
- Produz: a regra passa a reportar sobre qualquer componente com host root. Nenhuma assinatura
  pública muda.

- [x] **Step 1: medir o ponto cego ANTES de mudar**

```bash
cd /Users/work/Desktop/Projetos/pessoal/codm
# remover a linha de exceção, rodar, contar, reverter
bun x eslint packages/app/react/src > /tmp/wide.txt 2>&1; echo "EXIT=$?"
grep -c 'local/component-props' /tmp/wide.txt
```
Esperado: **36**, `EXIT=1`.

- [x] **Step 2: alargar a população**

Em `scripts/eslint-rules/component-props.ts`, remover:
```ts
if (!exported.has(name) && !isDefaultExported(node)) return
```
e, com ela, `const exported = exportedNames(...)`, a função `exportedNames` e `isDefaultExported`
(ficam sem uso — 32 linhas de código morto).

- [x] **Step 3: migrar a testemunha de `valid` para `invalid`**

O caso `"a module-private helper has no caller outside its own file"` codificava a doutrina antiga.
Vira:
```ts
{
  // THE WITNESS for the 2026-08-14 doctrine widening. […] Move it back to `valid` and the
  // widening silently stops being enforced.
  name: 'a module-private helper owes className too — export shape is not an exemption',
  filename: APP,
  code: `${REACT}function Cell({ value }: { value: string }) { return <td>{value}</td> }\nexport function Row({ className, ...props }: ComponentProps<'tr'>) { return <tr className={className} {...props}><Cell value="x" /></tr> }`,
  errors: [{ messageId: 'noSurface' }],
},
```

- [x] **Step 4: corrigir o fixture da exemption (b), que estava errado**

`Inner` aceitava `className` mas não espalhava props tendo vocabulário completo de root:
```ts
function Inner({ className, ...props }: ComponentProps<'div'>) { return <div className={cn(className)} {...props} /> }
```

- [x] **Step 5: rodar a suíte da regra**

```bash
bun test scripts/eslint-rules/component-props.test.ts > /tmp/rt.txt 2>&1; echo "EXIT=$?"
```
Esperado: `EXIT=0`, 32 pass.

- [x] **Step 6: corrigir os 36 componentes**

Forma canônica, para cada violação — estender o tipo com o vocabulário do root, desestruturar
`className` + `...props`, e no root fazer merge com `cn()`:
```tsx
export function ArtifactsSection({ threadId, className, ...props }: ComponentProps<'div'> & { threadId: string }) {
  return <div className={cn('grid items-start gap-4 py-4 sm:grid-cols-2', className)} {...props}>…</div>
}
```
Só o root. Preservar as classes existentes exatamente, apenas envolvidas em `cn(..., className)`.

- [x] **Step 7: lint limpo**

```bash
bun x eslint packages/app/react/src > /tmp/after.txt 2>&1; echo "EXIT=$?"
```
Esperado: `EXIT=0`, zero `local/component-props`.

- [ ] **Step 8: bateria + commit**

```bash
cd /Users/work/Desktop/Projetos/pessoal/codm
bun tsc > /tmp/g1.txt 2>&1; echo "tsc EXIT=$?"
bun lint > /tmp/g2.txt 2>&1; echo "lint EXIT=$?"
bun run test > /tmp/g3.txt 2>&1; echo "test EXIT=$?"
bun test:tooling > /tmp/g4.txt 2>&1; echo "tooling EXIT=$?"
bun detect > /tmp/g5.txt 2>&1; echo "detect EXIT=$?"
```
**Atenção:** `bun run test` e `bun detect` estão **vermelhos no HEAD por dívida pré-existente**
(3 falhas de frontend em onboarding/msw; 1 finding gating em `go-enum-literals`). Compare contra a
linha de base antes de atribuir qualquer vermelho a esta fase — o método é remover o diff e rodar
de novo.

```bash
git add scripts/eslint-rules packages/app/react/src docs/adr/0003-*.md
git commit -m "feat(lint): className vale para componente module-private, com a testemunha"
```

---

# FASE 2 — a rodada de volta ao template (codm → template)

**Contexto:** o template tem **a mesma** exceção de export shape (linha 289, idêntica) e **8
findings** em 2 arquivos — `DataTable/DataTableContent.tsx` (5) e `Navbar/index.tsx` (3). Os mesmos
dois arquivos aparecem na lista do codm: é dívida herdada da ancestralidade comum.

E o template está **atrás** numa segunda frente: o detector velho ainda emite `CP-01`/`CP-02`,
duplicando a doutrina que a regra eslint já aplica, reporta 0 findings e **não tem teste**. É um
gate vacuoso convivendo com o gate real. O codm já terminou essa migração.

**Files:**
- Modify: `scripts/eslint-rules/component-props.ts` (mesma mudança da Fase 1)
- Modify: `scripts/eslint-rules/component-props.test.ts` (mesma testemunha)
- Modify: `scripts/detectors/component-props.ts` (reduzir a `CP-03` só)
- Create: `scripts/detectors/component-props.test.ts` (portar do codm)
- Modify: `packages/app/react/src/components/DataTable/DataTableContent.tsx`,
  `packages/app/react/src/components/Navbar/index.tsx`

- [ ] **Step 1: medir antes**

```bash
cd /Users/work/Desktop/Projetos/pessoal/template-fullstack
# com a linha 289 removida:
bun x eslint packages/app/react/src > /tmp/t.txt 2>&1; echo "EXIT=$?"
grep -c 'local/component-props' /tmp/t.txt
```
Esperado: **8**, `EXIT=1`. (Medido em 2026-08-14.)

**Correção:** a versão anterior deste comando incluía `packages/app/expo`, e isso produz 22 erros
não relacionados (require-imports, no-undef, …) que fazem o `EXIT` parecer falha da frente. O
`expo` tem alvo `lint` PRÓPRIO em `project.json` — `bun x eslint` direto nele **não é o gate do
repo** e usa outra configuração. O gate real é `bun lint` (nx run-many), que fica em 0. Os 8
findings estão todos em `packages/app/react`.

- [ ] **Step 2–5:** repetir os Steps 2–5 da Fase 1 no template (alargar, testemunha, fixture,
  suíte).

  **Correção (verificador F3 da condição 0):** a frase anterior aqui — *"o arquivo é a mesma versão,
  349 linhas nos dois, 36 linhas de diff, todas prosa"* — estava **errada**. Medido: template 349
  linhas, codm **330**; o diff tem 8 hunks, dos quais **3 são código** (a linha da exceção, o
  `const exported`, e as funções `isDefaultExported`/`exportedNames` — 35 linhas) e 4 são prosa. As
  *categorias* estavam certas; os números eram de outra medição. A lógica de regra continua sem
  divergência entre os dois.

- [ ] **Step 6: corrigir os 8 componentes**

`DataTableHeader`, `DataTableBody`, `DataTableRow`, `DataTableEmpty`, `DataTableLoading` (roots
`<TableHeader>` / `<TableBody>` / `<TableRow>`); `LogoSection`, `NavigationEntry`, `LogoutSection`
(root `<div>`). Mesma forma canônica da Fase 1, Step 6.

- [ ] **Step 7: terminar a migração detector→eslint que o codm já fez**

Reduzir `scripts/detectors/component-props.ts` a `CP-03` apenas (route shell não chama hook de
dados), removendo `CP-01`/`CP-02` — que a regra eslint já aplica e melhor. Portar
`scripts/detectors/component-props.test.ts` do codm (41 linhas: predicados `dataHookCall` e
`isRouteShell` com pares true/false).

Falseador desta etapa: antes do teste existir, o detector reporta 0 findings e nada prova que ele
sabe reprovar. Depois, os pares negativos do teste falham se a lógica quebrar.

- [ ] **Step 8: bateria do template + commit**

```bash
bun tsc; echo "EXIT=$?"   # e lint, run test, test:tooling, detect — cada um sem pipe
```
Esperado: 5/5 `EXIT=0` (o template estava 5/5 verde após a T0).

---

# FASE 3 — `gate-vacuity`, e o bug que ele já acha

**Contexto e justificativa:** o codm tem 6 detectores, o template 9. Falta, entre outros, o
`gate-vacuity` — o rail cujo trabalho é pegar prova cujo exit code **não consegue** ser diferente de
zero. Rodando o do template contra o codm: **1 finding, exit 1**.

O achado é real e está em produção:

```
docker/Dockerfile.api:46   RUN bun --cwd packages/api/typescript run build
```

Provado nesta sessão:
```
bun --cwd <dir> run <script>   → EXIT=0, imprime usage, NÃO executa
bun run --cwd <dir> <script>   → EXIT=1, "Script not found"
```
A etapa de build da imagem Docker da API **nunca rodou e sempre passou**.

**Correção de enquadramento (verificador F3):** este bug **já era conhecido**. O comentário em
`docker/cloud.Dockerfile:58-62` o nomeia explicitamente — *"`bun run --cwd <path> <script>` — NOT
`bun --cwd <path> run <script>` (docker/Dockerfile.api uses the latter)… flagged as a pre-existing
defect… out of this task's scope to fix there"*. Não é descoberta do `gate-vacuity`; é um defeito
já sinalizado por uma task anterior que **nunca ganhou gate nem conserto**. O valor do
`gate-vacuity` aqui não é achar — é impedir que volte.

**Files:**
- Create: `scripts/lib/repo-files.ts`, `scripts/lib/strip-comments.ts` (+ testes) — pré-requisitos
- Create: `scripts/detectors/gate-vacuity.ts` (369 ln) + `gate-vacuity.test.ts` (345 ln)
- Modify: `scripts/detectors/run-all.ts` (registrar)
- Modify: `docker/Dockerfile.api:46`

- [ ] **Step 1: portar os pré-requisitos**

Copiar do template `scripts/lib/repo-files.ts` (33 ln) e `scripts/lib/strip-comments.ts` (561 ln)
com seus testes (67 e 664 ln). Rodar `bun test scripts/lib`.

**Correção (verificador F3):** é **cópia pura, sem retarget**. Nenhum dos três arquivos toca
`template.config` — `repo-files.ts` importa só `node:child_process`, `strip-comments.ts` não
importa nada. Provado ao vivo: o detector do template rodou contra a árvore do codm via
`ROOT_OVERRIDE`, sem modificação, e reproduziu o achado.

- [ ] **Step 2: portar o detector com o teste JUNTO**

Copiar `gate-vacuity.ts` + `gate-vacuity.test.ts`. O teste é a testemunha: sem ele, um detector de
gate vacuoso seria ele próprio um gate vacuoso.

- [ ] **Step 3: rodar — deve REPROVAR**

```bash
bun scripts/detectors/gate-vacuity.ts > /tmp/gv.txt 2>&1; echo "EXIT=$?"
```
Esperado: `EXIT=1`, apontando `docker/Dockerfile.api:46` (GV-03).
**Colar esta saída no relatório** — é o falseador desta fase, e ele é um bug de verdade, não um
plantado.

- [ ] **Step 4: consertar o Dockerfile**

```dockerfile
RUN bun run --cwd packages/api/typescript build
```

- [ ] **Step 5: provar que a correção funciona E que o build de fato roda**

```bash
bun scripts/detectors/gate-vacuity.ts > /tmp/gv2.txt 2>&1; echo "EXIT=$?"   # esperado 0
docker build -f docker/Dockerfile.api . > /tmp/db.txt 2>&1; echo "EXIT=$?"
```
O segundo comando é o que importa: se a imagem **agora** falha, o build estava quebrado há tempo e
o no-op escondia. Isso é achado, não regressão — reporte, não contorne.

- [ ] **Step 6: registrar o detector**

Em `scripts/detectors/run-all.ts`, adicionar `['gate-vacuity', []]` à lista **e trocar
`const DETECTORS` por `export const DETECTORS`** — hoje o codm não exporta (o template exporta), e
sem isso o `run-all.test.ts` do Step 7 (`import { DETECTORS } from './run-all'`) não compila.
Omissão apontada pelo verificador F3.

- [ ] **Step 7: fechar o buraco irmão — `run-all.test.ts` e `projection-shape.test.ts`**

O codm não tem gate que garanta que um detector no disco está registrado na lista (o template tem
`run-all.test.ts`, 36 linhas). E `projection-shape` são 184 linhas com 0 findings e **nenhum
teste** — o único detector inequivocamente vacuoso do codm. Portar os dois testes.

- [ ] **Step 8: bateria + commit**

## O que a F3 mediu, e o que ela ensinou

**Inventário da varredura (condição 2), feito ANTES do fix:**

| Regra | Vivos | Em comentário | Nota |
|---|---|---|---|
| GV-01 (pipe engole exit status) | **0** | — | há pipes no repo, mas nenhum seguido de leitura de `$?`/`PIPESTATUS`, que é o que a regra exige |
| GV-02 (`PIPESTATUS` sob zsh/sh) | **0** | — | o símbolo só aparece nos regexes do próprio detector |
| GV-03 (`bun --cwd <dir> run`) | **1** | 3 | vivo: `docker/Dockerfile.api:46`. Comentados: `Dockerfile.app:42-43` e `cloud.Dockerfile:59` |

Cobertura de Go: os `.go` não entram no corpus do detector **por desenho** — não há pipe de shell
em fonte Go. O ferramental Go (`go build`/`go test`) é invocado por `package.json` e workflows, que
**estão** no corpus. Varredura com `--include='*.go'` feita mesmo assim: zero.

**Condição (3) GO-SHARING — não se aplica, e a razão fica dita.** Nenhuma regra language-agnostic
nova nasce aqui. Medido: `gate-vacuity` não aparece em registry de skill nenhum no template
(enquanto `import-direction` e `slice-closure` aparecem). Registry de skill mapeia **artefato de
domínio** → má prática; `gate-vacuity` é higiene de ferramental e não tem casa de skill em nenhum
dos dois repos.

**Duas armadilhas de porte, ambas da mesma família da F2** — a regra porta limpa, a forma do módulo
em volta não:

1. **`run-all.ts` do codm executava no topo do módulo.** O template tem `if (import.meta.main)`;
   o codm não tinha. Importar `DETECTORS` (que é o que `run-all.test.ts` faz) **disparava os sete
   detectores** como efeito colateral. Guarda aplicada.
2. **O piso de não-vacuidade é por repo.** O teste do template afirma `onDisk.length >= 8` (tem 9);
   o codm tem 7. Ajustado para 7, com a razão no comentário — é piso contra glob vazio, não ratchet.

**Defeito no `projection-shape` que só apareceu ao escrever a testemunha:** o check de
`switch (event.name)` da **PS-04 é de arquivo inteiro, não escopado ao `applyEvent`**. Uma
projection cujo `applyEvent` NÃO tem o switch, mas cujo `static create` tem, passa sem ser
acusada — falso negativo. Descoberto porque o teste falhava pelo motivo errado ao tentar isolar a
regra. **Não consertado aqui** (é redesenho de detector, não porte); registrado, e o teste
documenta a limitação no comentário do caso.

**E o build nunca esteve quebrado — ele nunca rodou.** `bun run build` em
`packages/api/typescript` fecha `EXIT=0` e produz `dist/server.js` (9,65 MB, 3581 módulos). Ou
seja, a imagem Docker da API vinha sendo construída **sem o bundle que o estágio 2 copia**. O
no-op não escondia um build quebrado; escondia a ausência do build.

---

# FASE 4 — sqlc sai do kernel, e ganha gate de paridade

> ## 🛑 PARE COM ACHADO — a Step 4 desta fase está BLOQUEADA
>
> A condição de parada que a própria Step 4 declarava (*"Se algum consumidor do kernel importar o
> gerado, PARE"*) **já é verdadeira hoje**, e é determinável sem executar nada. O verificador da
> condição (0) mediu:
>
> **Importadores dentro do kernel** (`core/`, módulo `template/core-go`):
> - `core/db/sqlite/store.go` — o `SqliteStore` guarda um `*sqlitedb.Queries`
> - `core/repositories/sqlite_domain_event_repository.go` — usa `sqlitedb.InsertEventParams`
> - `core/db/sqlite/store_test.go` — usa `InsertOutboxRowParams`, `ListUnprocessedParams`, `MarkProcessedParams`
>
> **Importadores no módulo da app** (`internal/`): 5 arquivos, todos em `internal/channel/repositories/`.
>
> **Por que isso não é acoplamento acidental:** o sqlc emite **UM pacote Go e UMA struct `Queries`
> para o schema inteiro**. O uso legítimo do kernel (outbox, events, idempotency — infra que é dele
> mesmo) e as 21 structs de produto (`GatewayChannel`, `IssueIssue`, `ArtifactArtifact`…) moram no
> mesmo pacote, por construção da ferramenta.
>
> **Consequência:** mover `gen/` para o módulo da app faria o **kernel importar a app** — inversão
> pior que a de hoje. "Mover + ajustar imports" não é o trabalho; o trabalho é **separar a saída do
> sqlc**, e isso é mudança de desenho, não mecânica.
>
> ### DECISÃO DO FOUNDER (2026-08-14): saída 1 — dois configs, e vira PADRÃO
>
> *"O core pode ter seu próprio sqlc mas para schemas somente referentes ao core, tendo também sua
> própria pasta de queries, possivelmente teremos 2 configs de sqlc, mas isso tem que ser definido
> corretamente e dado como padrão."*
>
> **Medição que confirma a viabilidade** (feita antes de desenhar): das 29 tabelas do
> `schema.sql`, **4 são do core** (`shared_events`, `shared_idempotency_keys`, `shared_outbox`,
> `shared_scheduled_commands`) e 25 são de produto. **Nenhuma FK toca uma tabela `shared_*`** — as
> 6 FKs do schema são todas produto→produto (`authentication_users`, `gateway_remotes`). O corte é
> limpo: o schema do core é autocontido, sem referência pendurada.
>
> O corte das queries também já é limpo hoje: `query/events.sql` e `query/outbox.sql` são do core
> (é exatamente o que os 3 importadores do kernel usam — `InsertEventParams`,
> `InsertOutboxRowParams`, `ListUnprocessedParams`, `MarkProcessedParams`); os outros 7
> (`artifact`, `channel`, `issue`, `owner`, `thread`, `ui`, `workspace`) são de produto.
>
> **O problema que ainda precisa de desenho, e é o que "definir corretamente" quer dizer:** o sqlc
> gera `models.go` para **todo o schema que recebe** — não há como excluir tabelas. Então cada
> config precisa de um `schema.sql` próprio contendo só as suas tabelas. Isso cria **um segundo
> artefato derivado**, e artefato derivado não se escreve à mão (inviolável). O `schema.sql` de
> hoje já é transcrito por um ritual manual de `tr`+`sed` sem gate; a solução não pode ser dois
> rituais manuais. O desenho tem de **derivar os dois schemas das migrações por script
> determinístico, com gate** — e é isso que torna a coisa padrão em vez de remendo.
>
> **Saídas possíveis, nenhuma tomada aqui** (decisão do founder):
> 1. **Dois `sqlc.yaml`** — um gera só as tabelas de infra dentro de `core/`, outro gera as de
>    produto no módulo da app. Custo: dois configs, dois `schema.sql` (ou um com `exclude`), e a
>    pergunta de onde ficam as tabelas que os dois leem.
> 2. **Tudo fica no kernel e o defeito é aceito como conhecido**, com o gate de paridade entrando
>    mesmo assim (Steps 1–3 e 5–6 seguem válidos e desbloqueados).
> 3. **`gen/` vai para um terceiro módulo** que nem kernel nem app possuem, e ambos importam.
>
> **Steps 1, 2, 3, 5 e 6 desta fase seguem VÁLIDOS e podem rodar** — o gate de paridade
> (`sqlc-parity.test.ts`) não depende de onde o pacote mora. Só a Step 4 está parada.
>
> Nota do verificador: `sqlc` **está instalado** nesta máquina (`/opt/homebrew/bin/sqlc`, v1.31.1),
> então o gate roda de verdade em vez de cair no `skipIf` — que, aliás, é uma vacuidade herdada do
> template: sem `sqlc` no PATH, os dois testes que importam **pulam em silêncio**.

**Contexto:** medido — `packages/api/go/core/` é módulo próprio (`module template/core-go`, o
kernel) e `core/db/sqlite/gen/` contém `artifact`, `channel`, `issue`, `owner`, `thread`, `ui`,
`workspace` — **sete bounded contexts de produto dentro do kernel**. `models.go` declara
`ArtifactArtifact`, `GatewayChannel`, `IssueIssue`, `AuthenticationUser`…

O template gera em `./internal/shared/db/gen` (pacote `dbgen`), no módulo da **app**, pela razão que
o briefing dá: *"produto no kernel inverteria a direção de dependência"*.

Segundo defeito: a cadeia do sqlc do codm tem **dois elos sem gate**. O template lê as migrações do
drizzle **direto**; o codm lê um `schema.sql` **re-transcrito à mão** (ritual de `tr`+`sed`
documentado num comentário do `sqlc.yaml`), e nada roda `sqlc diff`. O `db:check-go` existente
guarda outra aresta (migração ↔ cópia `//go:embed`).

**Decisão 13 continua valendo:** o sqlc do codm **segue sqlite**. O que muda é onde ele gera e o
gate.

- [ ] **Step 1: falseador do gate de paridade, ANTES do gate existir**

Corromper `gen/models.go` à mão e mostrar que **nada** acusa hoje:
```bash
cd /Users/work/Desktop/Projetos/pessoal/codm
cp packages/api/go/core/db/sqlite/gen/models.go /tmp/models.bak
echo "// corrupção proposital" >> packages/api/go/core/db/sqlite/gen/models.go
bun test:tooling > /tmp/t.txt 2>&1; echo "EXIT=$?"    # esperado: 0 — ninguém vê
cp /tmp/models.bak packages/api/go/core/db/sqlite/gen/models.go
```
Colar a saída: um `EXIT=0` aqui É o achado.

- [ ] **Step 2: portar `scripts/sqlc-parity.test.ts`**

Do template (71 linhas), retargetado: `GO_DIR = packages/api/go/core/db/sqlite`, asserir
`schema: "schema.sql"`, asserir que `gen/models.go` existe, rodar `sqlc diff`, e o **quarto teste**
— o que corrompe o gerado, exige `sqlc diff ≠ 0`, restaura e re-exige 0.

- [ ] **Step 3: rodar o falseador de novo — agora deve REPROVAR**

Repetir o Step 1. Esperado agora: `EXIT=1`, nomeando o arquivo corrompido.

- [ ] **Step 4: mover a saída do sqlc para o módulo da app**

`sqlc.yaml`: `out` passa de `gen` (dentro de `core/`) para o módulo da app. Regenerar com `sqlc`,
**nunca editar o gerado**. Ajustar imports em todo consumidor Go.

Se algum consumidor **do kernel** importar o gerado, PARE: isso significa que o kernel depende de
produto por outro caminho também, e é achado maior que esta task.

- [ ] **Step 5: gates Go**

```bash
cd /Users/work/Desktop/Projetos/pessoal/codm/packages/api/go
go build ./... ; echo "build EXIT=$?"
go test ./... ; echo "test EXIT=$?"
cd core && go build ./... ; echo "core build EXIT=$?" && go test ./... ; echo "core test EXIT=$?"
```

- [x] **Step 6: bateria completa + commit**

Inclui `bun sync:check` e `bun check:generated`, que tocam a cópia `//go:embed`.

## O que a F4 mediu — e o gate achou algo maior que o falseador plantado

**O falseador, com o retrato completo de quem é cego.** Corrompi `gen/models.go` (um campo que não
existe no schema) e medi cada gate:

| Comando | EXIT | Vê? |
|---|---|---|
| `bun test:tooling` | **0** | não |
| `db:check-go` | **0** | não — guarda outra aresta (migração ↔ cópia `//go:embed`) |
| `go build ./...` (app) | **0** | não — struct a mais compila |
| `go build ./...` (core) | **0** | não |
| `go test ./...` (ambos) | **0** | não |
| **`sqlc diff`** | **1** | **sim, e só ele** |

**O achado que o gate expôs, e que não era plantado: o gerado JÁ ESTAVA VELHO.** Com o `gen/` no
estado commitado, `sqlc diff` reprovava com **150 linhas** de divergência. Faltavam structs
inteiras — `AuthenticationDeviceCode`, `AuthenticationDeviceToken`, `OwnerOnboarding`, `ThreadLoop`
— e a assinatura de `ListTranscriptByThread` estava desatualizada (passou a devolver
`[]ListTranscriptByThreadRow` em vez de `[]ThreadTranscriptEntry`).

**Por que ninguém percebeu.** O `sqlc.yaml` documenta um ritual de **quatro** passos
(drizzle generate → `db:sync-go` → re-transcrever `schema.sql` → `sqlc generate`), e **só o passo 2
tinha gate**. O passo 4 não tinha nenhum, e foi o que ficou para trás: o `schema.sql` está em dia
(29 tabelas, bate com o schema real), o `gen/` não estava.

E o próprio `sqlc.yaml` chama os models de *"a compile-time drift guard"*. **Um guard que ninguém
regenera não guarda — envelhece.** Regenerado com `sqlc generate` (nunca à mão); `go build`/`go test`
verdes nos dois módulos depois.

**Quarta instância do padrão de porte** (a regra porta, a forma em volta não): o teste do template
afirma que o `sqlc.yaml` aponta para as migrações do drizzle **direto**
(`toContain('../../contracts/db/pg/migrations')`). No codm isso é deliberadamente o oposto — o
parser sqlite do sqlc rejeita a saída crua do drizzle-kit, então `schema.sql` é um transcrito
normalizado. Copiar a asserção importaria uma verdade de lá como mentira aqui. A versão do codm
afirma o que é verdade aqui, **e** que a razão do transcrito continue escrita no config.

**Fraqueza herdada, dita em vez de escondida:** os dois casos que rodam `sqlc` de fato estão sob
`skipIf(!sqlcAvailable)`. Sem o binário no PATH eles pulam em silêncio e o gate vira no-op. Mesma
forma no template. Registrado como dívida — consertar exige decidir se um contribuidor sem `sqlc`
deve ver o build falhar.

### Step 4 — RESOLVIDO, na forma que o founder escolheu

Não foi "mover para o módulo da app" (o AC original): foi **separar em dois configs**, e o AC
original ficou superado porque mover tudo faria o kernel importar a app.

**A peça que definia o problema:** o sqlc gera models para todo o schema que recebe, então cada
config precisa do seu próprio `schema.sql` — um segundo artefato derivado, que não podia nascer de
um segundo ritual manual de `tr`+`sed`. Resolvido com `scripts/db/split-sqlite-schema.ts`:
derivação determinística e idempotente, com gate `--check`, cortando pelo prefixo `shared_`.

**Por que o prefixo é seguro, medido antes de escrever:** nenhuma FK do schema toca tabela
`shared_*` (as 6 são todas produto→produto), e nenhuma das 7 queries de produto toca `shared_*`
enquanto `events.sql`/`outbox.sql` tocam só `shared_*`. Corte limpo nos dois níveis. E a regra é
**falseável**: `assertNoCrossReference` reprova nomeando os dois lados se uma FK cruzar a fronteira
um dia — momento em que o prefixo deixou de descrever o schema e o corte deve ser redesenhado, não
contornado.

**Resultado:** kernel com exatamente 4 structs (`SharedEvent`, `SharedIdempotencyKey`,
`SharedOutbox`, `SharedScheduledCommand`) e zero referência a produto; app com as 25. O pacote
gerado do kernel passou a ser importado **só por arquivos do kernel** (3). A inversão de direção de
dependência acabou.

**O compilador fez o trabalho:** ao remover as 7 `*.sql.go` órfãs do kernel, `go build` do app
quebrou nos 5 repositórios que importavam o pacote errado. Religados via `sqlitedb.New(r.store.DB())`
— e `SqliteStore.DB()` **já existia** (store.go:144), então nenhuma camada nova foi criada.

Gates novos: `sqlc-parity.test.ts` roda `sqlc diff` + testemunha de corrupção nos **dois** lados
(10 casos), e `split-sqlite-schema.test.ts` é a testemunha do corte (6 casos, incluindo a FK que
cruza a fronteira).

### Histórico: por que a Step 4 esteve BLOQUEADA

O gate entrou; a **separação** não. A decisão do founder (dois configs, `core` com schema e queries
só dele) está registrada e é viável — as 4 tabelas `shared_*` não têm FK em direção nenhuma. O que
falta desenhar antes de executar: **o sqlc gera `models.go` para todo o schema que recebe**, então
cada config precisa do seu próprio `schema.sql`, e esse segundo artefato derivado não pode nascer
de um segundo ritual manual de `tr`+`sed`. A derivação tem de ser script determinístico com gate —
é isso que separa padrão de remendo, e é o primeiro ato do trabalho restante.

---

# FASES 5–8 — o roteiro, cada uma com plano próprio

## Fase 5 — a composição explícita (T1' + T2, fundidas)

**Por que fundidas:** medido — `routers.ts` é `satisfies Record<ContextModule, Router>` e importá-lo
executa os 10 `BoundedContext.create`. Não há estado intermediário coerente: ou os 10 viram
descritores, ou nenhum. A decisão 17bis (vertical) não é executável neste repo.

**Entregável:** `deployment.ts` reescrito na forma do ADR 0002 (tabela por contexto, exaustiva sobre
`ContextModule`, `when: Partial<Criteria>`); `ContextDescriptor`; `manifest.ts` substituindo
`routers.ts`; laço de composição em `server.ts`; `cloud-profile.ts` **apagado**.

**Bloqueador de desenho, a resolver ANTES:** o defeito do `external` — 9 dos 10 contextos têm
bindings `Drizzle*`, `external` tem **zero** (`expandBindings([])`), mas `InfraChoices` exige `db`.
As decisões 8, 11 e 12 são mutuamente inconsistentes nesse ponto. Saída proposta em
`.specs/2026-08-14-relatorio-t1-linha-eixos.md` §4.2 (chaves exaustivas, escolha podendo ser `{}`),
**não aplicada** por ser mudança de contrato.

**Testemunhas:** falseador (a) re-executado contra a forma nova (contexto novo em `CONTEXTS` quebra
o `tsc` na linha da tabela) · falseador (b): eixo declarado sem escolha no plano, e escolha sem eixo,
**lançam no boot**.

## Fase 6 — identidade vem da nuvem (ADR 0001)

**Entregável:** `CloudSessionMiddleware` novo, resolvendo identidade via SDK própria contra
`GetSession` da nuvem (`baseURL: CODM_CLOUD_URL`), cache em disco com validade offline indefinida,
substituindo o `OperatorMiddleware` (que hoje carimba `OPERATOR_ID` **constante** — o buraco que
originou tudo isto) · `auth` vira cloud-only · `SetCloudToken` + `CloudSession` migram para `shared`
· dois clients TS (nuvem/local), o que exige o **perfil como eixo declarado** em
`packages/client/lib/discover.ts` (hoje chaveado só por pasta de serviço).

**Medições que já sustentam a viabilidade:** fora de `auth/`, o único consumidor de repositório de
auth é `owner/services/DrizzleOwnerDirectory.ts` — e `owner` também vai para a nuvem. Todo o resto
importa apenas `OperatorMiddleware`. O BFF local não lê tabela de usuário
(`GetOperatorIdentity` tira nome/foto do canal conectado; `GetMyAccount` é stub).

**Testemunhas:** local sem token não monta nada além de login · `ownerId` adulterado localmente é
rejeitado.

## Fase 7 — a família pg do deployment de nuvem

**Escopo real, muito menor que o da spec original:** só o lado nuvem precisa de pg — `shared` (os 4
tokens duais: driver, `DomainEventRepository`, `OutboxDispatcher`, `IdempotencyGuard`) mais os
repositórios de `auth` e `owner`. Nenhum outro contexto.

**Adotar a suíte de conformidade do template** como contrato de admissão: os 4 tokens duais de
`shared` são exatamente o que ela certifica, e ela vem com `violator.conformance` provando que sabe
reprovar. Interface a implementar: `FamilyHarness<Driver>` — 3 campos + 8 métodos
(`makeDriver`, `makeDispatcher`, `makeGuard`, `seedOutboxRow`, `readOutboxRow`, `expireLease`,
`poisonRow`, `crashBeforeFinalize`).

**A objeção do T33 enfraqueceu, mas não sumiu.** `4814f02d` apagou o pg do codm com medição de gate
vacuoso e nomeou "o terceiro aplicador" como a doença. Com nuvem e local sendo **deployments
separados**, cada um com seu aplicador, não há terceiro aplicador num mesmo processo — mas isso
precisa ser afirmado explicitamente no plano da fase, não assumido.

**Testemunha:** conformidade verde nas duas famílias, mesma suíte, dois harnesses, sem `if`.

## Fase 8 — validação por capacidade + demos

**As 4 testemunhas** que substituem o falseador (c) morto: conformidade nas duas famílias · local
sem token não monta · `ownerId` vem da nuvem · perfil cloud 404 nos sete.

**`demo-gate`**: portar `scripts/pr/` do template. A tabela do codm é determinada e tem 4 linhas —
`react` e `styles` em `VISUAL_SURFACES`; `astro` e `tauri` em `NON_VISUAL_TARGETS`; `expo` sai (o
codm não tem). O rail reprova alvo que não esteja em nenhuma das duas, por desenho.

**Demos gravadas** (artefato, não gate): `onboarding-attach`, `inbound-issue→stop-resolve`,
`terminal-tool-frame`.

---

# Dívida herdada, conhecida e NÃO paga por este plano

Dita explicitamente para não ser confundida com regressão:

- **O `bun tsc` do codm estava VERDE POR CACHE sobre 2 erros reais.** Medido nesta fase: a bateria
  dava `tsc EXIT=0`; ao mexer em 11 arquivos do app-react o cache do nx invalidou e apareceram 2
  `TS1360` em `src/locales/errors.check.ts` — `DATA_DIR_LOCKED` (registrado no wire pelo commit
  `5831fb3b`) sem tradução em nenhum dos dois catálogos. Provado que era pré-existente rodando
  `bun x nx run app-react:tsc --skip-nx-cache` com o diff guardado: `EXIT=1`, os mesmos 2 erros.
  Corrigido aqui (a tradução, que é o conserto que o próprio arquivo prescreve — *"Fix by adding the
  translation — never by widening the type"*).
  **É vacuidade de gate de outra família: não é o gate que não sabe reprovar, é o cache servindo um
  verde velho.** O `gate-vacuity` da Fase 3 não pega este caso; vale desenhar um rail próprio.
- **`bun run test` do codm está vermelho no HEAD** — 3 falhas de frontend (`composeStories + msw`,
  `OnboardingFlow` stories e backend real). Área que a frente paralela `feat/design-d3-adequacao`
  está reescrevendo.
- **`bun detect` do codm está vermelho no HEAD** — 1 finding gating em `go-enum-literals`
  (`internal/channel/services/gateway/whatsapp/config.go:28`, literal `"WARN"` re-tipado).
- **25 dos 28 `scripts/*.test.ts` do template não existem no codm**, entre eles a família de
  *liveness* (`test-liveness`, `lint-liveness`, `barrel-liveness`, `manifest-liveness`,
  `registry-pointers`) — a camada anti-vacuidade um degrau acima dos detectores.
- **`testenv_test.go` não existe no codm** (o template tem 88 linhas). O harness de que 264 funções
  de teste Go dependem é o único pacote Go sem teste próprio.
- **A concentração 25-em-4-arquivos** que o ADR 0003 expôs é sintoma de arquivos que deveriam ter
  sido divididos. O alargamento da regra tornou o problema visível; não o pagou.
- **Contagens em docblock envelhecem**: "337 componentes, 283 em `ui/`" já estava velho (medido:
  ~403 e ~304). Aquele par de números não é fonte de verdade.

# Onde o codm está À FRENTE do template — não sincronizar para trás

- Migração detector→eslint do `component-props`: **terminada** no codm, pela metade no template.
- `component-quality.ts`: 143 linhas contra 104.
- Go: 328 arquivos / 264 funções de teste, contra 178 / 186.
- **"NO SKIP, EVER"**: o codm honra melhor que o template — 2 skips condicionais e 3 recusas
  documentadas, contra 5 self-skips de `DATABASE_URL not set` no template, exatamente o padrão que
  o docblock do `testenv.go` dele condena.
- `DataDirLock` (139 linhas), handles tipados sobre o schema real, `enumCheck` dando `CHECK` no
  banco: nenhum tem contrapartida no template.
