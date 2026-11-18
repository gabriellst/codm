import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import type { ZodType } from 'zod'
import { TestBed, givenIssue, givenThread, testId } from '@test/support'
import { DomainEventRepository } from '@codm/core-typescript'
import { IssueControlSource, MailboxItemKind, PermissionPosture, ProviderKind, StopKind } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { AbortIssueTurnOnPause } from '@issue/handlers/AbortIssueTurnOnPause'
import { IssuePausedEvent } from '@issue/events/IssuePausedEvent'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { RunIssueTurn } from './RunIssueTurn'
import { AgentRunner } from '../services/AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '../services/AgentRunnerFactory'
import { IssueTurnAborter } from '../services/IssueTurnAborter'
import { MailboxRepository } from '../repositories/MailboxRepository'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'
import { AgentRunOutcome, type TransportStopKind } from '../enums'
import type { AgentRunRequest } from '../types/AgentRunRequest'
import type { AgentRuntimeEvent } from '../types/AgentRuntimeEvent'

/**
 * A runner that works until it is KILLED — what the Claude/Codex runners do with `request.signal`
 * (process-group kill), without a process: one frame, then it waits for the abort and ends the way a
 * killed child ends, on a transport stop. `started` counts the runs that actually began.
 */
class KillableRunner extends AgentRunner {
	started = 0
	running: Promise<void> = Promise.resolve()
	private markRunning: () => void = () => {}

	constructor() {
		super()
		this.reset()
	}

	reset(): void {
		this.started = 0
		this.running = new Promise(resolve => {
			this.markRunning = resolve
		})
	}

	async *run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		this.started += 1
		yield { type: 'frame', frame: { kind: 'assistant_text', messageId: 'k-0', text: 'trabalhando…', parentToolUseId: null } }
		this.markRunning()
		await new Promise<void>(resolve => {
			if (request.signal?.aborted) resolve()
			request.signal?.addEventListener('abort', () => resolve(), { once: true })
		})
		yield {
			type: 'finished',
			result: {
				outcome: AgentRunOutcome.STOPPED,
				replyText: '',
				sessionId: null,
				failed: true,
				stop: { kind: StopKind.SERVER_ERROR as TransportStopKind, detail: 'provider killed' },
			},
		}
	}

	async shutdown(): Promise<void> {}
}

/**
 * "PARE" VALE NA HORA (fase 2, item 2) — a turn already running is killed by the pause, and leaves NO
 * trace a person would read as an answer.
 *
 * Measured with a runner that only ends when its signal aborts: the pause handler aborts it, the turn
 * reports `held`, and nothing of its conclusion is persisted — no ISSUE_RESULT queued for the group, no
 * stop raised for a run the operator stopped on purpose. A pause that lands before the spawn keeps the
 * turn from starting at all.
 *
 * Falsifier: drop the `signal?.aborted` checks in `RunIssueTurn` and the killed turn persists its
 * transport stop as an outcome (and, with RETRY semantics, reports `transportStop` instead of `held`);
 * stop passing `{ signal }` to `agent.run` and the first test never finishes — the runner never dies.
 */
describe('a pause kills the running issue turn, and the killed turn says nothing', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const runner = new KillableRunner()

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))
	})
	beforeEach(async () => {
		await testBed.reset()
		runner.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const input = (issueId: string, threadId: string) => ({
		ownerId: MOCK_CLOUD_OWNER_ID,
		issueId,
		threadId,
		key: 'APP-12',
		title: 'Prévia do relatório',
		provider: ProviderKind.CLAUDE_CODE,
		workspacePath: '/tmp/workspace',
		prompt: 'gera a prévia',
		turnKind: MailboxItemKind.WORK as const,
		posture: PermissionPosture.AUTO,
		messageId: testId('pause-turn', 'entry'),
	})

	it('pausing mid-run aborts the turn: held, no ISSUE_RESULT, no stop', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-12' })
		const aborter = testBed.resolve(IssueTurnAborter)
		const turn = aborter.begin(issue.id.value)

		const running = testBed.resolve(RunIssueTurn).execute(input(issue.id.value, thread.id.value))
		await runner.running

		// The pause, as it lands: the flag committed, then the fact's handler.
		issue.pause()
		await testBed.resolve(IssueRepository).save(issue)
		await testBed.resolve(AbortIssueTurnOnPause).handle(
			new IssuePausedEvent({
				entityId: issue.id.value,
				ownerId: issue.ownerId,
				payload: { issueId: issue.id.value, threadId: thread.id.value, source: IssueControlSource.CONSOLE },
			}),
		)

		const out = await running
		turn.end()
		expect(out.held).toBe(true)
		expect(await testBed.resolve(MailboxRepository).claimNext('pause-turn-test', 60_000)).toBeUndefined()
		expect(await testBed.resolve(DomainEventRepository).findByType(AgentRunStopRaisedEvent)).toHaveLength(0)
	})

	it('a pause that lands before the spawn keeps the turn from starting', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-13' })
		const aborter = testBed.resolve(IssueTurnAborter)
		const turn = aborter.begin(issue.id.value)
		aborter.abort(issue.id.value)

		const out = await testBed.resolve(RunIssueTurn).execute(input(issue.id.value, thread.id.value))
		turn.end()

		expect(out.held).toBe(true)
		expect(runner.started).toBe(0)
	})

	it('a late pause fact for an issue already resumed kills nothing', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-14' })
		const turn = testBed.resolve(IssueTurnAborter).begin(issue.id.value)

		await testBed.resolve(AbortIssueTurnOnPause).handle(
			new IssuePausedEvent({
				entityId: issue.id.value,
				ownerId: issue.ownerId,
				payload: { issueId: issue.id.value, threadId: thread.id.value, source: IssueControlSource.WHATSAPP },
			}),
		)

		expect(turn.signal.aborted).toBe(false)
		turn.end()
	})
})
