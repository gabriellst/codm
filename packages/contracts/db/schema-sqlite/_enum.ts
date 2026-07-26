/**
 * Enum-column CHECK helper for the SQLite-dialect schema.
 *
 * The repo never used pgEnum — enums are text + convention on the pg side. On
 * SQLite we make that convention DB-enforced with `text` + `CHECK (col IN (...))`
 * (go-domain-design.md decision (a)). The value-set is single-sourced from the
 * generated wire enums (`Object.values(Enum)`), so the CHECK can never drift from
 * the frozen contract.
 */
import { sql, type SQLWrapper } from 'drizzle-orm'
import { check } from 'drizzle-orm/sqlite-core'

/** `check(name, `col IN ('A','B',...)`)` — values come straight from the wire enum. */
export function enumCheck(name: string, column: SQLWrapper, values: readonly string[]) {
	const list = values.map(v => `'${v}'`).join(', ')
	return check(name, sql`${column} IN (${sql.raw(list)})`)
}
