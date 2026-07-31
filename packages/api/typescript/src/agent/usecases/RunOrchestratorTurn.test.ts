import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import type { ZodType } from 'zod'
import { DrizzleClient } from '@codm/core-typescript'
import { scheduledCommands } from '@codm/contracts/db'
import { MailboxItemKind, ProviderKind, StopKind, StopResolution } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenStop, givenThread } from '@test/support'
import { OPERATOR_ID } from '@auth/operator'
import { ThreadRepository } from '@thread/repositories'
import { TYPING_FIRST_BEAT_SLOT, typingBeatJobId } from '@thread/utils'
import type { Thread } from '@thread/entities/Thread'
import { AgentRunner } from '../services/AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '../services/AgentRunnerFactory'
import { AgentRunOutcome } from '../enums'
import type { AgentRunRequest, AgentRuntimeEvent } from '../types'
import { RunOrchestratorTurn } from './RunOrchestratorTurn'

/**
 * WHAT THE TURN SAYS ON THE CHANNEL BEFORE IT HAS WORDS — the activation half of AC-10 (streaming
 * spec, decision 10).
 *
 * `SustainTypingPresence` shipped complete and INERT: the port, the command, the alternating beats,
 * the ceiling and the cancellation all landed with tests, and nothing ever enqueued the FIRST beat.
 * That failure has no symptom a suite can trip over by accident — `tsc` is green, every unit test
 * passes, the reply still arrives — so the property has to be asserted where the loop is actually
 * armed, which is the turn.
 *
 * ASSERTED ON THE QUEUE, NOT ON A SPY. The activation is a durable row in `shared_scheduled_commands`
 * carrying a derivable job id, and that row is the entire contract between "the turn started" and
 * "somebody keeps the indicator lit" — a spy on a method would still pass if the enqueue wrote the
 * wrong handle, the wrong ceiling or the wrong conversation, all of which end as a loop that beats for
 * nobody.
 */
/**
 * Captures the request the turn ASSEMBLED, which is the only place the prompt exists as a value.
 *
 * Reading it here rather than unit-testing the builder is the whole point: `prompt.test.ts` proves the
 * paragraph renders when the input carries stops, and this proves the input CARRIES them — the seam
 * between the read and the prompt is exactly what was missing, and a builder test cannot see it.
 */
class CapturingRunner extends AgentRunner {
	requests: AgentRunRequest<ZodType | undefined>[] = []
	async *run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		this.requests.push(request)
		yield { type: 'finished', result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'ok', sessionId: 'sess-orch', failed: false } }
	}
	async shutdown(): Promise<void> {}
}

describe('RunOrchestratorTurn — the cues the turn is responsible for lighting', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let db: DrizzleClient

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
		await testBed.reset()
		db = testBed.resolve(DrizzleClient)
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const runTurn = (thread: Thread) =>
		testBed.resolve(RunOrchestratorTurn).execute({
			ownerId: OPERATOR_ID,
			threadId: thread.id.value,
			workspacePath: '/tmp/workspace',
			provider: ProviderKind.CLAUDE_CODE,
			item: {
				kind: MailboxItemKind.OPERATOR_MESSAGE,
				entryId: crypto.randomUUID(),
				speaker: 'operator',
				text: 'pode me tirar uma dúvida?',
			},
		})

	const typingBeats = async () => (await db.select().from(scheduledCommands)).filter(row => row.name === 'sustain_typing_presence')

	describe('AC-10 (activation): a running turn arms the typing loop', () => {
		it('enqueues the FIRST beat, on the handle a canceller can derive, with a ceiling in the future', async () => {
			const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

			await runTurn(thread)

			const beats = await typingBeats()
			expect(beats).toHaveLength(1)
			// The id is DERIVED from the conversation — the property that lets `DeliverChannelMessage` stop a
			// loop it never started. A random one would beat correctly and be uncancellable.
			expect(beats[0]?.id).toBe(typingBeatJobId(thread.channelId, thread.contactRef.externalId, TYPING_FIRST_BEAT_SLOT))

			const payload = beats[0]?.input as { ownerId: string; channelId: string; remoteId: string; untilEpochMs: number; slot: number }
			expect(payload).toMatchObject({
				ownerId: OPERATOR_ID,
				channelId: thread.channelId,
				remoteId: thread.contactRef.externalId,
				slot: TYPING_FIRST_BEAT_SLOT,
			})
			// The ceiling travels from the first beat — without it the loop has no self-limit and every
			// crash between "on" and "off" strands a contact watching a permanent "digitando…".
			expect(payload.untilEpochMs).toBeGreaterThan(Date.now())
		})

		/**
		 * The loop belongs to ONE conversation. Asserted against a second thread because the handle is
		 * derived from `channelId` + `remoteId`: a seam that armed the loop on the wrong pair would light
		 * a stranger's chat and leave the one actually waiting silent, and a single-thread fixture cannot
		 * tell the two apart.
		 */
		it('arms the loop for the thread being answered, and for no other conversation', async () => {
			const answered = await givenThread(testBed, { ownerId: OPERATOR_ID })
			const quiet = await givenThread(testBed, { ownerId: OPERATOR_ID })

			await runTurn(answered)

			const ids = (await typingBeats()).map(row => row.id)
			expect(ids).toEqual([typingBeatJobId(answered.channelId, answered.contactRef.externalId, TYPING_FIRST_BEAT_SLOT)])
			expect(ids).not.toContain(typingBeatJobId(quiet.channelId, quiet.contactRef.externalId, TYPING_FIRST_BEAT_SLOT))
		})
	})

	/**
	 * AC-4 (issue-resume spec, decision 1) — THE STOPS REACH THE PROMPT.
	 *
	 * The read landed first and alone (`GetOpenStops`, ec0a9140) because the prompt was carrying the
	 * founder's uncommitted work. Unstitched, it is the quietest kind of dead code: it compiles, its own
	 * suite is green, and the only symptom is an orchestrator that never connects "pode seguir" in the
	 * chat to the issue that stopped waiting for exactly that — which is the bug the whole spec exists
	 * for. So the assertion is made against the ASSEMBLED prompt, not against the builder.
	 */
	describe('AC-4: the open stops of the thread travel into the turn the orchestrator is given', () => {
		const capturedSystemPrompt = async (thread: Thread): Promise<string> => {
			const runner = new CapturingRunner()
			// Before the resolve below, always: a Handler captures its collaborators at RESOLVE time.
			testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))
			await runTurn(thread)
			return runner.requests[0]?.systemPrompt ?? ''
		}

		it('a thread with 2 open stops hands the model both — with the issue, the kind and the question', async () => {
			const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
			const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, key: 'refunds' })

			const asked = await givenStop(testBed, {
				threadId: thread.id.value,
				issueId: issue.id.value,
				kind: StopKind.HUMAN_REQUESTED,
				title: 'Refund window',
				detail: 'Full or partial for orders older than 90 days?',
			})
			const approval = await givenStop(testBed, {
				threadId: thread.id.value,
				kind: StopKind.APPROVAL_NEEDED,
				title: 'Drop the legacy column',
				detail: 'The migration drops the legacy ref column — confirm before I run it.',
			})
			// THE FILTER, on trial with the rest: a prompt that lists an already-answered question invites
			// the model to answer it twice, and post-slice-2 that reschedules an issue nobody asked for.
			const answered = await givenStop(testBed, {
				threadId: thread.id.value,
				issueId: issue.id.value,
				kind: StopKind.HUMAN_REQUESTED,
				title: 'Already answered',
				detail: 'this one must not reach the prompt',
			})
			const repo = testBed.resolve(ThreadRepository)
			const loaded = (await repo.findById(thread.id.value))!
			loaded.resolveStop(answered, StopResolution.REVIEW_AND_SEND)
			await repo.save(loaded)

			const system = await capturedSystemPrompt(thread)

			expect(system).toContain('UNANSWERED QUESTIONS')
			expect(system).toContain(asked.stopId)
			expect(system).toContain(issue.id.value)
			expect(system).toContain(StopKind.HUMAN_REQUESTED)
			expect(system).toContain('Refund window')
			expect(system).toContain('Full or partial for orders older than 90 days?')
			expect(system).toContain(approval.stopId)
			expect(system).toContain(StopKind.APPROVAL_NEEDED)
			expect(system).toContain('Drop the legacy column')

			expect(system).not.toContain(answered.stopId)
			expect(system).not.toContain('Already answered')
		})

		/**
		 * The empty half, and it is not a smoke test: a seam that read every open stop in the DATABASE
		 * would satisfy the case above on a one-thread fixture and only fail here, which is why the
		 * NEIGHBOUR thread carries a stop of its own.
		 */
		it('a thread with nothing open renders no section — and never borrows a neighbour thread`s stop', async () => {
			const quiet = await givenThread(testBed, { ownerId: OPERATOR_ID })
			const noisy = await givenThread(testBed, { ownerId: OPERATOR_ID })
			const borrowed = await givenStop(testBed, {
				threadId: noisy.id.value,
				kind: StopKind.HUMAN_REQUESTED,
				title: 'not yours',
				detail: 'belongs to the conversation next door',
			})

			const system = await capturedSystemPrompt(quiet)

			expect(system).not.toContain('UNANSWERED QUESTIONS')
			expect(system).not.toContain(borrowed.stopId)
			expect(system).not.toContain('not yours')
		})
	})

	/**
	 * THE QUOTED MESSAGE REACHES THE MODEL — the seam, not the renderer.
	 *
	 * `prompt.test.ts` proves the section renders when the INPUT carries a quoted line. This proves the
	 * turn actually puts it there, which is the half that was missing: `IngestChannelMessage` has always
	 * computed `repliesToAgent`, spent it on the invocation gate, and thrown the quote away. Nothing
	 * downstream errored — the agent was simply invoked without being told what it was answering.
	 *
	 * Asserted on the USER prompt (`messages[0].content`) rather than the system one, because that is
	 * where the turn's own material lives: standing instructions go in `system`, and a resumed CLI
	 * session already holds those.
	 */
	describe('the message being replied to travels from the item into the turn', () => {
		const capturedUserPrompt = async (thread: Thread, quotedAgentText?: string): Promise<string> => {
			const runner = new CapturingRunner()
			testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))
			await testBed.resolve(RunOrchestratorTurn).execute({
				ownerId: OPERATOR_ID,
				threadId: thread.id.value,
				workspacePath: '/tmp/workspace',
				provider: ProviderKind.CLAUDE_CODE,
				item: {
					kind: MailboxItemKind.OPERATOR_MESSAGE,
					entryId: crypto.randomUUID(),
					speaker: 'operator',
					text: 'depois',
					quotedAgentText,
				},
			})
			return (runner.requests[0]?.messages[0]?.content as string) ?? ''
		}

		it('an item carrying a quoted agent line puts that line in the prompt', async () => {
			const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

			const user = await capturedUserPrompt(thread, 'rodo a migration agora ou depois do deploy?')

			expect(user).toContain('THE MESSAGE THEY REPLIED TO')
			expect(user).toContain('rodo a migration agora ou depois do deploy?')
		})

		it('an item without one renders no section — the common turn is untouched', async () => {
			const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

			expect(await capturedUserPrompt(thread)).not.toContain('THE MESSAGE THEY REPLIED TO')
		})
	})
})
