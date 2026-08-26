# Upstream da sessão de reconciliação — dossiê classificado

**Status:** Dossiê. Nada executado.
**Escopo:** 58 commits do codm na janela de 23h encerrada em 15/08 04:38, excluídos os 3 da sessão de declaração-de-contexto (`d12244db`, `ae25c803`, `5596df4e`).
**Companheiro de:** `.plans/2026-08-15-declaracao-de-contexto.md` — este doc alimenta as ondas W0/W2 de lá (ver §5).
**Fonte:** análise de histórico + verificação item a item no template, cruzada com o inventário que a própria sessão de reconciliação enviou.

---

## 1. Os dois fatos que reordenam a leitura

**(a) A maior parte da sessão foi porte template → codm, não o contrário.** W1 (liveness), F3 (gate-vacuity), F4 (sqlc), W5 (injection), ADR 0006 (hierarquia de drivers), a suíte de conformidade e quase toda a família pg **vieram do template**. Os próprios commits dizem ("espelhar o repo irmão por inteiro"). Isso derruba a superfície de upstream de ~58 commits para **7 itens**, e é bom: o que sobra é medido.

**(b) A W4 "rodada de volta" já rodou.** O template está em `feat/upstream-harness`, HEAD `95b713e50` (14/08 21:42), e 5 commits de upstream aterrissaram lá entre 21:28 e 21:42. **Tudo que o codm fez depois de 22:17 (`5d17fdf5`) nunca subiu.** O template já mantém o ledger de doação em `docs/UPSTREAM.md` (180 linhas, 4 regras de ouro) — o formato do que subir já existe, este dossiê o alimenta.

---

## 2. Classificação — 22 frentes

| Frente | Classe | Veredito | Custo |
|---|---|---|---|
| Planejamento/ADRs/relatórios (18 commits de docs) | CODM | NÃO SOBE (2 doutrinas citáveis) | — |
| lint `className` module-private · lint-liveness · registry-pointers · barrel-liveness · manifest-liveness · gate-vacuity | KERNEL (porte de lá) | **JÁ TEM** | — |
| `19a8dab1` context-layers + context-barrels + recusa no `wire.ts` | KERNEL **novo** | SOBE COM ADAPTAÇÃO | médio |
| `192f8ce9` test-liveness: parser cego a `cd` e `--manifest-path` | DEFEITO-COMPARTILHADO (latente) | **SOBE** | baixo |
| `c91041cb` graph: auto-skip + `validatePlan` engolindo grafo ausente | DEFEITO-COMPARTILHADO (**vivo**) | **SOBE** | baixo |
| `ec2cb463` sqlc | misto | SOBE só o `-f <config>` | baixo |
| composição por descritores (5 commits) | KERNEL + CODM | SOBE COM ADAPTAÇÃO (metade mecanismo) | **alto** |
| ↳ guarda do `slice-closure` p/ raiz ausente | DEFEITO-COMPARTILHADO (**vivo**) | **SOBE** isolado | baixo |
| `0c4a9883` PgDriver que CONFERE e RECUSA | DEFEITO-COMPARTILHADO | **SOBE** | médio |
| `48242a86`/`c0a85895` causa raiz da dupla registração de DI | DEFEITO-COMPARTILHADO (**vivo**) | SOBE a causa; sintoma não se aplica | médio |
| identidade da nuvem · tronco cloud pg · client-rust `clientId` · gateway `PRODUCT_NAME` · better-auth/device tokens | CODM | NÃO SOBE | — |
| `kernel-parity.ts` · `split-sqlite-schema` · `PollingHealthCheck` · `enumCheck` | KERNEL sem consumidor lá | NÃO SOBE | — |

---

## 3. A lista priorizada

### Tier 0 — defeito compartilhado, custo baixo, cada um independente

**1. `c91041cb` — o `validatePlan` que responde OK a uma pergunta que não fez.**
Único item **medido e vermelho AGORA** no template: `bun test scripts/graph` → 64 pass / **10 skip** / 3 fail, e `scripts/graph/tests` está dentro de `test:tooling`.
- `scripts/graph/cli/validate-plan-cmd.ts:284-290` — `catch {}` pelado carregando o grafo; PR-18 (`:295`) e PR-19 (`:315`) ambos sob `if (ctx) {`.
- `cli/index.ts:302-308` — imprime `OK: <plan> passes PR-18..27` sem saber que duas regras não foram avaliadas.
- `validate-plan-cmd.ts:70-73` — `ValidationResult` não tem `skipped`; `:540` — `exitCode: findings.length === 0 ? 0 : 1`. Regra não avaliada não consegue reprovar.
- `.gitignore:128-129` — `.graph/` ignorado, e nenhum alvo nx o reconstrói. Em clone novo e em CI, PR-18/19 **nunca rodam**.
- `scripts/graph/tests/plan-parser.test.ts:7-13` — `describeIf = hasFixture ? describe : describe.skip` sobre `.plans/2026-05-13-agentic-coding-system-bootstrap.md`, **que não existe naquele repo**. 6 casos em passe silencioso, sem `biome-ignore`, sem banner.

Conserto: fixtures locais sob `__fixtures__/` (padrão que os vizinhos já usam), matar o `describeIf`, dar ao `ValidationResult` um `skipped: string[]` com `exitCode != 0` e `NOT EVALUATED:` no lugar do `OK`. O codm já pagou o desenho da costura testável.
*(As 3 falhas atuais são causa separada — `spawnSync` com stdout vazio dentro do `bun test` nos extratores Go/Rust. Fica NOMEADO, não é este defeito.)*

**2. `46d974d2` (parcial) — guarda do `slice-closure` para raiz de composição ausente.**
`scripts/detectors/slice-closure.ts:954-955` — `tsFiles.get(...routers.ts)` e `if (routersRoot) {`, fechando em `:999` **sem `else`**: o dia em que o arquivo mudar de nome, a regra SCW-03 deixa de existir em silêncio. O autor já consertou a metade *interna* do mesmo defeito uma linha abaixo (`:963-973`, com o incidente do rename `ROUTERS`→`CONTEXTS` documentado em `:948-953`) e **não aplicou a lição acima**. `slice-closure.test.ts` não tem caso para raiz ausente.
Conserto: `else` que vira finding + um caso de teste. Independente da refatoração de composição.

**3. `192f8ce9` (parcial) — `test-liveness` cego a `cd` e a `--manifest-path`.**
- `scripts/test-liveness.test.ts:208` — `command.split(/&&|\|\||;/)`: o `cd <dir>` de um segmento **não acumula** para os seguintes.
- `:170` `CARGO_TEST` + `:220-223` empurram `cwdSuffix: ''` cravado — `--manifest-path` é invisível.
Latente hoje (nenhum alvo de teste do template usa `cd`, e não há `--manifest-path`), mas é um rail que **acusa o repo por uma cegueira dele** — a forma de defeito que o programa inteiro existe para caçar. As asserções unitárias já estão escritas no codm.

**4. `ec2cb463` (parcial) — `sqlc -f <config absoluto>` no lugar de `{ cwd }`.**
`scripts/sqlc-parity.test.ts:28-29`. Era a Task 1 Step 3 da W4 e ficou para trás enquanto os Steps 2 e 4 subiram. Um gate que só funciona invocado do lugar certo falha exatamente no pre-commit, onde mais serve. Uma linha + falseador trivial (rodar de `/tmp`).

### Tier 1 — defeito compartilhado estrutural, custo médio

**5. `0c4a9883` + doutrina do ADR 0005 — o driver pg que CONFERE e RECUSA.**
O item de maior consequência de produção da lista.

```
template-fullstack/packages/api/typescript/core/src/db/pg/drivers/NodePgDriver.ts:92-98
  async runMigrations()  { throw new BaseError('NOT_IMPLEMENTED') }
  async readMigrations() { throw new BaseError('NOT_IMPLEMENTED') }
```

O driver de **produção** promete aplicar e verificar migração, não faz nem uma coisa nem outra, e só falha se alguém chamar. Quem migra é `drizzle-kit migrate` fora de banda (`contracts/package.json:21`), e `src/server.ts:77-90` só chama `runMigrations()` em `integration`. Um serviço `real` que suba sobre schema atrasado troca um erro de deploy — barulhento, imediato, com rollback — por **corrupção silenciosa de dado**.

Corolário do ADR 0005: *"'manual' descreve quem APLICA, nunca quem VERIFICA."* Sobe: `readMigrations()` sobre journal × ledger com `splitByLedger` (função pura, 4 testemunhas incluindo ledger ausente = tudo pendente), e `runMigrations()` virando conferidor com `MIGRATIONS_PENDING` → **503**, não 500, com o nome da migração no texto. A mecânica atravessa: `MigrationStatus {applied, pending}` já é vendor-neutro nos dois, e `meta/_journal.json` × `drizzle.__drizzle_migrations` é o par que o `drizzle-kit migrate` do template já usa.
Custo médio: código de erro novo + `GlobalErrorMapper` + i18n. Cuidado registrado: um guard anterior *"killed every `bun e2e` webServer boot with NOT_IMPLEMENTED (FASE F incident, 2026-08-12)"* (`server.ts:85-86`).

### Tier 2 — kernel novo, exige decisão de founder

**6. `19a8dab1` — `context-layers` + `context-barrels` + recusa no `wire.ts`.**
O único rail genuinamente **novo** da sessão. Ausente dos três lados no template: `scripts/lib/context-layers.ts` e `scripts/context-barrels.test.ts` não existem, e `scripts/cli/wire.ts:163-164` cria o barril **incondicionalmente**. Censo: **55** barris de camada em `src/<ctx>/<camada>/index.ts`, e `.claude/skills/bounded-context/SKILL.md:59-87` **prescreve** barril em quase toda camada.
Não é conserto de acidente — é mudança de convenção declarada. O mecanismo porta limpo; os `why` são medição do codm e **têm de ser re-medidos** nos 7 contextos do template.

**7. Composição por descritores + causa raiz da dupla registração de DI — como PACOTE.**
As duas coisas são o mesmo diff: sem composição explícita, a raiz precisa do merge; enquanto a raiz tem o merge, todo token de contexto é registrado duas vezes.
- `src/routers.ts:48` monta os 7 contextos **por efeito colateral de import** (cada `<ctx>/index.ts` chama `BoundedContext.create` no topo do módulo com top-level await), e `:22-38` declara que a **ordem de import é load-bearing**.
- `core/src/types/BoundedContext.ts:184-189` + `src/shared/registry.ts:253-270` + `src/shared/index.ts:36-45`: a raiz carrega `ALL_REGISTRIES` **e** os seis filhos passam o próprio registry. O descarte é real — `tsyringe-neo/dist/index.js:257` substitui o registro inteiro e o cache de singleton vive nele (`:399,405`).
- Precisão que a verificação impôs: no template **não é todo token que dobra**. O `CORE_REGISTRY` é registrado uma vez; o que dobra são os tokens dos **seis contextos de produto**. E o sintoma que o codm sofreu não existe lá — `PollingHealthCheck` não existe, e `HealthService.ts:14-20` **recusa deliberadamente** a forma de lista agregada.

**Não sobe a `PLACEMENT` nem o eixo `deployment`** — o template não tem segundo deployment e a tabela viraria decoração, exatamente a classe de defeito que esta sessão inteira caçou.
Custo **alto**: no codm o corte deixou **575 testes vermelhos** na primeira tentativa, porque o `TestBed` montava container sem compor.
*Não verificado:* se a dupla registração produz falha observável no template hoje (exigiria instrumentar um boot e diferenciar identidade de instância na sequência `shared→auth→…→ui`).

---

## 4. Não sobe, com razão medida — para o ledger, não para redescobrir

`split-sqlite-schema.ts` (o template não tem a inversão que ele conserta) · `trunk-parity`/tronco cloud (um tronco só) · `enumCheck` no pg (recusado pelo founder na W4) · `kernel-parity.ts` (o template é raiz, não tem pai) · `PollingHealthCheck`/`HealthService` com lista (forma recusada deliberadamente) · `clientId` no renderizador Rust (não há segundo perfil lá; os três renderizadores chaveiam por `source.service`, único por filesystem) · identidade da nuvem · device tokens/deep link · `PRODUCT_NAME` do gateway.

**Duas doutrinas que sobem como PROSA no `docs/UPSTREAM.md`, não como código:** o corolário do ADR 0005 (quem aplica ≠ quem verifica) e a testemunha do grupo de identidade (*"a asserção que o desenho antigo não podia fazer — TROCAR a sessão TROCA o dono"*).

---

## 5. Achados sem porte pronto — ficam NOMEADOS

1. **`tsconfig.build.json` — o alvo real do `tsc` — omite `scripts/**`.** O template já consertou o `tsconfig.json` (`:28-36`, com post-mortem inline, `fdb5d289d`), mas `project.json:39` roda `-p tsconfig.build.json`, que sobrescreve `include` sem `scripts/**`. Medido: `tsc -p tsconfig.json` → exit 2 (~30 erros, 3 `TS6307`); `tsc -p tsconfig.build.json` → exit 0. Logo **`emit-openapi.ts` — o emissor de onde nasce a OpenAPI da qual a SDK inteira é gerada — segue fora do type-check do build.**
2. **O rail `process.env` do template é cego ao `core/src`.** `tests/architecture/process-env.test.ts:21` — `SRC = .../src`, escopo declarado intencional em `:15-19`. Leituras de produção no kernel sem cobertura: `BoundedContext.ts:94`, `OpenAPI.ts:223`, `Tracing.ts:32`, `Mediator.ts:63`, `OtlpLoggingService.ts:45`. No lado Go o template está **à frente** (ENV-08). **Rust não é varrido em nenhum dos dois**, e `fleet.rs:137-140` declara um contrato cross-language com `config/sidecars.ts` que rail nenhum assere.
3. **`OpenAPI.ts` do codm está à frente** (`fileName`, `promoteDiscriminantEnums`) — `template-fullstack/.../OpenAPI.ts:187` sem `fileName`, `:224` com caminho cravado, e `promoteDiscriminantEnums` ausente no repo inteiro. Único delta de kernel medido em que o codm lidera e ninguém registrou.
4. **PS-04 do `projection-shape`** checa `switch (event.name)` no arquivo inteiro em vez de escopar ao `applyEvent` — falso negativo conhecido, nos dois repos, sem gate.
5. **Resíduo do MESMO defeito aqui no codm — demonstrado ao vivo ao escrever este dossiê.** O `c91041cb` consertou `plan-parser.test.ts` e `validate-plan-cmd.test.ts` com fixtures locais, mas **`scripts/graph/tests/plan-cmd.test.ts` continua carregando o grafo real** (`plan-cmd.ts:127` → `loadGraph()` → `.graph/graph.json`). Como `.graph/` é gitignored e nenhum alvo o reconstrói, o pre-commit desta worktree reprovou com **6 falhas** e `test:tooling` saiu 1 — no checkout principal passava só porque o artefato calhava de existir. `bun cli graph build` → 65 pass / 0 fail.
   É o mesmo modo de falha do Tier 0 nº 1, do outro lado: lá o gate **passa** sem avaliar; aqui ele **quebra** sem o artefato. Os dois pedem a mesma cura — ou fixture local, ou o alvo de teste declara a dependência e a constrói.
6. **`check:generated` NÃO PODE passar numa worktree — os `.mcp.json` embutem caminho absoluto.** Medido ao rodar o gate: os três `packages/client/dist/typescript/src/typescript/mcp/scopes/*/.mcp.json` carregam `"args": ["tsx", "<PATH ABSOLUTO>/…/server.ts"]`, então regenerar de qualquer checkout que não seja o principal produz **drift falso** — 3 arquivos, 1 linha cada. Vale para worktree e para CI com path diferente. O conserto é o gerador emitir caminho relativo à raiz do pacote (ou o gate normalizar), e é do mesmo tipo do defeito `sqlc -f <config>` do Tier 0: um gate que só funciona invocado do lugar certo.
7. **Uma worktree do codm não sobe sem TRÊS bootstraps manuais, e nenhum está declarado.** Medido nesta sessão, um por vez, cada um descoberto quando algo quebrou: `bun install` (o CLAUDE.md promete fall-through de `node_modules`, mas a raiz tem 22 entradas e não tem `tsyringe-neo` — as deps moram por workspace, e o walk-up de uma worktree nunca visita `<main>/packages/<x>/node_modules`); `bun cli graph build` (`.graph/` é gitignored e alvo nenhum o reconstrói); e copiar o `.env` (sem ele, `CLOUD_DATABASE_URL` falta e o `emit-openapi` do perfil cloud morre num erro de DI que não parece ambiental — *"Cannot inject the dependency `domainEvents`"*). O template tem `bun worktree:link`, que cobre só o primeiro. **Um `worktree:bootstrap` que faça os três, mais um `worktree:check` que os asserte, é upstream nas DUAS direções.**
8. **Sem testemunha para `renderLibRs` (rust) e `renderAggregateClientGo` (go)** no template — só `render/typescript.test.ts`, e mesmo esse cobre `renderServiceClient`, não o agregado. Foi por isso que o defeito do `clientId` atravessou a onda inteira no codm.

---

## 6. Encaixe no plano de declaração-de-contexto

| Item | Onde entra |
|---|---|
| Tier 0 (1–4) | **W0-template, junto dos meus consertos de família.** Independentes entre si e do resto; são 4 correções pontuais em rails/tooling. Cabem no mesmo goal de W0. |
| Tier 1 (5) | **W0-template, mas como frente própria** — custo médio, toca erro/i18n/GlobalErrorMapper, e tem o precedente do incidente FASE F para respeitar. |
| Tier 2 item 6 (context-barrels) | **W3 do plano (poda)** — é da mesma família: decidir quais portas devem existir. Exige decisão de founder e re-medição no template. |
| Tier 2 item 7 (composição + DI) | **É a W2 do plano.** Correção importante de enquadramento: a W2 não é "portar o desenho novo" — o codm **já construiu** o mecanismo, e este dossiê o precificou (alto risco, 575 testes vermelhos na primeira tentativa lá). A W2 vira "subir a metade mecanismo do que já existe aqui", sem `PLACEMENT` nem eixo `deployment`. |

**Consequência para o sequenciamento do plano:** o W0-template cresce (3 consertos meus + 4 do Tier 0 + 1 do Tier 1) mas continua sem exigir aval de doutrina. A W2 fica mais barata em desenho e mais cara em execução do que o plano supunha.


---

## 8. Segunda leva da sessão de reconciliação — a classe "retrato tirado cedo demais" (2026-08-17)

A sessão irmã mandou um aprendizado novo depois de um **500 em produção** no callback do Google. Registro aqui o que **verifiquei nesta branch**, separado do que é relato.

### 8.1 O mecanismo — VERIFICADO no meu código, não aceito de relato

`BoundedContext.create` faz, numa ÚNICA chamada e nesta ordem:

| linha | o que faz |
|---|---|
| `BoundedContext.ts:195-196` | `registerAll` do registry DESTE contexto — no container **RAIZ**, mesmo para não-root |
| `:201-202` | resolve os mediators e constrói handlers e projectors |
| `:203` | resolve a fila e **ESCREVE no banco** (`registerJobs` enfileira os repetíveis) |
| `:205` | roda o `setup` |
| `:207` | constrói o `Router`, que **resolve TODO controller sincronamente** |
| `Router.ts:68-69` | e ENGOLE a falha de resolução com `console.warn` |

Enquanto o contexto N monta, os registries de N+1..10 **não existem**. Uma cadeia cross-context alcançada durante a montagem resolve um token sem binding, o tsyringe constrói a **classe abstrata** sem reclamar (objeto sem método), e o Router silencia. Sintoma medido pela sessão irmã: `this.owners.ensureOwnerFor is not a function`, 500 depois de o operador já ter autorizado no Google.

### 8.2 O que eu achei e a sessão irmã não reivindicou

**O pin do driver existe POR CAUSA disto, e a correção o apaga.** `shared/lifecycle.ts` carrega um `registerInstance` do `DatabaseDriver` cujo próprio docblock diz o porquê: *"`BoundedContext.create` aplica o registry de cada contexto no container RAIZ, e re-registrar um token singleton descarta a instância em cache"*. Com composição em duas fases — todos os registries, depois todas as rotas — não há re-registro durante a composição, e o pin fica sem função.

Isso muda a natureza da proposta: o degrau 1 não ACRESCENTA um guard, ele **remove um hack existente** e mata a causa de dois defeitos medidos (o 500 do OAuth e o mailbox/health reportando `down` para sempre). É o degrau "eliminar" no sentido forte da escada.

### 8.3 Estado no template — relato da sessão irmã, com linhas para conferir na W2

- A janela estrutural **existe** (`core/src/types/BoundedContext.ts:184-197`; `Router.ts:68-69`), mas está **neutralizada por ordenação**: `routers.ts:32-38` importa `shared` primeiro e a raiz aplica `ALL_REGISTRIES` (merge de todos). Proteção por CONVENÇÃO de ordem de import, não por mecanismo — um `import '@<ctx>/index'` fora do `routers.ts` reproduz o 500. **Latente, regressão possível.**
- O template também tem o padrão do **singleton descartado**: cada child re-registra o próprio `INSTANCE_REGISTRY` no rootContainer (`create:187-189`). Latente hoje; a W2 mata por construção se `create` parar de registrar.
- O template **já documenta o hazard em prosa** (`shared/registry.ts:232-234`: *"an UNBOUND abstract silently constructs a method-less instance and crashes boot"`) — sabe do risco, não tem o mecanismo.
- **Inversão registrada:** o `Handler` do template já resolve o `UnitOfWorkFactory` pelo topo neutro (`:73-75`); o codm é que estava atrás. Sem upstream necessário.

→ **Consequência para a W2:** o par manifest/compose que ela leva ao template tem de mecanizar duas fases **desde o dia 1**, em vez de reproduzir a proteção por ordem de import.

### 8.4 Colisão T1.9 × o rail da sessão irmã — resolvida a favor da T1.9

A sessão irmã estendeu o `context-map.test.ts` para varrer o tronco cloud com `PG_TABLE_RE = /pgTable\('([a-z]+)_/`. A T1.9 (`05e77d23`) converteu o tronco para `pgSchema('ns').table('tabela')`, o que quebra aquele regex **por construção** — e ela própria classificou a extensão como INPUT, não como estado a preservar.

A intenção que sobrevive é *"o rail enxerga os dois troncos"*, e ela já está atendida aqui por outro caminho: `dialect.ts` resolve dono por dialeto (DIA-01..08) e `trunk-parity` compara **namespace + nome lógico** (TRK-01..06). No merge, o lado dela tem SQL cru com nome de schema público (`tests/kernel/insert-site-audit.test.ts`, bloco cloud: `SELECT * FROM "owner_owners"`; o truncate do `PGliteDriver`) que precisa virar qualificado — `"owner"."owners"`.
