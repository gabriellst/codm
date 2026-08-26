/**
 * Enum-column CHECK helper for the **pg-dialect** (cloud) schema.
 *
 * Gêmeo de `db/schema/_enum.ts`, que faz o mesmo no dialeto SQLite. A única diferença é de qual
 * `drizzle-orm/*-core` o `check` vem — a forma emitida (`CHECK (col IN ('A','B'))`) é a mesma nos
 * dois bancos, o que é precisamente o que o gate de paridade de kernel (ADR 0005, consequência 4)
 * precisa poder afirmar.
 *
 * POR QUE NÃO `pgEnum`. O docblock do gêmeo registra o fato histórico: *"the repo never used pgEnum
 * — enums are text + convention on the pg side"*. Este arquivo não inverte essa decisão; ele faz no
 * Postgres o que o lado SQLite já fazia — troca **convenção** por **restrição**, mantendo o tipo da
 * coluna. Um `pgEnum` teria dois custos concretos aqui: (a) acrescentar um valor vira `ALTER TYPE`,
 * que não roda dentro de transação em Postgres antigo, contra um `CHECK` recriável; e (b) a forma
 * lógica dos dois troncos deixaria de ser comparável — de um lado um TIPO, do outro uma RESTRIÇÃO —
 * e o gate de paridade perderia o que compara.
 *
 * O conjunto de valores vem de `Object.values(Enum)` sobre os enums de fio GERADOS, então o CHECK
 * não tem como divergir do contrato congelado.
 */
import { sql, type SQLWrapper } from 'drizzle-orm'
import { check } from 'drizzle-orm/pg-core'

/** `check(name, `col IN ('A','B',...)`)` — values come straight from the wire enum. */
export function enumCheck(name: string, column: SQLWrapper, values: readonly string[]) {
	const list = values.map(v => `'${v}'`).join(', ')
	return check(name, sql`${column} IN (${sql.raw(list)})`)
}
