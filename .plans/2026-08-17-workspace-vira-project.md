# `workspace` → `project` — desambiguar uma palavra que carrega dois conceitos

**Status:** aprovado no NOME (founder, 2026-08-17 — `project` confirmado; a §5 registra a objeção que eu levantei e a medição que a derrubou). Execução por unidades, da U1 à U5.
**Origem:** `feat/rename-workspace-project`, commit `abdec57c` (311 arquivos), feito em 2026-08-10 **sem plano**. Este documento é o plano que faltava, escrito depois de a tentativa de cherry-pick medir 84 conflitos autorados sobre a árvore de hoje.
**Antecedentes:** `main` em `330feccd` — W1 (declaração de contexto co-locada) + ADR 0007 (composição em duas fases) já dentro.

---

## 1. Por que isto não é cosmético

O repo usa `workspace` para **duas coisas diferentes**, e a colisão já chegou a um tipo:

```ts
// packages/contracts/db/namespaces.ts:33
owner: ContextId | WorkspaceId
```

- `ContextId` inclui `'workspace'` — o **bounded context** (o diretório de trabalho do operador, com `WorkspaceRepository`, tabelas `workspace_*`, rotas de UI).
- `WorkspaceId` é `keyof typeof WORKSPACES` do `template.config.ts` — o **pacote do monorepo** (`apiGo`, `appReact`, …), que o `detectLang` e a resolução de skills consomem.

Essa união contém os dois sentidos da mesma palavra. Quem lê `owner: 'workspace'` não sabe, sem abrir dois arquivos, se é o contexto ou o pacote. É a classe de ambiguidade que este repo trata como defeito em todo lugar menos aqui.

Renomear o **domínio** para `project` remove a colisão sem tocar no vocabulário do monorepo, que é padrão de ferramenta (bun/nx) e não nosso para mudar.

## 2. Por que um find/replace NÃO faz este trabalho — medido

| família | linhas |
|---|---|
| claramente o CONTEXTO | 227 |
| claramente o PACOTE do monorepo | 359 |
| **ambíguas** | **1611** |

E a medição se falseou sozinha: o heurístico que escrevi para separá-las classificou `app/react/src/routes/(app)/workspaces/…` como "pacote", quando é o domínio. **Se um regex afinado à mão erra, um `sed` global erra mais.**

Consequência: o rename é feito por **unidades semânticas**, uma de cada vez, cada uma com seu gate — nunca por varredura de texto.

## 3. As cinco unidades, em ordem de dependência

| # | unidade | conteúdo | gate |
|---|---|---|---|
| **U1** | contrato de fio | `contracts/wire/` — eventos e enums que nomeiam o conceito; regenera `generated/{ts,go,rust}` | `bun contracts` verde, `cargo check` no crate rust |
| **U2** | schema e banco | `contracts/db/schema/*.ts` (`workspace_*` → `project_*`), `namespaces.ts`, **migração de rename de tabela** — `ALTER TABLE … RENAME TO`, preservadora de dado, e o espelho `//go:embed` do gateway | `bun migrate:create`, `db:check-go` byte-a-byte, `dump-sqlite-schema --check` |
| **U3** | backend TS | `git mv src/workspace src/project` + o `context.ts` dele + os `consumes`/`reads` que o citam nos outros nove + `PLACEMENT` + regenerar os três derivados | `contexts:check`, tsc, api tests |
| **U4** | backend Go | `internal/*` que consome o namespace + queries sqlc | `go build`, `go test`, `sqlc-parity` |
| **U5** | frontend | rotas `(app)/workspaces/`, componentes, stores, i18n (`pt.json`/`en.json`), SDK regerada | `bun sdk`, tsc, app-react build, e2e |

**A U2 é a única irreversível** e a única que precisa de janela: é rename de tabela em dois troncos (sqlite local + pg cloud) mais o espelho embutido no binário Go.

## 4. O que NÃO muda, e é a metade que dá errado se esquecida

- `template.config.ts` — `WORKSPACES`, `WorkspaceId`, `REPO.workspaces`. É o pacote do monorepo.
- `scripts/lib/repo-model.ts` (`detectLang`) e tudo que resolve skill por workspace.
- `bun`/`nx` workspaces em `package.json`.
- `packages/app/tauri/config/*` — os sidecars falam de pacotes, não de domínio.

Um rail fecha isto: depois da U5, `WorkspaceId` e `ContextId` não podem mais ter interseção — hoje têm, e é o defeito que motiva a frente.

## 5. `project` serve — e a primeira versão desta seção estava errada

Esta seção nasceu reprovando o nome. A medição que a sustentava estava inflada, e o founder tinha razão em contestar. O registro do erro fica, porque o método que o produziu é o que interessa:

- o grep por `\bproject\b` contava **`Projector` e `Projection`** — artefatos de domínio, não a palavra. Daí saiu o falso "21 arquivos";
- das 270 ocorrências reais, o grosso é **`Project` do ts-morph** (`scripts/graph/adapters/ts/project.ts:9` — `project.addSourceFilesAtPaths(...)`), que é tipo de biblioteca, não sentido concorrente;
- o sentido do nx já vem **desambiguado por prefixo**: o campo é `nxProject`, não `project`.

**As duas colisões não são da mesma espécie, e é isso que decide:**

| | como colide |
|---|---|
| `workspace` (hoje) | **estrutural** — os dois sentidos se encontram no mesmo tipo: `owner: ContextId \| WorkspaceId`, com `'workspace'` dentro de `ContextId` |
| `project` (proposto) | **lexical** — a palavra aparece em `scripts/`, num tipo de biblioteca e num campo já prefixado, e nunca encontra o tipo do domínio numa união |

A colisão estrutural obriga o compilador a exibir os dois sentidos lado a lado; a lexical é só reúso de palavra em árvores separadas, que este repo já tolera e já resolveu com prefixo quando precisou.

**Decisão: `project`.** A frente segue com o alvo original.

**Duas amarras que a escolha traz**, e elas são baratas:

1. O sentido de domínio **não entra em `scripts/`**. Aquela árvore fala de pacote e de ts-morph; se um dia precisar do conceito de domínio, ele chega prefixado, no mesmo padrão do `nxProject`.
2. Um rail fecha a única colisão que importava: depois da U5, `ContextId` e `WorkspaceId` não podem ter interseção. Hoje têm — `'workspace'` está nos dois — e é esse cruzamento que a frente existe para desfazer.

## 6. Sequência

0. ~~Medir a ambiguidade de `project` → aval do founder.~~ **FEITO** (§5): o nome está confirmado.
1. U1 → gate. 2. U2 → gate (a irreversível). 3. U3 → gate. 4. U4 → gate. 5. U5 → gate.
6. Rail de não-interseção `ContextId × WorkspaceId`, com falseador.
7. Apagar `feat/rename-workspace-project` — seu único commit exclusivo foi re-executado, não mergeado.

## 7. Por que NÃO mergear o `abdec57c`

Ele foi computado contra uma árvore que não tinha os dez `<ctx>/context.ts`, nem `contexts.generated.ts`, nem `composition.generated.ts`, nem `namespaces.ts`. Fundi-lo produz uma árvore **meio-renomeada**, e a metade que sobra é invisível ao compilador — `workspace` continua sendo identificador válido. Medido: 91 conflitos, 84 deles autorados.

Ele continua sendo a melhor **referência** de quais ocorrências qualificam, e deve ser lido unidade a unidade durante a execução. Referência, não diff.
