// DrizzleDomainEventRepository — the append-only event log plus its outbox twin.
//
// Two things here are dialect-sensitive and neither shows up in a type error:
//   1. `findByOwnerIdAndNameLike` used to count with a Postgres integer CAST appended to `count(*)`.
//      That cast syntax does not exist in this dialect; SQLite rejects it at runtime, and the only
//      way to see that is to RUN the count.
//   2. Every row carries `source`, and the value must be the FROZEN wire enum, because the Go side
//      discriminates its lane on that exact string. A retyped literal drifts silently.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import * as schema from '@codm/contracts/db'
import { events, outbox } from '@codm/contracts/db'
import { migrationsDir } from '@codm/contracts/db/migrations'
import { OutboxSource } from '@codm/contracts-typescript/wire/enums'
import { LibsqlDriver } from '../db/drivers/LibsqlDriver'
import type { DrizzleClient } from '../db/client'
import { BaseDomainEvent } from '../types/BaseDomainEvent'
import { BaseIntegrationEvent } from '../types/BaseIntegrationEvent'
import { z } from '../utils/schema'
import { DrizzleDomainEventRepository } from './DrizzleDomainEventRepository'

const OWNER = '66666666-6666-4666-8666-666666666666'

const ProbeEventSchema = z.domainEvent({ marker: z.string() })

class ProbeEvent extends BaseDomainEvent<typeof ProbeEventSchema> {
	static override readonly name = 'probe.happened' as const
	static readonly schema = ProbeEventSchema
}
class OtherEvent extends BaseDomainEvent<typeof ProbeEventSchema> {
	static override readonly name = 'other.happened' as const
	static readonly schema = ProbeEventSchema
}

describe('DrizzleDomainEventRepository', () => {
	let dir: string
	let driver: LibsqlDriver
	let repo: DrizzleDomainEventRepository

	beforeAll(async () => {
		dir = mkdtempSync(join(tmpdir(), 'libsql-events-test-'))
		driver = new LibsqlDriver({ schema, migrationsDir, dbPath: join(dir, 'codedm.db') })
		await driver.runMigrations()
		repo = new DrizzleDomainEventRepository(driver.db as DrizzleClient)
	})

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true })
	})

	beforeEach(async () => {
		await driver.reset()
	})

	const save = (marker: string, Event: typeof ProbeEvent | typeof OtherEvent = ProbeEvent) =>
		driver.transaction(tx =>
			repo.save(new Event({ entityId: crypto.randomUUID(), ownerId: OWNER, payload: { marker } }), tx as DrizzleClient),
		)

	it('writes the audit row AND the outbox row, both on the `api` lane', async () => {
		await save('one')

		const [auditRow] = await driver.db.select().from(events)
		const [outboxRow] = await driver.db.select().from(outbox)

		expect(auditRow?.name).toBe('probe.happened')
		expect(auditRow?.source).toBe(OutboxSource.api)
		expect(auditRow?.occurredAt).toBeInstanceOf(Date)
		expect(outboxRow?.id).toBe(auditRow?.id as string)
		expect(outboxRow?.source).toBe(OutboxSource.api)
		expect(outboxRow?.processedAt).toBeNull()
	})

	const ProbeIntegrationEventSchema = z.integrationEvent('integration.probe.happened', { marker: z.string() })
	class ProbeIntegrationEvent extends BaseIntegrationEvent<typeof ProbeIntegrationEventSchema> {
		static override readonly name = 'integration.probe.happened' as const
		static readonly schema = ProbeIntegrationEventSchema
	}

	it('an INTEGRATION event lands on the `integration` lane — the lane whose claimant is SqlExternalMediator', async () => {
		await driver.transaction(tx =>
			repo.saveIntegrationEvent(new ProbeIntegrationEvent({ ownerId: OWNER, payload: { marker: 'crossing' } }), tx as DrizzleClient),
		)

		const [auditRow] = await driver.db.select().from(events)
		const [outboxRow] = await driver.db.select().from(outbox)

		// The audit row records WHO PRODUCED it (this daemon = api); the outbox row records WHO CLAIMS it.
		expect(auditRow?.source).toBe(OutboxSource.api)
		expect(outboxRow?.source).toBe(OutboxSource.integration)
		expect(outboxRow?.processedAt).toBeNull()
	})

	it('COUNTS with a dialect-portable count(*) — the old Postgres integer cast would fail at runtime', async () => {
		await save('a')
		await save('b')
		await save('c')
		await save('elsewhere', OtherEvent)

		const page = await repo.findByOwnerIdAndNameLike(OWNER, 'probe.%', { limit: 2, offset: 0 })
		expect(page.total).toBe(3) // the count, not the page size
		expect(typeof page.total).toBe('number')
		expect(page.items).toHaveLength(2)

		const second = await repo.findByOwnerIdAndNameLike(OWNER, 'probe.%', { limit: 2, offset: 2 })
		expect(second.items).toHaveLength(1)
		expect(second.total).toBe(3)
	})

	it('saveIfNotExists is idempotent at the database level', async () => {
		const event = new ProbeEvent({ entityId: crypto.randomUUID(), ownerId: OWNER, payload: { marker: 'once' } })

		expect(await driver.transaction(tx => repo.saveIfNotExists(event, tx as DrizzleClient))).toBe(true)
		expect(await driver.transaction(tx => repo.saveIfNotExists(event, tx as DrizzleClient))).toBe(false)
		expect(await driver.db.select().from(events)).toHaveLength(1)
	})

	it('sweeps by name since a timestamp — the epoch-ms comparison is not inverted by units', async () => {
		await save('recent')
		const future = new Date(Date.now() + 60_000)
		const past = new Date(Date.now() - 60_000)

		expect(await repo.listByNameSince('probe.happened', past)).toHaveLength(1)
		expect(await repo.listByNameSince('probe.happened', future)).toHaveLength(0)
	})
})
