import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq, like } from 'drizzle-orm'
import { scheduledCommands } from '@codm/contracts/db'
import { CommandQueue, DrizzleClient, DrizzleDatabaseDriver, MockLoggingService, SqliteCommandQueue } from '@codm/core-typescript'
import { MessageAuthor, MailboxTargetKind, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenThread, GIVEN_MENTION_TAG } from '@test/support'
import { OPERATOR_ID } from '@auth/operator'
import { MailboxRepository } from '@agent/repositories'
import { IngestChannelMessage } from './IngestChannelMessage'
import { DeliverChannelMessage } from './DeliverChannelMessage'
import { ReactToChannelMessage } from './ReactToChannelMessage'
import { SustainTypingPresence } from './SustainTypingPresence'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ChannelSender, MockChannelSender } from '../services/ChannelSender'
import { CUE_ACKNOWLEDGED, TYPING_FIRST_BEAT_SLOT, typingBeatJobId } from '../utils'

/**
 * THE INSTANT CUES — `👀` on the message that woke the agent, and the native "digitando…" while it
 * generates (streaming spec, decisions 10-12).
 *
 * Three properties are on trial here, and each one is a way the cues could be WORSE than no cue:
 *
 *  AC-9  — the `👀` fires on exactly the messages that wake the agent, and on NO others. Both sides
 *          are asserted, because the failure that fools an operator most is the false one: an
 *          acknowledgement on a message that will never be answered reads as "it's working on it"
 *          and then goes silent forever, with nothing anywhere explaining why.
 *  AC-10 — the typing indicator is renewed while the turn runs, STOPS on its own at a ceiling, and
 *          stops immediately once the reply is on the wire.
 *  AC-11 — a channel that refuses every cue changes nothing about the message or the turn.
 *
 * Every timing here is DRIVEN, never slept: the queue's `tick()` is called explicitly and `run_at` is
 * rewound by hand, so a slow machine cannot make this suite flake.
 */
describe('the instant cues — 👀 on the trigger, "digitando…" while it thinks, and neither may cost anything', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let db: DrizzleClient
	let driver: DrizzleDatabaseDriver
	let queue: SqliteCommandQueue
	let sender: MockChannelSender

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
		db = testBed.resolve(DrizzleClient)
		driver = testBed.resolve(DrizzleDatabaseDriver)
	})

	beforeEach(async () => {
		await testBed.reset()

		// ORDER MATTERS, and it cost this suite its first red: a Handler captures its collaborators at
		// RESOLVE time, so every binding a handler injects has to be in place before the handler is
		// resolved. `SustainTypingPresence` injects the queue to arm its own next beat — resolved too
		// early it re-arms into whatever the previous test left behind.
		sender = new MockChannelSender()
		testBed.override(ChannelSender, sender)

		// Our own queue instance, driven by hand. It is ALSO the one the producers enqueue through
		// (overridden onto the container), so "what the ingest scheduled" and "what this suite ticks"
		// are the same rows rather than two hopeful halves.
		queue = new SqliteCommandQueue(driver, new MockLoggingService())
		testBed.override(CommandQueue, queue)

		await queue.registerCommandHandler(testBed.resolve(ReactToChannelMessage))
		await queue.registerCommandHandler(testBed.resolve(SustainTypingPresence))
		await queue.registerCommandHandler(testBed.resolve(DeliverChannelMessage))
		queue.stopPolling() // deterministic: this suite calls tick() itself
	})

	afterEach(async () => {
		await queue.close()
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	const TRIGGER_WAMID = 'wamid-that-woke-it'

	/** Ingest one inbound, aged by `minutesAgo` — `receivedAt` is when the PLATFORM says it was sent. */
	const ingest = (threadId: string, text: string, opts: { minutesAgo?: number; platformMessageId?: string | undefined } = {}) =>
		testBed.resolve(IngestChannelMessage).execute({
			threadId,
			senderExternalId: 'stranger-42',
			text,
			receivedAt: new Date(Date.now() - (opts.minutesAgo ?? 0) * 60 * 1000),
			platformMessageId: 'platformMessageId' in opts ? opts.platformMessageId : TRIGGER_WAMID,
		})

	const commandRows = async (namePrefix: string) => (await db.select().from(scheduledCommands)).filter(row => row.name === namePrefix)

	const rowById = async (id: string) => (await db.select().from(scheduledCommands).where(eq(scheduledCommands.id, id)))[0]

	const typingRows = async () => db.select().from(scheduledCommands).where(like(scheduledCommands.id, 'typing:%'))

	// Writes go through the driver's write seam — `db` is the READ connection.
	const rewindRunAt = async (id: string) =>
		driver.transaction(tx =>
			tx
				.update(scheduledCommands)
				.set({ runAt: new Date(Date.now() - 1_000) })
				.where(eq(scheduledCommands.id, id)),
		)

	// ─────────────────────────────────────────────────────────────────────────────
	// AC-9 — the reaction rides the SAME verdict as the turn
	// ─────────────────────────────────────────────────────────────────────────────

	describe('AC-9: the 👀 fires when — and only when — the message wakes the agent', () => {
		it('an INVOCABLE message gets the 👀, aimed at the wamid that triggered it', async () => {
			const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

			const out = await ingest(thread.id.value, `${GIVEN_MENTION_TAG} ship the coupon fix`)
			expect(out.invocable).toBe(true)

			// The cue is a durable row, enqueued in the ingest's own transaction — not an inline HTTP call.
			const scheduled = await commandRows('react_to_channel_message')
			expect(scheduled).toHaveLength(1)

			await queue.tick()

			expect(sender.reactions).toHaveLength(1)
			expect(sender.reactions[0]).toMatchObject({
				channelId: thread.channelId,
				remoteId: thread.contactRef.externalId,
				messageId: TRIGGER_WAMID,
				reaction: CUE_ACKNOWLEDGED,
				fromMe: false,
				ownerId: OPERATOR_ID,
			})
		})

		/**
		 * THE HALF THAT MAKES THE OTHER HALF MEAN SOMETHING, and the falseador's target.
		 *
		 * Identical sender, identical text, identical citation, identical wamid as the case above — the
		 * ONLY variable is the age. Move the cue out of the `if (invocable)` branch and this goes red
		 * with a `👀` on a message that will never be answered.
		 */
		it('the SAME message 6 minutes old is transcribed, queues no turn, and gets NO reaction', async () => {
			const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

			const out = await ingest(thread.id.value, `${GIVEN_MENTION_TAG} ship the coupon fix`, { minutesAgo: 6 })
			expect(out.invocable).toBe(false)

			// Still in the conversation — being late costs it a turn, never its place in the transcript.
			const entries = await testBed.resolve(ThreadRepository).listEntries(thread.id.value)
			expect(entries.filter(e => e.kind === TranscriptKind.CONTACT)).toHaveLength(1)

			expect(await commandRows('react_to_channel_message')).toHaveLength(0)
			await queue.tick()
			expect(sender.reactions).toHaveLength(0)
		})

		it('a FRESH message with the mention gate closed gets no reaction either', async () => {
			const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

			const out = await ingest(thread.id.value, 'ship the coupon fix')
			expect(out.invocable).toBe(false)

			expect(await commandRows('react_to_channel_message')).toHaveLength(0)
			await queue.tick()
			expect(sender.reactions).toHaveLength(0)
		})

		it('a caller with no platform message (the console) ingests normally and simply gets no cue', async () => {
			const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

			const out = await ingest(thread.id.value, `${GIVEN_MENTION_TAG} ship it`, { platformMessageId: undefined })

			expect(out.invocable).toBe(true)
			expect(await commandRows('react_to_channel_message')).toHaveLength(0)
		})
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// AC-11 — best-effort, proven at BOTH seams a cue can break
	// ─────────────────────────────────────────────────────────────────────────────

	describe('AC-11: a channel that refuses every cue costs the message and the turn nothing', () => {
		/** A gateway that is down for cues and for words alike. */
		const deadChannel = () =>
			({
				async send() {
					throw new Error('gateway down')
				},
				async react() {
					throw new Error('gateway down')
				},
				async signalTyping() {
					throw new Error('gateway down')
				},
			}) as unknown as ChannelSender

		it('the message is ingested and the TURN is queued even though the reaction can never be delivered', async () => {
			testBed.override(ChannelSender, deadChannel())
			// Re-resolve the executor against the dead channel — see the ordering note in beforeEach.
			await queue.removeAllCommandHandlers()
			await queue.registerCommandHandler(testBed.resolve(ReactToChannelMessage))
			queue.stopPolling()

			const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
			const out = await ingest(thread.id.value, `${GIVEN_MENTION_TAG} ship the coupon fix`)

			// THE REAL WORK SURVIVED — verdict, transcript and the scheduled turn.
			expect(out.invocable).toBe(true)
			const entries = await testBed.resolve(ThreadRepository).listEntries(thread.id.value)
			expect(entries.filter(e => e.kind === TranscriptKind.CONTACT)).toHaveLength(1)
			expect(await testBed.resolve(MailboxRepository).hasPending(MailboxTargetKind.THREAD, thread.id.value)).toBe(true)

			// And the cue dies QUIETLY: the command is consumed, not retried into a dead-letter row the
			// operator would have to look at. `attempts` never climbs, `dead_at` is never set — the row is
			// simply gone.
			const cueId = `cue:${out.entryId}`
			expect(await rowById(cueId)).toBeDefined()
			await queue.tick()
			expect(await rowById(cueId)).toBeUndefined()
		})

		/**
		 * THE OTHER SEAM — the one that can actually reach the ingest.
		 *
		 * `CommandQueue.enqueueCommand` is transactional only on the SQLite driver; the broker-backed one
		 * declares `transactional = false` and its enqueue is network I/O. This proves that a queue which
		 * refuses the CUE still leaves the ingest whole. Remove the guard in `IngestChannelMessage` and
		 * this goes red with the ingest itself throwing.
		 */
		it('a queue that refuses to schedule the cue does NOT break the ingest', async () => {
			const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

			testBed.override(CommandQueue, {
				...queue,
				async enqueueCommand() {
					throw new Error('broker unreachable')
				},
			} as unknown as CommandQueue)

			const out = await ingest(thread.id.value, `${GIVEN_MENTION_TAG} ship the coupon fix`)

			expect(out.invocable).toBe(true)
			expect(out.entryId).toBeTruthy()
			const entries = await testBed.resolve(ThreadRepository).listEntries(thread.id.value)
			expect(entries.filter(e => e.kind === TranscriptKind.CONTACT)).toHaveLength(1)
			expect(await testBed.resolve(MailboxRepository).hasPending(MailboxTargetKind.THREAD, thread.id.value)).toBe(true)
		})
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// AC-10 — the typing loop: renewed, self-limiting, and cleared by the reply
	// ─────────────────────────────────────────────────────────────────────────────

	describe('AC-10: "digitando…" is renewed while the turn runs and can never get permanently stuck', () => {
		const startLoop = (channelId: string, remoteId: string, untilEpochMs: number) =>
			queue.enqueueCommand<SustainTypingPresence>(
				'sustain_typing_presence',
				{ ownerId: OPERATOR_ID, channelId, remoteId, untilEpochMs, slot: TYPING_FIRST_BEAT_SLOT },
				{ jobId: typingBeatJobId(channelId, remoteId, TYPING_FIRST_BEAT_SLOT) },
			)

		it('each beat publishes the indicator AND arms the next one, alternating between the two handles', async () => {
			const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
			const { channelId, contactRef } = thread
			const remoteId = contactRef.externalId

			await startLoop(channelId, remoteId, Date.now() + 60_000)

			await queue.tick()
			expect(sender.typingBeats).toHaveLength(1)
			expect(sender.typingBeats[0]).toMatchObject({ channelId, remoteId, ownerId: OPERATOR_ID })
			// The beat that ran is gone (the queue deletes it) and its SUCCESSOR is armed on the OTHER
			// handle — which is the whole reason the loop alternates: a beat re-arming its own id would
			// schedule a row the queue then deletes, and the loop would die after exactly one beat.
			expect(await rowById(typingBeatJobId(channelId, remoteId, 0))).toBeUndefined()
			const armed = await rowById(typingBeatJobId(channelId, remoteId, 1))
			expect(armed?.runAt.getTime()).toBeGreaterThan(Date.now())

			// "Time passes" — the next beat comes due and hands the loop back to slot 0.
			await rewindRunAt(typingBeatJobId(channelId, remoteId, 1))
			await queue.tick()
			expect(sender.typingBeats).toHaveLength(2)
			expect(await rowById(typingBeatJobId(channelId, remoteId, 1))).toBeUndefined()
			expect(await rowById(typingBeatJobId(channelId, remoteId, 0))).toBeDefined()
		})

		/**
		 * THE PROPERTY THAT MAKES A CRASH SURVIVABLE. Nobody cancels anything here — the ceiling in the
		 * beat's own payload is what ends the loop, so a turn that hangs forever cannot leave a contact
		 * staring at a permanent "digitando…".
		 */
		it('a beat past its ceiling publishes NOTHING and arms NOTHING — the loop ends itself', async () => {
			const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
			const { channelId, contactRef } = thread
			const remoteId = contactRef.externalId

			await startLoop(channelId, remoteId, Date.now() - 1)

			await queue.tick()

			expect(sender.typingBeats).toHaveLength(0)
			expect(await typingRows()).toHaveLength(0)
		})

		it('the reply going out CANCELS the loop — no beat survives the first text', async () => {
			const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
			const { channelId, contactRef } = thread
			const remoteId = contactRef.externalId

			await startLoop(channelId, remoteId, Date.now() + 60_000)
			await queue.tick()
			expect(sender.typingBeats).toHaveLength(1)
			expect(await typingRows()).toHaveLength(1) // the successor is armed

			await testBed.resolve(DeliverChannelMessage).execute({
				ownerId: OPERATOR_ID,
				channelId,
				contactExternalId: remoteId,
				text: 'here you go',
				author: MessageAuthor.SYSTEM,
			})

			// Both derivable handles are cleared — the canceller holds only the conversation coordinates
			// and still stops a loop it never started.
			expect(await typingRows()).toHaveLength(0)
			await queue.tick()
			expect(sender.typingBeats).toHaveLength(1)
		})
	})
})
