import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import type { PgDrizzleClient } from '../client'

/**
 * Utilitários específicos da família `pg`. Nada aqui é neutro de vendor — por isso mora na família,
 * não no nível `drivers/`.
 */

/** A forma do `meta/_journal.json` que o drizzle-kit escreve. Formato de ARQUIVO, não contrato. */
interface DrizzleKitJournal {
	entries: Array<{ idx: number; tag: string; when: number }>
}

/**
 * As migrações do tronco cloud em disco, em ordem de aplicação.
 *
 * Lê o `meta/_journal.json` — e aqui a família pg DIVERGE da libsql de propósito. A libsql deriva o
 * conjunto de `readdir → filter .sql → sort` justamente porque o Go embute uma cópia sem `meta/`.
 * Na pg quem aplica é o `drizzle-kit migrate`, que casa ledger com journal pelo campo `when`; ler o
 * journal aqui é ler a MESMA fonte que o aplicador usa. Derivar do `readdir` daria uma segunda
 * verdade sobre "quais migrações existem", e as duas discordariam no primeiro arquivo `.sql` solto
 * na pasta.
 */
export async function readCloudJournal(migrationsDir: string): Promise<Array<{ tag: string; when: number }>> {
	const raw = await readFile(path.join(migrationsDir, 'meta', '_journal.json'), 'utf-8')
	const journal = JSON.parse(raw) as DrizzleKitJournal
	return [...journal.entries].sort((a, b) => a.idx - b.idx).map(entry => ({ tag: entry.tag, when: entry.when }))
}

/** Os `.sql` presentes na pasta — usado só para acusar arquivo fora do journal. */
export async function listCloudSqlFiles(migrationsDir: string): Promise<string[]> {
	const files = await readdir(migrationsDir)
	return files.filter(file => file.endsWith('.sql')).sort()
}

/**
 * Zera todas as tabelas do banco corrente.
 *
 * `TRUNCATE ... CASCADE` sobre tudo que não é catálogo nem o schema do próprio ledger — apagar o
 * `drizzle.__drizzle_migrations` faria o próximo boot achar que NADA foi aplicado e recusar subir,
 * que é o gate deste driver disparando contra si mesmo.
 */
export async function truncateAllTables(db: PgDrizzleClient): Promise<void> {
	await db.execute(sql`
		DO $$ DECLARE
			r RECORD;
		BEGIN
			FOR r IN (SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'drizzle'))
			LOOP
				EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.schemaname) || '.' || quote_ident(r.tablename) || ' CASCADE';
			END LOOP;
		END $$
	`)
}

/**
 * A DECISÃO do conferidor, isolada como função pura: dado o journal em disco e os carimbos que o
 * ledger diz ter aplicado, o que está aplicado e o que está pendente.
 *
 * Exportada de propósito. É ela que a testemunha exercita contra entradas sabidamente atrasadas —
 * um conferidor cuja lógica só é exercida por bancos em dia é um conferidor que ninguém provou que
 * recusa, e recusar é a única coisa que ele existe para fazer.
 */
export function splitByLedger(
	journal: Array<{ tag: string; when: number }>,
	appliedStamps: ReadonlySet<number>,
): { applied: string[]; pending: string[] } {
	const applied: string[] = []
	const pending: string[] = []
	for (const entry of journal) (appliedStamps.has(entry.when) ? applied : pending).push(entry.tag)
	return { applied, pending }
}
