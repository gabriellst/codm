import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread, GIVEN_MENTION_TAG } from '@test/support'
import { MailboxTargetKind, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { MailboxRepository } from '@agent/repositories'
import { IngestChannelMessage } from './IngestChannelMessage'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { MessageIngestedEvent } from '../events'
import { DomainEventRepository } from '@codm/core-typescript'

/**
 * C16 IngestChannelMessage — the invocation-gate matrix. The message is ALWAYS transcribed +
 * buffered (observation ≠ invocation); `invocable` is the AND of four gates: not paused, sender may
 * invoke, (when the mention gate is on) the tag is present, and the message was SENT inside the
 * freshness window. Only an invocable inbound queues a turn.
 */
describe('IngestChannelMessage gate matrix', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const ingest = (threadId: string, senderExternalId: string, text: string) =>
		testBed.resolve(IngestChannelMessage).execute({ threadId, senderExternalId, text, receivedAt: new Date() })

	it('always transcribes, even from a non-invoking sender (observation != invocation)', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		// The seeded contact participant has canInvoke=false.
		const out = await ingest(thread.id.value, thread.contactRef.externalId, 'just watching')

		expect(out.invocable).toBe(false)
		const entries = await testBed.resolve(ThreadRepository).listEntries(thread.id.value)
		const contact = entries.filter(e => e.kind === TranscriptKind.CONTACT)
		expect(contact).toHaveLength(1)
		expect(contact[0]?.text).toBe('just watching')
		// The ingest fact is emitted regardless of invocability.
		const events = await testBed.resolve(DomainEventRepository).findByType(MessageIngestedEvent)
		expect(events).toHaveLength(1)
	})

	it('gate: an unknown sender (no participant deny) is invocable WHEN they cite the thread', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const out = await ingest(thread.id.value, 'stranger-42', `${GIVEN_MENTION_TAG} ship the coupon fix`)
		expect(out.invocable).toBe(true)
	})

	it('gate: the SAME sender and text without the citation is transcribed but NOT invocable', async () => {
		// The half that makes the previous test mean something, and the founder's actual ask: the agent
		// hears every message and answers only the ones addressed to it.
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const out = await ingest(thread.id.value, 'stranger-42', 'ship the coupon fix')
		expect(out.invocable).toBe(false)
		// Still transcribed — the context window is unconditional.
		expect(out.entryId).toBeTruthy()
	})

	it('gate: a paused thread is never invocable', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		thread.pause()
		await testBed.resolve(ThreadRepository).save(thread)

		const out = await ingest(thread.id.value, 'stranger-42', 'ship the coupon fix')
		expect(out.invocable).toBe(false)
	})

	it('gate: a participant with canInvoke=false is denied', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		// The seeded contact participant is a read-only participant.
		const out = await ingest(thread.id.value, thread.contactRef.externalId, 'do the thing')
		expect(out.invocable).toBe(false)
	})

	it('gate: the mention gate requires the tag to be present', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		thread.configureMentionGate({ enabled: true, tag: '@bot' })
		await testBed.resolve(ThreadRepository).save(thread)

		const withoutTag = await ingest(thread.id.value, 'stranger-42', 'no mention here')
		expect(withoutTag.invocable).toBe(false)

		const withTag = await ingest(thread.id.value, 'stranger-42', 'hey @bot ship it')
		expect(withTag.invocable).toBe(true)
	})

	/**
	 * THE FRESHNESS WINDOW — the gateway-backlog gate (`INVOCATION_FRESHNESS_WINDOW_MS`, 5 min).
	 *
	 * The case it exists for: the gateway reconnects to WhatsApp and whatsmeow replays every message
	 * the phone buffered while the socket was down, each carrying the `occurredAt` the platform stamped
	 * when it was SENT. Every one of those clears the other three gates. Without a window each one
	 * schedules a turn, and the operator gets an hour of conversation answered in a burst.
	 *
	 * Each test states its age in minutes, and every one of them asserts BOTH SIDES: the transcript
	 * entry AND the mailbox. Proving only the absence of a turn would let a regression that also stops
	 * TRANSCRIBING sail through green — and losing the message from the conversation is a worse bug
	 * than the one being fixed.
	 */
	describe('the freshness window (5 min)', () => {
		const ingestAgedMinutes = (threadId: string, senderExternalId: string, text: string, minutesAgo: number) =>
			testBed.resolve(IngestChannelMessage).execute({
				threadId,
				senderExternalId,
				text,
				// `receivedAt` is the event's `occurredAt` — when the PLATFORM says it was sent.
				receivedAt: new Date(Date.now() - minutesAgo * 60 * 1000),
			})

		/** Both sides of the ledger for one thread: what the conversation shows, and what got scheduled. */
		const stateOf = async (thread: { id: { value: string } }) => ({
			contactEntries: (await testBed.resolve(ThreadRepository).listEntries(thread.id.value)).filter(e => e.kind === TranscriptKind.CONTACT),
			queued: await testBed.resolve(MailboxRepository).hasPending(MailboxTargetKind.THREAD, thread.id.value),
		})

		it('a message sent 1 minute ago is invocable and DOES queue the turn', async () => {
			const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

			const out = await ingestAgedMinutes(thread.id.value, 'stranger-42', `${GIVEN_MENTION_TAG} ship the coupon fix`, 1)

			expect(out.invocable).toBe(true)
			const { contactEntries, queued } = await stateOf(thread)
			expect(contactEntries).toHaveLength(1)
			expect(queued).toBe(true)
		})

		it('the SAME message sent 6 minutes ago is transcribed and queues NOTHING', async () => {
			// THE FOUNDER'S CASE. Identical sender, identical text, identical citation as the test above —
			// the ONLY variable is the age, so a green here can only be the window talking.
			const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

			const out = await ingestAgedMinutes(thread.id.value, 'stranger-42', `${GIVEN_MENTION_TAG} ship the coupon fix`, 6)

			expect(out.invocable).toBe(false)

			const { contactEntries, queued } = await stateOf(thread)
			// SIDE ONE — the message still EXISTS in the conversation. It is history, quotable, and it is
			// in the console. Being late costs it a turn, not its place in the transcript.
			expect(contactEntries).toHaveLength(1)
			expect(contactEntries[0]?.text).toBe(`${GIVEN_MENTION_TAG} ship the coupon fix`)
			// SIDE TWO — and no turn was scheduled for it.
			expect(queued).toBe(false)
		})

		it('a backlog replay of 3 messages transcribes all 3 and queues none', async () => {
			// The shape of the actual incident, at the scale that motivated it: a reconnect delivers a
			// burst, all of them citing the tag. Three entries, zero turns.
			const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

			for (const minutesAgo of [30, 20, 10]) {
				const out = await ingestAgedMinutes(thread.id.value, 'stranger-42', `${GIVEN_MENTION_TAG} backlog ${minutesAgo}`, minutesAgo)
				expect(out.invocable).toBe(false)
			}

			const { contactEntries, queued } = await stateOf(thread)
			expect(contactEntries).toHaveLength(3)
			expect(queued).toBe(false)
		})

		/**
		 * COMPOSITION, not substitution. The window is ANDed onto the existing gates — it never rescues a
		 * message the other three refused. Each leg here is FRESH (1 minute) and still denied, by pause,
		 * by the roster, and by the missing citation respectively.
		 */
		it('freshness composes with the other gates — a fresh message is still refused by each of them', async () => {
			const repo = testBed.resolve(ThreadRepository)

			// PAUSED.
			const paused = await givenThread(testBed, { ownerId: OPERATOR_ID })
			paused.pause()
			await repo.save(paused)
			expect((await ingestAgedMinutes(paused.id.value, 'stranger-42', `${GIVEN_MENTION_TAG} go`, 1)).invocable).toBe(false)
			expect((await stateOf(paused)).queued).toBe(false)

			// MUTED PARTICIPANT — the seeded contact is read-only, and cites the tag.
			const muted = await givenThread(testBed, { ownerId: OPERATOR_ID })
			expect((await ingestAgedMinutes(muted.id.value, muted.contactRef.externalId, `${GIVEN_MENTION_TAG} go`, 1)).invocable).toBe(false)
			expect((await stateOf(muted)).queued).toBe(false)

			// NO CITATION — the mention gate.
			const untagged = await givenThread(testBed, { ownerId: OPERATOR_ID })
			expect((await ingestAgedMinutes(untagged.id.value, 'stranger-42', 'go', 1)).invocable).toBe(false)
			expect((await stateOf(untagged)).queued).toBe(false)

			// And every one of those three is still IN the transcript — refusing a turn is never refusing
			// the message.
			for (const thread of [paused, muted, untagged]) {
				expect((await stateOf(thread)).contactEntries).toHaveLength(1)
			}
		})

		/**
		 * The other half of composition: the window does not become the ONLY gate either. A reply to the
		 * agent bypasses the mention tag (and only that) — but a stale reply is still stale.
		 */
		it('a reply to the agent is not exempt — a 6-minute-old reply queues nothing', async () => {
			const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
			// The agent's own line, written the way `RecordOrchestratorReply` writes it: kind SYSTEM.
			const agentLine = thread.recordEntry({ kind: TranscriptKind.SYSTEM, text: 'quer que eu faça?', at: new Date() })
			await testBed.resolve(ThreadRepository).save(thread)

			const stale = await testBed.resolve(IngestChannelMessage).execute({
				threadId: thread.id.value,
				senderExternalId: 'stranger-42',
				// No citation at all: it is the QUOTE that would carry it past the mention gate.
				text: 'sim, pode fazer',
				quotedEntryId: agentLine.entryId,
				receivedAt: new Date(Date.now() - 6 * 60 * 1000),
			})

			expect(stale.invocable).toBe(false)
			const { queued } = await stateOf(thread)
			expect(queued).toBe(false)
		})
	})

	/**
	 * WHAT THE QUEUED TURN KNOWS ABOUT THE QUOTE.
	 *
	 * `repliesToAgent` has always been computed here and has always been spent entirely on `canInvoke` —
	 * it opened the door and told the agent nothing about why. The consequence only shows up one context
	 * away, in the prompt: a reply is usually a FRAGMENT ("depois", "o segundo", "pode"), and a fragment
	 * handed over with no antecedent gets answered against whatever the model guesses it meant.
	 *
	 * The fix carries no new read and no new contract. `quoted` is already resolved above for the gate,
	 * and the transcript row it returns already holds the text — so the item the mailbox was always going
	 * to write simply carries it. Asserted on the ENQUEUED PAYLOAD, because that is the only place the
	 * fact crosses out of this context.
	 */
	describe('the mailbox item carries what the message replied to', () => {
		/** The one turn queued for this thread, as the DISPATCHER reads it. Asserts nothing — callers do. */
		const queuedItem = async () => {
			const item = await testBed.resolve(MailboxRepository).claimNext('ingest-test', 60_000)
			return { targetId: item?.targetId, payload: item?.payload as { text: string; quotedAgentText?: string } | undefined }
		}

		it('a reply to the agent hands the turn the QUOTED text', async () => {
			const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
			// The agent's own line, written the way `RecordOrchestratorReply` writes it: kind SYSTEM.
			const agentLine = thread.recordEntry({ kind: TranscriptKind.SYSTEM, text: 'rodo a migration agora ou depois do deploy?' })
			await testBed.resolve(ThreadRepository).save(thread)

			// No citation tag anywhere — the QUOTE is what carries this past the mention gate, which is
			// exactly the case the payload has to describe.
			const out = await testBed.resolve(IngestChannelMessage).execute({
				threadId: thread.id.value,
				senderExternalId: 'stranger-42',
				text: 'depois',
				quotedEntryId: agentLine.entryId,
				receivedAt: new Date(),
			})

			expect(out.invocable).toBe(true)
			const { targetId, payload } = await queuedItem()
			expect(targetId).toBe(thread.id.value)
			expect(payload?.text).toBe('depois')
			expect(payload?.quotedAgentText).toBe('rodo a migration agora ou depois do deploy?')
		})

		/**
		 * A quote of ANOTHER PARTICIPANT is not the agent being replied to. It does not lower the mention
		 * gate, and it must not put words in the prompt as though the agent had said them — the field
		 * names the agent's OWN line, and a contact's line arriving under it would be rendered as `you:`.
		 */
		it('a reply to a CONTACT line carries no quoted text', async () => {
			const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
			const humanLine = thread.recordEntry({ kind: TranscriptKind.CONTACT, senderExternalId: 'marina', text: 'alguém mexeu no toggle?' })
			await testBed.resolve(ThreadRepository).save(thread)

			const out = await testBed.resolve(IngestChannelMessage).execute({
				threadId: thread.id.value,
				senderExternalId: 'stranger-42',
				// The tag IS needed here — quoting a human grants no invocation.
				text: `${GIVEN_MENTION_TAG} fui eu`,
				quotedEntryId: humanLine.entryId,
				receivedAt: new Date(),
			})

			expect(out.invocable).toBe(true)
			const { targetId, payload } = await queuedItem()
			expect(targetId).toBe(thread.id.value)
			expect(payload?.quotedAgentText).toBeUndefined()
		})

		it('an ordinary message with no quote at all carries none', async () => {
			const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

			await testBed.resolve(IngestChannelMessage).execute({
				threadId: thread.id.value,
				senderExternalId: 'stranger-42',
				text: `${GIVEN_MENTION_TAG} ship the coupon fix`,
				receivedAt: new Date(),
			})

			const { targetId, payload } = await queuedItem()
			expect(targetId).toBe(thread.id.value)
			expect(payload?.quotedAgentText).toBeUndefined()
		})
	})
})
