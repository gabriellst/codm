# Declarative Repo — self-model, coherence rails, example pipeline

**Date:** 2026-07-21 · **Status:** DONE (2026-07-21) — todas as fases executadas; ver §Execução abaixo
**Origem:** brainstorm do usuário (5 críticas: exemplos de evals → template; exemplos Go do medscall; medscall como filho; paths/contextos hard-coded; stripKeys/env edge-case handling) + evidence pack do scout `wf_29a77f85` (2026-07-21, re-verificado por grep).

## O problema latente

O repo se descreve por **convenção** (pastas + ~20 listas manuais espalhadas), não por **dado**. Cada ferramenta mantém sua cópia do modelo estrutural — e elas drift-am. Provas ativas NA ÉPOCA DO DRAFT (todas corrigidas pela execução; mantidas como registro do estado que motivou o plano):

- **HD-01** `import-direction.ts` R3 protege 13 contextos dos quais **9 não existem**; `owner` e `quota` (reais) estão **desprotegidos**.
- **HD-02** `enum-placement.test.ts` guarda 15 de **24** wire enums (9 desguardados incl. `Role` — um `export enum Role` em src passa hoje).
- **HD-03** cada env key vive em até **5 lugares** (Config.ts, ProductConfig.ts, .env.example, config.go, stripKeys); ~31 keys de schema faltam no .env.example; `.env.example:16` literalmente confessa "keep in sync".
- **HD-04** o e2e **forkou o vocabulário** de env (lê `PORT`/`API_BASE_URL`; o resto do repo fala `API_PORT`/`API_URL`).
- **HD-05** adicionar 1 contexto = tocar **6-7 arquivos**, só 1 compile-checked (`routers.ts` via `satisfies Record<ContextModule, Router>` — o padrão comprovado a estender).
- **HD-06..12** taxonomia pasta→artefato triplicada (causou incidente documentado de review silenciosamente pulado), variant-skills em 2 códigos + prosa, `detectLang` duplicado (uma cópia ainda roteia `.rs`→rust), `CC_BP_SCOPE` split do yaml (cc-bp só-yaml = zero cobertura de review), universo LANGS em 4 cópias, ~25 globs com roots literais.
- **HD-13** Go hand-mirror declarado ("keep in lockstep") em config.go/walker.go.
- **HD-14** canonical_snippets das skills = texto congelado citando contextos purgados (`src/catalog/registry.ts`, `@tenancy`, `MULTI_STORE`).
- **slice-closure.allow.yaml 100% stale** (4 eventos permitidos, todos purgados) e **product-residue não varre `.claude/` nem `examples/`** (MULTI_STORE vivo em skills).

Decisões genuínas que FICAM como listas (GD-01..06): PATTERNS do product-residue, EXEMPTIONS com `why`, exceções nomeadas do import-direction, REQUIRED_SECRETS_IN_PROD, `contexts.ts` (o **spine** designado). Gap transversal: allowlists não têm mecanismo de **liveness** (GD-05 provou: forma certa, conteúdo 100% morto).

## O princípio

> **Derive o que é derivável; declare só decisões; o que for redeclaração inevitável, GATE** (verificação mecânica que falha o build, com fixture negativa).

Extensão do config-first da W4 (identidade) para **estrutura**.

## Decisões do usuário (2026-07-21)

1. Promoção de exemplos: score PERFECT **candidata**, usuário aprova em lote (curadoria).
2. Exemplos **estáticos** (formato Tier-3/pairs já estabelecido, com CONTEXT-ORIGIN headers; eslint já ignora examples/).
3. Port do medscall (F3): **bem depois** — resolver tudo aqui primeiro, com F3 em mente.
4. Manifesto vive em **`template.config.ts`** (crescendo; sem arquivo novo).

## F1a — Self-model (fonte única + derivações)

1. **Env-registry** em `template.config.ts`-adjacente (o schema Zod é TS da api; o manifesto declara METADADOS): cada key com `{ owner: 'kernel'|'ts-product'|'billing-gateway'|'go'|'frontend', secret?, requiredInProd?, doc }`. Derivam: `.env.example` **gerado** (`bun env:generate` + gate de sincronia), stripKeys do create-template (strip por owner ∉ seleção), `REQUIRED_SECRETS_IN_PROD`, e o **fork do e2e corrigido** (HD-04: e2e passa a ler `API_PORT`/`API_URL`). Go config permanece hand-mirror com **gate de paridade** (HD-13: script compara keys go vs manifesto — Go não importa TS; gate no lugar de derivação).
2. **Spine de contextos**: `contexts.ts` é a fonte; estender o padrão `satisfies Record<ContextModule, …>` (provado em routers.ts) a `shared/registry.ts` (ALL_REGISTRIES) e ao barrel de schema do contracts (paridade contexto↔schema via gate — contracts não importa a api). `import-direction` R3 deriva de `CONTEXTS` (HD-01).

2b. **Context map — DECLARAÇÃO PRÉVIA (v3, decisão final do usuário 2026-07-21):**
   **Racional documentado (fica no header do arquivo): NÃO há derivação de cara — é preciso ter intenção antes de derivar.** Um baseline derivado abençoaria o estado atual incluindo os acidentes (quota→@billing/usecases entraria como fato consumado); com declaração prévia, escrever o mapa É a auditoria — toda aresta real ou é conscientemente declarada ou o gate acende no dia 1. Derivação existe só como ferramenta de conferência (`bun contextmap:diff` mostra real vs declarado), nunca como fonte.
   - **`CONTEXT_MAP` declarado à mão** (junto do spine): consumer → suppliers permitidos, com `note` por aresta. Aresta = par de contextos (SEM channels por aresta — granularidade fina rejeitada).
   - **`CROSS_CONTEXT_POLICY` global** (mantida da v2 — o usuário validou o `forbidden` explicitamente): allowed = repositories/services/objects/enums/schemas/middlewares; **forbidden = entities/usecases/handlers/events** — garante que não há "importações demais" independente da aresta.
   - **`AMBIENT`** (~3 linhas): shared (kernel), auth/middlewares, owner/middlewares.
   - **Gate** (reescrita do import-direction R3): imports reais ⊆ CONTEXT_MAP ∧ política de canais; aresta não-declarada = FAIL; canal forbidden = FAIL (mesmo em aresta declarada, salvo exemption nomeada com `why`). **Liveness**: aresta declarada sem import real = warning (mapa não vira permissão fóssil). Detector de ciclo sobre o declarado; ciclo exige anotação.
   - Achados do grep 2026-07-21 a decidir AO ESCREVER o mapa: ciclo billing↔quota (anotar como partnership: billing lê @quota/repositories p/ metering; quota deriva de @billing/{objects,services}); `quota → @billing/usecases` (forbidden — refactor p/ service/evento ou exemption); `ui → @owner/entities` (forbidden — refactor p/ DTO ou exemption).
   - Mermaid renderizado DO mapa declarado (`bun graph:contextmap`).
3. **CMPL-02 deriva de contracts** (HD-02): a lista de enums cross-boundary = exports do índice gerado de wire enums; `CROSS_BOUNDARY_ENUMS` manual morre; enum novo em contracts fica guardado automaticamente.
4. **Taxonomia única** (HD-06/07/08/09/11): `.claude/registry.yaml` vira a fonte de pasta→artefato + `scope:` por cc-bp; review.ts/graph/classify-edit consomem; variant-skills por `existsSync` do registry da variante; `detectLang` único derivando de `workspaceRoots`; universo LANGS de um export só.
5. **create-template deriva** (HD-10): backends/frontends/nx-names/strip tudo do manifesto (frontends já fluem; completar).
6. **Registry DI declarativo** (redeclaração C do brainstorm): `{ token, mock, real, integration? }` → expande 3 envs; divergência vira declaração explícita. Codemod nos registries existentes.

## F1b — Coherence rails (onde não dá pra derivar, gateia)

No molde dos rails existentes (scan + assert + mensagem + fixture negativa):

- **wiring-completeness** (o bug dos 13 handlers): todo `*Handler.ts` exportado em internal/external.ts; todo `*Job.ts` num `jobs:[]`; todo `extends Controller` no barrel; toda entry de CONTEXTS com registry nas 3 envs (CMPL-06/07/11/12 do plano de reinforcement, nunca landados).
- **generated-in-sync** (nos mordeu 3×): regen de contracts+sdk == committed (`git diff --exit-code` nos dirs gerados).
- **i18n-coherence**: chaves pt == en; toda `t('…')` existe; chave órfã = warn.
- **error-coherence**: união TS + registerErrorCodes + tradução — os três coerentes.
- **event-name-contract**: emitter do contracts valida nome `integration.*` (a convenção que o roteamento do outbox agora depende).
- **allowlist-liveness** (GD-05): toda entry de allow/exemption tem que casar com algo vivo; entry morta = FAIL (mata a classe "slice-closure 100% stale").
- **residue scan-roots ampliados**: product-residue passa a varrer `.claude/skills` + `examples/` (com exempt de proveniência).
- **env-example-in-sync**: `.env.example` gerado == committed.

## F2 — Example pipeline (itens 1+2 do usuário)

Estado real: scoreboard/ git-tracked com 150 jsonl + **65 .patch** (arquivos full-build), ~30 tasks PERFECT; promoção existe só como comentário (`run.ts:709`); **zero** skill→example linkage (único link máquina: grader-id `<skill>#<pattern-id>`); formato de exemplar já assentado (Tier-3 + pairs WANT→GOT com CONTEXT-ORIGIN).

1. **Fix de granularidade**: `.patch` um-por-(stamp,task) (hoje re-runs concatenam — blocker de extração).
2. **`bun examples:promote`**: task PERFECT no docTreeHash atual → aplica patch em worktree scratch → seleciona arquivos pelos globs dos graders → gera `examples/pairs/<task-id>/` (WANT.md = prompt da task verbatim + proveniência; GOT/ = arquivos com header stamp+docTreeHash+model; NOTES.md auto-rascunhado) → **fila de candidatos**; usuário aprova em lote (decisão 1).
3. **Skills referenciam exemplos**: campo `examples:` no registry.yaml (path p/ examples/), validado por gate (path existe; toda skill de artefato com ≥1 exemplo por lang quando houver); canonical_snippets stale (HD-14) migram para refs.
4. **Harvest Go do medscall** (item 2): template api/go tem **zero** código de domínio (50 arquivos kernel-only) e as 16 skills Go citam paths sem instância viva. Fonte: medscall channel (291 arquivos Go, 0 commits desde o audit = pin estável). Harvest Tier-3 verbatim por citizen: entities/projections/projectors/handlers (split internal vs integration)/usecases/controllers (incl. oneOf discriminators)/events/services/SSE — 2-3 arquivos exemplares por tipo, com CONTEXT-ORIGIN, ligados às skills Go via `examples:`.

## F3 — Medscall-as-child (DEFERIDO — decisão 3)

Bem depois; pré-requisitos acumulados por F1/F2: self-model aguenta produto real, sync-machinery Plan 2 (drift gate), exemplos Go já harvestados. O port valida o modelo (filho = template + deltas declarados) e não deve re-criar gambiarras.

## Ordem de execução

F1a.1-3 (env-registry + spine + CMPL-02 derivado — mata as mentiras ativas) → F1b (rails; wiring-completeness e generated-in-sync primeiro) → F1a.4-6 (taxonomia/create-template/DI) → F2.1-3 (promotor + linkage) → F2.4 (harvest Go). Cada etapa: gates verdes + commit próprio. Crítico adversarial no fim (lição W0-W6: 2 bugs funcionais passaram por todos os gates).

---

## Execução — fechamento (2026-07-21)

Todas as fases executadas e commitadas na v1.9, cada uma com gates reproduzidos:

- **F1a.1** env-registry workspace-first (`consumers`), `.env.example` gerado, rail ENV 6/6 — e36947c90/db5ea2cb3
- **F1a.2** spine `CONTEXTS` + `CONTEXT_MAP` declarado + R3 derivado (rail 7/7) — a66071791
- **F1a.3** CMPL-02 importa o wire binding (24/24) — 4dd102298
- **F1a.4** taxonomia única: `scripts/lib/repo-model.ts` (detectLang derivado de `REPO.workspaces`; rust morto), `scope:` por cc-bp no yaml, variant-lists → existsSync, component `job:`, gate de paridade — 7d09d2143
- **F1a.5** `nxProject` no Workspace + gate workspace⇔filesystem; patchEnvExample reescrito como relação `consumers` pura (o modelo owner/`go:true` estava vivo e NUNCA removia key — pego pelo smoke) — 9c97cad4a
- **F1a.6** DI declarativo: `expandBindings` no core, 7 registries codemodados, divergência = coluna explícita — ce268f047
- **F1b batch 1** wiring-completeness (4/4) + `bun check:generated` — b39713c3c
- **F1b batch 2** error-coherence, event-name-contract (assert nos emitters + rail EVT-03), allowlist-liveness (allow.yaml 100% stale limpo), residue ampliado a skills+examples, i18n-coherence (2 drifts reais corrigidos) — 83afab81c + 5d4d0a70e
- **Débito de detector** slice-closure de-fossilizado (13 erros falsos → checks de wrong-mapping residuais), enums billing/shared registrados no OpenAPI (SDK ganhou `InvoiceStatus`/`RefundBasis` nomeados), baseline SCW-01a re-baselined vivo, walker Go tolera internal/ sem packages — 584f919a9
- **F2.4** 44 exemplares Go verbatim do medscall channel@ff66dbb1 com proveniência CONTEXT-ORIGIN — c1d7d5e00
- **F2.3** `examples:` em 16 skill registries + gate de dead-link — f93723ec4
- **F2.1+F2.2** um .patch por (stamp,task) + `bun examples:promote` (fila de candidatos; promoção final = aprovação do usuário) — 3b3bab77f
- **Crítico adversarial** (3 lentes × verificação): 13 majors confirmados e corrigidos — o cluster central era "gates que nunca rodam" (CI vermelho no sweep de seeds; parity-gates fora de qualquer sweep; pre-commit `--projects=api,client` no-op silencioso; check:generated sem consumidor) + review sem Go + stamp copiando .env/worktrees + staleness de docs/skills — 1360a4d1c e o commit de docs subsequente.

**Residuais conhecidos (decisões de produto, não defeitos):**
1. Os 8 dead events baselined em SCW-01a (auth Password* ×3 — fluxos são do better-auth; billing External* ×5 — aguardam a webhook pipeline). Deletar é decisão do usuário.
2. Stamping não é fechado sobre template.config.ts: uma cópia --backends=typescript ainda DECLARA apiGo no manifest (o gate workspace⇔filesystem falharia lá). Fechar exige transformar o stamp numa transformação declarada do manifest — fora do escopo deste plano; regex-patch de TS foi rejeitado por ser exatamente a classe de edge-case que o §5 proíbe.
3. Cobertura de locale dos códigos de erro (react 2/52, expo 0/52) é warn-only no error-coherence — gatear exige decidir o code-set contratual e o shape do errors.title do expo.
4. examples/tenant-membership carrega *.test.ts que não rodam no path shipped (exemplares são estáticos por decisão; sem gate de compilação).
