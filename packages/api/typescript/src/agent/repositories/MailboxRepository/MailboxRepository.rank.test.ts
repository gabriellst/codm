import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq, inArray } from 'drizzle-orm'
import { LibSqlDatabaseDriver } from '@codm/core-typescript'
import { agentMailbox } from '@codm/contracts/db'
import {
	IssuePriority,
	IssueWorkKind,
	MailboxClaimClass,
	MailboxDeferCause,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	PriorityReason,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { IssueAttributes } from '../../entities/IssueAttributes'
import { IssueAttributesRepository, MockIssueAttributesRepository } from '../IssueAttributesRepository'
import { CLAIM_RANK } from '../../utils/ClaimRank'
import { MailboxRepository } from './MailboxRepository'
import { MockMailboxRepository } from './MockMailboxRepository'

const THREAD = '00000000-0000-4000-8000-00000000aaaa'

/**
 * THE CLAIM ORDER (fase 4, S4) — a decision's answer first, then a client's bug, then the declared priority; the lanes
 * stay the first key; a target is ranked by the best of its ready items but always hands its OLDEST one (nothing jumps
 * an older item of its own task, nor a paused one); equal ranks go by arrival (`created_at`, then `id`). Run against
 * SQLite and against the in-memory twin, same assertions.
 *
 * Falsifier: order by the ITEM's rank instead of the target's oldest item and "FIFO inside the target" claims the
 * newer answer first; drop the `id` key and the same-millisecond case follows the query plan; drop the lane key and
 * the conversation waits behind the client's bug.
 */
for (const env of ['libsql', 'mock'] as const) {
	describe(`MailboxRepository (${env}) — claim order by priority, then arrival`, () => {
		let testBed: TestBed
		let testContainer: DependencyContainer
		let mailbox: MailboxRepository
		let attributes: IssueAttributesRepository

		beforeAll(async () => {
			testContainer = container.createChildContainer()
			testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		})
		beforeEach(async () => {
			await testBed.reset()
			if (env === 'libsql') {
				mailbox = testBed.resolve(MailboxRepository)
				attributes = testBed.resolve(IssueAttributesRepository)
			} else {
				attributes = new MockIssueAttributesRepository()
				mailbox = new MockMailboxRepository(attributes)
			}
		})
		afterAll(async () => {
			await testBed.destroy()
		})

		/** A task born with `priority` for `reason`. No call ⇒ no attributes row (an issue older than the table). */
		const task = async (priority: IssuePriority, reason: PriorityReason = PriorityReason.DECLARED): Promise<string> => {
			const issueId = crypto.randomUUID()
			await attributes.insertIfNew(
				IssueAttributes.born({
					issueId,
					ownerId: MOCK_CLOUD_OWNER_ID,
					threadId: THREAD,
					priority,
					priorityReason: reason,
					workKind: IssueWorkKind.CHANGE,
				}),
			)
			return issueId
		}

		let seq = 0
		const enqueue = async (targetId: string, claimClass: MailboxClaimClass, targetKind = MailboxTargetKind.ISSUE): Promise<string> => {
			seq += 1
			const dedupKey = `rank:${seq}:${crypto.randomUUID()}`
			await mailbox.enqueue({
				ownerId: MOCK_CLOUD_OWNER_ID,
				targetKind,
				targetId,
				kind: targetKind === MailboxTargetKind.ISSUE ? MailboxItemKind.STEER : MailboxItemKind.OPERATOR_MESSAGE,
				claimClass,
				posture: PermissionPosture.AUTO,
				payload: { dedupKey },
				dedupKey,
			})
			// Distinct milliseconds, so "arrival" is unambiguous unless a case says otherwise.
			await Bun.sleep(2)
			return dedupKey
		}
		const claim = (lanes?: readonly MailboxTargetKind[]) => mailbox.claimNext('w', 60_000, lanes)
		const keyOf = (item: Awaited<ReturnType<typeof claim>>) => (item?.payload as { dedupKey?: string } | undefined)?.dedupKey

		it('the rank table: a decision answer leads, then client bug, HIGH, NORMAL, LOW', () => {
			const rank = (cls: MailboxClaimClass, reason: PriorityReason, priority: IssuePriority) => CLAIM_RANK[cls][reason][priority]
			expect(rank(MailboxClaimClass.DECISION_ANSWER, PriorityReason.DECLARED, IssuePriority.LOW)).toBeLessThan(
				rank(MailboxClaimClass.STEER, PriorityReason.CLIENT_BUG, IssuePriority.HIGH),
			)
			expect(rank(MailboxClaimClass.STEER, PriorityReason.CLIENT_BUG, IssuePriority.LOW)).toBeLessThan(
				rank(MailboxClaimClass.STEER, PriorityReason.DECLARED, IssuePriority.HIGH),
			)
			expect(rank(MailboxClaimClass.WORK, PriorityReason.DECLARED, IssuePriority.HIGH)).toBeLessThan(
				rank(MailboxClaimClass.WORK, PriorityReason.DEFAULT, IssuePriority.NORMAL),
			)
			expect(rank(MailboxClaimClass.WORK, PriorityReason.DEFAULT, IssuePriority.NORMAL)).toBeLessThan(
				rank(MailboxClaimClass.WORK, PriorityReason.DECLARED, IssuePriority.LOW),
			)
		})

		it('client bug, then HIGH, then NORMAL, then LOW — whatever order they arrived in', async () => {
			const low = await task(IssuePriority.LOW)
			const normal = await task(IssuePriority.NORMAL, PriorityReason.DEFAULT)
			const high = await task(IssuePriority.HIGH)
			const bug = await task(IssuePriority.NORMAL, PriorityReason.CLIENT_BUG)
			for (const issueId of [low, normal, high, bug]) await enqueue(issueId, MailboxClaimClass.STEER)

			const order = [await claim(), await claim(), await claim(), await claim()].map(item => item?.targetId)
			expect(order).toEqual([bug, high, normal, low])
		})

		it("a decision's answer passes every task ahead of it", async () => {
			const bug = await task(IssuePriority.HIGH, PriorityReason.CLIENT_BUG)
			const waiting = await task(IssuePriority.LOW)
			await enqueue(bug, MailboxClaimClass.STEER)
			await enqueue(waiting, MailboxClaimClass.DECISION_ANSWER)

			expect((await claim())?.targetId).toBe(waiting)
		})

		it("FIFO inside the target: the newer answer lifts its task, but the task's OLDER item runs first", async () => {
			const lifted = await task(IssuePriority.NORMAL, PriorityReason.DEFAULT)
			const other = await task(IssuePriority.HIGH)
			const olderSteer = await enqueue(lifted, MailboxClaimClass.STEER)
			await enqueue(other, MailboxClaimClass.STEER)
			const answer = await enqueue(lifted, MailboxClaimClass.DECISION_ANSWER)

			const first = await claim()
			expect(first?.targetId).toBe(lifted)
			expect(keyOf(first)).toBe(olderSteer)
			// The lifted task is leased; the other runs beside it, and the answer waits behind its own older item.
			expect((await claim())?.targetId).toBe(other)
			expect(await claim()).toBeUndefined()
			await mailbox.complete([first?.id ?? ''])
			expect(keyOf(await claim())).toBe(answer)
		})

		it("nothing jumps a paused task's item: a held item keeps its whole target out, answer included", async () => {
			const paused = await task(IssuePriority.HIGH, PriorityReason.CLIENT_BUG)
			await enqueue(paused, MailboxClaimClass.STEER)
			const held = await claim()
			expect(held?.targetId).toBe(paused)
			// What the dispatcher does with a held issue's item: given back deferred, attempt refunded.
			await mailbox.defer([held?.id ?? ''], new Date(Date.now() + 30_000), MailboxDeferCause.HOLD)

			const normal = await task(IssuePriority.LOW)
			await enqueue(paused, MailboxClaimClass.DECISION_ANSWER)
			await enqueue(normal, MailboxClaimClass.STEER)

			expect((await claim())?.targetId).toBe(normal)
			expect(await claim()).toBeUndefined()
		})

		it('the lanes stay the first key: the conversation lane is served before a client bug', async () => {
			const bug = await task(IssuePriority.HIGH, PriorityReason.CLIENT_BUG)
			await enqueue(bug, MailboxClaimClass.DECISION_ANSWER)
			await enqueue(THREAD, MailboxClaimClass.OPERATOR, MailboxTargetKind.THREAD)

			expect((await claim([MailboxTargetKind.THREAD, MailboxTargetKind.ISSUE]))?.targetKind).toBe(MailboxTargetKind.THREAD)
			expect((await claim([MailboxTargetKind.THREAD, MailboxTargetKind.ISSUE]))?.targetId).toBe(bug)
		})

		it('equal priority goes by arrival — the owner decision of 19/11', async () => {
			const first = await task(IssuePriority.NORMAL)
			const second = await task(IssuePriority.NORMAL)
			const third = await task(IssuePriority.NORMAL)
			await enqueue(second, MailboxClaimClass.STEER)
			await enqueue(first, MailboxClaimClass.WORK)
			await enqueue(third, MailboxClaimClass.STEER)

			expect([await claim(), await claim(), await claim()].map(item => item?.targetId)).toEqual([second, first, third])
		})

		it('a task older than the attributes table ranks as the birth defaults (NORMAL)', async () => {
			const low = await task(IssuePriority.LOW)
			const legacy = crypto.randomUUID()
			const high = await task(IssuePriority.HIGH)
			await enqueue(low, MailboxClaimClass.STEER)
			await enqueue(legacy, MailboxClaimClass.STEER)
			await enqueue(high, MailboxClaimClass.STEER)

			expect([await claim(), await claim(), await claim()].map(item => item?.targetId)).toEqual([high, legacy, low])
		})

		if (env === 'libsql') {
			it('the same millisecond goes by id (uuid v7) — never by the query plan', async () => {
				const a = await task(IssuePriority.NORMAL)
				const b = await task(IssuePriority.NORMAL)
				await enqueue(a, MailboxClaimClass.STEER)
				await enqueue(b, MailboxClaimClass.STEER)
				const driver = testBed.resolve(LibSqlDatabaseDriver)
				const rows = await driver.db
					.select({ id: agentMailbox.id, targetId: agentMailbox.targetId })
					.from(agentMailbox)
					.where(inArray(agentMailbox.targetId, [a, b]))
				// Both rows the same instant: the id is the only key left, and uuid v7 orders as they were minted.
				await driver.transaction(tx =>
					tx
						.update(agentMailbox)
						.set({ createdAt: new Date(1_700_000_000_000) })
						.where(inArray(agentMailbox.targetId, [a, b])),
				)
				const byId = [...rows].sort((x, y) => (x.id < y.id ? -1 : 1)).map(row => row.targetId)
				expect(byId).toEqual([a, b])

				expect([await claim(), await claim()].map(item => item?.targetId)).toEqual([a, b])
			})

			it('…and it is the id deciding, not the insertion: the later row with the lower id goes first', async () => {
				const a = await task(IssuePriority.NORMAL)
				const b = await task(IssuePriority.NORMAL)
				await enqueue(a, MailboxClaimClass.STEER)
				await enqueue(b, MailboxClaimClass.STEER)
				const driver = testBed.resolve(LibSqlDatabaseDriver)
				await driver.transaction(async tx => {
					await tx
						.update(agentMailbox)
						.set({ createdAt: new Date(1_700_000_000_000) })
						.where(inArray(agentMailbox.targetId, [a, b]))
					// A uuid v7 minted before every other: the row inserted LAST now has the lowest id.
					await tx.update(agentMailbox).set({ id: '00000000-0000-7000-8000-000000000001' }).where(eq(agentMailbox.targetId, b))
				})

				expect([await claim(), await claim()].map(item => item?.targetId)).toEqual([b, a])
			})
		}
	})
}
