import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import type { ZodType } from 'zod'
import { TestBed, givenThread, givenWorkspace } from '@test/support'
import { MockOutboxDispatcher } from '@codedm/core-typescript'
import { ChannelKind, MessageType, TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { ChannelMessageReceivedEvent } from '@codedm/contracts-typescript/wire/events'
import { OPERATOR_ID } from '@auth/operator'
import { ConsumeInboundMessage } from '@thread/handlers/ConsumeInboundMessage'
import { PublishThreadIntegrationEvents } from '@thread/handlers/PublishThreadIntegrationEvents'
import { TranscriptRepository } from '@thread/repositories/TranscriptRepository'
import { PublishAgentIntegrationEvents } from '@agent/handlers/PublishAgentIntegrationEvents'
import { RunIssueTurnOnClassification } from '@agent/handlers/RunIssueTurnOnClassification'
import { AgentRunner } from '@agent/services/AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '@agent/services/AgentRunnerFactory'
import { AgentRunOutcome } from '@agent/enums'
import type { AgentRunRequest, AgentRuntimeEvent } from '@agent/types'
import { MaterializeIssueFromExecution } from '@issue/handlers/MaterializeIssueFromExecution'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { BrowserFrameEnricher } from '@ui/services/BrowserFrameEnricher'

/**
 * FLOW (mock DI) — inbound → route → classify → SPAWN → issue OPENED → SSE, the now-CLOSED Core saga.
 *
 * Ported from integration to 'mock' DI mode: the choreography is asserted by the integration events
 * CAPTURED on the external mediator (no DB), the point of mock mode. The reachable saga is driven
 * IN-PROCESS with a stub runner (no provider CLI, no LLM): the gateway fact → `ConsumeInboundMessage`
 * → `ClassifyMessage` emits `integration.message.classified`; the phase-6b closer
 * `RunIssueTurnOnClassification` consumes it → `RunIssueTurn` → the terminal facts bridge
 * to `integration.issue.opened` / completed; `MaterializeIssueFromExecution` materializes the Issue
 * row and the `BrowserFrameEnricher` synthesizes the `browser.*` SSE frame.
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
		new ChannelMessageReceivedEvent({
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
				content: { text: opts.text ?? 'ship the coupon fix' },
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

		const entries = await testBed.resolve(TranscriptRepository).listByThread(thread.id.value)
		expect(entries.filter(e => e.kind === TranscriptKind.CONTACT)).toHaveLength(1)
	})

	it('an invocable inbound is classified → integration.message.classified is published (captured)', async () => {
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(new NewIssueStubRunner()))
		const outbox = await wireBridges()
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		// Sender is not the read-only seeded contact → invocable.
		await testBed
			.resolve(ConsumeInboundMessage)
			.handle(inbound(thread.channelId, thread.contactRef.externalId, 'wamid-1', { senderExternalId: 'stranger-42' }) as never)
		await outbox.flush()

		const classified = testBed.externalSpy.getPublishedOfType('integration.message.classified')
		expect(classified).toHaveLength(1)
	})

	it('classified → RunIssueTurn → issue OPENED fires live, materializes the Issue + an SSE frame', async () => {
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(new NewIssueStubRunner()))
		const outbox = await wireBridges()

		// A workspace bound to the thread so the closer can resolve the run cwd.
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value })

		// 1. Inbound → classify → integration.message.classified.
		await testBed
			.resolve(ConsumeInboundMessage)
			.handle(inbound(thread.channelId, thread.contactRef.externalId, 'wamid-open', { senderExternalId: 'stranger-42' }) as never)
		await outbox.flush()
		const classified = testBed.externalSpy.getPublishedOfType('integration.message.classified')[0]
		expect(classified).toBeDefined()

		// 2. The phase-6b closer consumes it and runs the (stub) terminal session in-process.
		await testBed.resolve(RunIssueTurnOnClassification).handle(classified as never)
		await outbox.flush()

		// 3. integration.issue.opened + issue.completed FIRE live off the terminal facts.
		const opened = testBed.externalSpy.getPublishedOfType('integration.issue.opened')
		expect(opened).toHaveLength(1)
		// NOT completed — and that is the inversion working. `IssueWorkAgent` declares a tool scope, so
		// `RunIssueTurn` no longer mints the conclusion from the terminal outcome (§4.3 rule 7): the ONLY
		// producer is the declaration use case behind the `TransitionIssueStatus` tool. Publishing here as
		// well would put `integration.issue.completed` in the outbox twice for one finished run.
		expect(testBed.externalSpy.getPublishedOfType('integration.issue.completed')).toHaveLength(0)

		const openedEvent = opened[0] as { payload: { issueId: string; threadId: string } }
		expect(openedEvent.payload.threadId).toBe(thread.id.value)

		// 4. MaterializeIssueFromExecution materializes the Issue row from the opened fact.
		await testBed.resolve(MaterializeIssueFromExecution).handle(opened[0] as never)
		const issue = await testBed.resolve(IssueRepository).findById(openedEvent.payload.issueId)
		expect(issue).toBeDefined()
		expect(issue?.threadId).toBe(thread.id.value)

		// 5. The SSE enricher synthesizes a browser.thread_status_changed frame from the opened fact.
		const frames = await testBed.resolve(BrowserFrameEnricher).enrich(opened[0] as never)
		expect(frames.some(f => f.name === 'browser.thread_status_changed')).toBe(true)
	})
})
