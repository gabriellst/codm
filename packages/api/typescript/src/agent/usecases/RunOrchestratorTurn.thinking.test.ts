import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import type { ZodType } from 'zod'
import { CommandQueue, LibSqlCommandQueue, LibSqlDatabaseDriver, MockLoggingService } from '@codm/core-typescript'
import { PHASE_EDIT_MIN_INTERVAL_MS } from '@codm/contracts/cues'
import { ChannelKind, MailboxItemKind, MessageAuthor, MessageType, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { ChannelMessageReceivedInProcessEvent, OrchestratorRepliedEvent } from '@codm/contracts-typescript/wire/events'
import { TestBed, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import type { Thread } from '@thread/entities/Thread'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { ConsumedMessageRepository } from '@thread/repositories/ConsumedMessageRepository'
import { ChannelSender, MockChannelSender } from '@thread/services/ChannelSender'
import { DeliverChannelMessage } from '@thread/usecases/DeliverChannelMessage'
import { StreamChannelReply } from '@thread/usecases/StreamChannelReply'
import { DeliverOrchestratorReply } from '@thread/handlers/DeliverOrchestratorReply'
import { ConsumeInboundMessage } from '@thread/handlers/ConsumeInboundMessage'
import { ConfigureThinkingIndicator, ConfigureStreaming } from '@thread/usecases/ConfigureThreadSettings'
import { AgentRunner } from '../services/AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '../services/AgentRunnerFactory'
import { AgentRunOutcome } from '../enums'
import type { AgentRunRequest } from '../types/AgentRunRequest'
import type { AgentRuntimeEvent } from '../types/AgentRuntimeEvent'
import { RunOrchestratorTurn, THINKING_ERROR_COPY } from './RunOrchestratorTurn'

/**
 * THE "PENSANDO" PLACEHOLDER — it opens the stream, evolves by phase, and either becomes the answer or
 * the friendly error (thinking-indicator spec, decisions 1-2, AC-3/AC-6).
 *
 * Uses the SAME queue-driving harness as `ReplyStreaming.test.ts` next door (a real
 * `LibSqlCommandQueue`, ticked by hand, with `StreamChannelReply`/`DeliverChannelMessage` registered)
 * so the first real cut and the final delivery run through the UNMODIFIED production path — this suite
 * proves the turn is a well-behaved PRODUCER into that machinery, not a second copy of its behaviour.
 */
describe('RunOrchestratorTurn — the "Pensando" placeholder', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let driver: LibSqlDatabaseDriver
	let queue: LibSqlCommandQueue
	let sender: MockChannelSender

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		driver = testBed.resolve(LibSqlDatabaseDriver)
	})

	beforeEach(async () => {
		await testBed.reset()

		// ORDER MATTERS (same trap `ReplyStreaming.test.ts` documents): every override must land BEFORE
		// anything is resolved, because a Handler captures its collaborators at RESOLVE time.
		sender = new MockChannelSender()
		testBed.override(ChannelSender, sender)

		queue = new LibSqlCommandQueue(driver, new MockLoggingService())
		testBed.override(CommandQueue, queue)

		await queue.registerCommandHandler(testBed.resolve(StreamChannelReply))
		await queue.registerCommandHandler(testBed.resolve(DeliverChannelMessage))
		queue.stopPolling() // deterministic: this suite ticks the queue itself
	})

	afterEach(async () => {
		await queue.close()
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	/** Drives one turn with a SCRIPTED runner — the events it yields ARE the phases under test. */
	class ScriptedRunner extends AgentRunner {
		constructor(private readonly events: AgentRuntimeEvent[]) {
			super()
		}
		async *run<OutputSchema extends ZodType | undefined = undefined>(
			_request: AgentRunRequest<OutputSchema>,
		): AsyncIterable<AgentRuntimeEvent> {
			for (const event of this.events) yield event
		}
		async shutdown(): Promise<void> {}
	}

	/**
	 * Like `ScriptedRunner`, but a step can carry a REAL delay before it yields — the only way to
	 * observe `PHASE_EDIT_MIN_INTERVAL_MS` actually elapsing (or not) between two `tool_use` frames.
	 * A step with no `delayMs` yields immediately, same as `ScriptedRunner`.
	 */
	class TimedScriptedRunner extends AgentRunner {
		constructor(private readonly steps: ReadonlyArray<{ event: AgentRuntimeEvent; delayMs?: number }>) {
			super()
		}
		async *run<OutputSchema extends ZodType | undefined = undefined>(
			_request: AgentRunRequest<OutputSchema>,
		): AsyncIterable<AgentRuntimeEvent> {
			for (const step of this.steps) {
				if (step.delayMs) await new Promise(resolve => setTimeout(resolve, step.delayMs))
				yield step.event
			}
		}
		async shutdown(): Promise<void> {}
	}

	/** The unhandled-throw case (T4's audit finding, case 3 of the catch terminal). */
	class ThrowingRunner extends AgentRunner {
		constructor(private readonly before: AgentRuntimeEvent[] = []) {
			super()
		}
		async *run<OutputSchema extends ZodType | undefined = undefined>(
			_request: AgentRunRequest<OutputSchema>,
		): AsyncIterable<AgentRuntimeEvent> {
			for (const event of this.before) yield event
			throw new Error('boom mid-run')
		}
		async shutdown(): Promise<void> {}
	}

	const runTurn = (thread: Thread, runner: AgentRunner) => {
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))
		return testBed.resolve(RunOrchestratorTurn).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			workspacePath: '/tmp/workspace',
			provider: ProviderKind.CLAUDE_CODE,
			item: { kind: MailboxItemKind.OPERATOR_MESSAGE, entryId: crypto.randomUUID(), speaker: 'operator', text: 'pode ajudar?' },
		})
	}

	/** The real terminal leg (mirrors `DeliverOrchestratorReply.handle` driven straight, as its own test does). */
	const deliverFinal = async (threadId: string, text: string) => {
		await testBed
			.resolve(DeliverOrchestratorReply)
			.handle(new OrchestratorRepliedEvent({ ownerId: MOCK_CLOUD_OWNER_ID, payload: { threadId, text } }) as never)
		await queue.tick()
	}

	const typingBeatCount = () => testBed.probe().count('scheduledCommands', { name: 'sustain_typing_presence' })

	// ─────────────────────────────────────────────────────────────────────────────
	// AC-3 — one message, opened as "Pensando", growing through phases, ending as the reply
	// ─────────────────────────────────────────────────────────────────────────────

	describe('AC-3: the placeholder opens the stream and evolves by phase into the final reply', () => {
		it('edits on each new (tool, target) phase once the spacing window elapses — tool-driven verb + sanitized target, and the first real cut EDITS the same message', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

			const events: Array<{ event: AgentRuntimeEvent; delayMs?: number }> = [
				{
					event: {
						type: 'frame',
						frame: {
							kind: 'tool_use',
							toolUseId: 't1',
							tool: 'Read',
							input: { file_path: '/tmp/x/Thread.ts' },
							target: 'Thread.ts',
							parentToolUseId: null,
						},
					},
				},
				// A DIFFERENT (tool, target) pair — but it only fires ONCE the spacing window has passed
				// (decision 4), hence the delay ahead of it.
				{
					event: {
						type: 'frame',
						frame: {
							kind: 'tool_use',
							toolUseId: 't2',
							tool: 'Edit',
							input: { file_path: '/tmp/x/RunOrchestratorTurn.ts' },
							target: 'RunOrchestratorTurn.ts',
							parentToolUseId: null,
						},
					},
					delayMs: PHASE_EDIT_MIN_INTERVAL_MS + 100,
				},
				// A repeated call with the SAME (tool, target) pair must not fire a third phase edit.
				{
					event: {
						type: 'frame',
						frame: {
							kind: 'tool_use',
							toolUseId: 't3',
							tool: 'Edit',
							input: { file_path: '/tmp/x/RunOrchestratorTurn.ts' },
							target: 'RunOrchestratorTurn.ts',
							parentToolUseId: null,
						},
					},
				},
				// A tool with NO recognizable target (`Bash` with no `command`) — the line falls back to the
				// no-detail format, same as today's. Past the spacing window again, so it still applies on
				// its own turn rather than coalescing with t2/t3.
				{
					event: { type: 'frame', frame: { kind: 'tool_use', toolUseId: 't4', tool: 'Bash', input: {}, parentToolUseId: null } },
					delayMs: PHASE_EDIT_MIN_INTERVAL_MS + 100,
				},
				{ event: { type: 'frame', frame: { kind: 'text_delta', messageId: 'm1', delta: 'Vou olhar o log.' } } },
				{
					event: {
						type: 'finished',
						result: {
							outcome: AgentRunOutcome.COMPLETED,
							replyText: 'Vou olhar o log. Encontrei o problema.',
							sessionId: 'sess-1',
							failed: false,
						},
					},
				},
			]

			const result = await runTurn(thread, new TimedScriptedRunner(events))

			// (a) — THE FIRST CALL ON THE CHANNEL IS THE PLACEHOLDER, before the model said anything real.
			expect(sender.sent).toHaveLength(1)
			expect(sender.sent[0]?.text).toMatch(/^✻ .+…$/)
			expect(sender.sent[0]?.text).not.toContain('Pensando —')
			const messageId = 'mock-wamid-1'

			// (b) — THREE PHASE EDITS on the SAME message: Read→Thread.ts, Edit→RunOrchestratorTurn.ts (the
			// repeated t3 call added none), Bash with no target. The glyph ADVANCES on each (only the OPENING
			// send is pinned to ✻); the verb is TOOL-DRIVEN (`describeToolActivity`), not the random pool —
			// deterministic, so the exact lines are asserted rather than just their shape.
			expect(sender.edits).toHaveLength(3)
			for (const edit of sender.edits) {
				expect(edit.messageId).toBe(messageId)
				expect(edit.text).not.toContain('Pensando —')
			}
			expect(sender.edits[0]?.text).toBe('✼ Lendo… · Thread.ts')
			expect(sender.edits[1]?.text).toBe('✽ Editando… · RunOrchestratorTurn.ts')
			// No target resolved for `Bash` with an empty input — the line degrades to the no-detail shape.
			expect(sender.edits[2]?.text).toBe('✾ Executando…')
			expect(sender.edits[2]?.text).not.toContain(' · ')

			// (c) — the real cut was ENQUEUED (durable, best-effort) but not applied until the queue runs.
			expect(sender.edits).toHaveLength(3)
			await queue.tick()

			// It EDITS the same message — no second balloon, and phase edits stop from here on.
			expect(sender.sent).toHaveLength(1)
			expect(sender.edits).toHaveLength(4)
			expect(sender.edits[3]).toMatchObject({ messageId, text: 'Vou olhar o log.' })

			// (d) — the final delivery EDITS the same message again, to the CANONICAL text — and nothing else
			// was ever sent: one messageId for the whole reply, thinking phase included.
			await deliverFinal(thread.id.value, result.text)
			expect(sender.sent).toHaveLength(1)
			expect(sender.screen()).toEqual(['Vou olhar o log. Encontrei o problema.'])
		})

		it('a burst of phase changes inside the spacing window coalesces into ONE edit — only the latest pair survives, applied reactively once a later frame arrives past the window', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

			const events: Array<{ event: AgentRuntimeEvent; delayMs?: number }> = [
				// t1 fires IMMEDIATELY — nothing was ever edited before it, so there is nothing to throttle
				// against.
				{
					event: {
						type: 'frame',
						frame: { kind: 'tool_use', toolUseId: 't1', tool: 'Read', input: {}, target: 'a.ts', parentToolUseId: null },
					},
				},
				// t2 and t3 land INSIDE the spacing window (no delay ahead of either) — both COALESCE, and
				// only the LAST one observed (t3, `c.ts`) survives as the pending phase.
				{
					event: {
						type: 'frame',
						frame: { kind: 'tool_use', toolUseId: 't2', tool: 'Read', input: {}, target: 'b.ts', parentToolUseId: null },
					},
				},
				{
					event: {
						type: 'frame',
						frame: { kind: 'tool_use', toolUseId: 't3', tool: 'Read', input: {}, target: 'c.ts', parentToolUseId: null },
					},
				},
				// A LATER frame, once the window has elapsed, is what flushes the coalesced pending phase —
				// reactively, off the run's own event stream, never a dangling timer.
				{ event: { type: 'frame', frame: { kind: 'text_delta', messageId: 'm1', delta: '' } }, delayMs: PHASE_EDIT_MIN_INTERVAL_MS + 100 },
				{
					event: {
						type: 'finished',
						result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'ok', sessionId: 'sess-burst', failed: false },
					},
				},
			]

			await runTurn(thread, new TimedScriptedRunner(events))

			// ONE edit for the immediate t1, ONE for the coalesced-and-flushed t3 — t2 never got its own edit.
			expect(sender.edits).toHaveLength(2)
			expect(sender.edits[0]?.text).toBe('✼ Lendo… · a.ts')
			expect(sender.edits[1]?.text).toBe('✽ Lendo… · c.ts')
		})

		it('a channel that cannot edit gets no placeholder — the unstreamed behaviour, unchanged', async () => {
			sender.capabilities = { edit: false, media: true }
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

			const events: AgentRuntimeEvent[] = [
				{ type: 'frame', frame: { kind: 'tool_use', toolUseId: 't1', tool: 'Read', input: {}, parentToolUseId: null } },
				{ type: 'frame', frame: { kind: 'text_delta', messageId: 'm1', delta: 'Tudo certo.' } },
				{ type: 'finished', result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'Tudo certo.', sessionId: 'sess-2', failed: false } },
			]

			const result = await runTurn(thread, new ScriptedRunner(events))
			await queue.tick()

			// NOTHING went out while the answer was being written — no placeholder, no phase edit.
			expect(sender.sent).toHaveLength(0)
			expect(sender.edits).toHaveLength(0)

			await deliverFinal(thread.id.value, result.text)

			expect(sender.sent).toHaveLength(1)
			expect(sender.sent[0]?.text).toBe('Tudo certo.')
			expect(sender.edits).toHaveLength(0)
		})

		// ─────────────────────────────────────────────────────────────────────────────
		// Per-thread opt-out (thinking-indicator spec, per-thread setting) — reuses the SAME
		// "no placeholder" degradation a channel with no edit capability already has.
		// ─────────────────────────────────────────────────────────────────────────────

		it('thinkingIndicatorEnabled=false — no placeholder and no phase edits even on a channel that CAN edit, and the final reply is unaffected', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
			await testBed.resolve(ConfigureThinkingIndicator).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, enabled: false })
			const disabledThread = await testBed.resolve(ThreadRepository).findById(thread.id.value)
			if (!disabledThread) throw new Error('thread not found')

			// No `text_delta`/`assistant_text` frames — this proves the PLACEHOLDER + PHASE EDITS are gone
			// (the `tool_use` frame would have fired a phase edit had a placeholder opened) without also
			// exercising the streamed-cut path, which is gated on the CHANNEL's own `capabilities.edit` and
			// stays independent of this per-thread setting (same as it is today).
			const events: AgentRuntimeEvent[] = [
				{ type: 'frame', frame: { kind: 'tool_use', toolUseId: 't1', tool: 'Read', input: {}, parentToolUseId: null } },
				{
					type: 'finished',
					result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'Tudo certo.', sessionId: 'sess-thinking-off', failed: false },
				},
			]

			const result = await runTurn(disabledThread, new ScriptedRunner(events))
			await queue.tick()

			// NOTHING went out while the answer was being written — no placeholder, no phase edit — even
			// though `sender.capabilities.edit` is still true (the default `MockChannelSender` capability).
			expect(sender.sent).toHaveLength(0)
			expect(sender.edits).toHaveLength(0)

			await deliverFinal(thread.id.value, result.text)

			expect(sender.sent).toHaveLength(1)
			expect(sender.sent[0]?.text).toBe('Tudo certo.')
			expect(sender.edits).toHaveLength(0)
		})

		it('thinkingIndicatorEnabled=false — a non-delivery closes typing but has no placeholder to edit to the error copy', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
			await testBed.resolve(ConfigureThinkingIndicator).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, enabled: false })
			const disabledThread = await testBed.resolve(ThreadRepository).findById(thread.id.value)
			if (!disabledThread) throw new Error('thread not found')

			const events: AgentRuntimeEvent[] = [
				{ type: 'finished', result: { outcome: AgentRunOutcome.STOPPED, replyText: '', sessionId: null, failed: false } },
			]
			const result = await runTurn(disabledThread, new ScriptedRunner(events))

			expect(result.spoke).toBe(false)
			expect(sender.sent).toHaveLength(0)
			expect(sender.edits).toHaveLength(0)
			expect(await typingBeatCount()).toBe(0)
		})
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// Per-thread opt-out (reactions/streaming spec, per-thread setting) — `streamingEnabled` gates
	// INTERMEDIATE content cuts only; the placeholder/indicator machinery is untouched by it.
	// ─────────────────────────────────────────────────────────────────────────────

	describe('streamingEnabled=false: no intermediate cuts, only the final delivery ever lands', () => {
		it('streaming OFF + indicator ON — the placeholder still opens and takes its phase edits, but no content cut ever fires; the final delivery EDITS the same placeholder (one message)', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
			await testBed.resolve(ConfigureStreaming).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, enabled: false })
			const disabledThread = await testBed.resolve(ThreadRepository).findById(thread.id.value)
			if (!disabledThread) throw new Error('thread not found')

			const events: AgentRuntimeEvent[] = [
				{ type: 'frame', frame: { kind: 'tool_use', toolUseId: 't1', tool: 'Read', input: {}, target: 'a.ts', parentToolUseId: null } },
				// Would decide a real cut on a streaming-enabled thread — with streaming off, `decideCut` is
				// never even called for this frame.
				{ type: 'frame', frame: { kind: 'text_delta', messageId: 'm1', delta: 'Vou olhar o log.' } },
				{
					type: 'finished',
					result: {
						outcome: AgentRunOutcome.COMPLETED,
						replyText: 'Vou olhar o log. Encontrei o problema.',
						sessionId: 'sess-streaming-off',
						failed: false,
					},
				},
			]

			const result = await runTurn(disabledThread, new ScriptedRunner(events))
			await queue.tick()

			// The placeholder opened (indicator still ON) and took its ONE phase edit from the tool_use
			// frame — but the text_delta produced NO content edit: streaming off means no cut is ever
			// decided, so `sender.edits` holds only the phase edit.
			expect(sender.sent).toHaveLength(1)
			expect(sender.edits).toHaveLength(1)
			expect(sender.edits[0]?.text).toBe('✼ Lendo… · a.ts')

			// The final delivery EDITS the SAME placeholder to the canonical text — one message for the
			// whole reply, exactly like AC-3's first-cut-lands case, except there was no intermediate cut.
			await deliverFinal(thread.id.value, result.text)
			expect(sender.sent).toHaveLength(1)
			expect(sender.edits).toHaveLength(2)
			expect(sender.screen()).toEqual(['Vou olhar o log. Encontrei o problema.'])
		})

		it('streaming OFF + indicator ALSO off — no placeholder, no cuts, a single plain send with the final text', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
			await testBed.resolve(ConfigureStreaming).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, enabled: false })
			await testBed.resolve(ConfigureThinkingIndicator).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, enabled: false })
			const disabledThread = await testBed.resolve(ThreadRepository).findById(thread.id.value)
			if (!disabledThread) throw new Error('thread not found')

			const events: AgentRuntimeEvent[] = [
				{ type: 'frame', frame: { kind: 'tool_use', toolUseId: 't1', tool: 'Read', input: {}, parentToolUseId: null } },
				{ type: 'frame', frame: { kind: 'text_delta', messageId: 'm1', delta: 'Tudo certo.' } },
				{
					type: 'finished',
					result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'Tudo certo.', sessionId: 'sess-both-off', failed: false },
				},
			]

			const result = await runTurn(disabledThread, new ScriptedRunner(events))
			await queue.tick()

			// NOTHING went out while the answer was being written — no placeholder (indicator off), no cut
			// (streaming off).
			expect(sender.sent).toHaveLength(0)
			expect(sender.edits).toHaveLength(0)

			await deliverFinal(thread.id.value, result.text)

			// A single plain send — exactly today's non-streaming/non-indicator behaviour, with zero edits.
			expect(sender.sent).toHaveLength(1)
			expect(sender.sent[0]?.text).toBe('Tudo certo.')
			expect(sender.edits).toHaveLength(0)
		})
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// Bug fix — the placeholder's own WhatsApp echo must not be misattributed to the operator
	// ─────────────────────────────────────────────────────────────────────────────

	describe("bug fix: the placeholder's own echo is claimed, never ingested as the channel OWNER's message", () => {
		it('claims the placeholder messageId eagerly, at open time — its fromMe echo is a dedup no-op, not a new CONTACT entry', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

			const events: AgentRuntimeEvent[] = [
				{
					type: 'finished',
					result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'Tudo certo.', sessionId: 'sess-echo', failed: false },
				},
			]
			await runTurn(thread, new ScriptedRunner(events))

			// The placeholder went out — same mint scheme `MockChannelSender` always uses.
			expect(sender.sent).toHaveLength(1)
			const placeholderId = 'mock-wamid-1'

			// It was CLAIMED into the ledger right after `send()` returned — before the turn even finishes
			// running, and long before any `deliver_channel_message` command exists to claim through.
			const consumed = testBed.resolve(ConsumedMessageRepository)
			expect(await consumed.has(thread.channelId, placeholderId)).toBe(true)

			// Simulate WhatsApp echoing THIS account's own send back INBOUND (`fromMe: true`) — the exact
			// loop `DeliverChannelMessage`'s docblock names, and the one the placeholder used to be exposed
			// to: before this fix, `ConsumeInboundMessage` found no claim for `placeholderId`, ingested the
			// echo as a brand-new message, and — since `fromMe` alone decides the sender — attributed it to
			// `OPERATOR_PARTICIPANT_ID`. The "✻ …" placeholder showed up in the transcript as if the
			// channel OWNER had typed it, not the agent.
			const consumeInbound = testBed.resolve(ConsumeInboundMessage)
			await consumeInbound.handle(
				new ChannelMessageReceivedInProcessEvent({
					ownerId: MOCK_CLOUD_OWNER_ID,
					payload: {
						channelId: thread.channelId,
						messageId: placeholderId,
						internalMessageId: crypto.randomUUID(),
						remoteId: thread.contactRef.externalId,
						senderId: thread.contactRef.externalId,
						fromMe: true,
						author: MessageAuthor.HUMAN,
						isGroup: false,
						timestamp: Math.floor(Date.now() / 1000),
						occurredAt: new Date(),
						observedAt: new Date(),
						messageType: MessageType.TEXT,
						content: { text: sender.sent[0]?.text ?? '' },
						platform: ChannelKind.WHATSAPP,
						ownerId: MOCK_CLOUD_OWNER_ID,
					},
				}) as never,
			)

			// The echo was a dedup no-op — the ledger claim was already there. No spurious CONTACT entry.
			const entries = await testBed.resolve(ThreadRepository).recentEntries(thread.id.value, 10)
			expect(entries.filter(e => e.kind === 'CONTACT')).toHaveLength(0)
		})
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// AC-6 — the three non-delivery shapes T4's audit named, all closing the same way
	// ─────────────────────────────────────────────────────────────────────────────

	describe('AC-6: a turn that ends without delivering closes both cues', () => {
		it('a STOPPED outcome (no reply) cancels the typing loop and edits the placeholder to the friendly error', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
			expect(await typingBeatCount()).toBe(0)

			const events: AgentRuntimeEvent[] = [
				{ type: 'finished', result: { outcome: AgentRunOutcome.STOPPED, replyText: '', sessionId: null, failed: false } },
			]
			const result = await runTurn(thread, new ScriptedRunner(events))

			expect(result.spoke).toBe(false)
			// The placeholder opened, and NOTHING else was ever sent.
			expect(sender.sent).toHaveLength(1)
			expect(sender.edits).toHaveLength(1)
			expect(sender.edits[0]).toMatchObject({ messageId: 'mock-wamid-1', text: THINKING_ERROR_COPY })
			// The typing loop was cancelled explicitly — not left for the 5-minute ceiling.
			expect(await typingBeatCount()).toBe(0)
		})

		it('a COMPLETED outcome with an EMPTY reply is a non-delivery too', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

			const events: AgentRuntimeEvent[] = [
				{ type: 'finished', result: { outcome: AgentRunOutcome.COMPLETED, replyText: '   ', sessionId: 'sess-3', failed: false } },
			]
			const result = await runTurn(thread, new ScriptedRunner(events))

			expect(result.text).toBe('')
			expect(sender.edits).toHaveLength(1)
			expect(sender.edits[0]).toMatchObject({ messageId: 'mock-wamid-1', text: THINKING_ERROR_COPY })
			expect(await typingBeatCount()).toBe(0)
		})

		it('an unhandled throw around agent.run() closes both cues AND still propagates to the dispatcher', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

			await expect(runTurn(thread, new ThrowingRunner())).rejects.toThrow('boom mid-run')

			expect(sender.edits).toHaveLength(1)
			expect(sender.edits[0]).toMatchObject({ messageId: 'mock-wamid-1', text: THINKING_ERROR_COPY })
			expect(await typingBeatCount()).toBe(0)
		})

		it('an error AFTER a real cut landed cancels typing but does NOT overwrite the growing reply', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

			const before: AgentRuntimeEvent[] = [{ type: 'frame', frame: { kind: 'text_delta', messageId: 'm1', delta: 'Já comecei.' } }]
			await expect(runTurn(thread, new ThrowingRunner(before))).rejects.toThrow('boom mid-run')

			// The cut was enqueued before the throw — materialise it.
			await queue.tick()
			expect(sender.screen()).toEqual(['Já comecei.'])
			// The placeholder already grew into a real, if incomplete, answer — never clobbered with the error.
			expect(sender.edits.map(e => e.text)).not.toContain(THINKING_ERROR_COPY)
			expect(await typingBeatCount()).toBe(0)
		})
	})
})
