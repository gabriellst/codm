// src/shared/deployment.ts — O que LIGA o eixo de alocação: a tabela resolvida, a leitura do
// ambiente, e o mapa de bindings por família. Substitui `src/shared/cloud-profile.ts` (cujo
// `CLOUD_CONTEXTS: ReadonlySet` era a SEGUNDA cópia do conjunto montado — aqui o conjunto é
// derivado da tabela, não declarado).
//
// ── O QUE DEIXOU DE MORAR AQUI ──────────────────────────────────────────────────────────────────
// As DECLARAÇÕES. `Deployment`, `Criteria`, `DatabaseFamily`, `InfraChoices`, `ContextInfra`,
// `Axis` e `Placement` foram para `@codm/contracts/placement`, junto do contrato de declaração de
// contexto que as usa. A razão está escrita lá: `Placement` é a forma do campo `placement` de
// `ContextDecl`, e enquanto ela esteve partida entre o kernel (a forma) e este arquivo (os valores),
// o alias amarrado não tinha casa onde encontrar as próprias peças — era isso que o prendia dentro
// deste workspace.
//
// A régua que ficou: contracts DECLARA, este arquivo LIGA. Se algo aqui abre recurso, lê ambiente
// ou nomeia um token de DI, é deste lado. Se é um conjunto fechado que outra linguagem também
// poderia precisar ler, é de lá.
//
// Este módulo continua PURO: uma tabela literal e funções sem efeito. Nada aqui abre recurso, e é
// por isso que um teste pode importá-lo direto — a razão de `cloud-profile.ts` ter existido como
// arquivo separado (o `index.ts` não ser test-safe) some junto com o efeito colateral de import
// que a composição explícita elimina.
//
// FORMA: por CONTEXTO, não por deployment (ADR 0002). Cada contexto declara sob quais CRITÉRIOS
// monta, nunca "em qual perfil" — senão `deployment` fica cravado como eixo, que a decisão 6
// proíbe. Um critério novo (`region`, `releaseTrack`) entra como mais uma chave dentro do `when`,
// e nenhum call site aprende que ele existe.
//
// ── O REGISTRO DA FAMÍLIA `pg` ──────────────────────────────────────────────────────────────────
// A `pg` entrou em 2026-08-14 ACOMPANHADA, e isto é o lado que a acompanhou. Declarar a família
// sozinha teria produzido uma linha que ninguém lê: sem `InfraModules` e sem o laço de composição
// APLICANDO o módulo escolhido, o `db: 'pg'` da tabela seria decorativo. Três coisas destravaram:
//
//   1. **a co-propriedade do dado** — a `.specs/2026-08-14-pare-e-reporte-t1-familia-pg.md` dizia
//      que *"o sidecar Go escreve em `owner_owners` pelo mesmo arquivo SQLite"*. **Falso, medido**:
//      `InsertOwnerIfNew` e `GetOwnerByID` existem gerados pelo sqlc e têm ZERO callers fora de
//      `internal/shared/db/sqlite/gen/`. Não havia decisão de propriedade a tomar.
//   2. **o aplicador de migração** — ADR 0005. É propriedade da FAMÍLIA: libsql aplica no boot, `pg`
//      aplica MANUALMENTE num passo de deploy e o driver CONFERE E RECUSA.
//   3. **a hierarquia de drivers** — ADR 0006. Havia um nível só, cuja assinatura nomeava libsql, e
//      nenhum driver `pg` o estendia sem cast. Agora há topo neutro e um nível-meio por família.
import type { ContextId } from '@codm/contracts/context-ids'
import type { ContextInfra, Criteria, InfraChoices, Placement } from '@codm/contracts/placement'
import type { InstanceRegistry } from '@codm/core-typescript'
import { mountedContextsOf as kernelMountedContexts, placementFor as kernelPlacementFor } from '@codm/core-typescript'
import { CONTEXT_PLACEMENT } from '../../generated/contexts.generated'

/**
 * DERIVADO de `InfraChoices` por mapped type: para cada eixo, o mapa família→módulo de bindings.
 * É isto que elimina a segunda cópia — sem este mapped type, cada `registry.ts` teria de
 * redigitar `Record<'db', Record<DatabaseFamily, InstanceRegistry>>`.
 *
 * NÃO carrega `'none'`, e isso é deliberado: não existe módulo de bindings para "nenhum banco".
 * Quem fala `'none'` é o `ContextInfra`; o laço de composição simplesmente não consulta este mapa
 * quando a escolha do eixo é essa.
 *
 * Mora AQUI e não em contracts porque nomeia `InstanceRegistry` — um token de DI, mecanismo deste
 * workspace. É a régua do cabeçalho aplicada: a escolha de família é declaração, o mapa de bindings
 * que a realiza é ligação.
 */
export type InfraModules = { [K in keyof InfraChoices]: Partial<Record<InfraChoices[K], InstanceRegistry>> }

/**
 * A TABELA, agora DERIVADA — cada contexto declara o seu `placement` em `<ctx>/context.ts`, e
 * `bun contexts:sync` agrega em `CONTEXT_PLACEMENT`.
 *
 * Ela era um literal aqui, `satisfies Record<ContextId, readonly Placement[]>`, e o docblock dizia
 * que o valor disso era o falseador: *"contexto novo quebra o `tsc` AQUI até alguém dizer onde ele
 * mora"*. Esse falseador NÃO se perdeu, mudou de lugar: `placement` é OBRIGATÓRIO no alias do
 * produto (`@codm/contracts/context`), então um contexto novo não compila até responder a mesma
 * pergunta — só que no arquivo dele, que é onde ela tem dono.
 *
 * O que a forma central custava era o que a DC2 já tinha eliminado para `consumes`/`reads`/`ambient`:
 * uma lista de decisões POR CONTEXTO escrita num arquivo que fala de todos os dez. Para acrescentar
 * um contexto você editava aqui; ao PODAR um, o stamp do `create-template` não tinha como podar a
 * linha dele, e sobrava um órfão. Exatamente o argumento que moveu os `givens`.
 *
 * O gate é o mesmo dos outros derivados: `bun contexts:check` reprova se este arquivo divergir das
 * fontes. Nada de rail novo — a checagem já existia e passou a cobrir mais um fato.
 */
export const PLACEMENT = CONTEXT_PLACEMENT satisfies Record<ContextId, readonly Placement[]>

/**
 * O SEAM. Hoje uma consulta sobre um critério; amanhã combina critérios sem tocar em nenhum call
 * site.
 *
 * NÃO é uma máquina de matching, e isso é deliberado (ADR 0002, "o que NÃO é construído agora"):
 * hoje o único critério real de composição é `deployment`. Construir resolução de precedência,
 * curingas ou pesos para um critério só seria generalidade que ninguém pediu e que ninguém saberia
 * manter correta.
 */
export const placementFor = (context: ContextId, criteria: Criteria): Placement | undefined =>
	kernelPlacementFor<ContextId, Criteria, ContextInfra>(PLACEMENT, context, criteria)

/**
 * Como ESTE processo descobre seus critérios.
 *
 * Mora aqui, e não em contracts junto do tipo `Criteria`, porque LÊ AMBIENTE — é ligação, não
 * declaração. Enquanto foram dois arquivos, o `cloud-profile.ts` mantinha um `isCloudProfile()` que
 * era a segunda cópia da mesma decisão, e um `CLOUD_CONTEXTS: ReadonlySet` que era a segunda cópia
 * do conjunto montado.
 *
 * `CODM_PROFILE` é lido LITERALMENTE: só a string exata `'cloud'` arma o deployment de nuvem.
 * `'Cloud'`, `'true'` e ausência caem em `local`, que é o desktop. Um parse tolerante aqui faria um
 * processo de nuvem subir como desktop por causa de uma maiúscula.
 *
 * `env` é parâmetro para um teste poder afirmar a leitura sem mutar o ambiente do processo.
 */
export const criteriaFromEnv = (env: NodeJS.ProcessEnv = process.env): Criteria => ({
	deployment: env.CODM_PROFILE === 'cloud' ? 'cloud' : 'local',
})

/**
 * Os contextos que montam sob estes critérios. DERIVADO da tabela — não há lista paralela, que é
 * exatamente o que o `CLOUD_CONTEXTS: ReadonlySet` de `cloud-profile.ts` era.
 */
export const mountedContexts = (criteria: Criteria): ContextId[] =>
	kernelMountedContexts<ContextId, Criteria, ContextInfra>(PLACEMENT, criteria)
