import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { CommandQueue, type Handler, MockCommandQueue, type Transaction } from '@codm/core-typescript'
import {
	MailboxClaimClass,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	ProviderKind,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenThread, givenWorkspace } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { CUE_DELIVERED, CUE_READ } from '@thread/utils/ChannelCues'
import type { RoutedSteerOrigin } from '@thread/services/SteerCue'
import { MailboxRepository } from '../../repositories/MailboxRepository'
import { RunIssueTurn } from '../../usecases/RunIssueTurn'
import { MailboxDispatcher } from './MailboxDispatcher'

type JobsOptions = Parameters<CommandQueue['enqueueCommand']>[2]

/**
 * A queue that RECORDS every reaction enqueued — each call, so a duplicate a real queue would drop on
 * its job id still shows — and runs none of them.
 */
class RecordingCommandQueue extends MockCommandQueue {
	readonly reactions: string[] = []
	override async enqueueCommand<T extends Handler>(
		name: T['name'],
		input: T['input'],
		opts?: JobsOptions,
		tx?: Transaction,
	): Promise<void> {
		if (name === 'react_to_channel_message') {
			this.reactions.push((input as { reaction: string }).reaction)
			return
		}
		await super.enqueueCommand<T>(name, input, opts, tx)
	}
}

/** What the issue turn reports, one per run, in order — the last one repeats. */
type Outcome = { spoke: boolean; held?: true; transportStop?: { detail: string } }

/**
 * ENTREGUE / LIDO NO WHATSAPP (fase 2, item 5) — a steer routed from a channel message walks 👀 → ☑️ → ✅
 * on that very message.
 *
 * Measured on the real dispatcher (a recording queue), with the issue turn replaced by a scripted report:
 * the first hand-off of the item queues ☑️, the turn that consumes it queues ✅. A retry is the same
 * delivery and queues nothing new; a turn a pause killed is not "read"; a steer that did not come from
 * a channel message (console, loop, stop resolution) queues nothing at all.
 *
 * Falsifier: cue DELIVERED on every claim (not `firstClaim`) and the retry case records two ☑️; cue READ
 * before the `held` return and the held case records ✅; drop the `channelOrigin` parse and the console
 * case still passes but every other case records nothing.
 */
describe('a routed steer answers delivered and read on the message it came from', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let queue: RecordingCommandQueue

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		// ONE queue for the suite: the dispatcher is a singleton and keeps the queue it was built with.
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
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-12' })
		const origin: RoutedSteerOrigin = {
			ownerId: MOCK_CLOUD_OWNER_ID,
			channelId: thread.channelId,
			remoteId: thread.contactRef.externalId,
			messageId: 'wamid-steer',
			fromMe: false,
			senderExternalId: 'stranger-42',
			entryId: uuidv7(),
		}
		return { thread, issue, origin }
	}

	const enqueueSteer = (issueId: string, threadId: string, channelOrigin?: RoutedSteerOrigin) =>
		testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issueId,
			kind: MailboxItemKind.STEER,
			claimClass: MailboxClaimClass.STEER,
			posture: PermissionPosture.AUTO,
			payload: { issueId, threadId, key: 'APP-12', title: 'Prévia', text: 'Operador: usa o azul', channelOrigin },
			dedupKey: `steer:${uuidv7()}`,
		})

	/** Drain with the issue turn scripted: each run reports the next outcome. */
	const drainWith = async (...outcomes: Outcome[]) => {
		let run = 0
		const scripted = {
			bindContainer() {
				return this
			},
			async execute() {
				const outcome = outcomes[Math.min(run, outcomes.length - 1)]
				run += 1
				return outcome
			},
		}
		const runContainer = testContainer.createChildContainer()
		runContainer.registerInstance(RunIssueTurn as never, scripted as never)
		await testBed.resolve(MailboxDispatcher).bind(runContainer).drain()
		return run
	}

	it('first hand-off ☑️, consumed turn ✅ — in that order', async () => {
		const { thread, issue, origin } = await scene()
		await enqueueSteer(issue.id.value, thread.id.value, origin)

		await drainWith({ spoke: true })

		expect(queue.reactions).toEqual([CUE_DELIVERED, CUE_READ])
	})

	it('a retried turn is the same delivery — one ☑️, and ✅ only once it is consumed', async () => {
		const { thread, issue, origin } = await scene()
		await enqueueSteer(issue.id.value, thread.id.value, origin)

		const runs = await drainWith({ spoke: false, transportStop: { detail: 'server error' } }, { spoke: true })

		expect(runs).toBe(2)
		expect(queue.reactions).toEqual([CUE_DELIVERED, CUE_READ])
	})

	it('a turn a pause killed (held) is not read', async () => {
		const { thread, issue, origin } = await scene()
		await enqueueSteer(issue.id.value, thread.id.value, origin)

		await drainWith({ spoke: false, held: true })

		expect(queue.reactions).toEqual([CUE_DELIVERED])
	})

	it('a steer that did not come from a channel message cues nothing', async () => {
		const { thread, issue } = await scene()
		await enqueueSteer(issue.id.value, thread.id.value)

		await drainWith({ spoke: true })

		expect(queue.reactions).toEqual([])
	})
})
