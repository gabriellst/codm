import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import type { RetriedTransportStopKind } from '@agent/enums/TransportStopKind'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { and, eq } from 'drizzle-orm'
import { CommandQueue, type Handler, LibSqlDatabaseDriver, MockCommandQueue, type Transaction } from '@codm/core-typescript'
import { agentMailbox } from '@codm/contracts/db'
import {
	MailboxClaimClass,
	MailboxDeferCause,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	ProviderKind,
	StopKind,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenThread, givenWorkspace } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { CUE_DELIVERED, CUE_READ } from '@thread/utils/ChannelCues'
import type { RoutedSteerOrigin } from '@thread/services/SteerCue'
import { MailboxRepository } from '../../repositories/MailboxRepository'
import { RunIssueTurn } from '../../usecases/RunIssueTurn'
import { IssueTurnAborter } from '../IssueTurnAborter'
import { MailboxDispatcher } from './MailboxDispatcher'

type JobsOptions = Parameters<CommandQueue['enqueueCommand']>[2]

/** Records every reaction enqueued (each call, so a duplicate shows) and runs none of them. */
class RecordingCommandQueue extends MockCommandQueue {
	readonly reactions: { reaction: string; messageId: string }[] = []
	override async enqueueCommand<T extends Handler>(
		name: T['name'],
		input: T['input'],
		opts?: JobsOptions,
		tx?: Transaction,
	): Promise<void> {
		if (name === 'react_to_channel_message') {
			const { reaction, messageId } = input as { reaction: string; messageId: string }
			this.reactions.push({ reaction, messageId })
			return
		}
		await super.enqueueCommand<T>(name, input, opts, tx)
	}
}

/** What the issue turn reports, one per run, in order — the last one repeats. */
type Outcome =
	| { spoke: boolean; transportStop?: { kind: RetriedTransportStopKind; detail: string; retryAfter?: number } }
	| { held: true }
	| { interrupted: { sessionKept: boolean } }

/** The fields of `RunIssueTurn`'s input this suite reads. */
interface TurnInput {
	prompt: string
	messageId: string
	answersEntryId?: string
	posture: PermissionPosture
	firedByLoop?: string
	turnKind: MailboxItemKind
}

/**
 * RECADOS JUNTOS (fase 4, item 6b) — the dispatcher's half: the steers of one task pending together are ONE turn; every
 * point that used to handle "one item" handles the group, and each steer keeps its own identity (its row, its ☑️ / ✅).
 *
 * Measured on the real dispatcher (SQLite queue, recording command queue), with the issue turn replaced by a script that
 * records the input it was handed and reports the next outcome.
 *
 * Falsifier: renew/complete/defer only the head and the followers run a second time (the "one turn" and "pause" cases
 * count two runs); charge every member in `fail` and the followers die beside the head; cue only the head and the cue
 * cases read one ☑️; take the head's id as `messageId` and the cursor case goes red; register only the last entry with
 * the aborter and the "agora for a steer already in the turn" case cuts its own turn.
 */
describe('steers pending together for one task ride ONE turn', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let queue: RecordingCommandQueue

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		queue = new RecordingCommandQueue()
		testBed.override(CommandQueue, queue)
	})
	beforeEach(async () => {
		await testBed.reset()
		queue.reactions.length = 0
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const scene = async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-7' })
		return { thread, issue }
	}

	/** A steer routed from a channel message (its own entry and origin), or — `routed: false` — one from the console. */
	const steer = async (
		scope: { threadId: string; issueId: string },
		text: string,
		{
			routed = true,
			claimClass = MailboxClaimClass.STEER,
			posture = PermissionPosture.AUTO,
		}: { routed?: boolean; claimClass?: MailboxClaimClass; posture?: PermissionPosture } = {},
	) => {
		const entryId = uuidv7()
		const channelOrigin: RoutedSteerOrigin | undefined = routed
			? {
					ownerId: MOCK_CLOUD_OWNER_ID,
					channelId: 'channel-test',
					remoteId: 'group-test',
					messageId: `wamid-${text}`,
					fromMe: false,
					senderExternalId: 'participant-test',
					entryId,
				}
			: undefined
		await testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: scope.issueId,
			kind: MailboxItemKind.STEER,
			claimClass,
			posture,
			payload: {
				issueId: scope.issueId,
				threadId: scope.threadId,
				key: 'APP-7',
				title: 'Prévia',
				text: `Pessoa: ${text}`,
				...(routed && { entryId, channelOrigin }),
			},
			dedupKey: `steer:${entryId}`,
		})
		await Bun.sleep(2)
		return entryId
	}

	const rows = async (issueId: string) =>
		testBed
			.resolve(LibSqlDatabaseDriver)
			.db.select({
				id: agentMailbox.id,
				payload: agentMailbox.payload,
				attempts: agentMailbox.attempts,
				consumedAt: agentMailbox.consumedAt,
				deadAt: agentMailbox.deadAt,
				leaseUntil: agentMailbox.leaseUntil,
				firstClaimedAt: agentMailbox.firstClaimedAt,
			})
			.from(agentMailbox)
			.where(eq(agentMailbox.targetId, issueId))
			.orderBy(agentMailbox.createdAt)

	/** Drain with the issue turn scripted: each run records its input, may act mid-turn, and reports the next outcome. */
	const drainWith = async (outcomes: Outcome[], during?: (input: TurnInput) => void | Promise<void>) => {
		const inputs: TurnInput[] = []
		const scripted = {
			bindContainer() {
				return this
			},
			async execute(input: TurnInput) {
				inputs.push(input)
				await during?.(input)
				return outcomes[Math.min(inputs.length - 1, outcomes.length - 1)]
			},
		}
		const runContainer = testContainer.createChildContainer()
		runContainer.registerInstance(RunIssueTurn as never, scripted as never)
		await testBed.resolve(MailboxDispatcher).bind(runContainer).drain()
		return inputs
	}

	it('three steers → one turn: texts in order, cursor and dedup on the LAST item, every row consumed', async () => {
		const { thread, issue } = await scene()
		const scope = { threadId: thread.id.value, issueId: issue.id.value }
		await steer(scope, 'usa o azul')
		await steer(scope, 'e o botão maior', { routed: false })
		const lastRouted = await steer(scope, 'esquece o rodapé')

		const inputs = await drainWith([{ spoke: true }])

		expect(inputs).toHaveLength(1)
		expect(inputs[0]?.prompt).toBe('Pessoa: usa o azul\n\nPessoa: e o botão maior\n\nPessoa: esquece o rodapé')
		const queued = await rows(issue.id.value)
		expect(inputs[0]?.messageId).toBe(queued.at(-1)?.id)
		// It answers the LAST person who wrote — the latest word in the group.
		expect(inputs[0]?.answersEntryId).toBe(lastRouted)
		expect(queued.every(row => row.consumedAt !== null && row.attempts === 1 && row.firstClaimedAt !== null)).toBe(true)
	})

	it('☑️ and ✅ per steer, each on its own message — the console steer cues nothing', async () => {
		const { thread, issue } = await scene()
		const scope = { threadId: thread.id.value, issueId: issue.id.value }
		await steer(scope, 'um')
		await steer(scope, 'dois', { routed: false })
		await steer(scope, 'tres')

		await drainWith([{ spoke: true }])

		expect(queue.reactions).toEqual([
			{ reaction: CUE_DELIVERED, messageId: 'wamid-um' },
			{ reaction: CUE_DELIVERED, messageId: 'wamid-tres' },
			{ reaction: CUE_READ, messageId: 'wamid-um' },
			{ reaction: CUE_READ, messageId: 'wamid-tres' },
		])
	})

	it('the prefix stops at an "agora" and at another posture — each starts its own turn, in order', async () => {
		const { thread, issue } = await scene()
		const scope = { threadId: thread.id.value, issueId: issue.id.value }
		await steer(scope, 'a')
		await steer(scope, 'b')
		await steer(scope, 'agora!', { claimClass: MailboxClaimClass.INTERRUPT })
		await steer(scope, 'c')
		await steer(scope, 'libera', { posture: PermissionPosture.BYPASS })

		const inputs = await drainWith([{ spoke: true }])

		expect(inputs.map(input => [input.prompt, input.posture])).toEqual([
			['Pessoa: a\n\nPessoa: b', PermissionPosture.AUTO],
			['Pessoa: agora!\n\nPessoa: c', PermissionPosture.AUTO],
			['Pessoa: libera', PermissionPosture.BYPASS],
		])
	})

	it('a pause holds the whole group — nothing read, attempts refunded, and it comes back as one turn', async () => {
		const { thread, issue } = await scene()
		const scope = { threadId: thread.id.value, issueId: issue.id.value }
		await steer(scope, 'um')
		await steer(scope, 'dois')

		const inputs = await drainWith([{ held: true }])

		expect(inputs).toHaveLength(1)
		const held = await rows(issue.id.value)
		expect(held.map(row => [row.consumedAt, row.attempts, row.leaseUntil !== null])).toEqual([
			[null, 0, true],
			[null, 0, true],
		])
		expect(queue.reactions.map(cue => cue.reaction)).toEqual([CUE_DELIVERED, CUE_DELIVERED])

		// Resumed: the group is released and runs as one turn — no second ☑️, one ✅ each.
		await testBed.resolve(MailboxRepository).releaseDeferred(held.map(row => row.id))
		const again = await drainWith([{ spoke: true }])
		expect(again).toHaveLength(1)
		expect(queue.reactions.map(cue => cue.reaction)).toEqual([CUE_DELIVERED, CUE_DELIVERED, CUE_READ, CUE_READ])
	})

	it('a turn an "agora" cut before its session: the group is released at once, attempts refunded', async () => {
		const { thread, issue } = await scene()
		const scope = { threadId: thread.id.value, issueId: issue.id.value }
		await steer(scope, 'um')
		await steer(scope, 'dois')

		// Released AT ONCE means the same drain claims the group again — not "after the clock ticks a millisecond".
		const seen: (readonly [Date | null, number])[][] = []
		const runs = await drainWith([{ interrupted: { sessionKept: false } }, { spoke: true }], async () => {
			seen.push((await rows(issue.id.value)).map(row => [row.consumedAt, row.attempts] as const))
		})

		expect(runs.map(input => input.prompt)).toEqual(['Pessoa: um\n\nPessoa: dois', 'Pessoa: um\n\nPessoa: dois'])
		// The second claim charges ONE attempt per row: the cut one was refunded, nothing was consumed in between.
		expect(seen[1]).toEqual([
			[null, 1],
			[null, 1],
		])
		expect((await rows(issue.id.value)).map(row => [row.consumedAt !== null, row.attempts])).toEqual([
			[true, 1],
			[true, 1],
		])
	})

	it('a failed turn charges only the head; past the calendar the head alone is poisoned and the followers run on', async () => {
		const { thread, issue } = await scene()
		const scope = { threadId: thread.id.value, issueId: issue.id.value }
		await steer(scope, 'um')
		await steer(scope, 'dois')
		await steer(scope, 'tres')

		// Each failure parks the head on its calendar (fase 5, S2 — 5 attempts for a provider error on the task lane); the
		// test plays the clock forward by lapsing that wait between drains.
		const fail: Outcome = { spoke: false, transportStop: { kind: StopKind.SERVER_ERROR, detail: 'server error' } }
		const outcomes: Outcome[] = [fail, fail, fail, fail, fail, { spoke: true }]
		const inputs: TurnInput[] = []
		for (let pass = 0; pass < 5; pass++) {
			inputs.push(...(await drainWith(outcomes.slice(pass))))
			await testBed
				.resolve(LibSqlDatabaseDriver)
				.db.update(agentMailbox)
				.set({ leaseUntil: new Date(Date.now() - 1) })
				.where(and(eq(agentMailbox.targetId, issue.id.value), eq(agentMailbox.deferCause, MailboxDeferCause.RETRY)))
		}

		const group = 'Pessoa: um\n\nPessoa: dois\n\nPessoa: tres'
		expect(inputs.map(input => input.prompt)).toEqual([group, group, group, group, group, 'Pessoa: dois\n\nPessoa: tres'])
		const after = await rows(issue.id.value)
		expect(after.map(row => [row.deadAt !== null, row.consumedAt !== null, row.attempts])).toEqual([
			[true, false, 5],
			[false, true, 1],
			[false, true, 1],
		])
		// One ☑️ per steer for all those claims — a retry is the same delivery.
		expect(queue.reactions.filter(cue => cue.reaction === CUE_DELIVERED)).toHaveLength(3)
	})

	it('an "agora" for a steer the turn already carries spares it; one that arrives later cuts the whole group', async () => {
		const { thread, issue } = await scene()
		const scope = { threadId: thread.id.value, issueId: issue.id.value }
		const first = await steer(scope, 'um')
		await steer(scope, 'dois')

		const cuts: boolean[] = []
		const aborter = testBed.resolve(IssueTurnAborter)
		await drainWith([{ spoke: true }], () => {
			cuts.push(aborter.interrupt(issue.id.value, first))
			cuts.push(aborter.interrupt(issue.id.value, uuidv7()))
		})

		expect(cuts).toEqual([false, true])
	})

	// LAST: the pause lives in the dispatcher singleton's memory for the rest of the suite.
	it('a provider limit defers the whole group with the attempt refunded', async () => {
		const { thread, issue } = await scene()
		const scope = { threadId: thread.id.value, issueId: issue.id.value }
		await steer(scope, 'um')
		await steer(scope, 'dois')

		await drainWith([{ spoke: false, transportStop: { kind: StopKind.SERVER_ERROR, detail: 'limit', retryAfter: Date.now() + 3_600_000 } }])

		expect((await rows(issue.id.value)).map(row => [row.consumedAt, row.attempts, row.leaseUntil !== null])).toEqual([
			[null, 0, true],
			[null, 0, true],
		])
	})
})
