import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import type { ZodType } from 'zod'
import { TestBed, givenThread, GIVEN_MENTION_TAG } from '@test/support'
import { ChannelKind, MessageType, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { ChannelMessageReceivedInProcessEvent } from '@codm/contracts-typescript/wire/events'
import { OPERATOR_ID } from '@auth/operator'
import { ConsumeInboundMessage } from '@thread/handlers/ConsumeInboundMessage'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { AgentRunner } from '@agent/services/AgentRunner'
import { AgentRunOutcome } from '@agent/enums'
import type { AgentRunRequest, AgentRuntimeEvent } from '@agent/types'
import { MailboxRepository } from '@agent/repositories'
import { MailboxItemKind, MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'

/**
 * FLOW (mock DI) — inbound → route → classify → SPAWN → issue OPENED → SSE, the now-CLOSED Core saga.
 *
 * Ported from integration to 'mock' DI mode: the choreography is asserted by the integration events
 * CAPTURED on the external mediator (no DB), the point of mock mode. The reachable saga is driven
 * IN-PROCESS with a stub runner (no provider CLI, no LLM): the gateway fact → `ConsumeInboundMessage`
 * → `ClassifyMessage` emits `integration.message.classified`; the phase-6b closer
 * `RunIssueTurnOnClassification` consumes it → `RunIssueTurn` → the terminal facts bridge
 * to `integration.issue.opened` / completed; `MaterializeIssueFromExecution` materializes the Issue
 * row and the raw facts reach the console via the SSE re-emit (B5: `BrowserFrameEnricher` is gone).
 *
 * Reply-quote / context-match DB resolution stays in the ClassifyMessage use-case + OpenIssuesReader
 * repository specs (integration) — a flow spec asserts the cross-context hand-offs, not DB reads.
 */

/**
 * Stub `AgentRunner` — ONE method, and the `outputSchema` on the request is what makes a run a
 * classification (§4.2). With it: a NEW_ISSUE decision. Without it: canned reply frames and a clean
 * terminal event, so `RunIssueTurn` drives the whole transport-fan + outcome-mapping path.
 */
class NewIssueStubRunner extends AgentRunner {
	async *run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		if (request.outputSchema) {
			const output = { decision: 'NEW_ISSUE', title: 'Ship the coupon fix' }
			yield {
				type: 'finished',
				result: { outcome: AgentRunOutcome.COMPLETED, replyText: JSON.stringify(output), sessionId: null, output, failed: false },
			}
			return
		}
		const lines = [`$ ${request.agentName} (stub) in ${request.cwd}`, ...request.messages.map(m => m.content), 'done']
		for (const [index, text] of lines.entries()) {
			yield { type: 'frame', frame: { kind: 'assistant_text', messageId: `stub-${index}`, text, parentToolUseId: null } }
		}
		yield {
			type: 'finished',
			result: { outcome: AgentRunOutcome.COMPLETED, replyText: lines.join('\n'), sessionId: 'stub-session', failed: false },
		}
	}
	async shutdown(): Promise<void> {}
}

describe('Flow (mock): inbound → classify → spawn → issue opened → SSE', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeEach(async () => {
		// Fresh container per test — mock mode has no DB reset, so isolation comes from fresh singletons.
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('mock', { testContainer, ownerId: OPERATOR_ID })
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const inbound = (
		channelId: string,
		contactExternalId: string,
		messageId: string,
		opts: Partial<{ senderExternalId: string; text: string }> = {},
	) =>
		new ChannelMessageReceivedInProcessEvent({
			ownerId: OPERATOR_ID,
			// Verbatim gateway payload (union-slots pilot): text rides the WHATSAPP/TEXT content variant.
			payload: {
				channelId,
				messageId,
				internalMessageId: crypto.randomUUID(),
				remoteId: contactExternalId,
				senderId: opts.senderExternalId ?? contactExternalId,
				fromMe: false,
				isGroup: false,
				timestamp: Math.floor(Date.now() / 1000),
				occurredAt: new Date(),
				observedAt: new Date(),
				messageType: MessageType.TEXT,
				content: { text: opts.text ?? `${GIVEN_MENTION_TAG} ship the coupon fix` },
				platform: ChannelKind.WHATSAPP,
				ownerId: OPERATOR_ID,
			},
		})

	/** Register the internal bridges so a flushed domain fact publishes its integration event (captured). */
	async function wireBridges(): Promise<MockOutboxDispatcher> {
		await testBed.spy.register(testBed.resolve(PublishThreadIntegrationEvents))
		await testBed.spy.register(testBed.resolve(PublishAgentIntegrationEvents))
		return testBed.resolve(MockOutboxDispatcher)
	}

	it('at-least-once delivery becomes exactly-once processing (one transcript entry)', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const consumer = testBed.resolve(ConsumeInboundMessage)
		const event = inbound(thread.channelId, thread.contactRef.externalId, 'wamid-dup')

		// The gateway redelivers the SAME platform message.
		await consumer.handle(event as never)
		await consumer.handle(event as never)

		const entries = await testBed.resolve(ThreadRepository).listEntries(thread.id.value)
		expect(entries.filter(e => e.kind === TranscriptKind.CONTACT)).toHaveLength(1)
	})

	/**
	 * THE REPOINT (§7.4), and the property that makes it worth a flow test rather than a unit one: the
	 * item is written in the SAME transaction as the transcript entry it refers to.
	 *
	 * Before the pivot this branch called `ClassifyMessage`. The classifier is gone, and what an
	 * invocable message now produces is a queued turn of the thread's orchestrator — nothing else, and
	 * nothing synchronous. No LLM runs on the ingest path any more.
	 */
	it('an invocable inbound QUEUES an orchestrator turn — same transaction as the entry', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		await testBed
			.resolve(ConsumeInboundMessage)
			.handle(inbound(thread.channelId, thread.contactRef.externalId, 'wamid-1', { senderExternalId: 'stranger-42' }) as never)

		const mailbox = testBed.resolve(MailboxRepository)
		const claimed = await mailbox.claimNext('flow-test', 60_000)

		expect(claimed?.targetKind).toBe(MailboxTargetKind.THREAD)
		expect(claimed?.targetId).toBe(thread.id.value)
		expect(claimed?.kind).toBe(MailboxItemKind.OPERATOR_MESSAGE)

		// The payload carries the entry the turn answers — the id the orchestrator may cite (D6) and the
		// one the run token claim is minted from.
		const entries = await testBed.resolve(ThreadRepository).listEntries(thread.id.value)
		const contact = entries.find(e => e.kind === TranscriptKind.CONTACT)
		expect(claimed).toBeDefined()
		const payload = claimed?.payload as { entryId: string } | undefined
		expect(payload?.entryId).toBe(contact?.entryId)
	})

	/**
	 * D3 as a pipeline property: a message nobody addressed is TRANSCRIBED and schedules NOTHING. It is
	 * context for the next turn's window, never a turn of its own — and the gate is what stops the
	 * orchestrator answering a group's small talk.
	 */
	it('a NON-invocable inbound is transcribed but queues nothing (D3)', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		// No mention tag → the gate refuses to invoke.
		await testBed.resolve(ConsumeInboundMessage).handle(
			inbound(thread.channelId, thread.contactRef.externalId, 'wamid-quiet', {
				senderExternalId: 'stranger-42',
				text: 'só conversando',
			}) as never,
		)

		const entries = await testBed.resolve(ThreadRepository).listEntries(thread.id.value)
		expect(entries.filter(e => e.kind === TranscriptKind.CONTACT)).toHaveLength(1)
		expect(await testBed.resolve(MailboxRepository).claimNext('flow-test', 60_000)).toBeUndefined()
	})

	/**
	 * The redelivery story end to end: the gateway's at-least-once becomes exactly-once TURNS, because
	 * the mailbox `dedupKey` is the entry id. Without it a redelivered message answers twice in a real
	 * group.
	 */
	it('a redelivered inbound queues exactly ONE turn', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const event = inbound(thread.channelId, thread.contactRef.externalId, 'wamid-twice', { senderExternalId: 'stranger-42' })

		await testBed.resolve(ConsumeInboundMessage).handle(event as never)
		await testBed.resolve(ConsumeInboundMessage).handle(event as never)

		const mailbox = testBed.resolve(MailboxRepository)
		const first = await mailbox.claimNext('flow-test', 60_000)
		expect(first).toBeDefined()
		await mailbox.complete(first?.id ?? '')
		expect(await mailbox.claimNext('flow-test', 60_000)).toBeUndefined()
	})
})
