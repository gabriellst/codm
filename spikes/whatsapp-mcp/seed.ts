/**
 * Banco de teste com o schema REAL do codm (aplica packages/contracts/src/db/sqlite/migrations).
 *
 *   bun seed.ts ./test.db                 # cria do zero com 2 conversas e algumas mensagens
 *   bun seed.ts ./test.db --add "oi"      # insere uma mensagem recebida nova (simula o gateway)
 *
 * Escreve só no arquivo que você passar. Nunca aponte para o codm.db de verdade.
 */
import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const MIGRATIONS = resolve(import.meta.dir, '../../packages/contracts/src/db/sqlite/migrations')
const CHANNEL = 'ch-seed'
const ALICE = '5583999990001@s.whatsapp.net'
const GROUP = '120363000000000001@g.us'

export function createSeedDb(path: string) {
	for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true })
	const db = new Database(path)
	db.exec('PRAGMA journal_mode = WAL')
	for (const file of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) {
		for (const stmt of readFileSync(join(MIGRATIONS, file), 'utf8').split('--> statement-breakpoint')) {
			if (stmt.trim()) db.exec(stmt)
		}
	}

	const now = Date.now()
	db.query(
		`INSERT INTO gateway_channels (id, owner_id, platform, name, credentials, status, created_at, updated_at)
		 VALUES (?, 'owner-seed', 'WHATSAPP', 'Seed', '{}', 'CONNECTED', ?, ?)`,
	).run(CHANNEL, now, now)
	const remote = db.query(
		`INSERT INTO gateway_remotes (channel_id, remote_id, type, platform, name, last_message_at, created_at, updated_at)
		 VALUES (?, ?, ?, 'WHATSAPP', ?, ?, ?, ?)`,
	)
	remote.run(CHANNEL, ALICE, 'USER', 'Alice', now, now, now)
	remote.run(CHANNEL, GROUP, 'GROUP', 'Time BK', now - 1000, now, now)

	insertMessage(db, { remote: ALICE, sender: ALICE, text: 'Oi, tudo bem?', at: now - 60_000 })
	insertMessage(db, { remote: ALICE, sender: 'me@s.whatsapp.net', text: 'Tudo, e você?', at: now - 50_000, direction: 'SENT' })
	insertMessage(db, { remote: GROUP, sender: ALICE, text: 'Deploy saiu?', at: now - 40_000 })
	// Sync de histórico: mensagem ANTIGA observada AGORA — tem que aparecer como nova para o cursor.
	insertMessage(db, { remote: ALICE, sender: ALICE, text: 'mensagem antiga do histórico', at: now - 86_400_000, observed: now - 30_000 })
	db.close()
}

export function insertMessage(
	db: Database,
	m: { remote: string; sender: string; text: string; at: number; observed?: number; direction?: 'RECEIVED' | 'SENT' },
) {
	const id = crypto.randomUUID()
	db.query(
		`INSERT INTO gateway_messages (id, channel_id, remote_id, platform_message_id, direction, platform, sender_remote_id,
		                               message_type, content, occurred_at, observed_at)
		 VALUES (?, ?, ?, ?, ?, 'WHATSAPP', ?, 'TEXT', ?, ?, ?)`,
	).run(id, CHANNEL, m.remote, `wa-${id}`, m.direction ?? 'RECEIVED', m.sender, JSON.stringify({ text: m.text }), m.at, m.observed ?? m.at)
	return id
}

export function addReceived(path: string, text: string) {
	const db = new Database(path)
	const id = insertMessage(db, { remote: ALICE, sender: ALICE, text, at: Date.now() })
	db.close()
	return id
}

if (import.meta.main) {
	const [path, flag, text] = process.argv.slice(2)
	if (!path) {
		console.error('uso: bun seed.ts <arquivo.db> [--add "texto"]')
		process.exit(1)
	}
	if (flag === '--add') {
		addReceived(path, text ?? 'mensagem nova')
		console.log('mensagem recebida inserida em', path)
	} else {
		createSeedDb(path)
		console.log('banco de teste criado em', path)
	}
}
