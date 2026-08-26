import type { Namespace } from '../contexts/namespaces'

/**
 * O RESOLVEDOR DE DIALETO — como um namespace LÓGICO vira tabela FÍSICA.
 *
 * É a peça que separa as duas metades que o campo `pgSchema` misturava: o `namespaces.ts` ao lado
 * diz QUEM possui cada namespace (domínio); isto diz COMO ele se realiza em cada dialeto (infra).
 * Com os dois separados, mudar de dialeto — ou consertar um tronco que está na forma errada — é
 * trocar a implementação daqui, não reescrever o schema.
 *
 * ── as duas realizações, e por que não são a mesma ───────────────────────────────────────────────
 * `pg` tem namespace NATIVO: `pgSchema('authentication').table('users')` → a tabela `users` dentro
 * do schema `authentication`. O Postgres carrega a fronteira no próprio banco, com `search_path`,
 * `GRANT` e RLS por contexto.
 *
 * `sqlite` NÃO TEM: o dialeto não conhece schema, então o namespace só pode virar PREFIXO do nome
 * (`authentication_users`). É o `table_name_prefix` do Rails, e a doc dele diz por quê — *"most
 * databases don't support namespaces for tables"*.
 *
 * O prefixo é CONCESSÃO do dialeto que não tem namespace, nunca a forma preferida. Quando ele
 * aparece num dialeto que TEM (o que é o estado do tronco cloud hoje: 13 tabelas em `pgTable(` plano,
 * zero `pgSchema(`), isso é o dialeto mais fraco tendo ditado a convenção do mais forte.
 */

/** A tabela física que um namespace lógico produz num dialeto. */
export type PhysicalTable =
	/** O dialeto tem namespace nativo: a fronteira mora no banco. */
	| { readonly form: 'schema'; readonly schema: string; readonly name: string }
	/** O dialeto não tem: a fronteira mora no nome, por concessão. */
	| { readonly form: 'prefix'; readonly name: string }

export interface DialectNamespace {
	readonly id: 'pg' | 'sqlite'
	/** Como o namespace lógico vira tabela física neste dialeto. */
	declare(ns: Namespace | string, table: string): PhysicalTable
	/**
	 * O INVERSO, para os rails: dado o TEXTO de um arquivo de schema, o mapa
	 * `símbolo exportado → namespace dono`.
	 *
	 * Recusa o dialeto errado por construção — não por um `if`. Cada leitor casa a sintaxe do SEU
	 * dialeto e só dela; alimentado com o schema do outro, devolve mapa VAZIO. É o falseador cruzado
	 * que prova que o resolvedor discrimina de fato.
	 */
	tableOwners(source: string): Map<string, string>
}

/** `export const owners = ownerSchema.table('owners', …)` precedido de `pgSchema('owner')`. */
const PG_SCHEMA_VAR = /export const (\w+) = pgSchema\('([a-z_]+)'\)/g
const PG_TABLE = /export const (\w+) = (\w+)\.table\(/g

/** `export const events = sqliteTable('shared_events', …)` — o namespace é o trecho antes do 1º `_`. */
const SQLITE_TABLE = /export const (\w+) = sqliteTable\(\s*'([a-z]+)_/g

export const pgNamespace: DialectNamespace = {
	id: 'pg',

	declare: (ns, name) => ({ form: 'schema', schema: String(ns), name }),

	tableOwners(source) {
		// Dois passos, porque no pg o namespace é uma VARIÁVEL: primeiro descobre quais variáveis são
		// schemas, depois casa `<var>.table(`. Uma tabela pendurada numa variável que não é schema não
		// entra — é assim que este leitor recusa `pgTable(` plano, que é o drift do tronco cloud.
		const schemas = new Map<string, string>()
		for (const m of source.matchAll(PG_SCHEMA_VAR)) schemas.set(m[1] ?? '', m[2] ?? '')

		const owners = new Map<string, string>()
		for (const m of source.matchAll(PG_TABLE)) {
			const ns = schemas.get(m[2] ?? '')
			if (ns !== undefined) owners.set(m[1] ?? '', ns)
		}
		return owners
	},
}

export const sqliteNamespace: DialectNamespace = {
	id: 'sqlite',

	declare: (ns, name) => ({ form: 'prefix', name: `${String(ns)}_${name}` }),

	tableOwners(source) {
		const owners = new Map<string, string>()
		for (const m of source.matchAll(SQLITE_TABLE)) owners.set(m[1] ?? '', m[2] ?? '')
		return owners
	},
}

/**
 * O parser de prefixo tem uma regra que NÃO estava declarada em lugar nenhum antes: "o trecho antes
 * do primeiro `_`" significa que **um namespace não pode conter underscore**. Enquanto isso vivia
 * numa regex dentro de um rail, era acordo tácito; aqui é asserção, e quem violar descobre no gate
 * em vez de num mapa de ownership silenciosamente errado.
 */
export const namespaceAllowsPrefixForm = (ns: string): boolean => !ns.includes('_')

export const DIALECTS = { pg: pgNamespace, sqlite: sqliteNamespace } as const satisfies Record<string, DialectNamespace>
