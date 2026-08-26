/**
 * ALOCAÇÃO — a máquina de "este contexto monta quando <critérios>", sem saber que critérios existem.
 *
 * ── O QUE É KERNEL AQUI E O QUE NÃO É ───────────────────────────────────────────────────────────
 *
 * Tudo neste arquivo é genérico sobre TRÊS parâmetros que o produto amarra: a união de contextos, a
 * forma dos critérios, e a forma da infra. O kernel nunca aprende que existe um `deployment`, muito
 * menos que ele pode ser `'cloud'` — se aprendesse, um fork com outro eixo (região, tier, tenant)
 * teria de editar o kernel para declarar o seu.
 *
 * O que FICA no produto, e é o teste para saber se algo deveria ter vindo: qualquer coisa que
 * nomeie um valor. `DatabaseFamily = 'libsql' | 'pg'`, `Deployment = 'cloud' | 'local'`,
 * `criteriaFromEnv` lendo `CODM_PROFILE` — todos nomeiam valores DESTE produto. Aqui só mora a
 * álgebra sobre eles.
 *
 * ── POR QUE A FORMA VEM DE CONTRACTS, E SÓ A COMPUTAÇÃO FICA ────────────────────────────────────
 *
 * `Axis` e `PlacementOf` moravam aqui, e o teste acima os aprovava: são genéricos, não nomeiam
 * valor nenhum. Mas ele estava medindo a coisa errada. `PlacementOf` é a forma do campo
 * `placement` de `ContextDecl` — uma DECLARAÇÃO, cujo contrato mora em
 * `contracts/src/contexts/decl.ts`. Enquanto a forma ficou aqui, o contrato estava partido em dois
 * pacotes, e o alias que o amarra não tinha casa onde encontrar todas as suas peças: era isso que
 * obrigava `<ctx>/context.ts` a importar de dentro de um workspace em vez do contrato.
 *
 * O invariante que este arquivo protege sobrevive intacto — as funções abaixo continuam genéricas,
 * e o kernel continua sem saber o que é um `deployment`. E a direção do import é a que já se
 * praticava: o core importa `@codm/contracts` em produção; contracts nunca importa o core.
 *
 * ── POR QUE A TABELA É PARÂMETRO E NÃO IMPORT ───────────────────────────────────────────────────
 *
 * `placementFor` e `mountedContextsOf` recebem a tabela. A versão anterior a importava do módulo do
 * produto, o que prendia as duas funções a uma constante concreta — e é exatamente o que impediria
 * este arquivo de ser kernel. Passar a tabela também deixa um teste exercitar a álgebra com uma
 * tabela de mentira, sem tocar na do produto.
 */
import type { PlacementOf } from '@codm/contracts/placement'

/**
 * `Object.keys` TIPADO, com a restrição em `object` e não em `Record<string, unknown>`: uma
 * `interface` do produto (como `Criteria`) não tem index signature implícita e não satisfaria a
 * segunda, o que forçaria o produto a trocar `interface` por `type` só para agradar o kernel.
 *
 * O `as` é a única forma de expressar isto em TypeScript, e é seguro aqui
 * porque a entrada é um objeto cujas chaves o chamador acabou de declarar — não um valor vindo do
 * fio, onde a asserção seria uma mentira sobre dados que ninguém validou.
 */
export const keysOf = <T extends object>(o: T): (keyof T)[] => Object.keys(o) as (keyof T)[]

/** Um `when` casa quando toda chave que ele declara bate com o critério dado. `{}` casa sempre. */
const matches = <Criteria extends object>(when: Partial<Criteria>, criteria: Criteria): boolean =>
	keysOf(when).every(key => when[key] === criteria[key])

/**
 * O SEAM. Hoje uma consulta sobre um critério; amanhã combina critérios sem tocar em nenhum call
 * site.
 *
 * NÃO é uma máquina de matching, e isso é deliberado (ADR 0002, "o que NÃO é construído agora"):
 * enquanto houver um critério real, precedência, curingas e pesos seriam generalidade que ninguém
 * pediu e que ninguém saberia manter correta.
 */
export function placementFor<Ctx extends string, Criteria extends object, Infra>(
	table: Record<Ctx, readonly PlacementOf<Criteria, Infra>[]>,
	context: Ctx,
	criteria: Criteria,
): PlacementOf<Criteria, Infra> | undefined {
	return table[context].find(placement => matches(placement.when, criteria))
}

/** Os contextos que montam sob estes critérios. DERIVADO da tabela — nunca uma lista paralela. */
export function mountedContextsOf<Ctx extends string, Criteria extends object, Infra>(
	table: Record<Ctx, readonly PlacementOf<Criteria, Infra>[]>,
	criteria: Criteria,
): Ctx[] {
	return keysOf(table).filter(context => placementFor(table, context, criteria) !== undefined)
}
