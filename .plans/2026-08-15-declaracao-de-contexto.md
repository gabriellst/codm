# Declaração de contexto — manifesto co-locado + upstream dos consertos de família

**Status:** Aprovado (2026-08-15, ao colar o goal da W1). A W0-codm já está commitada e verde; a W1 (§4) está em execução na worktree `declaracao-de-contexto`. W0-template, W2 e W3 seguem pendentes de goals próprios.
**Origem:** sessão de design 2026-08-15. Racional completo em três documentos:
[diagnóstico](https://claude.ai/code/artifact/e30aa2d7-92f7-44c7-a685-6472b7aa7c4a) ·
[estrutura alvo](https://claude.ai/code/artifact/f16899b3-03d9-46db-86a8-4f2570df3ce1) ·
[walkthrough](https://claude.ai/code/artifact/2fda8462-f321-4e3e-bbe1-106cc153846c).
Specs irmãs no template: `.specs/2026-08-15-manifesto-de-contexto-design.md` e `.specs/2026-08-15-contexto-em-um-arquivo-design.md`.

**Direção do fluxo:** construir no `codm`, extrair para o `template-fullstack`. É o mecanismo documentado (`docs/ECOSYSTEM.md`: *"Improvements return only by deliberate curation — the `clean-branch` skill is the extraction vehicle from a fork back to canon"*), e o `codm` é o consumidor concreto que a doutrina exige antes de generalizar regra.

---

## 1. Estado medido — os dois repos não partem do mesmo ponto

| Peça | `codm` | `template-fullstack` |
|---|---|---|
| Lista de contextos | `src/manifest.ts:36` — *"os dez contextos como DADO, sem montar nenhum"*, `satisfies Record<ContextModule, ContextDescriptor>` | só `shared/contexts.ts` + `src/routers.ts` (a mesma lista, **feita de efeitos**) |
| Placement / infra por contexto | `shared/deployment.ts:136` — `PLACEMENT`, `{ when, infra }`, exaustivo | **não existe** |
| Eixo de dialeto | `deployment.ts:42,76` — `db: 'pg' \| 'libsql' \| 'none'` por contexto | **não declarado em lugar nenhum** |
| Composição | `compose.ts:185,191` — `composeContexts` + `rootFirst` (ordem **derivada**) | `routers.ts:40-48` (ordem **posicional**) |
| Ciclo de vida por contexto | slot **inexistente** no descritor → resíduo em `server.ts:164,192` | slot existe no kernel; só `shared` usa |
| `saveWithOptimisticLock` | ✅ dividido por família (W0-codm) | caminho **neutro**, **pg-only**, **6 importadores**, tipa `db: PgDrizzleClient` (client de LEITURA) |
| família libsql tem upsert guardado | ✅ sim | **não tem** |
| `closeDatabase()` | ✅ removido (W0-codm) | `core/src/db/index.ts:19` + `src/server.ts:139`, mesmo engolir |
| `PgTransaction` | ✅ no nível-meio (W0-codm) | em `services/UnitOfWork/pg/PgUnitOfWork.ts:11`, **zero importadores** |

**Leitura:** o `codm` está **à frente** na composição e **atrás** em nada. O template está atrás na composição e tem os mesmos defeitos de família que já consertamos aqui. Logo o upstream tem duas naturezas diferentes — consertos (mecânicos, prontos) e reforma (precisa de aval).

---

## 2. As decisões do design, e as correções que a leitura do código forçou

Cada uma nasceu de uma medição, não de gosto. Estão aqui porque o executor não deve re-derivá-las.

1. **`pgSchema` → `namespace`.** O campo nomeia o mecanismo físico de UM dialeto dentro do spine de domínio. No `codm` isso já é mentira dupla: o tronco local é `sqliteTable('ns_tabela')` e o tronco cloud é `pgTable('ns_tabela')` — **plano**, quando o certo é `pgSchema('ns').table('tabela')` como o template faz em `contracts/db/pg/schema/*.ts`. O prefixo é concessão obrigatória do SQLite que vazou para o dialeto que não precisa dela.
2. **`consumes` × `reads` são canais distintos.** `consumes` = import de módulo TS (vira `CONTEXT_MAP`); `reads` = tabela no banco (vira `TABLE_READ_EDGES`). O segundo existe porque o primeiro é cego — `context-map.ts:98`: *"It is **structurally blind** to the other half"*. Uniões de chave **diferentes**: `consumes` por `ContextModule`, `reads` por `Namespace`, porque um namespace pode pertencer a workspace que não é contexto TS.
3. **`satisfies`, não `defineContext(…)`.** Idioma da casa (94 ocorrências), `import type` = zero runtime, e o único `defineX` do repo (`defineMessages`) não é identity function. Nem estático em `BoundedContext`: composição é runtime, manifesto é build-time.
4. **Correção — faltava `ambient`.** `AMBIENT` não deriva só de `kind`: o valor real é `{ shared: '*', auth: ['middlewares'], owner: ['middlewares'] }` — dois contextos `domain` expõem superfície ambiental. Sem o campo, a derivação erraria em dois terços.
5. **Correção — a ordem de boot é semântica.** FIFO no start, LIFO no shutdown, `shared` primeiro porque sobe o transporte. No template ela anda na posição das chaves de um literal; no `codm` já é derivada (`rootFirst`). No alvo deriva de `kind`, e o `root: true` cai junto.
6. **Correção — `<ctx>/index.ts` não é 100% derivável.** O campo `jobs` carrega decisão: sete cadências condicionais em `BILLING_SANDBOX` (template `billing/index.ts:38-49`). A cadência vai para o próprio job como estático, igual a `Projector.events`. Feito isso, `index.ts` **deixa de existir** — nada importa a raiz de um contexto além do compositor.
7. **Ciclo de vida é decisão, não derivável.** `setup`/`start`/`shutdown` são closures com container. Vão para `<ctx>/lifecycle.ts`, presente só onde o concern existe. Medido: só `shared` declara algum, nos dois repos; `setup:` ninguém declara.

**Decisões 8–11 — resolvidas pelo gate de coerência (condição 0 do goal), 2026-08-15.** A verificação das 5 frentes acendeu 4 bloqueios, todos confirmados no código. Três eram a mesma omissão: **este plano foi escrito como se a W1 só mexesse em `src/<ctx>/`, e ela mexe no kernel e no `compose.ts`.**

8. **O kernel do codm não tem ciclo de vida — e a correção é porte do template.** `BoundedContextOptions` (`core/src/types/BoundedContext.ts:48`) tem **só** `setup?`; `grep shutdownAll` devolve zero. O template tem `start`/`shutdown`/`startAll`/`shutdownAll` com coleta de `ShutdownFailure[]`. O próprio repo já sabia — `src/shared/descriptor.ts:22-24`: *"o tipo do kernel daqui tem 12 campos e NÃO tem `start`/`shutdown` (o do template tem 13 e tem)"* — mas o comentário nunca virou tarefa.
   → **Nasce a T1.0**, antes de tudo: portar `start?`/`shutdown?`, `shutdownAll` (LIFO + coleta), e `JobDefinition` lendo `static repeat`. É porte downstream de algo já provado lá, e é o que torna a W2 simétrica em vez de reconciliar duas formas de kernel.
   *Erro de origem, registrado:* o desenho do ciclo de vida foi feito lendo o `BoundedContext.ts` do **template**, não o daqui.

9. **O agregado gerado é `Record`, não array.** `compose.ts:83,151,186` exigem `Record<ContextModule, ContextDescriptor>` e fazem acesso indexado em 8 pontos. O §2.1 emitia `CONTEXTS_BOOT = [ … ]`.
   → `composition.generated.ts` emite o **`Record`** que o `compose.ts` já consome, **mais um array separado só de ids** para a ordem de boot derivada de `kind`. O `compose.ts` fica intocado, e a ordem vira dado explícito em vez de posição.

10. **A composição condicional mora no barril de controllers — não num arquivo novo.** A Decisão 6 (`index.ts` deixa de existir) era falsa para 3 dos 10: `agent/index.ts:28,41` e `external/index.ts:12` têm carve-out sob `EMIT_OPENAPI`, e `shared/index.ts:45` faz dispatch por `byEnvironment`.
    → O `if` desce para **`<ctx>/controllers/index.ts`**, que é onde ele pertence: seleção de controller é assunto de controller. **Consequência boa:** com o condicional lá, o `<ctx>/index.ts` fica sem nada para fazer e a Decisão 6 volta a valer para **os 10**, não 7.
    → **Consequência a pagar, e ela corrige o §6:** o barril de controllers **deixa de ser alvo de geração** e continua autorado. Logo o **WIRE-03 NÃO fica vacuoso** e não pode ser aposentado. Para a composição ficar uniforme (sem `if` no gerador), todo contexto expõe o mesmo símbolo montado — o trivial nos 7, o condicional nos 3; a forma exata do export é decisão do `/plan` da DC2.

11. **O nome `ContextDecl` é do tipo novo; o antigo morre na T1.7.** Já existe `interface ContextDecl { pgSchema: string | null }` em `src/shared/contexts.ts:51-53`. Não colide no compilador (módulos distintos), e o campo único do antigo é exatamente o que a reforma elimina — ele sai junto com o `namespaces.ts`.

---

### 2.1 A estrutura, arquivo por arquivo — o que as decisões acima produzem

Em ordem de dependência. Cada camada só depende da de cima. **AUTORADO** = alguém escreve; **DERIVADO** = `bun sync` escreve e `bun sync:check` vigia.

```
packages/api/typescript/
  core/src/types/ContextDecl.ts        AUTORADO  o contrato genérico (kernel, não conhece contexto)
  src/
    contexts.ids.generated.ts          DERIVADO  uniões LITERAIS · zero imports
    shared/context.ts                  AUTORADO  o alias já amarrado (1 vez no repo)
    <ctx>/
      context.ts                       AUTORADO  a declaração — o único arquivo novo por contexto
      registry.ts                      AUTORADO  bindings DI (já existe, fica)
      lifecycle.ts                     AUTORADO  OPCIONAL — start/shutdown; hoje só `shared` e `agent`
      controllers/index.ts             AUTORADO  o barril + a seleção condicional (Decisão 10)
      entities/ usecases/ handlers/ jobs/ …
      (sem index.ts — a composição é central)
    contexts.generated.ts              DERIVADO  manifestos agregados  → substitui `manifest.ts`
    composition.generated.ts           DERIVADO  BoundedContext.create + registries → substitui `compose.ts` à mão

packages/contracts/db/
  namespaces.ts                        AUTORADO  namespace → dono · língua-neutra · UMA lista
  <dialeto>/schema/…                   AUTORADO  o schema físico por tronco

template.config.ts
  PROFILE                              AUTORADO  o que ESTE fork tem
```

**Mapa para o que o codm já tem:** `manifest.ts` vira `contexts.generated.ts` (mesma garantia de exaustividade, agora derivada dos `context.ts`); a metade manual de `compose.ts` vira `composition.generated.ts` (o laço e as amarras `assertInfraAgreement`/`assertFamiliesProvided` ficam, autorados); `deployment.ts` perde a coluna `db` do `ContextInfra` para o `PROFILE`+resolvedor, e o `PLACEMENT` sobrevive como o eixo `deployment` do fork.

#### 1 · O contrato (kernel, genérico)

```ts
// core/src/types/ContextDecl.ts — o kernel NÃO conhece a lista de contextos do produto
export interface ContextDecl<Ctx extends string = string, Ns extends string = string> {
	/** kernel = infra da máquina (outbox/events/idempotency), não um peer. Substitui a prosa dos `why`. */
	kind: 'domain' | 'kernel' | 'bff' | 'edge'
	/** só quando difere da chave do módulo (`auth` → `authentication`) */
	namespace?: Ns
	/** superfícies importáveis sem aresta declarada; `kind:'kernel'` implica '*' */
	ambient?: readonly string[]
	/** política de propriedade — hoje duplicada em 3 arquivos */
	tier?: 1 | 2 | 3 | 4
	/** arestas de IMPORT de módulo → vira CONTEXT_MAP */
	consumes?: Partial<Record<Ctx, string>>
	/** leituras de TABELA cross-namespace → vira TABLE_READ_EDGES */
	reads?: Partial<Record<Ns, string>>
	/** o que o stamp precisa para podar → vira CONTEXT_DECLS */
	removable?: { pairedWith?: readonly Ctx[]; why: string }
	/** capability que o fork precisa ter para este contexto embarcar */
	requires?: readonly Capability[]
}
```

#### 2 · As uniões, geradas como LITERAIS

```ts
// src/contexts.ids.generated.ts — gerado, SEM nenhum import
// Literal de propósito: derivar de `keyof typeof CONTEXTS` criaria inferência circular,
// porque cada context.ts se restringe por este tipo.
export type ContextModule = 'agent' | 'artifact' | 'auth' | 'external' | 'issue'
                          | 'owner' | 'shared' | 'thread' | 'ui' | 'workspace'
```

#### 3 · O alias amarrado — escrito UMA vez

```ts
// src/shared/context.ts
import type { ContextDecl as Base } from '@codm/core-typescript/types/ContextDecl'
import type { ContextModule } from '../contexts.ids.generated'
import type { Namespace } from '@codm/contracts/db/namespaces'

export type ContextDecl = Base<ContextModule, Namespace>
```

Assim todo `context.ts` fica com **um** import. Tudo é `import type` → some na compilação, zero aresta de runtime, ciclo impossível. E importar de `@shared` não pede aresta declarada: `shared` é `AMBIENT: '*'`.

#### 4 · A declaração — mínima e madura

```ts
// src/external/context.ts — o mínimo é uma linha de conteúdo
import type { ContextDecl } from '@shared/context'
export default { kind: 'edge' } satisfies ContextDecl
```

```ts
// src/agent/context.ts — maduro; cada campo entrou quando a necessidade apareceu
import type { ContextDecl } from '@shared/context'

export default {
	kind: 'domain',
	tier: 4,
	consumes: { workspace: 'IssueWorkAgent resolve o workspace do run' },
	reads:    { shared: 'o mailbox dobra a tabela de events para agendar turnos' },
	requires: ['agent-runtime'],
} satisfies ContextDecl
```

`satisfies`, não `defineContext(…)`: é o idioma da casa (94 ocorrências), e desde o TS 4.9 entrega tipagem contextual, autocomplete, excess-property check e preservação de literais — sem valor importado.

#### 5 · O ciclo de vida — só onde o concern existe

```ts
// src/agent/lifecycle.ts
export const start = async (c: DependencyContainer) => {
	resolve(c, MailboxDispatcher).bind(c).start()
}
export const shutdown = async (c: DependencyContainer) => {
	await resolve(c, AgentRunnerFactory).shutdown()
	await resolve(c, MailboxDispatcher).stop()
}
```

O gerador emite o import só onde o arquivo existe (`existsSync`, sem listas — o padrão que o repo já usa para variantes de skill). **É isto que apaga os dois `mounted.includes('agent')` de `server.ts:164,192` e o helper `step()`:**

```ts
// server.ts — o que sobra do stop()
async function stop() {
	await mainRouter.stop()                                     // processo
	const failures = await BoundedContext.shutdownAll(contexts) // LIFO + coleta
	await resolve(container, DatabaseDriver).close()            // processo, e é o ÚLTIMO
	if (failures.length) throw new Error('shutdown com passo(s) falhos')
}
```

A ordem cai de graça: a sequência manuscrita (`http → agent → mailbox → outbox → mediators → transporte → db`) **é** o LIFO da ordem de composição.

#### 6 · A única lista que sobra

```ts
// packages/contracts/db/namespaces.ts
// Colapsa TRÊS listas: CONTEXTS.pgSchema + FOREIGN_PGSCHEMAS + PENDING_PGSCHEMAS.
// Vive em contracts porque é língua-neutra (o Go também é dono) e porque um namespace
// pode existir ANTES do contexto — que é exatamente o contract lock da Fase 0.
export const NAMESPACES = {
	authentication: { owner: 'auth'    },   // nome difere da chave
	agent:          { owner: 'agent'   },
	shared:         { owner: 'shared'  },
	gateway:        { owner: 'apiGo'   },   // workspace, não contexto
} as const satisfies Record<string, NamespaceDecl>
```

`owner` que não é contexto existente nem `WorkspaceId` **não compila** — mesmo mecanismo do `assertUnionSlotOwners` (`contracts/codegen/lib/union-slots.ts:122-137`), já em produção.

#### 7 · O físico, atrás de um resolvedor por dialeto

```ts
interface DialectNamespace {
	declare(ns: string, table: string): PhysicalTable   // como o namespace vira tabela física
	tableOwners(): Map<string, string>                  // inverso, para o rail
}
// pg      → pgSchema(ns).table(table)       namespace NATIVO            ✔ alvo
// sqlite  → sqliteTable(`${ns}_${table}`)   prefixo (dialeto não tem)   ✔ alvo
// pg-flat → pgTable(`${ns}_${table}`)       estado atual do tronco cloud ✘ drift a corrigir
```

#### 8 · Os agregados derivados

```ts
// src/contexts.generated.ts — manifesto (importa objetos puros; rails leem sem instanciar container)
export const CONTEXTS         = { … } satisfies Record<ContextModule, ContextDecl>
export const CONTEXT_MAP      = { … }   // montado dos `consumes`
export const TABLE_READ_EDGES = [ … ]   // montado dos `reads`
export const AMBIENT          = { … }   // kind === 'kernel' → '*', mais os `ambient` declarados
export const TIER2_CONTEXTS   = [ … ]   // filtro sobre `tier`

// src/composition.generated.ts — runtime (importa barrels + registry; tsyringe entra aqui)
// RECORD, não array (Decisão 9): é a forma que `compose.ts:83,151,186` já consome, com
// acesso indexado em 8 pontos. A ordem sai num array SEPARADO, só de ids.
export const MANIFEST   = { … } satisfies Record<ContextModule, ContextDescriptor>
export const BOOT_ORDER = [ … ] as const  // rank de `kind`: kernel → domain → bff → edge
```

Três arquivos e não um porque têm pesos diferentes: `ids` (tipos, zero imports) → `contexts` (dado inerte) → `composition` (runtime). É o que mantém os rails baratos.

#### 9 · De onde vem cada campo do `BoundedContextOptions`

| Campo | Origem |
|---|---|
| `name` | nome da pasta |
| `root` | derivado de `kind: 'kernel'` |
| `controllers` · `middlewares` · `skipMiddlewares` | barrels gerados |
| `internalHandlers` · `externalHandlers` · `projectors` | barrels gerados |
| `jobs` | barrel + `static repeat` no próprio job |
| `registry` | **`registry.ts`** — autorado |
| `setup` | ninguém usa hoje |
| `start` · `shutdown` | **`lifecycle.ts`** — autorado, opcional |

A cadência sai do `index.ts` e vai para o job, como `Projector.events` já faz:

```ts
export class BillingClockJob {
	static repeat = { every: ProductConfig.env.BILLING_SANDBOX ? 60_000 : 3_600_000 }
}
```

#### 10 · O perfil do fork

```ts
// template.config.ts
export const PROFILE = {
	dialect: 'sqlite',
	trunks:  { local: 'sqlite', cloud: 'pg' },
	capabilities: ['agent-runtime', 'redis', 'otel'],   // ausência É a declaração
} as const satisfies ProfileDecl
```

`requires` do contexto encontra `PROFILE.capabilities`: capability ausente → contexto não embarca, com **recusa nomeada**. Fases à la Quarkus: "este fork tem sqlite" é build-time-fixed; "a connection string" é run-time.

---

## 3. W0 — Consertos de família

### W0-codm — **FEITO**, verde no working tree

| # | Mudança | Prova |
|---|---|---|
| T0.1 | `saveWithOptimisticLock` sai do caminho neutro para `db/pg/` + `db/libsql/`; exports prefixados (`pgSaveWithOptimisticLock` / `libSqlSaveWithOptimisticLock`) porque o `tsc` recusa a ambiguidade (**TS2308**) nos dois `export *` do barril neutro — precedente `pg/client.ts` → `PgDrizzleClient` | 30 testes em `core/src/db` |
| T0.2 | Gêmeo pg nasce com testemunha própria (3 casos, contra Postgres real via PGlite) | **falseador provado**: removido o `setWhere`, o caso 3 fica vermelho; restaurado, verde |
| T0.3 | `closeDatabase()` removido; `server.ts` usa `resolve(container, DatabaseDriver).close()` dentro do `step()` existente | tsc + suite |
| T0.4 | `PgTransaction` move de `services/UnitOfWork/pg/PgUnitOfWork.ts` para o nível-meio `db/pg/PgDatabaseDriver.ts`, exportado pelo barril da família; 4 consumidores atualizados | espelha os 8 consumidores de `LibSqlTransaction` |
| T0.5 | `PgIdempotencyGuard.txClient` ganha assinatura honesta `PgTransaction \| PgDrizzleClient` — antes fazia `as PgDrizzleClient`, dizendo "client de LEITURA" para um handle de escrita | tsc |

**Achados registrados:** o `closeDatabase` **engolia o erro** (`catch` sem relançar), o que neutralizava o `step()` do shutdown — falha ao fechar o banco nunca reprovava, `exit 0`. E o `server.ts` já usava o port direto na linha 134 (`runMigrations()`): o wrapper era o único fora do padrão até dentro do próprio arquivo.

⚠️ **Mudança de comportamento observável:** falha ao fechar o banco agora conta como passo falho e o `index.ts` sai com 1.

### W0-template — a fazer

| # | Tarefa | Nota |
|---|---|---|
| T0.6 | `closeDatabase` sai (`core/src/db/index.ts:19`), call site vira port direto (`src/server.ts:139`) | idêntico ao codm |
| T0.7 | `PgTransaction` move para `db/pg/PgDatabaseDriver.ts` + barril | **zero importadores** no template — é o momento barato de fazer |
| T0.8 | Split do `saveWithOptimisticLock`: o existente vira `db/pg/`, o gêmeo `db/libsql/` **nasce** (hoje a família libsql do template não tem upsert guardado por versão) | 6 importadores em `src/billing/repositories/` |
| T0.9 | **Corrigir a divergência de tipo na subida**: o template tipa `db: PgDrizzleClient`; o certo é `PgTransaction` | pode acender vermelho em call site que passa o client de leitura — **se acender, é achado, não regressão** |
| T0.10 | Testemunhas nos dois dialetos + falseador provado em cada | espelhar o par do codm |

### W0-template — o que vem da sessão de reconciliação

Dossiê completo, com verificação item a item no template: **`.plans/2026-08-15-upstream-reconciliacao.md`**. Dos 58 commits daquela sessão, a maior parte foi porte **template → codm**; sobram 7 itens de upstream. Estes entram aqui porque são independentes entre si e não exigem aval de doutrina:

| # | Tarefa | Evidência |
|---|---|---|
| T0.11 | `graph`: matar o `describeIf` de fixture ausente e dar `skipped` ao `ValidationResult` | **vermelho AGORA**: `bun test scripts/graph` → 64 pass / 10 skip / 3 fail, dentro de `test:tooling`. `validate-plan-cmd.ts:284-290,540` + `cli/index.ts:302-308` imprimem `OK` para regras nunca avaliadas |
| T0.12 | `slice-closure`: `else` que vira finding quando a raiz de composição some | `slice-closure.ts:954-955,999` — sem `else`; a lição já foi aplicada uma linha abaixo (`:963-973`) e não acima |
| T0.13 | `test-liveness`: acumular `cd` entre segmentos e resolver `--manifest-path` | `test-liveness.test.ts:208` e `:170,220-223` — latente, mas o rail acusaria o repo por cegueira dele |
| T0.14 | `sqlc`: `-f <config absoluto>` no lugar de `{ cwd }` | `sqlc-parity.test.ts:28-29` — Task 1 Step 3 da W4 que ficou para trás |
| T0.15 | **Frente própria** — `NodePgDriver` que CONFERE e RECUSA | `NodePgDriver.ts:92-98`: o driver de PRODUÇÃO lança `NOT_IMPLEMENTED` em `runMigrations` **e** `readMigrations`. Um `real` sobre schema atrasado troca erro de deploy por corrupção silenciosa. Respeitar o incidente FASE F (`server.ts:85-86`) |

---

### 3.1 Inventário da pesquisa (condição 2 do goal) — medido 2026-08-15

O grep final da W1 tem de provar **zero fora deste inventário**.

**(a) Guards por nome de contexto — 2 em TS, 0 em Go.**

| Onde | O quê |
|---|---|
| `src/server.ts:163` | `if (mounted.includes('agent'))` — liga o `MailboxDispatcher` |
| `src/server.ts:191` | `if (mounted.includes('agent'))` — espelho no `stop()` |

Os dois somem na **DC3**, quando o ciclo de vida descer para `agent/lifecycle.ts`. Um terceiro hit (`agent/types/Agent.ts:164`) é **prosa em comentário**, não guard. Do lado **Go: zero** — coerente com a condição (3), o Go aqui é gateway e não tem universo `ContextModule`.

**(b) Cadências `repeat:` fora do próprio job — 3, em 3 contextos distintos.**

| Onde | Job | Cadência |
|---|---|---|
| `src/shared/index.ts:85` | `PruneOutbox` | 24 h |
| `src/issue/index.ts:17` | `AutoArchiveCompletedIssues` | 1 h |
| `src/thread/index.ts:39` | `FireDueLoops` | `FIRE_DUE_LOOPS_INTERVAL_MS` |

As três migram para `static repeat` na **DC2**; o kernel já sabe lê-las (DC0 T2). Correção de premissa: o plano dizia que as cadências estavam concentradas em `billing` — **isso era medição do template**. Aqui são 3, espalhadas, e nenhuma em billing (que não existe neste fork).

**(c) Literais de dialeto por tronco — o drift confirmado.**

| Tronco | `sqliteTable(` | `pgTable(` | `pgSchema(` |
|---|---|---|---|
| local — `db/schema` (9 arquivos) | **sim** | 0 | **0** |
| cloud — `db/cloud/schema` (3 arquivos) | 0 | **sim** (13 tabelas) | **0** |

É a medição que originou a reforma inteira: **o tronco Postgres é PLANO**. Ele tem namespace nativo disponível e não o usa — o prefixo, que é concessão obrigatória do SQLite, vazou para o dialeto que não precisa dela. Corrigir isso é a T1.9, e é o resolvedor de dialeto (T1.8) que a torna troca de implementação em vez de reescrita das 13 tabelas.

## 4. W1 — O manifesto co-locado (no `codm`)

Ordem escolhida porque a distância é menor aqui: o `codm` já tem `manifest`/`PLACEMENT`/`compose`. O que falta é co-locar, gerar e fechar o slot de ciclo de vida.

| # | Tarefa |
|---|---|
| **T1.0** | **KERNEL, antes de tudo (Decisão 8).** Portar do template: `start?`/`shutdown?` em `BoundedContextOptions`, `BoundedContext.shutdownAll` (LIFO + `ShutdownFailure[]`), e `JobDefinition` lendo `static repeat`. Mais: `composeContexts` passa a devolver as instâncias (hoje `compose.ts:198-199` guarda só `.router`), senão não há o que entregar ao `shutdownAll` |
| T1.1 | **FEITA** (`63a5a353`) — `ContextDecl<Ctx, Ns>` genérico no core; alias amarrado em `shared/context.ts`; `contexts.ids.generated.ts` com as uniões **literais** (derivar de `keyof typeof CONTEXTS` daria inferência circular) |
| T1.2 | **FEITA** — o gerador (`scripts/contexts/aggregate.ts`) emite os dois derivados a partir dos `<ctx>/context.ts`; a prova diff-zero rodou ANTES da troca de fonte (§4.2). Gerador `bun sync` que emite `contexts.generated.ts` + `composition.generated.ts` a partir dos `<ctx>/context.ts`. **Prova de correção: reproduzir `manifest.ts` + `PLACEMENT` atuais byte a byte** — mesmo gate diff-zero do `schema-drift.test.ts` |
| T1.3 | **FEITA** — dez `context.ts`; a PASTA virou o spine. Cinco arquivos centrais viraram dois derivados. Ver §4.3 |
| T1.4 | **FEITA** (`573e767c`) — cadência nos três jobs reais como `static repeat`; barrels mecânicos; rail `job-cadence.test.ts` com falseador. Executada **fora do gate §9.1**: mover cadência não co-loca declaração nem revisa a decisão de spine — o plano a lista sob a DC2 por conveniência de ordem, não por dependência |
| T1.5 | **FEITA** — `shared/lifecycle.ts` e `agent/lifecycle.ts`; os dois `mounted.includes('agent')` e o `step()` apagados; `stop()` em três passos (HTTP → `shutdownAll` → banco). Executada fora do gate §9.1: ciclo de vida em `<ctx>/lifecycle.ts` é a Decisão 7 registrada, e não é a decisão de spine — só o ponto de amarração de 2 linhas se move na DC2. Rail `lifecycle.test.ts` |
| T1.6 | **FEITA** — `BOOT_ORDER` derivado do `kind` (kernel → domain → bff → edge); `rootFirst` morreu; `root: true` sobrevive no descritor mas é EMITIDO, não declarado |
| T1.7 | **FEITA** (`725ddf99`) — `packages/contracts/db/namespaces.ts` colapsa `CONTEXTS.pgSchema` + `FOREIGN_PGSCHEMAS` + `PENDING_PGSCHEMAS` numa lista língua-neutra; `owner` validado contra `REPO.workspaces` no padrão `assertUnionSlotOwners` |
| T1.8 | **FEITA** (`4fd9c45d`) — `DialectNamespace`, resolvedor por dialeto; cisão do rail: domínio fica em `architecture/context-map.test.ts`, paridade namespace↔físico vai para `db/schema-ownership.test.ts`, um por tronco |
| T1.9 | **FEITA** (`05e77d23`) — tronco cloud volta a `pgSchema('ns').table('tabela')`. Ver §4.1 para o que ela custou de verdade |
| T1.10 | **FEITA** — `bun context show <ctx> [--json]` e `bun context map [--json]`, lendo as fontes de HOJE (quando a DC2 co-locar, só a leitura muda; a superfície fica igual). Rail `scripts/context.test.ts`, falseador na aresta inversa: 4/1 desligada, 5/0 ligada. **Achado de nome:** `bun cli context <nome>` já existe e GERA um contexto — o verbo ficou sobrecarregado; implementei o nome que o plano decidiu e deixei a decisão de renomear com quem o escreveu |

---

## 5. W2 — Upstream da reforma

**Reenquadramento imposto pelo dossiê de reconciliação.** A W2 não é "portar o desenho novo": o codm **já construiu** o mecanismo (descritor + manifesto + laço de composição, `f423a750`…`8a24a0e6`), e o dossiê o precificou — **custo alto, 575 testes vermelhos na primeira tentativa aqui**, porque o `TestBed` montava container sem compor. A W2 fica **mais barata em desenho e mais cara em execução** do que este plano supunha.

Duas amarras novas:
- **Vai em pacote com a causa raiz da dupla registração de DI.** São o mesmo diff: sem composição explícita a raiz precisa do merge, e enquanto a raiz tem o merge todo token de contexto de produto é registrado duas vezes (`BoundedContext.ts:184-189` + `shared/registry.ts:253-270` + `shared/index.ts:36-45`; o descarte de singleton é real em `tsyringe-neo/dist/index.js:257,399,405`). Precisão: no template **não é todo token que dobra** — o `CORE_REGISTRY` entra uma vez; dobram os dos seis contextos de produto.
- **NÃO leva a `PLACEMENT` nem o eixo `deployment`.** O template não tem segundo deployment; a tabela viraria decoração — exatamente a classe de defeito que a sessão de reconciliação passou 23h caçando.

| # | Tarefa |
|---|---|
| T2.1 | Template ganha o par `manifest`/`compose` (não tem) — é a peça que o `codm` já provou em produção |
| T2.2 | Template ganha `context.ts` co-locado + gerador + `lifecycle.ts` |
| T2.3 | `scripts/create-template/contexts.ts`: os `strips` de regex **morrem**. Hoje remover `notifications` custa 3 prunes + 9 padrões em 7 arquivos, incluindo um que atravessa linhas para casar um literal de objeto e outro acoplado à indentação por tab **e ao nome do campo** — renomear `pgSchema` quebra a receita de strip, e essa dependência não aparece em import nenhum |
| T2.4 | `PROFILE` + `requires` no `template.config.ts` — generaliza o `Criteria`/`PLACEMENT` do codm |

---

## 6. W3 — Poda (só depois do gerador verde)

Entra aqui também o **`context-barrels`** da sessão de reconciliação (`19a8dab1`) — mesma família de pergunta: quais portas **devem** existir. É o único rail genuinamente novo daquela sessão, e está ausente dos três lados no template (`scripts/lib/context-layers.ts` e `scripts/context-barrels.test.ts` não existem; `scripts/cli/wire.ts:163-164` cria o barril incondicionalmente; censo de **55** barris de camada; e `.claude/skills/bounded-context/SKILL.md:59-87` os **prescreve**). Não é conserto de acidente — é mudança de convenção declarada, e os `why` da tabela são medição do codm que **tem de ser re-medida** nos 7 contextos de lá.

Rails que ficam **vacuosos por construção** e podem ser aposentados: WIRE-01/02 (`wiring-completeness.test.ts:16-18`, testes a partir de `:126`), as pernas de `slice-closure` sobre chave de registry e `import './errors'` (`:1093-1118`), e a paridade do barrel de schema. Derivar não corta só edição — apaga a classe de falha e o rail que existia para vigiá-la.

**Correção imposta pela Decisão 10: o WIRE-03 sai desta lista.** Ele vigia que todo controller esteja exportado no barril, e o barril de controllers **continua autorado** — é lá que a seleção condicional passou a morar. Um rail só se aposenta quando vira vacuoso *por construção*; este não vira.

---

## 7. Condições de término

1. `bun tsc` e `bun run test` verdes nos dois repos, sem regressão de contagem.
2. `saveWithOptimisticLock` não existe em caminho neutro em nenhum dos dois repos; cada família tem o seu, com testemunha e **falseador provado** (remover o `setWhere` fica vermelho).
3. `closeDatabase` não existe; o passo de banco do `stop()` resolve o port direto e uma falha reprova o shutdown.
4. `PgTransaction` é declarado uma vez, no nível-meio da família, nos dois repos.
5. Nenhum `mounted.includes('<contexto>')` no `server.ts`; nenhum helper `step()` por recurso.
6. Criar um contexto toca **um** arquivo autorado (`context.ts`) mais o `registry.ts`; nenhum arquivo compartilhado.
7. Remover um contexto é `rm -rf src/<ctx> && bun sync`; zero padrões de regex na receita de strip.
8. `bun sync:check` reprova em CI se qualquer derivado estiver defasado, com falsificador (derivado editado à mão fica vermelho).
9. O gerador reproduz o estado pré-reforma **byte a byte** antes de virar fonte (gate diff-zero).
10. `bun context show` existe e responde por contexto.
11. Nenhum namespace declarado sem dono; nenhum dono que não seja contexto existente ou `WorkspaceId` (erro de compilação).

### 4.1 T1.9 executada — e o que ela custou além das 13 tabelas

O plano previa "troca de implementação, não reescrita". A troca das declarações foi barata mesmo (5 arquivos, meia hora). O que **não** estava previsto:

1. **A migração não pode ser gerada.** O `drizzle-kit generate` vê 13 tabelas sumirem e 13 aparecerem e abre um prompt por tabela (`promptNamedWithSchemasConflict`); sem TTY ele aborta, e com TTY a resposta "nova" produziria `DROP` + `CREATE`. A `0001_native_namespaces.sql` é autoral — `SET SCHEMA` + `RENAME TO` + 9 `RENAME CONSTRAINT` — e o snapshot foi gerado à parte, num diretório de rascunho vazio onde não há estado anterior e portanto não há pergunta. A prova de que as duas metades concordam é a geração seguinte dizer *"No schema changes, nothing to migrate"*.
2. **`tsc` não viu nada.** Os 7 projetos ficaram verdes com o tronco já convertido. Quem acusou foram **22 testes contra Postgres real** — e é o argumento mais forte que este repo tem para manter o PGlite: sem ele a T1.9 teria sido mergeada compilando e quebrado no primeiro boot da nuvem.
3. **O achado que vale mais que a conversão.** `PgCommandQueue` tinha o nome da tabela **redigitado** dentro de um `ON CONFLICT DO UPDATE` em SQL cru. Mover a tabela o quebrou em runtime (`missing FROM-clause entry`). SQL cru é string, e string não é conferida por ninguém. Agora vem de `getTableName()`; o gêmeo libsql recebeu a mesma derivação preventivamente.
4. **Três rails mudaram de sinal, e isso é saúde.** DIA-07 nasceu medindo o defeito e virou guarda da correção. O `trunk-parity` deixou de comparar por prefixo achatado e passou a comparar **namespace + nome lógico** — cada dialeto chega lá pelo seu caminho, e a comparação passou a falar de lógica em vez de nomenclatura. PGL-01 consultava `schemaname = 'public'`, que ficou vazio.

**Restrição respeitada:** nada foi aplicado a banco nenhum. A migração é passo de deploy manual (ADR 0005), e a geração rodou com URL de fachada que não conecta.

### 4.2 T1.2 — a metade provável está feita, e a outra metade tem um ACHADO

A T1.2 pede duas coisas: um gerador que emita o agregado a partir dos `<ctx>/context.ts` (depende do gate §9.1), e a **prova diff-zero de que ele reproduz `manifest.ts` + `PLACEMENT` byte a byte antes de virar fonte** (não depende). Executei a segunda, que é a que de-risca a primeira.

**`manifest.ts`: reproduzido byte a byte, e a ordem é derivada.** `renderManifest(manifestOrder())` bate exatamente com o arquivo em disco. A ordem não foi redigitada: o `CONTEXTS` declara `auth, owner, shared, …` e o manifesto lista `shared, auth, owner, …`, e o gerador fecha a diferença lendo QUEM declara `root: true`. Isso antecipa o falseador da T1.6 sem executá-la. Falseado de verdade: trocando a regra pela ordem de declaração pura, MAN-01 e MAN-02 ficam vermelhos (11 pass / 2 fail); restaurada, 21/0. Nada disso torna `manifest.ts` gerado — ele segue autorado, porque trocar a fonte é a DC2.

**`PLACEMENT`: ACHADO — não é reproduzível byte a byte por co-locação, e o plano precisa saber disso antes da DC2.**

Medido no corpo da tabela: **28 linhas — 12 de comentário, 13 de dado, 3 em branco**. Quase metade é prosa, e são **3 cabeçalhos de seção**, um dos quais (`── identidade e tenancy: CLOUD-ONLY (ADR 0001, W3 Task 4c) ──`) cobre **dois** contextos, `auth` e `owner`.

Duas consequências, e nenhuma é fatal — mas as duas mudam o que a DC2 pode prometer:

1. **Um comentário que pertence a dois contextos não se co-loca.** Ou ele é duplicado nos dois `context.ts` (e passa a ter duas cópias que divergem), ou é dropado (e a razão registrada some), ou passa a morar num cabeçalho do gerador (e deixa de ser co-locado, virando a lista central que a reforma quer apagar). São três opções com custos diferentes, e escolher por conta própria seria improvisar sobre a substância do plano.
2. **O `PLACEMENT` é quase todo DECISÃO, não derivação** — por que `auth` é cloud-only, por que `external` é `'none'`, por que repetir `libsql` é deliberado. A doutrina da casa (*"derive o que é derivável; declare só decisões"*) diz que esse conteúdo fica declarado. Co-locar move ONDE ele é declarado; não o torna derivável. Então a "prova diff-zero do `PLACEMENT`" só é alcançável se a prosa viajar dentro de cada `context.ts` — o que é factível, mas é uma entrega maior do que "o agregado não muda de forma, só de fonte" sugere.

**Pergunta que vai junto do gate §9.1, porque é a mesma decisão:** se a co-locação for autorizada, o que acontece com os 3 cabeçalhos de seção do `PLACEMENT` — duplicar, dropar, ou mantê-los num cabeçalho do gerador?

### 4.3 DC2 executada — o que o código apontou que o plano não previa

**Três colisões**, todas descobertas pelo compilador ou por um rail, nenhuma por leitura:

1. **O alias e a declaração do kernel colidiam.** O §2.1 punha o alias amarrado em `shared/context.ts` e, na mesma tabela, mandava todo `<ctx>/context.ts` ser a declaração daquele contexto. As duas regras colidem exatamente em `shared`. Só apareceu quando o bootstrap sobrescreveu o alias com a declaração do kernel — que passou a importar a si mesma. O alias foi para `src/context.ts`, raiz de composição, onde o `manifest.ts` já morava pela razão gêmea (*"um arquivo solto em `src/*.ts` que não pertence a contexto nenhum"*).
2. **`SHARED_REGISTRY` × `INSTANCE_REGISTRY`.** Nove contextos exportavam um nome, o `shared` outro. Um gerador uniforme não pode ter esse ramo; o nome ficou um só.
3. **O registro de vocabulário OpenAPI não era do `shared`.** Ele agrega quatro contextos e morava no `setup` do kernel por conveniência histórica (o kernel montava primeiro). Quando o `setup` mudou de arquivo, o rail de fronteira acusou dois imports cross-context que só passavam por uma isenção concedida ao arquivo antigo. **A isenção estava certa; o arquivo é que era o errado** — agregar quatro contextos é raiz de composição, e agora mora em `src/openapi.ts`.

**A sonda da AC-6, e o achado que ela produziu.** Criei um contexto `probe` com o mínimo (`context.ts` + `registry.ts` + `controllers/index.ts`), rodei `contexts:sync` — passou — e deixei o `tsc` dizer o que faltava. Ele exige **dois** arquivos compartilhados, e eles são de naturezas opostas:

| arquivo | natureza | veredito |
|---|---|---|
| `shared/deployment.ts` (`PLACEMENT`) | **decisão** — onde o contexto monta, sob quais critérios | fica. O §2.1 o mantém de propósito como o eixo `deployment` do fork |
| `shared/registry.ts` (`CONTEXT_REGISTRIES`) | **agregação pura** — id → o registry que o contexto já exporta | **é a última lista central do repo, e é derivável** |

O `CONTEXT_REGISTRIES` tem o mesmo shape do `MANIFEST`: uma entrada por contexto, checada pelo compilador, zero decisões. O gerador já emite `import { INSTANCE_REGISTRY as <id>Registry }` para montar o descritor — emitir o mapa junto é mecânico.

**Por que NÃO foi feito nesta leva, e a pergunta que fica:** o detector `slice-closure` tem uma checagem que existe *porque* esse mapa é escrito à mão ("registry importado mas mapeado sob a chave de contexto ERRADA"). Gerá-lo torna aquela checagem sempre-verde neste repo — vacuosa de fato, embora continue valendo para o template e para forks que ainda escrevem o mapa à mão. O goal exige **provar a vacuidade antes de aposentar um rail**, e essa é uma decisão sobre o rail, não sobre o gerador. Fica proposta, não executada.

**A AC-7 foi verificada empiricamente, não afirmada:** `rm -rf src/probe && bun contexts:sync` deixou o `tsc` limpo e o `git status` com **0** alterações.

### 7.1 Aferição das ACs — 2026-08-15, medida no código

**Achado sobre o próprio §7, e ele importa: quatro ACs dizem "nos dois repos", mas o goal da W1 cobre SÓ o codm.** O W0-template é goal próprio (§3). Logo o §7 **não pode ficar verde sob um goal de W1** — as ACs foram escritas para o programa inteiro, não para esta frente. Não é falha de execução: é escopo mal recortado na hora de escrever o §7.

| AC | Estado | Prova / porquê |
|---|---|---|
| 1 · tsc e test verdes nos dois repos | **parcial** | codm verde: tsc 7/7 · api **1448** · core 265 · tooling 717 · contracts 92 · Go build+test exit 0. `app-react` (3 fail) e `app-tauri` já estavam vermelhos **antes** da T1.9 — medido no commit anterior, não suposto: 262/3 e "resource path `binaries/codm-daemon-aarch64-apple-darwin` doesn't exist", que é bootstrap de worktree, não schema. Template: intocado (W0-template é outro goal) |
| 2 · upsert fora do caminho neutro, com falseador | **parcial** | codm ✓ — `core/src/db/saveWithOptimisticLock.ts` não existe; par por família com falseador provado (`d12244db`). Template: pendente |
| 3 · `closeDatabase` não existe | **parcial** | codm ✓ — zero ocorrências em `packages/api/typescript`. Template: pendente |
| 4 · `PgTransaction` declarado uma vez, no nível-meio | **parcial** | codm ✓ — uma declaração, em `core/src/db/pg/PgDatabaseDriver.ts:17`. Template: pendente |
| 5 · zero `mounted.includes` e zero `step()` | **ATENDIDA** | ambos apagados na T1.5, mais cinco imports que a raiz carregava para parar recursos que não adquiriu. Rail LIF-01 (varredura (a) da condição 2), falseado: literal de contexto de volta → 3 pass / 1 fail |
| 6 · criar contexto toca um arquivo autorado | **parcial — MEDIDA, não estimada** | sonda `probe`: `context.ts` + `registry.ts` + `controllers/index.ts` bastam para o `contexts:sync`, e o `tsc` então exige DOIS arquivos compartilhados: `PLACEMENT` (onde monta — DECISÃO, mantida de propósito pelo §2.1) e `CONTEXT_REGISTRIES` em `shared/registry.ts` (pura agregação id→registry — DERIVÁVEL, e é a última lista central do repo). Ver §4.3 |
| 7 · remover é `rm -rf && bun sync`, zero regex | **ATENDIDA — verificada empiricamente** | `rm -rf src/probe && bun contexts:sync` → `tsc` limpo e `git status` com **0** alterações. Zero regex na receita, zero arquivo compartilhado tocado |
| 8 · gate reprova derivado defasado, com falsificador | **ATENDIDA** | `bun contexts:check` sai 1 com o arquivo editado à mão, 0 restaurado. Nome ajustado (`sync:check` já existe e é o trem de forks) |
| 9 · gerador reproduz byte a byte antes de virar fonte | **parcial** | ✓ uniões (CTX-01) · ✓ **`manifest.ts` (MAN-01, byte a byte, com ordem derivada de `root: true` e falseador provado em 11/2)** · ✗ `PLACEMENT` — ver o achado do §4.2: 12 das 28 linhas do corpo são prosa e 1 cabeçalho cobre dois contextos |
| 10 · `bun context show` | **ATENDIDA** | `bun run context show issue` e `bun run context map` respondem; `--json` emite a visão estruturada; contexto inválido sai 1 NOMEANDO os válidos |
| 11 · nenhum namespace sem dono; dono inválido não compila | **ATENDIDA** | `owner: 'naoExiste'` → `TS2322`; restaurado, 0 erros |

**Placar honesto:** **5 atendidas** · **6 parciais** · **0 bloqueadas**. Das 6 parciais, 4 são por escopo de repo (dizem "nos dois repos", e este goal cobre só o codm), 1 é a prova diff-zero do `PLACEMENT` — que o §2.1 não gera, então não há o que provar — e 1 é a AC-6, cujo resíduo está medido no §4.3: um arquivo compartilhado que é decisão e fica, e um que é agregação e pode sair.

**Varreduras da condição (2), estado atual:** (b) `grep -rn "repeat:" src/` → **ZERO** desde a T1.4 · (c) `pgSchema(`/`pgTable(` por tronco → cloud em `pgSchema` nativo desde a T1.9, gate em TRK-05 · (a) guards por nome de contexto → **2** `mounted.includes(` e **1** `step()` em `server.ts`, que é a T1.5 esperando o gate.

### 7.2 Condição (3) GO-SHARING — executada, com resultado negativo justificado

A regra que esta reforma cria é sobre **declaração de bounded context**, e a skill que a ensina é `.claude/skills/bounded-context/` — que é **flat**: tem só `SKILL.md` e `registry.yaml`, sem `typescript/` nem `go/`. É lang-agnostic por desenho, e o `CLAUDE.md` a lista assim. As skills que têm par Go são as de artefato (`controller`, `entity`, `enum`, `errors`, `event`…), e nenhuma delas ganhou regra nova aqui.

Do outro lado, o Go deste repo é o gateway (`internal/{channel,shared}`) e **não tem universo `ContextModule`** — a varredura (a) da condição 2 mediu zero guards por nome de contexto lá.

→ **Não há par Go a escrever, e não haver é o resultado correto** — não uma pendência. Escrever um exemplo Go para uma regra que o Go não pode violar seria a cerimônia decorativa que este programa passou a sessão inteira caçando.

**E nada foi escrito na skill ainda, de propósito.** A co-locação não existe até a DC2; ensiná-la agora faria a skill descrever um repo que não é este — exatamente o defeito "skill ensina vocabulário morto" que a spec de saneamento nomeou. A atualização da `bounded-context` é entrega da DC2, junto com o que ela torna verdadeiro.

---

## 8. Restrições invioláveis

| Restrição | Origem |
|---|---|
| Não derivar o spine de imports observados | `.plans/2026-07-21-declarative-repo.md:41` — *"intenção antes de derivar"* |
| Granularidade fina por aresta permanece **rejeitada** | decisão v3, 2026-07-21 |
| `CROSS_CONTEXT_POLICY` está **fechada** — legalidade vem de estar em `allowed` | 2026-08-02, custo medido = 0 violações |
| Liveness **bidirecional**: encolher também reprova | catraca `TEST_EDGE_DEBT` — *"o número é um FATO, não um orçamento"* |
| Todo rail tocado carrega **testemunha RED provada** | lei da casa |
| A prosa de `context-map.ts` é load-bearing (`:209-212`) | a receita de strip casa texto case-insensitive, comentários inclusos |
| Não fechar pool de banco num hook de contexto | `BoundedContext.ts` — *"isso é de processo, é o ÚLTIMO passo, e continua sendo da raiz"* |
| Nenhum pump ligado em import-time | rails `pump-arming-order` + `tests/kernel/boot-clean.test.ts` |

---

## 9. Gates humanos

1. **W1 exige aval de doutrina.** `.plans/2026-07-21-declarative-repo.md:20` designou `contexts.ts` como **spine** e o manteve deliberadamente como lista manual central. Co-locar revisa essa decisão. Argumento a favor: a preocupação registrada era *não derivar o mapa dos imports reais* — aqui nada é observado, `context.ts` é artefato autorado, e só a **agregação** vira derivada (agregação já é derivada hoje: `ALL_REGISTRIES`, `ALL_ROUTERS`). Mas é revisão, não leitura.
2. **T0.9 pode acender vermelho.** Se algum dos 6 call sites do template passa o client de leitura, o aperto de tipo acusa. É achado — decidir se conserta na mesma leva ou vira ticket.
3. **W0-codm mudou comportamento de shutdown** (falha ao fechar banco agora reprova). Confirmar ou reverter.

---

## 10. Fora de escopo

- Famílias NoSQL (`Deferred` por decisão do founder).
- Mudança na `CROSS_CONTEXT_POLICY` ou na granularidade das arestas.
- Topologia de deploy (eixo mudo, mas independente deste).
- Dual-schema de produto no tronco sqlite.

---

## 11. Sequência recomendada

**W0-template** primeiro — mecânico, sem aval, e fecha o buraco da família libsql do template. Depois **W1** (com o gate §9.1 resolvido antes de T1.3). **W2** só com W1 verde. **W3** por último, e cada rail aposentado precisa da prova de que virou vacuoso, não de que ficou inconveniente.

**Ordem interna da W1, corrigida pelo gate de coerência:** `DC0 kernel (T1.0)` → `DC1 contrato+gerador` → `DC2 migração dos 10 contextos` → `DC3 ciclo de vida` → `DC4 namespaces+dialeto` → `DC5 introspecção`. O goal listava cinco frentes; a verificação da condição (0) achou o pré-requisito de kernel que faltava, e é exatamente para isso que aquela condição existe.

**Exceção que pode ir em paralelo:** a **T1.7** (`packages/contracts/db/namespaces.ts` + `type Namespace`) não depende de nenhuma outra tarefa — as três listas que ela colapsa já existem em `src/shared/contexts.ts:20-73`, e o `owner` valida contra `REPO.workspaces`, que já existe. É o único entregável da W1 com zero dependências.
