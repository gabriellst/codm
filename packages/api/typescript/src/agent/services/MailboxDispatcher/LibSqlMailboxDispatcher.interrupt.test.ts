import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import type { ZodType } from 'zod'
import { DomainEventRepository } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind, PermissionPosture, ProviderKind, StopKind } from '@codm/contracts-typescript/wire/enums'
import { CLAIM_CLASS_OF_KIND } from '@agent/utils/ClaimClassOfKind'
import { TestBed, givenIssue, givenThread, givenWorkspace } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { InterruptIssueTurnOnSteer } from '@thread/handlers/InterruptIssueTurnOnSteer'
import { IssueTurnInterruptRequestedEvent } from '@thread/events/IssueTurnInterruptRequestedEvent'
import { MailboxRepository } from '../../repositories/MailboxRepository'
import { AgentSessionRepository } from '../../repositories/AgentSessionRepository'
import { AgentRunStopRaisedEvent } from '../../events/AgentRunStopRaisedEvent'
import { AgentRunner } from '../AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '../AgentRunnerFactory'
import { AgentName, AgentRunOutcome, type TransportStopKind } from '../../enums'
import type { AgentRunRequest } from '../../types/AgentRunRequest'
import type { AgentRuntimeEvent } from '../../types/AgentRuntimeEvent'
import { RunIssueTurn } from '../../usecases/RunIssueTurn'
import { RunOrchestratorTurn } from '../../usecases/RunOrchestratorTurn'
import { IssueTurnAborter } from '../IssueTurnAborter'
import { MailboxDispatcher } from './MailboxDispatcher'

/**
 * A runner whose FIRST issue run works until it is killed or released — what the Claude runner does
 * with `request.signal` (process-group kill), without a process. It reports the session it was handed,
 * the way the CLI echoes `--session-id` in its init frame. Every later run finishes at once.
 */
class BlockingRunner extends AgentRunner {
	readonly prompts: string[] = []
	readonly sessions: Array<{ resumeId?: string; newId?: string } | undefined> = []
	killed = false
	running: Promise<void> = Promise.resolve()
	private markRunning: () => void = () => {}
	private releaseFirst: () => void = () => {}
	private blocked = false

	reset(): void {
		this.prompts.length = 0
		this.sessions.length = 0
		this.killed = false
		this.blocked = false
		this.running = new Promise(resolve => {
			this.markRunning = resolve
		})
	}

	release(): void {
		this.releaseFirst()
	}

	async *run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		const sessionId = request.session?.resumeId ?? request.session?.newId ?? null
		// Only ISSUE turns are recorded — the orchestrator turns an ISSUE_RESULT schedules run here too.
		const isIssueTurn = request.agentName === AgentName.ISSUE_WORK
		if (isIssueTurn) {
			this.prompts.push(request.messages.map(message => message.content).join('\n'))
			this.sessions.push(request.session)
		}
		if (sessionId) yield { type: 'frame', frame: { kind: 'system_init', sessionId, model: 'test' } }
		if (isIssueTurn && !this.blocked) {
			this.blocked = true
			const killed = await new Promise<boolean>(resolve => {
				this.releaseFirst = () => resolve(false)
				request.signal?.addEventListener('abort', () => resolve(true), { once: true })
				this.markRunning()
			})
			if (killed) {
				this.killed = true
				yield {
					type: 'finished',
					result: {
						outcome: AgentRunOutcome.STOPPED,
						replyText: '',
						sessionId,
						failed: true,
						stop: { kind: StopKind.SERVER_ERROR as TransportStopKind, detail: 'provider killed' },
					},
				}
				return
			}
		}
		yield { type: 'finished', result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'feito', sessionId, failed: false } }
	}

	async shutdown(): Promise<void> {}
}

/**
 * STEER IMEDIATO — "agora" (fase 2, item 4). A routed steer whose text starts with "agora" cuts the
 * issue's running turn, and its own turn RESUMES that session — the brief and the work so far included.
 * The cut turn says nothing: no ISSUE_RESULT, no stop. Without "agora" (the fallback: no runner takes
 * input into a live turn yet) the steer waits for the running turn to end, exactly as before.
 *
 * Measured with the real dispatcher, the real `RunIssueTurn` and the "agora" handler, against a runner
 * that only ends when killed or released.
 *
 * Falsifier: treat INTERRUPT like PAUSE in `RunIssueTurn` and the WORK item comes back held (30 s) — the
 * steer never runs in this drain; skip `upsertSessionRecord` on the cut and the steer's turn opens a NEW
 * session; let the cut turn `persistOutcome` and two ISSUE_RESULTs are queued.
 */
describe('"agora" cuts the running issue turn and the steer resumes its session', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const runner = new BlockingRunner()
	let answered = 0
	/** What each orchestrator turn was handed — the dispatcher's mapping of the ISSUE_RESULT item. */
	let orchestratorInputs: { issueId?: string; originEntryId?: string }[] = []

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))
	})
	beforeEach(async () => {
		await testBed.reset()
		runner.reset()
		answered = 0
		orchestratorInputs = []
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
		return { threadId: thread.id.value, issueId: issue.id.value }
	}

	const enqueue = (issueId: string, kind: MailboxItemKind, payload: Record<string, unknown>) =>
		testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issueId,
			kind,
			claimClass: CLAIM_CLASS_OF_KIND[kind],
			posture: PermissionPosture.AUTO,
			payload: { issueId, key: 'APP-12', title: 'Prévia do relatório', ...payload },
			dedupKey: `${kind}:${uuidv7()}`,
		})

	/**
	 * How many ISSUE_RESULTs reached the conversation — the only THREAD items these scenes produce, each
	 * one an orchestrator turn. The orchestrator is STUBBED and only counts: the real one would wait out
	 * its thinking-placeholder echo (no gateway here) and keep the write lock busy past the test.
	 */
	const drain = () => {
		const runContainer = testContainer.createChildContainer()
		const orchestrator = {
			bindContainer() {
				return this
			},
			async execute(input: { issueId?: string; originEntryId?: string }) {
				orchestratorInputs.push(input)
				answered += 1
				return { spoke: true }
			},
		}
		runContainer.registerInstance(RunOrchestratorTurn as never, orchestrator as never)
		return testBed.resolve(MailboxDispatcher).bind(runContainer).drain()
	}
	const issueResults = () => answered

	it('the cut turn says nothing, and the steer’s turn resumes the same session', async () => {
		const { threadId, issueId } = await scene()
		await enqueue(issueId, MailboxItemKind.WORK, { threadId, goal: 'gera a prévia' })

		const draining = drain()
		await runner.running

		const entryId = uuidv7()
		await enqueue(issueId, MailboxItemKind.STEER, { threadId, text: 'Operador: tira o rodapé', entryId })
		await testBed
			.resolve(InterruptIssueTurnOnSteer)
			.handle(
				new IssueTurnInterruptRequestedEvent({ entityId: threadId, ownerId: MOCK_CLOUD_OWNER_ID, payload: { threadId, issueId, entryId } }),
			)
		await draining

		expect(runner.killed).toBe(true)
		expect(runner.prompts).toHaveLength(2)
		expect(runner.prompts[0]).toContain('gera a prévia')
		expect(runner.prompts[1]).toContain('tira o rodapé')
		// The steer's turn CONTINUES the cut session rather than starting over.
		expect(runner.sessions[1]?.resumeId).toBe(runner.sessions[0]?.newId)
		expect((await testBed.resolve(AgentSessionRepository).findByIssueId(issueId))?.agentSessionId).toBe(runner.sessions[0]?.newId)
		// One answer — the steer's. The cut turn queued nothing and raised nothing.
		expect(issueResults()).toBe(1)
		// The answer's turn knows WHICH issue it speaks for (fase 3: it used to get none, and the reply was
		// recorded with no issue) and quotes the person's message the steer came from.
		expect(orchestratorInputs[0]).toMatchObject({ issueId, originEntryId: entryId })
		expect(await testBed.resolve(DomainEventRepository).findByType(AgentRunStopRaisedEvent)).toHaveLength(0)
	})

	it('a cut that lands before the CLI started keeps nothing — the turn reports no session', async () => {
		const { threadId, issueId } = await scene()
		const aborter = testBed.resolve(IssueTurnAborter)
		const turn = aborter.begin(issueId, 'some-other-entry')
		expect(aborter.interrupt(issueId, uuidv7())).toBe(true)

		const out = await testBed.resolve(RunIssueTurn).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			issueId,
			threadId,
			key: 'APP-12',
			title: 'Prévia do relatório',
			provider: ProviderKind.CLAUDE_CODE,
			workspacePath: '/tmp/workspace',
			prompt: 'gera a prévia',
			turnKind: MailboxItemKind.WORK,
			posture: PermissionPosture.AUTO,
			messageId: uuidv7(),
		})
		turn.end()

		expect(out.interrupted).toEqual({ sessionKept: false })
		expect(runner.prompts).toHaveLength(0)
		expect(await testBed.resolve(AgentSessionRepository).findByIssueId(issueId)).toBeUndefined()
	})

	it('a late "agora" never cuts the steer’s own turn', async () => {
		const { threadId, issueId } = await scene()
		const entryId = uuidv7()
		await enqueue(issueId, MailboxItemKind.STEER, { threadId, text: 'Operador: tira o rodapé', entryId })

		const draining = drain()
		await runner.running
		await testBed
			.resolve(InterruptIssueTurnOnSteer)
			.handle(
				new IssueTurnInterruptRequestedEvent({ entityId: threadId, ownerId: MOCK_CLOUD_OWNER_ID, payload: { threadId, issueId, entryId } }),
			)
		runner.release()
		await draining

		expect(runner.killed).toBe(false)
		expect(issueResults()).toBe(1)
	})

	it('without "agora" the steer waits for the running turn to end (the fallback)', async () => {
		const { threadId, issueId } = await scene()
		await enqueue(issueId, MailboxItemKind.WORK, { threadId, goal: 'gera a prévia' })

		const draining = drain()
		await runner.running
		await enqueue(issueId, MailboxItemKind.STEER, { threadId, text: 'Operador: tira o rodapé', entryId: uuidv7() })
		runner.release()
		await draining

		expect(runner.killed).toBe(false)
		expect(runner.prompts.map(prompt => prompt.includes('tira o rodapé'))).toEqual([false, true])
		// Both turns concluded; only the steer ANSWERS someone (a person routed to the issue) — the brief's
		// words are the issue's progress since fase 3 (item 5), no orchestrator turn. Was 2.
		expect(issueResults()).toBe(1)
	})
})
