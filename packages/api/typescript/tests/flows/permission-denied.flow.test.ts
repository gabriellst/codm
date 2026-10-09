import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import type { ZodType } from 'zod'
import { DomainEventRepository } from '@codm/core-typescript'
import {
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	ProviderKind,
	StopKind,
	StopResolution,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenThread, givenWorkspace } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { AgentRunner } from '@agent/services/AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '@agent/services/AgentRunnerFactory'
import { MailboxDispatcher } from '@agent/services/MailboxDispatcher'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { RunIssueTurn } from '@agent/usecases/RunIssueTurn'
import { RunOrchestratorTurn } from '@agent/usecases/RunOrchestratorTurn'
import { AgentRunStopRaisedEvent } from '@agent/events/AgentRunStopRaisedEvent'
import { AgentRunOutcome, FactSource, TRANSPORT_STOP_KINDS, TRANSPORT_STOP_RETRIES } from '@agent/enums'
import type { AgentRunRequest } from '@agent/types/AgentRunRequest'
import type { AgentRuntimeEvent } from '@agent/types/AgentRuntimeEvent'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { DEFAULT_STOP_POLICY, StopPolicyConfigRepository } from '@thread/repositories/StopPolicyConfigRepository'
import { RESOLUTIONS_BY_KIND } from '@thread/utils/StopResolutions'
import { NOTIFIES_ON_CHANNEL } from '@thread/utils/StopChannelNotice'

/** Every run ends the way the runner reports a blocked action — and counts how many times it was asked. */
class DenyingRunner extends AgentRunner {
	calls = 0
	async *run<OutputSchema extends ZodType | undefined = undefined>(
		_request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		this.calls += 1
		yield {
			type: 'finished',
			result: {
				outcome: AgentRunOutcome.STOPPED,
				replyText: '',
				sessionId: 'sess-denied',
				failed: false,
				stop: { kind: StopKind.PERMISSION_DENIED, detail: 'Preciso gravar em produção — me libera?\n- Bash (command)' },
			},
		}
	}
	async shutdown(): Promise<void> {}
}

/**
 * AC-10 (participant-permission-posture, Decision 9) — PERMISSION_DENIED is a TRANSPORT stop that is
 * RECORDED AT ONCE: a retry under the same posture only repeats the denial. The issue turn mints the
 * stop on the first occurrence (issue → NEEDS_INPUT downstream), the item is consumed rather than
 * requeued, the orchestrator turn raises a thread-level stop, and `StopPolicy.permissionDenied` is
 * respected. Retry-vs-record is DATA (`TRANSPORT_STOP_RETRIES`), never a branch on a kind's name.
 */
describe('Flow (integration): a permission denial stops the work at once', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let runner: DenyingRunner

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		await testBed.reset()
		runner = new DenyingRunner()
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const roomThread = async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		return givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value, providers: [ProviderKind.CLAUDE_CODE] })
	}

	it('AC-10 — the vocabulary: transport, APPROVE/DENY/TAKE_OVER, notifies, and NOT retried', () => {
		expect(TRANSPORT_STOP_KINDS).toContain(StopKind.PERMISSION_DENIED)
		expect(RESOLUTIONS_BY_KIND[StopKind.PERMISSION_DENIED]).toEqual([StopResolution.APPROVE, StopResolution.DENY, StopResolution.TAKE_OVER])
		expect(NOTIFIES_ON_CHANNEL[StopKind.PERMISSION_DENIED]).toBe(true)
		expect(TRANSPORT_STOP_RETRIES[StopKind.PERMISSION_DENIED]).toBe(false)
		// The two transport stops that DO retry keep doing so — the table changed one row, not the rule.
		expect(TRANSPORT_STOP_RETRIES[StopKind.SERVER_ERROR]).toBe(true)
		expect(TRANSPORT_STOP_RETRIES[StopKind.AUTH_REQUIRED]).toBe(true)
	})

	it('AC-10 — an issue turn mints the stop on the FIRST occurrence and reports no transport retry', async () => {
		const thread = await roomThread()

		const out = await testBed.resolve(RunIssueTurn).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			issueId: uuidv7(),
			threadId: thread.id.value,
			key: 'moeda',
			title: 'Troca a moeda',
			provider: ProviderKind.CLAUDE_CODE,
			workspacePath: '/tmp/workspace',
			prompt: 'troca a moeda',
			turnKind: MailboxItemKind.WORK,
			messageId: uuidv7(),
			posture: PermissionPosture.AUTO,
		})

		expect(out.transportStop).toBeUndefined()
		const [fact] = await testBed.resolve(DomainEventRepository).findByType(AgentRunStopRaisedEvent)
		expect(fact?.payload.kind).toBe(StopKind.PERMISSION_DENIED)
		expect(fact?.payload.source).toBe(FactSource.INFERRED)
		expect(fact?.payload.detail).toContain('me libera?')
		// No ISSUE_RESULT: the stop's channel notice is the voice (NOTIFIES_ON_CHANNEL), not a composed reply.
		expect(await testBed.resolve(MailboxRepository).claimNext('denied-test', 60_000)).toBeUndefined()
	})

	it('AC-10 — through the dispatcher the item is CONSUMED after one run, never requeued', async () => {
		const thread = await roomThread()
		const issueId = uuidv7()
		const mailbox = testBed.resolve(MailboxRepository)
		// Observed at the call boundary, not by a raw row read: `testBed.probe()` is the only sanctioned
		// path to persisted state and it does not expose mailbox columns (same gap the dispatcher's own
		// transport-stop test names). `complete` ⟺ `consumed_at` set; `fail` is the ONLY writer of
		// `last_error` and the only road to `dead_at` — so "complete once, fail never" is the row's
		// consumed / not-dead / no-error triple. `mailbox` is the singleton the dispatcher holds.
		const realFail = mailbox.fail.bind(mailbox)
		const realComplete = mailbox.complete.bind(mailbox)
		const failCalls: string[] = []
		let completeCalls = 0
		mailbox.fail = async (id, error, maxAttempts, tx) => {
			failCalls.push(error)
			return realFail(id, error, maxAttempts, tx)
		}
		mailbox.complete = async (id, tx) => {
			completeCalls += 1
			return realComplete(id, tx)
		}
		await mailbox.enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issueId,
			kind: MailboxItemKind.WORK,
			payload: {
				issueId,
				threadId: thread.id.value,
				key: 'moeda',
				title: 'Troca a moeda',
				goal: 'troca a moeda',
				provider: ProviderKind.CLAUDE_CODE,
			},
			posture: PermissionPosture.AUTO,
			dedupKey: `work:${issueId}`,
		})

		await testBed.resolve(MailboxDispatcher).bind(testContainer).drain()

		// A requeued item would be claimed again in the SAME drain — three runs and a SERVER_ERROR poison.
		expect(runner.calls).toBe(1)
		expect(completeCalls).toBe(1)
		expect(failCalls).toEqual([])
		// Nothing left pending: the item is not waiting for a retry either.
		expect(await mailbox.claimNext('denied-test', 60_000)).toBeUndefined()
		const stops = await testBed.resolve(ThreadRepository).openStops(thread.id.value)
		expect(stops.map(stop => stop.kind)).not.toContain(StopKind.SERVER_ERROR)
	})

	it('AC-10 — an orchestrator turn raises a THREAD-level PERMISSION_DENIED stop and notifies the channel', async () => {
		const thread = await roomThread()

		const out = await testBed.resolve(RunOrchestratorTurn).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			workspacePath: '/tmp/workspace',
			provider: ProviderKind.CLAUDE_CODE,
			item: { kind: MailboxItemKind.OPERATOR_MESSAGE, entryId: uuidv7(), speaker: 'operator', text: 'grava em produção' },
			posture: PermissionPosture.AUTO,
		})

		expect(out.transportStop).toBeUndefined()
		const stops = await testBed.resolve(ThreadRepository).openStops(thread.id.value)
		expect(stops).toHaveLength(1)
		expect(stops[0]?.kind).toBe(StopKind.PERMISSION_DENIED)
		expect(stops[0]?.issueId).toBeUndefined()
		const entries = await testBed.resolve(ThreadRepository).listEntries(thread.id.value)
		expect(entries.some(entry => entry.kind === TranscriptKind.SYSTEM)).toBe(true)
	})

	it('AC-10 — with StopPolicy.permissionDenied OFF the orchestrator turn records nothing and does not fail', async () => {
		const thread = await roomThread()
		await testBed.resolve(StopPolicyConfigRepository).upsert(MOCK_CLOUD_OWNER_ID, { ...DEFAULT_STOP_POLICY, permissionDenied: false })

		const out = await testBed.resolve(RunOrchestratorTurn).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			workspacePath: '/tmp/workspace',
			provider: ProviderKind.CLAUDE_CODE,
			item: { kind: MailboxItemKind.OPERATOR_MESSAGE, entryId: uuidv7(), speaker: 'operator', text: 'grava em produção' },
			posture: PermissionPosture.AUTO,
		})

		expect(out.transportStop).toBeUndefined()
		expect(await testBed.resolve(ThreadRepository).openStops(thread.id.value)).toHaveLength(0)
	})
})
