#!/usr/bin/env bun
/**
 * `bun migrate:deploy:cloud` — o PASSO DE DEPLOY do tronco de nuvem (ADR 0005).
 *
 * ── por que um script, e não o CLI do drizzle-kit ────────────────────────────────────────────────
 * Porque o CLI ENGOLE o motivo. Medido: com a URL apontando para um banco que não existe, o
 * `drizzle-kit migrate` imprime um spinner e sai com código 1 — sem mensagem, sem nome de banco,
 * sem dizer se o servidor está fora, se a senha está errada ou se o banco não foi criado. Para o
 * passo que o ADR 0005 tornou MANUAL, isso é o pior comportamento possível: quem o roda está num
 * deploy, e o que ele precisa é saber o que corrigir.
 *
 * NÃO é um segundo aplicador — a preocupação que o docblock do `drizzle.config.ts` do tronco SQLite
 * levanta. O `migrate()` do `drizzle-orm/node-postgres` escreve o MESMO ledger
 * (`drizzle.__drizzle_migrations`) que o `drizzle-kit migrate` escreveria, lendo a MESMA pasta
 * (`db/pg/migrations`, com o `meta/_journal.json` que o `generate` produziu). É o mesmo
 * mecanismo, chamado de dentro, para que as falhas tenham nome.
 *
 * ── o que ele verifica, em ordem, e por quê ──────────────────────────────────────────────────────
 * Cada checagem existe porque a falha correspondente aparecia MUDA:
 *   1. `CLOUD_DATABASE_URL` presente        → senão o drizzle diz `url: ''`
 *   2. o servidor responde                  → senão só "exited with code 1"
 *   3. o BANCO existe                       → e este ele CRIA, porque migrar não cria banco e a
 *                                             mensagem nativa não diz que era só isso
 *   4. aplica, e diz quantas aplicou
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Client } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { cloudMigrationsDir } from './migrations'

function fail(message: string): never {
	console.error(`\nmigrate:deploy:cloud — ${message}\n`)
	process.exit(1)
}

/**
 * O motivo, em uma linha, mesmo quando o driver não dá um.
 *
 * `ECONNREFUSED` do `pg` chega com `message` VAZIA — e uma linha em branco no meio de uma recusa é
 * pior que nenhuma, porque parece que a ferramenta não terminou de falar. O `code` sempre vem.
 */
function reasonOf(error: unknown): string {
	if (!(error instanceof Error)) return String(error)
	const code = (error as { code?: string }).code
	if (error.message.trim() !== '') return code ? `${error.message} (${code})` : error.message
	return code ?? error.name
}

const url = process.env.CLOUD_DATABASE_URL
if (url === undefined || url.trim() === '') {
	fail(
		'CLOUD_DATABASE_URL não está no ambiente.\n' +
			'  Declare-a no `.env` da RAIZ do repo (veja `.env.example`):\n' +
			'    CLOUD_DATABASE_URL=postgres://postgres:postgres@localhost:5432/codm_cloud\n' +
			'  Se ela JÁ está lá, o `.env` não foi carregado: este script roda de dentro de `packages/contracts`,\n' +
			'  e o Bun lê `.env` do diretório CORRENTE sem subir até a raiz — por isso o `--env-file=../../.env`.',
	)
}

const target = new URL(url)
const database = target.pathname.replace(/^\//, '')
if (database === '') fail(`CLOUD_DATABASE_URL não nomeia um banco: ${target.origin}/…`)

/** Conecta ao banco de manutenção do servidor — o único que existe antes do nosso. */
const adminUrl = new URL(url)
adminUrl.pathname = '/postgres'

const admin = new Client({ connectionString: adminUrl.toString() })
try {
	await admin.connect()
} catch (error) {
	fail(
		`não consegui falar com o servidor Postgres em ${target.host}.\n` +
			`  ${reasonOf(error)}\n` +
			'  Confira se o servidor está de pé e se usuário/senha da CLOUD_DATABASE_URL estão certos.',
	)
}

const existing = await admin.query<{ datname: string }>('SELECT datname FROM pg_database WHERE datname = $1', [database])
if (existing.rowCount === 0) {
	// CRIAR é responsabilidade deste passo, e não do operador: migrar não cria banco, e a falha
	// nativa disso não diz que faltava só isto. O nome vem da URL e é interpolado com aspas duplas
	// porque `CREATE DATABASE` não aceita parâmetro ligado.
	console.log(`banco \`${database}\` não existia — criando`)
	await admin.query(`CREATE DATABASE "${database.replace(/"/g, '""')}"`)
}
await admin.end()

const client = new Client({ connectionString: url })
await client.connect()
const db = drizzle(client)

const journalPath = path.join(cloudMigrationsDir, 'meta', '_journal.json')
const journal = JSON.parse(await readFile(journalPath, 'utf-8')) as { entries: Array<{ tag: string }> }

try {
	await migrate(db, { migrationsFolder: cloudMigrationsDir })
} catch (error) {
	await client.end()
	fail(`a migração falhou contra ${target.host}/${database}.\n  ${error instanceof Error ? error.message : String(error)}`)
}

const applied = await client.query<{ n: string }>('SELECT count(*)::text AS n FROM drizzle.__drizzle_migrations')
await client.end()

console.log(`tronco    pg (db/pg/migrations)`)
console.log(`alvo      ${target.host}/${database}`)
console.log(`ledger    ${applied.rows[0]?.n ?? '0'} de ${journal.entries.length} migração(ões) aplicadas`)
