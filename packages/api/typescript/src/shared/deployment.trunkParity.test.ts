import { describe, expect, it } from 'bun:test'
import { Table, getTableName, is } from 'drizzle-orm'
import { getTableConfig as pgTableConfig } from 'drizzle-orm/pg-core'
import { getTableConfig as sqliteTableConfig } from 'drizzle-orm/sqlite-core'
import * as cloudTrunk from '@codm/contracts/db/pg'
import * as localTrunk from '@codm/contracts/db'
import { namespaceAllowsPrefixForm } from '@codm/contracts/db/dialect'
import type { ContextId } from '@codm/contracts/context-ids'
import { CONTEXTS } from '@generated/contexts.generated'
import { mountedContexts } from '@shared/deployment'

/**
 * trunk-parity — os dois gates que o ADR 0005 cria a NECESSIDADE de ter.
 *
 * A decisão 2 do ADR partiu o schema em dois troncos, um por dialeto, e disse a coisa que torna
 * este arquivo obrigatório: *"o tronco pg NÃO é um espelho"*. Dois troncos que se pretendem
 * parcialmente iguais e parcialmente diferentes só são verificáveis se alguém disser ONDE fica a
 * fronteira — e a fronteira aqui é derivada, não redigitada:
 *
 *   ESCOPO (consequência 5)     — quais tabelas PODEM estar no tronco cloud
 *                                 ← `mountedContexts({deployment:'cloud'})` × `CONTEXTS[ctx].namespace`
 *   PARIDADE (consequência 4)   — quais tabelas TÊM de ser iguais nos dois
 *                                 ← as do namespace `shared`, o kernel dual da `PLACEMENT`
 *
 * Nenhuma das duas listas é escrita aqui. Acrescentar um contexto à nuvem, ou renomear um
 * `pgSchema`, muda o que este arquivo cobra sem que ninguém o edite — que é a diferença entre um
 * gate e uma lista que envelhece.
 *
 * ── o que a T1.9 mudou aqui, e por que o gate ficou MAIS forte ────────────────────────────────────
 * Este arquivo comparava os troncos por PREFIXO achatado (`name.startsWith('shared_')`), porque era
 * assim que o tronco pg declarava suas tabelas — `pgTable('shared_events', …)`. Com o tronco pg
 * convertido para namespace nativo (`sharedSchema.table('events', …)`), comparar por prefixo deixou
 * de funcionar, e as três asserções ficaram vermelhas de uma vez. Foi o resultado esperado: elas
 * mediam a forma antiga.
 *
 * A forma nova compara **namespace + nome lógico**, e cada dialeto chega lá pelo seu próprio
 * caminho: no pg o namespace é `config.schema`, um dado de primeira classe que o banco conhece; no
 * sqlite ele é o trecho antes do primeiro `_`, desfeito aqui na leitura. A comparação passou a
 * falar de LÓGICA em vez de nomenclatura — que é o que o ADR sempre quis dizer, e o que o prefixo
 * só conseguia aproximar enquanto os dois troncos usavam a mesma concessão.
 *
 * A regra que o desfazimento do prefixo pressupõe — namespace não contém `_` — não é acordo tácito:
 * está asserida em `namespaceAllowsPrefixForm`, e TRK-06 a exercita contra os namespaces reais.
 *
 * ── por que ESTE arquivo e não um teste em `packages/contracts` ───────────────────────────────────
 * Porque a pergunta não é sobre o schema: é sobre o schema CONTRA a tabela de alocação, e a tabela
 * mora em `src/shared/`. Um teste dentro de `contracts` teria de importar `api/typescript`, que é a
 * direção proibida de dependência. A pergunta pertence a quem consegue ver os dois lados.
 */

/** A forma LÓGICA de uma tabela — o que tem de coincidir entre dialetos, e nada além disso. */
export interface LogicalTable {
	/**
	 * O namespace DONO, já desfeito da forma física de cada dialeto.
	 *
	 * É o campo que a T1.9 acrescentou, e ele é o motivo de a comparação funcionar entre um dialeto
	 * que tem schema nativo e um que não tem: os dois chegam ao mesmo `'shared'` por caminhos
	 * diferentes, e é sobre esse valor comum que a paridade fala.
	 */
	readonly namespace: string
	/** o nome SEM o namespace — `events`, nunca `shared_events`. */
	readonly name: string
	/** coluna → é `NOT NULL`. O TIPO fica de fora de propósito: `integer{timestamp_ms}` e
	 *  `timestamptz` são o mesmo fato em dialetos diferentes, e cobrar tipo igual seria cobrar que
	 *  os dialetos não existissem. */
	readonly columns: Readonly<Record<string, boolean>>
	/** as colunas da chave primária, ordenadas — em `shared_idempotency_keys` a PK é composta. */
	readonly primaryKey: readonly string[]
}

/**
 * A diferença entre duas formas lógicas, como lista de frases. Vazio = idênticas.
 *
 * É função PURA e exportada de propósito: é ela que a testemunha (TRK-04) exercita contra um par
 * sabidamente divergente. Um gate cuja lógica de comparação só é exercida por dados que passam é um
 * gate que ninguém provou que reprova.
 */
export function diffLogical(a: LogicalTable, b: LogicalTable): string[] {
	const problems: string[] = []
	if (a.namespace !== b.namespace) problems.push(`namespace: '${a.namespace}' vs '${b.namespace}'`)
	if (a.name !== b.name) problems.push(`nome: '${a.name}' vs '${b.name}'`)

	const columnsA = Object.keys(a.columns).sort()
	const columnsB = Object.keys(b.columns).sort()
	for (const column of columnsA) if (!(column in b.columns)) problems.push(`coluna '${column}' só existe no primeiro`)
	for (const column of columnsB) if (!(column in a.columns)) problems.push(`coluna '${column}' só existe no segundo`)
	for (const column of columnsA) {
		if (!(column in b.columns)) continue
		if (a.columns[column] !== b.columns[column]) {
			problems.push(`coluna '${column}': NOT NULL diverge (${a.columns[column]} vs ${b.columns[column]})`)
		}
	}

	const pkA = [...a.primaryKey].sort().join(',')
	const pkB = [...b.primaryKey].sort().join(',')
	if (pkA !== pkB) problems.push(`chave primária: [${pkA}] vs [${pkB}]`)

	return problems
}

const tablesOf = (namespace: Record<string, unknown>): Table[] =>
	Object.values(namespace).filter((value): value is Table => is(value, Table))

/**
 * O namespace do tronco pg — dado de PRIMEIRA CLASSE, não um pedaço de string.
 *
 * `config.schema` é `undefined` para uma tabela declarada em `pgTable(` plano, que é exatamente a
 * forma que a T1.9 aposentou. Traduzir esse `undefined` para `''` faz a tabela cair fora de todo
 * namespace permitido, e TRK-01 a acusa como órfã — que é o comportamento desejado: uma tabela pg
 * sem schema é uma regressão à forma antiga, e ela tem de aparecer.
 */
const pgNamespaceOf = (table: Table): string => pgTableConfig(table).schema ?? ''

/**
 * O namespace do tronco sqlite — desfeito do PREFIXO, porque o dialeto não tem onde mais guardá-lo.
 *
 * `shared_idempotency_keys` → namespace `shared`, nome `idempotency_keys`. O corte é no PRIMEIRO
 * `_`, e é isso que torna "namespace não contém `_`" uma pré-condição e não um detalhe — ver
 * `namespaceAllowsPrefixForm`, exercitada em TRK-06.
 */
const splitSqliteName = (full: string): { namespace: string; name: string } => {
	const cut = full.indexOf('_')
	return cut === -1 ? { namespace: '', name: full } : { namespace: full.slice(0, cut), name: full.slice(cut + 1) }
}

const logicalPg = (table: Table): LogicalTable => {
	const config = pgTableConfig(table)
	return {
		namespace: pgNamespaceOf(table),
		name: config.name,
		columns: Object.fromEntries(config.columns.map(column => [column.name, column.notNull])),
		primaryKey: [
			...config.columns.filter(column => column.primary).map(column => column.name),
			...config.primaryKeys.flatMap(pk => pk.columns.map(c => c.name)),
		],
	}
}

const logicalSqlite = (table: Table): LogicalTable => {
	const config = sqliteTableConfig(table)
	return {
		...splitSqliteName(config.name),
		columns: Object.fromEntries(config.columns.map(column => [column.name, column.notNull])),
		primaryKey: [
			...config.columns.filter(column => column.primary).map(column => column.name),
			...config.primaryKeys.flatMap(pk => pk.columns.map(c => c.name)),
		],
	}
}

const CLOUD = { deployment: 'cloud' } as const

/** Os namespaces que o tronco cloud pode carregar — DERIVADOS, nunca listados. */
const cloudNamespaces = (): Map<string, ContextId> => {
	const byNamespace = new Map<string, ContextId>()
	for (const context of mountedContexts(CLOUD)) {
		const schema = CONTEXTS[context].namespace
		if (schema !== null) byNamespace.set(String(schema), context)
	}
	return byNamespace
}

const cloudTables = tablesOf(cloudTrunk as Record<string, unknown>)
const localTables = tablesOf(localTrunk as Record<string, unknown>)

describe('trunk-parity (ADR 0005 — dois troncos, e a fronteira entre eles é derivada)', () => {
	it('TRK-01: toda tabela do tronco cloud pertence a um contexto que a PLACEMENT aloca na NUVEM', () => {
		const allowed = cloudNamespaces()
		const strays: string[] = []

		for (const table of cloudTables) {
			// Igualdade de namespace, não `startsWith`: com schema nativo o dono é um valor, e comparar
			// valores não confunde `owner` com um `owner_audit` que viesse a existir.
			if (!allowed.has(pgNamespaceOf(table))) strays.push(`${pgNamespaceOf(table) || '(sem schema)'}.${getTableName(table)}`)
		}

		expect(
			strays,
			`estas tabelas estão no tronco cloud mas não pertencem a nenhum contexto alocado na nuvem ` +
				`(${[...allowed.values()].join(', ')}): ${strays.join(', ')}. Uma tabela de contexto LOCAL no Postgres é uma ` +
				`tabela que ninguém escreve — e uma tabela que existe é um convite.`,
		).toEqual([])
	})

	it('TRK-02: todo contexto alocado na nuvem que possui schema TEM tabelas no tronco cloud', () => {
		const missing: string[] = []

		for (const [namespace, context] of cloudNamespaces()) {
			const found = cloudTables.some(table => pgNamespaceOf(table) === namespace)
			if (!found) missing.push(`${context} (namespace '${namespace}')`)
		}

		expect(
			missing,
			`a PLACEMENT aloca estes contextos na nuvem, eles declaram possuir um pgSchema, e o tronco cloud não tem ` +
				`nenhuma tabela deles: ${missing.join(', ')}. É a metade silenciosa do defeito: o contexto monta na nuvem ` +
				`e as tabelas dele não existem lá.`,
		).toEqual([])
	})

	it('TRK-03: o KERNEL (namespace `shared`) tem a mesma forma lógica nos dois troncos', () => {
		// `shared` é o único contexto DUAL da PLACEMENT (ADR 0002) — monta nos dois deployments. É
		// exatamente por ser dual que ele é o único lugar onde as duas árvores podem divergir em
		// silêncio: as outras tabelas de cada tronco não têm com quem discordar.
		const namespace = String(CONTEXTS.shared.namespace)
		// A chave do casamento é `namespace.nome` LÓGICO, e é o que permite parear duas tabelas cuja
		// forma física difere: `shared.events` no pg e `shared_events` no sqlite são a mesma tabela.
		const localByLogical = new Map(
			localTables.map(table => [`${splitSqliteName(getTableName(table)).namespace}.${splitSqliteName(getTableName(table)).name}`, table]),
		)

		const shared = cloudTables.filter(table => pgNamespaceOf(table) === namespace)
		expect(shared.length, 'sem tabelas do namespace `shared` no tronco cloud este teste não estaria medindo nada').toBeGreaterThan(0)

		const problems: string[] = []
		for (const table of shared) {
			const logical = logicalPg(table)
			const key = `${logical.namespace}.${logical.name}`
			const twin = localByLogical.get(key)
			if (twin === undefined) {
				problems.push(`${key}: existe no tronco cloud e NÃO no tronco local — o kernel é dual por definição`)
				continue
			}
			for (const problem of diffLogical(logical, logicalSqlite(twin))) problems.push(`${key} → ${problem}`)
		}

		expect(
			problems,
			`o kernel divergiu entre os troncos:\n  ${problems.join('\n  ')}\n` +
				`Estas quatro tabelas são a mecânica da transação, não do domínio. Uma coluna acrescentada de um lado só ` +
				`aparece em produção.`,
		).toEqual([])
	})

	it('TRK-04: TESTEMUNHA — a comparação reprova um par que diverge', () => {
		// O gate acima só é confiável se `diffLogical` souber dizer não. Sem isto, TRK-03 passaria
		// igualmente bem se a função devolvesse `[]` sempre — que é a forma mais comum de gate vazio.
		const base: LogicalTable = {
			namespace: 'shared',
			name: 'outbox',
			columns: { id: true, payload: true, last_error: false },
			primaryKey: ['id'],
		}

		expect(diffLogical(base, base), 'idênticas não podem acusar nada').toEqual([])

		// O campo que a T1.9 acrescentou entra na testemunha junto: um gate que ganha dimensão nova e
		// não ganha prova nova é um gate que passou a ter uma metade não exercitada.
		const namespaceMoved = diffLogical(base, { ...base, namespace: 'owner' })
		expect(namespaceMoved, 'a mesma tabela em outro namespace TEM de ser vista').toHaveLength(1)
		expect(namespaceMoved[0]).toContain('namespace')

		const columnAdded = diffLogical(base, { ...base, columns: { ...base.columns, novo: false } })
		expect(columnAdded, 'coluna a mais de um lado TEM de ser vista').toHaveLength(1)
		expect(columnAdded[0]).toContain('novo')

		const nullabilityFlipped = diffLogical(base, { ...base, columns: { ...base.columns, last_error: true } })
		expect(nullabilityFlipped, 'NOT NULL trocado TEM de ser visto — é o que corrompe escrita em produção').toHaveLength(1)
		expect(nullabilityFlipped[0]).toContain('NOT NULL')

		const pkChanged = diffLogical(base, { ...base, primaryKey: ['id', 'scope'] })
		expect(pkChanged, 'chave primária diferente TEM de ser vista').toHaveLength(1)
		expect(pkChanged[0]).toContain('chave primária')
	})

	it('TRK-05: NENHUMA tabela do tronco cloud está em `pgTable(` plano — o namespace é nativo (T1.9)', () => {
		// O gate que impede a regressão de voltar. `dialect.ts` tem o gêmeo deste fato lido por regex
		// sobre o TEXTO (DIA-07); este aqui lê o OBJETO que o drizzle construiu. Não é a mesma
		// asserção duas vezes: um cobra o que a pessoa escreve, o outro o que o runtime enxerga — e o
		// segundo é o que de fato decide em qual schema o INSERT cai.
		const flat = cloudTables.filter(table => pgNamespaceOf(table) === '').map(table => getTableName(table))

		expect(cloudTables.length, 'sem tabelas no tronco cloud este teste não mediria nada').toBe(13)
		expect(
			flat,
			`estas tabelas do tronco cloud não declaram schema: ${flat.join(', ')}. No pg o namespace é nativo, e ` +
				`escondê-lo no nome é a concessão do SQLite — que não TEM schema — vazando para o dialeto que tem.`,
		).toEqual([])
	})

	it('TRK-06: os namespaces reais respeitam a pré-condição da forma de prefixo — nenhum contém `_`', () => {
		// O tronco sqlite desfaz o namespace cortando no primeiro `_`. Um namespace com `_` no nome
		// tornaria esse corte ambíguo e produziria dono errado EM SILÊNCIO — o pior modo de falha
		// possível para um mapa de ownership. A regra vale para todos os namespaces, não só os da
		// nuvem, porque é o tronco local quem paga por ela.
		const offenders = Object.values(CONTEXTS)
			.map(context => context.namespace)
			.filter((schema): schema is NonNullable<typeof schema> => schema !== null)
			.map(String)
			.filter(schema => !namespaceAllowsPrefixForm(schema))

		expect(offenders, `estes namespaces contêm '_' e quebrariam o desfazimento do prefixo: ${offenders.join(', ')}`).toEqual([])
	})
})
