import { eq } from 'drizzle-orm'
import * as schema from '@codm/contracts/db'
import { outbox } from '@codm/contracts/db'
import { migrationsDir } from '@codm/contracts/db/migrations'
import { OutboxSource } from '@codm/contracts-typescript/wire/enums'
import {
	LibSqlIdempotencyGuard,
	LibSqlOutboxDispatcher,
	EventEmitter2Mediator,
	LibSqlDriver,
	MockExternalMediator,
	MockLoggingService,
	describeIdempotencyConformance,
	describeOutboxConformance,
} from '@codm/core-typescript'

/**
 * A família **libsql**, submetida aos contratos de admissão.
 *
 * Este arquivo não tem asserção nenhuma, e isso é o desenho: as asserções moram UMA vez em
 * `core/src/db/conformance/`, e o que cada família traz é só a harness — como levantar o driver e
 * como construir os primitivos. Uma asserção escrita aqui seria uma regra que só uma família
 * cumpre, que é exatamente o que a suíte existe para impedir.
 */

const makeLibSqlDriver = async (): Promise<LibSqlDriver> => {
	const driver = new LibSqlDriver({ schema, migrationsDir })
	await driver.runMigrations()
	return driver
}

describeIdempotencyConformance({
	family: 'libsql',
	makeDriver: makeLibSqlDriver,
	makeGuard: driver => new LibSqlIdempotencyGuard(driver),
})

/**
 * A mesma família sob o contrato de OUTBOX — o par do `pg`.
 *
 * A propriedade cobrada é a mesma nos dois; o MECANISMO não. Aqui a reivindicação não precisa de
 * trava porque toda escrita do processo passa por um portão FIFO de um titular só; lá precisa de
 * `FOR UPDATE SKIP LOCKED`, porque réplicas do mesmo serviço disputam a janela entre o `SELECT` e o
 * `UPDATE`. É precisamente essa assimetria que faz "parece igual" não valer nada e a suíte valer.
 */
describeOutboxConformance({
	family: 'libsql',
	ownSource: OutboxSource.api,
	maxAttempts: 5,
	makeDriver: makeLibSqlDriver,
	makeGuard: driver => new LibSqlIdempotencyGuard(driver),
	makeDispatcher: driver =>
		new LibSqlOutboxDispatcher(driver, new EventEmitter2Mediator(), new MockExternalMediator(), new MockLoggingService()),
	seedOutboxRow: async (driver, row) => {
		await driver.db.insert(outbox).values({
			id: row.id,
			name: row.name,
			source: row.source,
			ownerId: row.ownerId ?? null,
			payload: row.payload ?? {},
			attempts: row.attempts ?? 0,
			leaseUntil: row.leaseUntil ?? null,
			processedAt: row.processedAt ?? null,
		})
	},
	readOutboxRow: async (driver, id) => {
		const [found] = await driver.db.select().from(outbox).where(eq(outbox.id, id)).limit(1)
		return found === undefined
			? undefined
			: {
					id: found.id,
					source: found.source,
					attempts: found.attempts,
					processedAt: found.processedAt,
					lastError: found.lastError,
					claimedBy: found.claimedBy,
				}
	},
})
