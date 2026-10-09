import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { LibSqlDatabaseDriver } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind, PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { TestBed } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository } from './MailboxRepository'

/**
 * INVARIANT (participant-permission-posture, Decision 4 / AC-5): an item enqueued BEFORE the posture
 * existed — a row whose INSERT never named the column — is claimed as AUTO, the least privilege. The rule
 * lives in the schema (`DEFAULT 'AUTO'`), not in a branch of the reader.
 *
 * The row is written with RAW SQL that omits the column, exactly as a pre-deploy producer did.
 *
 * FALSIFIER: drop `.default(PermissionPosture.AUTO)` from `agentMailbox.posture` and the `DEFAULT 'AUTO'`
 * from the migration — the legacy INSERT then fails `NOT NULL` and this test goes RED.
 */
describe('INVARIANT — a legacy item with no posture runs AUTO', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('a row inserted without the column is claimed as AUTO', async () => {
		const id = uuidv7()
		await testBed.resolve(LibSqlDatabaseDriver).db.run(
			sql`INSERT INTO agent_mailbox (id, owner_id, target_kind, target_id, kind, payload, dedup_key, attempts, created_at)
			    VALUES (${id}, ${MOCK_CLOUD_OWNER_ID}, ${MailboxTargetKind.ISSUE}, ${uuidv7()}, ${MailboxItemKind.STEER},
			            ${JSON.stringify({ threadId: uuidv7(), key: 'k', title: 't', text: 'legado' })}, ${`legacy:${id}`}, 0, ${Date.now()})`,
		)

		const claimed = await testBed.resolve(MailboxRepository).claimNext('legacy-test', 60_000)

		expect(claimed?.id).toBe(id)
		expect(claimed?.posture).toBe(PermissionPosture.AUTO)
	})
})
