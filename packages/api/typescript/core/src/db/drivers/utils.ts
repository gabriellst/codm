import path from 'node:path'
import type { DrizzleClient } from '../client'
import type { MigrationJournal } from './DrizzleDatabaseDriver'

export async function readMigrationJournal(migrationsDir: string): Promise<MigrationJournal> {
	const { readFile } = await import('node:fs/promises')
	const journalContents = await readFile(path.join(migrationsDir, 'meta', '_journal.json'), 'utf-8')
	return JSON.parse(journalContents) as MigrationJournal
}

export async function readMigrationSql(migrationsDir: string, tag: string): Promise<string> {
	const { readFile } = await import('node:fs/promises')
	return readFile(path.join(migrationsDir, `${tag}.sql`), 'utf-8')
}

export async function truncateAllTables(db: DrizzleClient): Promise<void> {
	const { sql } = await import('drizzle-orm')

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
