#!/usr/bin/env bun
/**
 * migrate — apply the shared-SQLite migrations against `$CODM_DATA_DIR`, then exit.
 *
 * WHY THIS IS NOT A SECOND APPLIER. The rule this repo enforces is ONE LEDGER, not "no script":
 * a third applier carrying its own bookkeeping (`drizzle-kit migrate`/`push`, which write
 * `__drizzle_migrations`) would re-apply DDL the boot migrators already applied, and the divergence
 * raises no error — only wrong reads. This script sidesteps that by calling
 * `migrateEmbeddedDatabase()`, the EXACT function `src/boot/migrate-embedded.ts` calls at daemon
 * boot: same driver singleton, same `packages/contracts/src/db/sqlite/migrations/*.sql`, same
 * `_sqlite_migrations` ledger. Running it is indistinguishable from booting the daemon and killing
 * it after the migration step — which is precisely the convenience it buys.
 *
 * ── ESCOPO: O TRONCO LOCAL, E SÓ ELE ─────────────────────────────────────────────────────────────
 * Desde o ADR 0005 existem DOIS troncos de schema, e este script é o aplicador de UM deles:
 *
 *   libsql / `db/sqlite/migrations`  → ESTE script, e o boot do daemon. Idempotente, no ledger
 *                                     `_sqlite_migrations` compartilhado com o gateway Go.
 *   pg / `db/pg/migrations`          → `bun migrate:deploy:cloud`. Passo de DEPLOY, ledger próprio
 *                                     (`__drizzle_migrations`), e o driver CONFERE e RECUSA no boot.
 *
 * Por isso ele RECUSA rodar sob `CODM_PROFILE=cloud`: ali o tronco é o outro, e aplicar o SQLite
 * contra um deployment de nuvem não erraria alto — criaria um arquivo `codm.db` que ninguém lê, e o
 * operador acharia que migrou.
 *
 * Ele também cria as tabelas DRIZZLE apenas. As `whatsmeow_*` pertencem ao gateway Go e nascem no
 * primeiro connect, então um dir recém-migrado tem menos tabelas que um que já rodou o gateway.
 * Isso é esperado, não migração parcial.
 *
 * ── E ELE LÊ O `.env` DA RAIZ ────────────────────────────────────────────────────────────────────
 * `bun migrate:dev` passa `--env-file=../../.env`, e isso é load-bearing: o script roda de dentro de
 * `packages/api/typescript`, e o Bun carrega `.env` do diretório CORRENTE, sem subir. Sem a flag,
 * `CODM_DATA_DIR` caía no default do schema — o comando funcionava por coincidir com o valor do
 * `.env`, e migraria o dir ERRADO, em silêncio, no dia em que alguém o customizasse.
 *
 * Usage: `bun migrate:dev` (root) · `bun --env-file=../../.env scripts/migrate.ts` (here)
 */
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { container } from 'tsyringe-neo'
import { Config, DatabaseDriver, registerAll, resolve, resolveDataDir, setBoundedContextEnvironment } from '@codm/core-typescript'
import { LIBSQL_DB_REGISTRY, INSTANCE_REGISTRY } from '@shared/registry'
import { ProductConfig } from '../src/shared/config/ProductConfig'

// A RECUSA (ver ESCOPO no docblock). Antes de tocar em qualquer coisa: este é o aplicador do tronco
// LOCAL, e sob o perfil de nuvem o tronco é outro.
if (Config.env.CODM_PROFILE === 'cloud') {
	console.error(
		'migrate: recusado sob CODM_PROFILE=cloud.\n' +
			'  Este script aplica o tronco LOCAL (SQLite, db/sqlite/migrations) no CODM_DATA_DIR.\n' +
			'  O tronco da NUVEM (Postgres, db/pg/migrations) tem outro aplicador: `bun migrate:deploy:cloud`.',
	)
	process.exit(1)
}

const dataDir = resolveDataDir(Config.env.CODM_DATA_DIR)
const dbPath = join(dataDir, ProductConfig.env.CODM_DB_FILE_NAME)

// Read the ledger through a SEPARATE read-only handle rather than the applier's driver: the point
// is to report what the applier did, and reusing its connection would report what we asked for.
function ledger(): string[] {
	try {
		const db = new Database(dbPath, { readonly: true })
		try {
			return db
				.query<{ name: string }, []>('select name from _sqlite_migrations order by name')
				.all()
				.map(row => row.name)
		} finally {
			db.close()
		}
	} catch {
		// No file, or no ledger table yet — a cold data dir.
		return []
	}
}

// O MESMO CAMINHO DO BOOT, montado à mão. `server.ts` faz: registry do kernel → módulo da FAMÍLIA
// → `resolve(DatabaseDriver).runMigrations()`. Aqui é idêntico, com a família escolhida
// EXPLICITAMENTE — como em todo sítio que monta container sem compor (ver `TestBed`). A recusa lá
// em cima é o que torna essa escolha honesta: sob cloud este script nem chega aqui.
//
// (Antes isto chamava `migrateEmbeddedDatabase()`, um wrapper que sumiu no T4 — `37ea918c`. O
// script ficou quebrado desde então, e ninguém notou: um comando que só se roda por conveniência
// não tem quem o exercite. É por isso que o `migrate:dev` agora entra na bateria.)
setBoundedContextEnvironment('real')
registerAll(container, [...INSTANCE_REGISTRY.real, ...LIBSQL_DB_REGISTRY.real])

const before = ledger()
await resolve(container, DatabaseDriver).runMigrations()
const after = ledger()

const applied = after.filter(name => !before.includes(name))
console.log(`tronco    libsql (db/sqlite/migrations)`)
console.log(`data dir  ${dataDir}`)
if (applied.length === 0) {
	console.log(`up to date — ${after.length} migration(s) already in _sqlite_migrations, applied 0`)
} else {
	console.log(`applied ${applied.length} of ${after.length}:`)
	for (const name of applied) console.log(`  + ${name}`)
}
process.exit(0)
