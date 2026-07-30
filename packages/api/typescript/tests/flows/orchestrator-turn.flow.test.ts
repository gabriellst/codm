import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread, givenWorkspace, GIVEN_MENTION_TAG } from '@test/support'
import { ChannelKind, MessageType } from '@codm/contracts-typescript/wire/enums'
import { ChannelMessageReceivedInProcessEvent } from '@codm/contracts-typescript/wire/events'
import { OPERATOR_ID } from '@auth/operator'
import { ConsumeInboundMessage } from '@thread/handlers/ConsumeInboundMessage'
import { MailboxDispatcher } from '@agent/services/MailboxDispatcher'
import { AgentSessionRepository } from '@agent/repositories'

/**
 * THE PHASE, END TO END, IN PROCESS: an inbound message becomes a turn of the thread's orchestrator.
 *
 * Everything below is one causal chain, and each link was built and tested separately —
 * `IngestChannelMessage` queues, the dispatcher claims, `RunOrchestratorTurn` runs, the agent mints a
 * token and speaks. Unit tests prove each link; only a flow test proves they are CONNECTED, and this
 * phase's whole failure mode is a chain that is individually correct and joined nowhere.
 *
 * That is not hypothetical: the dispatcher shipped registered-but-never-started, every unit test
 * passed, `tsc` was green, and the product simply never answered. The e2e suite caught it. This test
 * exists so the next such break is caught one layer earlier and in seconds.
 */
describe('Flow (integration): inbound → mailbox → dispatcher → orchestrator turn', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const inbound = (channelId: string, contactExternalId: string, messageId: string) =>
		new ChannelMessageReceivedInProcessEvent({
			ownerId: OPERATOR_ID,
			// Verbatim gateway payload (union-slots pilot): text rides the WHATSAPP/TEXT content variant.
			payload: {
				channelId,
				messageId,
				internalMessageId: crypto.randomUUID(),
				remoteId: contactExternalId,
				senderId: 'stranger-42',
				fromMe: false,
				isGroup: false,
				timestamp: Math.floor(Date.now() / 1000),
				occurredAt: new Date(),
				observedAt: new Date(),
				messageType: MessageType.TEXT,
				content: { text: `${GIVEN_MENTION_TAG} pode me tirar uma dúvida?` },
				platform: ChannelKind.WHATSAPP,
				ownerId: OPERATOR_ID,
			},
		})

	it('a mentioned message produces an orchestrator turn, and the session row proves it ran', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value })

		// 1. Inbound → the ingest transaction queues an OPERATOR_MESSAGE.
		await testBed.resolve(ConsumeInboundMessage).handle(inbound(thread.channelId, thread.contactRef.externalId, 'wamid-flow-1') as never)

		// 2. The dispatcher claims it and runs the turn. `drain` rather than `start` so the assertion
		//    does not race a timer — a test that slept to observe a turn would fail on a slow machine.
		const handled = await testBed.resolve(MailboxDispatcher).bind(testContainer).drain()
		expect(handled).toBe(1)

		// 3. The turn RAN: the orchestrator's session row exists, keyed by thread with no issue. This is
		//    the cheapest durable proof that the chain completed — it is written in the same transaction
		//    as the reply fact, at the very end of `RunOrchestratorTurn`.
		const session = await testBed.resolve(AgentSessionRepository).findOrchestratorByThreadId(thread.id.value)
		expect(session).toBeDefined()
		expect(session?.issueId).toBeUndefined()
		expect(session?.cwd).toBe(workspace.path)
	})

	/**
	 * THE FORK is NOT covered here, deliberately, and it is worth saying why rather than leaving a gap.
	 *
	 * `issue/create` is a real MCP tool call: the agent is handed an `--mcp-config` pointing at this
	 * daemon's own HTTP door, and the generated client calls back over the wire. An integration TestBed
	 * has no HTTP server, so the call fails with "unable to connect" — the round trip is the thing being
	 * tested, and it cannot be faked without testing the fake. e2e 04/07 own that leg.
	 *
	 * What IS covered here is everything up to it, which is where the joins actually broke.
	 */
	it('the queue is emptied — a second drain finds nothing left to run', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value })

		await testBed.resolve(ConsumeInboundMessage).handle(inbound(thread.channelId, thread.contactRef.externalId, 'wamid-flow-2') as never)

		const dispatcher = testBed.resolve(MailboxDispatcher).bind(testContainer)
		expect(await dispatcher.drain()).toBe(1)
		// Completed, not merely leased: a turn that left its item claimable would answer twice.
		expect(await dispatcher.drain()).toBe(0)
	})
})
