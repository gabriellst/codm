import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { DomainEventRepository, LibSqlDatabaseDriver } from '@codm/core-typescript'
import {
	IrreversibleActionKind,
	IssueTimelineItemKind,
	MailboxClaimClass,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	RegretWindowOutcome,
} from '@codm/contracts-typescript/wire/enums'
import { CLAIM_CLASS_OF_KIND } from '@agent/utils/ClaimClassOfKind'
import { TestBed, givenIssue, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { assembleIssueTimeline } from '@issue/utils/issueTimeline'
import { OpenRegretWindow } from './OpenRegretWindow'
import { MailboxRepository } from '../repositories/MailboxRepository'
import { ImmediateRegretWindowClock, RegretWindowClock } from '../services/RegretWindowClock'
import { RegretWindowClosedEvent } from '../events/RegretWindowClosedEvent'
import { REGRET_WINDOW_MS } from '../utils/irreversibleActions'

/**
 * A clock whose wait runs whatever the test scheduled for "during the window" — a steer arriving, a
 * pause landing — and then returns. No test here sleeps.
 */
class ScriptedClock extends ImmediateRegretWindowClock {
	during: () => Promise<void> = async () => {}

	override async wait(ms: number): Promise<void> {
		await super.wait(ms)
		await this.during()
	}
}

/**
 * JANELA DE ARREPENDIMENTO (fase 2, item 3) — an irreversible command waits, then checks the issue's
 * mailbox; a message it has not read, or a pause, cancels it.
 *
 * Falsifier: make `cancellation` use `hasPending` and the "own claimed item" case cancels every push;
 * drop the check before the wait and the "steer already queued" case waits 20 s for nothing; check only
 * before the wait and the "steer arrives mid-window" case lets the push through.
 */
describe('OpenRegretWindow', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const clock = new ScriptedClock()

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		testBed.override(RegretWindowClock, clock)
	})
	beforeEach(async () => {
		await testBed.reset()
		clock.waits.length = 0
		clock.during = async () => {}
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function givenWorkingIssue(paused = false) {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-12', paused })
		return { issueId: issue.id.value, threadId: thread.id.value }
	}

	const steer = (issueId: string, n: number, kind: MailboxItemKind = MailboxItemKind.STEER) =>
		testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issueId,
			kind,
			claimClass: CLAIM_CLASS_OF_KIND[kind],
			posture: PermissionPosture.AUTO,
			payload: { text: `recado ${n}` },
			dedupKey: `regret-test:${issueId}:${n}`,
		})

	const open = (ids: { issueId: string; threadId: string }, command: string) =>
		testBed.resolve(OpenRegretWindow).execute({ ownerId: MOCK_CLOUD_OWNER_ID, ...ids, command })

	const recorded = () => testBed.resolve(DomainEventRepository).findByType(RegretWindowClosedEvent)

	it('a command that is not irreversible opens no window: no wait, nothing recorded', async () => {
		const ids = await givenWorkingIssue()
		expect(await open(ids, 'git status && bun test')).toBeUndefined()
		expect(clock.waits).toHaveLength(0)
		expect(await recorded()).toHaveLength(0)
	})

	it('nothing new during the window → it waits the whole window and goes ahead', async () => {
		const ids = await givenWorkingIssue()
		const closed = await open(ids, 'git push origin main')
		expect(closed).toEqual({
			actionKind: IrreversibleActionKind.GIT_PUSH,
			outcome: RegretWindowOutcome.PROCEEDED,
			waitedMs: REGRET_WINDOW_MS,
		})
		expect(clock.waits).toEqual([REGRET_WINDOW_MS])
	})

	it('a steer that arrives DURING the window cancels the action', async () => {
		const ids = await givenWorkingIssue()
		clock.during = async () => {
			await steer(ids.issueId, 1)
		}
		const closed = await open(ids, 'gh pr merge 42 --squash')
		expect(closed).toEqual({
			actionKind: IrreversibleActionKind.PR_MERGE,
			outcome: RegretWindowOutcome.CANCELLED_BY_STEER,
			waitedMs: REGRET_WINDOW_MS,
		})
	})

	it('a steer queued BEFORE the action and still unread cancels at once, without waiting', async () => {
		const ids = await givenWorkingIssue()
		await steer(ids.issueId, 1)
		const closed = await open(ids, 'npm publish')
		expect(closed).toEqual({
			actionKind: IrreversibleActionKind.PACKAGE_PUBLISH,
			outcome: RegretWindowOutcome.CANCELLED_BY_STEER,
			waitedMs: 0,
		})
		expect(clock.waits).toHaveLength(0)
	})

	it("the live turn's OWN item (claimed, unconsumed) is not an unread message", async () => {
		const ids = await givenWorkingIssue()
		await steer(ids.issueId, 1)
		// The turn running right now took this steer — its session is reading it.
		expect(await testBed.resolve(MailboxRepository).claimNext('live-turn', 60_000)).toBeDefined()
		const closed = await open(ids, 'git push')
		expect(closed?.outcome).toBe(RegretWindowOutcome.PROCEEDED)
	})

	it('the automatic declaration reminder is not a message from anyone — it does not cancel', async () => {
		const ids = await givenWorkingIssue()
		await testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: ids.issueId,
			kind: MailboxItemKind.STEER,
			claimClass: MailboxClaimClass.STEER,
			posture: PermissionPosture.AUTO,
			payload: { text: 'declare o desfecho', declarationReminder: true },
			dedupKey: `regret-test:reminder:${ids.issueId}`,
		})
		expect((await open(ids, 'git push'))?.outcome).toBe(RegretWindowOutcome.PROCEEDED)
	})

	it('work that is not a steer does not cancel', async () => {
		const ids = await givenWorkingIssue()
		await steer(ids.issueId, 1, MailboxItemKind.WORK)
		expect((await open(ids, 'git push'))?.outcome).toBe(RegretWindowOutcome.PROCEEDED)
	})

	it('a paused issue cancels at once — the pause wins over an unread steer', async () => {
		const ids = await givenWorkingIssue(true)
		await steer(ids.issueId, 1)
		const closed = await open(ids, 'railway up')
		expect(closed).toEqual({ actionKind: IrreversibleActionKind.DEPLOY, outcome: RegretWindowOutcome.CANCELLED_BY_PAUSE, waitedMs: 0 })
		expect(clock.waits).toHaveLength(0)
	})

	it('the window is a fact on the issue timeline — kind and outcome, never the command line', async () => {
		const ids = await givenWorkingIssue()
		clock.during = async () => {
			await steer(ids.issueId, 1)
		}
		await open(ids, 'git push https://x-access-token:SECRET@example.invalid/repo.git HEAD')

		const facts = await recorded()
		expect(facts).toHaveLength(1)
		expect(facts[0]?.entityId).toBe(ids.issueId)

		const timeline = await assembleIssueTimeline(testBed.resolve(LibSqlDatabaseDriver), ids.issueId, 'Test issue')
		const window = timeline.find(item => item.kind === IssueTimelineItemKind.REGRET_WINDOW)
		expect(window).toMatchObject({
			kind: IssueTimelineItemKind.REGRET_WINDOW,
			actionKind: IrreversibleActionKind.GIT_PUSH,
			outcome: RegretWindowOutcome.CANCELLED_BY_STEER,
			waitedMs: REGRET_WINDOW_MS,
		})
		expect(JSON.stringify(timeline)).not.toContain('SECRET')
		expect(JSON.stringify(facts)).not.toContain('SECRET')
	})
})
