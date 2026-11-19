import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { LibSqlDatabaseDriver } from '@codm/core-typescript'
import { agentMailbox } from '@codm/contracts/db'
import { MailboxClaimClass, MailboxItemKind, MailboxTargetKind, PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { TestBed } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MockIssueAttributesRepository } from '../IssueAttributesRepository'
import { MAX_COALESCED } from '../../utils/SteerCoalescing'
import { MailboxRepository } from './MailboxRepository'
import { MockMailboxRepository } from './MockMailboxRepository'

/** Above every platform's pid ceiling — `kill(pid, 0)` answers ESRCH (see `MailboxRepository.test.ts`). */
const PID_NOBODY_HOLDS = 2_147_483_632

/**
 * RECADOS JUNTOS, the queue's half (fase 4, item 6b) — `claimBundle` leases a task's oldest ready item and the
 * contiguous prefix of STEERs behind it (same posture, same loop origin, up to `MAX_COALESCED`), all in one write; every
 * write that settles the turn settles the whole group; only the head pays a failed attempt. Run against SQLite and
 * against the in-memory twin, same assertions.
 *
 * Falsifier: skip an incompatible item instead of stopping at it and "the prefix stops" cases take the newer steer;
 * charge the followers in `fail` and the refund case reads 1; `claimNext` sharing the coalescing path makes its case
 * claim three.
 */
for (const env of ['libsql', 'mock'] as const) {
	describe(`MailboxRepository (${env}) — steers that ride one turn`, () => {
		let testBed: TestBed
		let testContainer: DependencyContainer
		let mailbox: MailboxRepository
		const ISSUE = '00000000-0000-4000-8000-0000000000a1'
		const OTHER = '00000000-0000-4000-8000-0000000000b2'

		beforeAll(async () => {
			testContainer = container.createChildContainer()
			testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		})
		beforeEach(async () => {
			await testBed.reset()
			mailbox = env === 'libsql' ? testBed.resolve(MailboxRepository) : new MockMailboxRepository(new MockIssueAttributesRepository())
		})
		afterAll(async () => {
			await testBed.destroy()
		})

		let seq = 0
		const enqueue = async (
			text: string,
			{
				claimClass = MailboxClaimClass.STEER,
				posture = PermissionPosture.AUTO,
				firedByLoop,
				targetId = ISSUE,
			}: { claimClass?: MailboxClaimClass; posture?: PermissionPosture; firedByLoop?: string; targetId?: string } = {},
		) => {
			seq += 1
			await mailbox.enqueue({
				ownerId: MOCK_CLOUD_OWNER_ID,
				targetKind: MailboxTargetKind.ISSUE,
				targetId,
				kind: claimClass === MailboxClaimClass.WORK ? MailboxItemKind.WORK : MailboxItemKind.STEER,
				claimClass,
				posture,
				payload: { text, firedByLoop },
				dedupKey: `bundle:${seq}:${text}`,
			})
			await Bun.sleep(2)
		}
		const bundle = () => mailbox.claimBundle('w', 60_000)
		const textsOf = (claimed: Awaited<ReturnType<typeof bundle>>) =>
			claimed ? [claimed.head, ...claimed.followers].map(item => (item.payload as { text: string }).text) : []
		const idsOf = (claimed: Awaited<ReturnType<typeof bundle>>) =>
			claimed ? [claimed.head, ...claimed.followers].map(item => item.id) : []

		it('three steers of one task are ONE turn, in arrival order — each its own first hand-off', async () => {
			for (const text of ['s1', 's2', 's3']) await enqueue(text)
			const claimed = await bundle()

			expect(textsOf(claimed)).toEqual(['s1', 's2', 's3'])
			expect([claimed?.head, ...(claimed?.followers ?? [])].map(item => [item?.firstClaim, item?.attempts])).toEqual([
				[true, 1],
				[true, 1],
				[true, 1],
			])
			// The whole task is leased: nothing more of it, and nothing left behind.
			expect(await bundle()).toBeUndefined()
		})

		it('claimNext never coalesces — it hands one item, as every caller outside the dispatcher expects', async () => {
			for (const text of ['s1', 's2', 's3']) await enqueue(text)
			expect((await mailbox.claimNext('w', 60_000))?.payload).toEqual(expect.objectContaining({ text: 's1' }))
			expect(await mailbox.claimNext('w', 60_000)).toBeUndefined()
		})

		it('the prefix STOPS at an "agora", a decision answer, a reminder — never skips it', async () => {
			for (const [text, claimClass] of [
				['s1', MailboxClaimClass.STEER],
				['now', MailboxClaimClass.INTERRUPT],
				['s3', MailboxClaimClass.STEER],
				['answer', MailboxClaimClass.DECISION_ANSWER],
				['s5', MailboxClaimClass.STEER],
				['remind', MailboxClaimClass.REMINDER],
				['s7', MailboxClaimClass.STEER],
			] as const)
				await enqueue(text, { claimClass })

			const turns: string[][] = []
			for (let claimed = await bundle(); claimed; claimed = await bundle()) {
				turns.push(textsOf(claimed))
				await mailbox.complete(idsOf(claimed))
			}
			// The "agora" leads the steer behind it; the answer and the reminder are turns of their own.
			expect(turns).toEqual([['s1'], ['now', 's3'], ['answer'], ['s5'], ['remind'], ['s7']])
		})

		it('the prefix stops at another posture and at a loop nudge — one author, one privilege per turn', async () => {
			await enqueue('a1')
			await enqueue('b1', { posture: PermissionPosture.BYPASS })
			await enqueue('b2', { posture: PermissionPosture.BYPASS })
			await enqueue('loop', { firedByLoop: 'daily' })
			await enqueue('a2')

			const turns: string[][] = []
			for (let claimed = await bundle(); claimed; claimed = await bundle()) {
				turns.push(textsOf(claimed))
				await mailbox.complete(idsOf(claimed))
			}
			expect(turns).toEqual([['a1'], ['b1', 'b2'], ['loop'], ['a2']])
		})

		it('the brief carries nobody; another task is never part of the group', async () => {
			await enqueue('brief', { claimClass: MailboxClaimClass.WORK })
			await enqueue('other', { targetId: OTHER })
			await enqueue('s1')
			await enqueue('s2')

			const first = await bundle()
			expect(textsOf(first)).toEqual(['brief'])
			expect(textsOf(await bundle())).toEqual(['other'])
			await mailbox.complete(idsOf(first))
			expect(textsOf(await bundle())).toEqual(['s1', 's2'])
		})

		it(`at most ${MAX_COALESCED} items ride one turn`, async () => {
			for (let n = 0; n < MAX_COALESCED + 2; n++) await enqueue(`s${n}`)
			const claimed = await bundle()
			expect(textsOf(claimed)).toHaveLength(MAX_COALESCED)
			await mailbox.complete(idsOf(claimed))
			expect(textsOf(await bundle())).toEqual([`s${MAX_COALESCED}`, `s${MAX_COALESCED + 1}`])
		})

		it('a failed turn: only the head pays — the followers come back with their attempt refunded, the group whole', async () => {
			for (const text of ['s1', 's2', 's3']) await enqueue(text)
			const claimed = await bundle()
			await mailbox.fail(claimed?.head.id ?? '', claimed?.followers.map(item => item.id) ?? [], 'boom', 3)

			const again = await bundle()
			expect(textsOf(again)).toEqual(['s1', 's2', 's3'])
			expect([again?.head, ...(again?.followers ?? [])].map(item => [item?.attempts, item?.firstClaim])).toEqual([
				[2, false],
				[1, false],
				[1, false],
			])
		})

		it('the head is poisoned alone; its followers form the next turn', async () => {
			for (const text of ['s1', 's2']) await enqueue(text)
			const claimed = await bundle()
			await mailbox.fail(claimed?.head.id ?? '', claimed?.followers.map(item => item.id) ?? [], 'boom', 1)

			const next = await bundle()
			expect(textsOf(next)).toEqual(['s2'])
			expect(next?.head.attempts).toBe(1)
		})

		it('a pause gives the whole group back — attempts refunded, held until the instant, then whole again', async () => {
			for (const text of ['s1', 's2']) await enqueue(text)
			const claimed = await bundle()
			await mailbox.defer(idsOf(claimed), new Date(Date.now() + 60_000))
			expect(await bundle()).toBeUndefined()
			expect((await mailbox.deferred()).map(item => item.id).sort()).toEqual([...idsOf(claimed)].sort())

			await mailbox.releaseDeferred(idsOf(claimed))
			const again = await bundle()
			expect(textsOf(again)).toEqual(['s1', 's2'])
			expect([again?.head.attempts, again?.followers[0]?.attempts]).toEqual([1, 1])
		})

		it('complete consumes every item of the turn in one write; the heartbeat renews them all', async () => {
			for (const text of ['s1', 's2']) await enqueue(text)
			const claimed = await mailbox.claimBundle('w', -1)
			// A lapsed lease, renewed for the WHOLE group by its holder: nothing of the task is claimable.
			await mailbox.renewLease(idsOf(claimed), 'w', 60_000)
			expect(await bundle()).toBeUndefined()
			await mailbox.complete(idsOf(claimed))
			expect(await bundle()).toBeUndefined()
			expect(await mailbox.hasPending(MailboxTargetKind.ISSUE, ISSUE)).toBe(false)
		})

		if (env === 'libsql') {
			it('a crash mid-turn never splits the group: the boot sweep frees all of it, and it comes back whole', async () => {
				for (const text of ['s1', 's2', 's3']) await enqueue(text)
				const claimed = await bundle()
				const driver = testBed.resolve(LibSqlDatabaseDriver)
				// The daemon that held it died: every row of the group carries the dead boot.
				await driver.transaction(tx =>
					tx
						.update(agentMailbox)
						.set({ claimedBoot: 'boot-that-died', claimedPid: PID_NOBODY_HOLDS })
						.where(eq(agentMailbox.targetId, ISSUE)),
				)
				expect(await mailbox.releaseOrphanedClaims()).toBe(3)

				const again = await bundle()
				expect(idsOf(again)).toEqual(idsOf(claimed))
				// Every item keeps its own first hand-off: none of them is "delivered" a second time.
				expect([again?.head, ...(again?.followers ?? [])].every(item => item?.firstClaim === false)).toBe(true)
			})
		}
	})
}
