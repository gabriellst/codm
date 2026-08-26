import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread } from '@test/support'
import { ChannelKind, MessageAuthor, MessageType, ArtifactKind } from '@codm/contracts-typescript/wire/enums'
import { ChannelMessageReceivedInProcessEvent } from '@codm/contracts-typescript/wire/events'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { DeliverChannelAttachment } from './DeliverChannelAttachment'
import { ChannelSender, MockChannelSender } from '../services/ChannelSender'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ConsumeInboundMessage } from '../handlers/ConsumeInboundMessage'

/**
 * The `deliver_channel_attachment` command — the delivery leg of "envio de artefatos pelo canal"
 * (decisions 2 and 4), mirroring `DeliverChannelMessage.test.ts`'s two structural properties for the
 * text path:
 *
 * 1. THE SEND DISPATCHES BY KIND, to whichever `ChannelSender.sendMedia` branch the artifact's kind
 *    names.
 * 2. THE LOOP MUST NOT OPEN. Same `fromMe` echo hazard `DeliverChannelMessage`'s docblock names and
 *    the placeholder bug fixed — this handler claims the echo BEFORE anything else, in the same
 *    transaction as the `SYSTEM` entry it writes, so a redelivered echo of this account's own send
 *    dies at `ConsumeInboundMessage`'s dedup latch before any thread lookup.
 *
 * Unlike `DeliverChannelMessage`, there is no pre-existing entry to LINK — this handler writes the
 * `SYSTEM` entry itself (see the class docblock for why), so the second property this suite proves is
 * that the entry it writes actually carries `mediaPath`/`artifactId`.
 */
describe('DeliverChannelAttachment — the artifact leaves as native media, its echo cannot come back as speech', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const command = (threadId: string, overrides: Partial<DeliverChannelAttachment['input']> = {}): DeliverChannelAttachment['input'] => ({
		ownerId: MOCK_CLOUD_OWNER_ID,
		threadId,
		artifactId: '019e4d24-6524-7041-9e1c-8108180cddaf',
		mediaPath: '/mock-media-dir/abc123.png',
		kind: ArtifactKind.IMAGE,
		...overrides,
	})

	it('dispatches to ChannelSender.sendMedia, carrying the owner explicitly', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const sender = new MockChannelSender()
		testBed.override(ChannelSender, sender)

		await testBed.resolve(DeliverChannelAttachment).execute(command(thread.id.value, { caption: 'here you go' }))

		expect(sender.sentMedia).toHaveLength(1)
		expect(sender.sentMedia[0]).toMatchObject({
			channelId: thread.channelId,
			remoteId: thread.contactRef.externalId,
			kind: ArtifactKind.IMAGE,
			mediaPath: '/mock-media-dir/abc123.png',
			caption: 'here you go',
			ownerId: MOCK_CLOUD_OWNER_ID,
		})
	})

	it('CLAIMS its own outgoing message and records a SYSTEM entry carrying mediaPath + artifactId', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		testBed.override(ChannelSender, new MockChannelSender())
		const ledger = testBed.resolve(ConsumedMessageRepository)

		await testBed.resolve(DeliverChannelAttachment).execute(command(thread.id.value, { caption: 'relatório' }))

		const ourId = 'mock-wamid-1'
		expect(await ledger.has(thread.channelId, ourId)).toBe(true)
		// THE LOOP PROOF, same shape `DeliverChannelMessage.test.ts` uses: a second claim on an
		// already-claimed id returns false, so the echo stops before any thread lookup.
		expect(await ledger.claim({ ownerId: MOCK_CLOUD_OWNER_ID, channelId: thread.channelId, platformMessageId: ourId })).toBe(false)

		const entries = await testBed.resolve(ThreadRepository).recentEntries(thread.id.value, 10)
		const entry = entries.find(e => e.kind === 'SYSTEM' && e.mediaPath === '/mock-media-dir/abc123.png')
		expect(entry).toBeDefined()
		expect(entry?.text).toBe('relatório')
		expect(entry?.artifactId).toBe('019e4d24-6524-7041-9e1c-8108180cddaf')

		// LINKED too, not merely claimed — a reply to the delivered artifact should resolve to this entry
		// the same way a reply to a text SYSTEM message already does.
		expect(await ledger.findEntry(thread.channelId, ourId)).toEqual({ threadId: thread.id.value, entryId: entry!.entryId })
	})

	it('an empty caption records an entry with empty text, never undefined — the artifact bubble has no caption to show', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		testBed.override(ChannelSender, new MockChannelSender())

		await testBed.resolve(DeliverChannelAttachment).execute(command(thread.id.value))

		const entries = await testBed.resolve(ThreadRepository).recentEntries(thread.id.value, 10)
		expect(entries.find(e => e.kind === 'SYSTEM')?.text).toBe('')
	})

	it("AC-3 — the artifact's own echo (fromMe) is a dedup no-op, never a spurious CONTACT entry", async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const sender = new MockChannelSender()
		testBed.override(ChannelSender, sender)

		await testBed.resolve(DeliverChannelAttachment).execute(command(thread.id.value, { caption: 'segue o print' }))
		const messageId = 'mock-wamid-1'

		// WhatsApp echoes this account's own send back INBOUND (`fromMe: true`) — the exact loop
		// `DeliverChannelMessage`'s docblock names, replicated for the media path (same regression class
		// as the "Pensando" placeholder bug: `RunOrchestratorTurn.thinking.test.ts`).
		const consumeInbound = testBed.resolve(ConsumeInboundMessage)
		await consumeInbound.handle(
			new ChannelMessageReceivedInProcessEvent({
				ownerId: MOCK_CLOUD_OWNER_ID,
				payload: {
					channelId: thread.channelId,
					messageId,
					internalMessageId: crypto.randomUUID(),
					remoteId: thread.contactRef.externalId,
					senderId: thread.contactRef.externalId,
					fromMe: true,
					author: MessageAuthor.HUMAN,
					isGroup: false,
					timestamp: Math.floor(Date.now() / 1000),
					occurredAt: new Date(),
					observedAt: new Date(),
					messageType: MessageType.IMAGE,
					content: { imageMessage: { caption: 'segue o print' } },
					platform: ChannelKind.WHATSAPP,
					ownerId: MOCK_CLOUD_OWNER_ID,
				},
			}) as never,
		)

		// The echo was a dedup no-op — the ledger claim from the delivery was already there. No spurious
		// CONTACT entry was recorded, and the SYSTEM entry from the delivery itself is still the only one.
		const entries = await testBed.resolve(ThreadRepository).recentEntries(thread.id.value, 10)
		expect(entries.filter(e => e.kind === 'CONTACT')).toHaveLength(0)
		expect(entries.filter(e => e.kind === 'SYSTEM')).toHaveLength(1)
	})

	it('drops silently when the thread no longer resolves — defensive, same posture as RecordOrchestratorReply', async () => {
		testBed.override(ChannelSender, new MockChannelSender())
		await expect(
			testBed.resolve(DeliverChannelAttachment).execute(command('00000000-0000-4000-8000-0000000000ee')),
		).resolves.toBeUndefined()
	})
})
