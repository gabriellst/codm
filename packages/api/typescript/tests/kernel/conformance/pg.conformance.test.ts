import { eq } from 'drizzle-orm'
import { outbox } from '@codm/contracts/db/pg'
import { OutboxSource } from '@codm/contracts-typescript/wire/enums'
import {
	EventEmitter2Mediator,
	MockExternalMediator,
	MockLoggingService,
	PGliteDriver,
	PgIdempotencyGuard,
	PgOutboxDispatcher,
	describeIdempotencyConformance,
	describeOutboxConformance,
} from '@codm/core-typescript'

/**
 * A família **pg**, submetida ao MESMO contrato de admissão que a libsql.
 *
 * É isto que o ADR 0005 quis dizer com "a nuvem roda sobre Postgres": não que exista um arquivo
 * chamado `PgDriver`, e sim que a família passa a mesma prova. O concreto é o `PGliteDriver`
 * (Postgres em processo) porque a suíte não pode depender de um servidor de pé — e é Postgres de
 * verdade, não uma imitação.
 */
describeIdempotencyConformance({
	family: 'pg',
	makeDriver: async () => {
		const driver = new PGliteDriver()
		await driver.runMigrations()
		return driver
	},
	makeGuard: driver => new PgIdempotencyGuard(driver),
})

/** A mesma família, agora sob o contrato de OUTBOX — onde o `SKIP LOCKED` dela é provado equivalente. */
describeOutboxConformance({
	family: 'pg',
	ownSource: OutboxSource.api,
	maxAttempts: 5,
	makeDriver: async () => {
		const driver = new PGliteDriver()
		await driver.runMigrations()
		return driver
	},
	makeGuard: driver => new PgIdempotencyGuard(driver),
	makeDispatcher: driver =>
		new PgOutboxDispatcher(driver, new EventEmitter2Mediator(), new MockExternalMediator(), new MockLoggingService()),
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
