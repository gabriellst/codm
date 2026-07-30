import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread, givenWorkspace, GIVEN_MENTION_TAG } from '@test/support'
import { ChannelKind, ContactKind, MessageAuthor, MessageType, ProviderKind, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { ChannelMessageReceivedInProcessEvent } from '@codm/contracts-typescript/wire/events'
import { OPERATOR_ID } from '@auth/operator'
import { ConsumeInboundMessage } from '../handlers/ConsumeInboundMessage'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ChannelConnectivity } from '../services/ChannelConnectivity'
import { AttachThread } from './AttachThread'
import { DeliverChannelMessage } from './DeliverChannelMessage'
import { IngestChannelMessage } from './IngestChannelMessage'

/**
 * AC-4 and AC-5 — THE TWO WRITE PORTS of a deleted thread (thread-deletion spec, decisions 3 and 4).
 *
 * "Apagada = desconfigurada" is only true if the two doors that can write to a thread agree on it:
 * an inbound message must land nowhere (decision 3), and a deliberate re-attach must bring the same
 * row back with its history (decision 4). They are the same property from both sides — nothing
 * revives by accident, everything revives on purpose.
 */
describe('AC-4/AC-5 — the write ports of a deleted thread', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
		testBed.override(ChannelConnectivity, { isConnected: async () => true, anyConnected: async () => true } as ChannelConnectivity)
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	/**
	 * `fromMe: true` deliberately. The roster `givenThread` seeds gives the CONTACT `canInvoke: false`, so
	 * a message from them transcribes but schedules nothing — which would make the control below unable to
	 * prove the mailbox write it exists to prove. An owner-authored message is attributed to the operator
	 * roster id, which always invokes, so the live path writes all three effects and the deleted path has
	 * all three to withhold.
	 */
	const inbound = (channelId: string, contactExternalId: string, messageId: string) =>
		new ChannelMessageReceivedInProcessEvent({
			ownerId: OPERATOR_ID,
			payload: {
				channelId,
				messageId,
				internalMessageId: crypto.randomUUID(),
				remoteId: contactExternalId,
				senderId: contactExternalId,
				fromMe: true,
				isGroup: false,
				timestamp: Math.floor(Date.now() / 1000),
				occurredAt: new Date(),
				observedAt: new Date(),
				messageType: MessageType.TEXT,
				content: { text: `${GIVEN_MENTION_TAG} ship the coupon fix` },
				platform: ChannelKind.WHATSAPP,
				ownerId: OPERATOR_ID,
			},
		})

	async function deletedThread() {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value })
		const repo = testBed.resolve(ThreadRepository)
		const loaded = (await repo.findById(thread.id.value))!
		loaded.delete()
		await repo.save(loaded)
		return { thread, workspace }
	}

	/**
	 * AC-4 — the headline. All THREE side effects of the ingest path are asserted absent in one test,
	 * because "a mensagem é ignorada" is a statement about the whole write, not about the transcript:
	 *   - no transcript entry  → nothing appears in the chat;
	 *   - no mailbox item      → no orchestrator turn is scheduled, so no issue is ever forked and no
	 *                            reply is ever delivered (the mailbox is the only door to both);
	 *   - no domain event      → nothing downstream reacts.
	 *
	 * The snapshot is taken BEFORE the delivery and compared after, so the assertion is "these tables
	 * did not move" rather than "these tables are empty" — which would also pass if the seed wrote
	 * nothing.
	 */
	it('AC-4 — an inbound for a deleted thread writes no entry, no mailbox item and no event', async () => {
		const { thread } = await deletedThread()
		const probe = testBed.probe()
		const before = await probe.snapshot(['transcriptEntries', 'agentMailbox', 'events', 'outbox'] as const)

		await testBed.resolve(ConsumeInboundMessage).handle(inbound(thread.channelId, thread.contactRef.externalId, 'wamid-deleted') as never)

		expect(await probe.snapshot(['transcriptEntries', 'agentMailbox', 'events', 'outbox'] as const)).toEqual(before)
	})

	/**
	 * The same event against a LIVE thread — the control. Without it the test above is satisfied by a
	 * handler that drops everything, and "ignores messages for deleted threads" would be indistinguishable
	 * from "ingest is broken".
	 */
	it('AC-4 control — the identical inbound for a LIVE thread does write all three', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value })
		const probe = testBed.probe()
		const before = await probe.snapshot(['transcriptEntries', 'agentMailbox', 'events'] as const)

		await testBed.resolve(ConsumeInboundMessage).handle(inbound(thread.channelId, thread.contactRef.externalId, 'wamid-live') as never)

		const after = await probe.snapshot(['transcriptEntries', 'agentMailbox', 'events'] as const)
		expect(after.transcriptEntries).toBe(before.transcriptEntries + 1)
		expect(after.agentMailbox).toBe(before.agentMailbox + 1)
		expect(after.events).toBeGreaterThan(before.events)
	})

	/** The use case is the floor under the handler: called directly, it refuses rather than writing. */
	it('AC-4 — IngestChannelMessage itself refuses a deleted thread (THREAD_NOT_FOUND)', async () => {
		const { thread } = await deletedThread()

		await expect(
			testBed.resolve(IngestChannelMessage).execute({
				threadId: thread.id.value,
				senderExternalId: thread.contactRef.externalId,
				text: 'hello?',
				receivedAt: new Date(),
			}),
		).rejects.toThrow(expect.objectContaining({ name: 'THREAD_NOT_FOUND' }))
	})

	/**
	 * THE IN-FLIGHT COMMAND — a delivery enqueued BEFORE the delete must not crash-loop after it.
	 *
	 * It cannot, and the reason is structural rather than defensive: `DeliverChannelMessage` never loads
	 * a thread. Its constructor takes `ChannelSender`, `ConsumedMessageRepository` and `LoggingService`
	 * — no `ThreadRepository` — and its input is primitives the PRODUCER resolved at enqueue time
	 * (`channelId`, `contactExternalId`, `text`). So the delete is invisible to it: there is no lookup to
	 * return `undefined`, no THREAD_NOT_FOUND to throw, and therefore no row that fails, retries three
	 * times and dead-letters. It sends the reply the agent had already composed.
	 *
	 * NOTHING WAS CHANGED for this. The test exists to PIN the property: adding a thread lookup to this
	 * executor later would reintroduce exactly the crash-loop this asserts cannot happen, and would do it
	 * silently, because the happy path would stay green.
	 */
	it('a delivery command enqueued before the delete still executes cleanly afterwards', async () => {
		const { thread } = await deletedThread()

		await expect(
			testBed.resolve(DeliverChannelMessage).execute({
				ownerId: OPERATOR_ID,
				channelId: thread.channelId,
				contactExternalId: thread.contactRef.externalId,
				text: 'a reply composed before the delete',
				author: MessageAuthor.SYSTEM,
			}),
		).resolves.toBeUndefined()
	})

	/**
	 * AC-5 — re-attach REVIVES: same row, new settings, old transcript.
	 *
	 * The `threadId` equality is the load-bearing assertion. A `Thread.create` here would either violate
	 * `threads_owner_channel_contact_unq` or (if the unique were relaxed) mint a second id and silently
	 * strand the history on the first — and a test that only checked "the thread is back" would pass on
	 * both.
	 */
	it('AC-5 — AttachThread on a deleted thread revives the same row, keeping the transcript', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value })
		const repo = testBed.resolve(ThreadRepository)

		const loaded = (await repo.findById(thread.id.value))!
		loaded.recordEntry({ kind: TranscriptKind.CONTACT, text: 'história antiga', senderExternalId: thread.contactRef.externalId })
		loaded.delete()
		await repo.save(loaded)

		// A DIFFERENT workspace and a different provider set: the wizard's new choices must win.
		const newWorkspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID, path: '/Users/dev/Second Project' })
		const out = await testBed.resolve(AttachThread).execute({
			ownerId: OPERATOR_ID,
			contactRef: {
				channelId: thread.channelId,
				externalId: thread.contactRef.externalId,
				displayName: 'Renamed Contact',
				kind: ContactKind.USER,
			},
			workspaceId: newWorkspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})

		expect(out.threadId).toBe(thread.id.value)

		const revived = (await repo.findById(thread.id.value))!
		expect(revived.deletedAt).toBeUndefined()
		expect(revived.workspaceId).toBe(newWorkspace.id.value)
		expect(revived.contactRef.displayName).toBe('Renamed Contact')
		expect(revived.mentionGate).toEqual({ enabled: true, tag: '@second-project' })

		const entries = await repo.listEntries(thread.id.value)
		expect(entries.map(e => e.text)).toContain('história antiga')
	})

	/** A LIVE thread still rejects a second attach — reviving must not weaken the dedupe. */
	it('AC-5 — a live thread still raises THREAD_ALREADY_ATTACHED', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value })

		await expect(
			testBed.resolve(AttachThread).execute({
				ownerId: OPERATOR_ID,
				contactRef: {
					channelId: thread.channelId,
					externalId: thread.contactRef.externalId,
					displayName: 'Contact',
					kind: ContactKind.USER,
				},
				workspaceId: workspace.id.value,
				providers: [ProviderKind.CLAUDE_CODE],
			}),
		).rejects.toThrow(expect.objectContaining({ name: 'THREAD_ALREADY_ATTACHED' }))
	})

	/** A revived thread is a WORKING thread again — the ingest door reopens with it (decision 3 ↔ 4). */
	it('AC-5 — after the revive, an inbound is ingested again', async () => {
		const { thread, workspace } = await deletedThread()
		await testBed.resolve(AttachThread).execute({
			ownerId: OPERATOR_ID,
			contactRef: {
				channelId: thread.channelId,
				externalId: thread.contactRef.externalId,
				displayName: 'Contact',
				kind: ContactKind.USER,
			},
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})

		await testBed.resolve(ConsumeInboundMessage).handle(inbound(thread.channelId, thread.contactRef.externalId, 'wamid-revived') as never)

		const entries = await testBed.resolve(ThreadRepository).listEntries(thread.id.value)
		expect(entries.filter(e => e.kind === TranscriptKind.CONTACT)).toHaveLength(1)
	})
})
