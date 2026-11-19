import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { BatchItemDestinationKind, BatchStatus } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { Batch } from '@thread/entities/Batch'
import { BatchRepository } from '@thread/repositories/BatchRepository'
import { GetBatch } from './GetBatch'

/**
 * THE BATCH SCREEN'S READ (fase 4, item 5) — every item, its destination when recorded, and the key/title of the
 * issues the destinations name; another conversation's code is not found.
 */
describe('GetBatch — a conversation’s batch for the console', () => {
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

	const open = async (threadId: string) => {
		const batch = Batch.open({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId,
			seq: 7,
			sourceEntryId: crypto.randomUUID(),
			items: [
				{ n: 1, excerpt: 'trocar o texto do botão' },
				{ n: 2, excerpt: 'refazer o logo' },
			],
		})
		await testBed.resolve(BatchRepository).save(batch)
		return batch
	}

	it('an incomplete batch lists its items without destinations', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await open(thread.id.value)
		const out = await testBed.resolve(GetBatch).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, batchCode: 'L-7' })
		expect(out).toMatchObject({ code: 'L-7', status: BatchStatus.INCOMPLETE, issues: [] })
		expect(out.items.map(item => item.destination)).toEqual([undefined, undefined])
	})

	it('a recorded batch carries every destination and the issues they name', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			key: 'APP-42',
			title: 'Texto do botão',
		})
		const batch = await open(thread.id.value)
		batch.recordDestinations(
			[
				{ n: 1, destination: { kind: BatchItemDestinationKind.NEW_ISSUE, issueId: issue.id.value } },
				{ n: 2, destination: { kind: BatchItemDestinationKind.DECLINED, reason: 'fora do escopo' } },
			],
			new Date(),
		)
		batch.recordReceipt(crypto.randomUUID())
		await testBed.resolve(BatchRepository).save(batch)

		const out = await testBed.resolve(GetBatch).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, batchCode: 'L-7' })
		expect(out.status).toBe(BatchStatus.RECORDED)
		expect(out.items[1]?.destination).toEqual({ kind: BatchItemDestinationKind.DECLINED, reason: 'fora do escopo' })
		expect(out.issues).toEqual([{ issueId: issue.id.value, key: 'APP-42', title: 'Texto do botão' }])
	})

	it('a code of another conversation is not found', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const other = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await open(other.id.value)
		await expect(
			testBed.resolve(GetBatch).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, batchCode: 'L-7' }),
		).rejects.toThrow(expect.objectContaining({ name: 'BATCH_NOT_FOUND' }))
	})
})
