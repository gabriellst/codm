import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { inArray } from 'drizzle-orm'
import { scheduledCommands } from '@codm/contracts/db'
import { CommandQueue, LibSqlDatabaseDriver, MockLoggingService, LibSqlCommandQueue } from '@codm/core-typescript'
import { TestBed, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { SustainTypingPresence } from './SustainTypingPresence'
import { ChannelSender, MockChannelSender } from '../services/ChannelSender'
import { endTypingPresence } from '../services/TypingPresence'
import { TYPING_BEAT_INTERVAL_MS, TYPING_FIRST_BEAT_SLOT, typingBeatJobId } from '../utils/ChannelCues'

/**
 * AUDITORIA ANTI-DANGLING (Task T4) — the founder's report ("digitando fantasma no fim de um
 * stream, em oportunidade real") checked against the lease `SustainTypingPresence` already ships.
 *
 * `ChannelCues.test.ts` already proves three of the design's four properties end to end: the beat
 * renews and alternates handles, a beat PAST its ceiling publishes and arms nothing, and the reply
 * landing (`DeliverChannelMessage`) cancels both handles. What that suite does not cover — and what
 * this one adds — is:
 *
 *   1. The NEAR-deadline case (a beat that ran, but whose successor would only wake up past the
 *      ceiling) — distinct from the past-ceiling case, and untested until now.
 *   2. `endTypingPresence` (`thread/services/TypingPresence`) as its OWN unit, now that it is a
 *      seam other callers can reach — not just `DeliverChannelMessage`'s private detail.
 *   3. THE FALSEADOR the audit was asked to produce: what happens between a turn ending WITHOUT a
 *      delivery (an error, or a run that never produced a reply) and the ceiling. Nothing in
 *      `RunOrchestratorTurn` calls a canceller on that path today (confirmed by reading the file —
 *      the `outcome.kind !== 'COMPLETED'` branch just logs and returns), so the loop's only
 *      remaining off-switch is `untilEpochMs`. In production that is `TYPING_MAX_DURATION_MS`,
 *      5 minutes (`ChannelCues.ts`) — long enough that a contact watching "digitando…" persist for
 *      minutes after the agent has already given up reads as exactly the dangling the founder saw.
 *      This suite proves the MECHANISM (short, controlled ceiling — production minutes would make
 *      the test itself the slow thing), not the constant.
 *
 * THE FIX THIS AUDIT LANDS: `endTypingPresence` used to be a private method on
 * `DeliverChannelMessage`, unreachable from anywhere else — including the one place that would need
 * it to close the gap, `RunOrchestratorTurn`'s non-completion return. It is now exported from
 * `thread/services/TypingPresence`, the same permitted cross-context surface `beginTypingPresence`
 * already uses (`usecases` is forbidden across the `agent → thread` boundary; `services` is not).
 * Wiring the call into that return path is agent-context work and stays out of this audit's
 * exclusive write scope (`packages/api/typescript/src/thread/**` only) — the finding is reported,
 * not silently left unfixed.
 *
 * ### Reading persisted state — probe, not a raw driver resolve
 * All READ assertions below go through `testBed.probe().count('scheduledCommands', ...)`
 * (`tests/architecture/probe-discipline.test.ts`), same as `RaiseStop.test.ts` /
 * `ReplyStreaming.test.ts` next door. This suite only ever has ONE conversation and ONE command
 * name (`sustain_typing_presence`) in flight, so a bare count answers every assertion here — "is a
 * beat currently pending" — without needing the id-level reads `ChannelCues.test.ts` is separately
 * exempted for (that suite juggles MULTIPLE cue kinds and asserts a specific row's `run_at`, which
 * the probe deliberately does not expose). Advancing the clock (`rewindRunAt`) is a WRITE, not a
 * read of persisted business state, and stays on the raw driver — the same seam `driver.transaction`
 * already is in every sibling suite that drives `queue.tick()` by hand.
 */
describe("SustainTypingPresence — the lease against the founder's dangling report", () => {
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

		// ORDER MATTERS (the same note `ChannelCues.test.ts` left): `SustainTypingPresence` captures its
		// collaborators at RESOLVE time, so the override must land before it is resolved.
		sender = new MockChannelSender()
		testBed.override(ChannelSender, sender)

		queue = new LibSqlCommandQueue(driver, new MockLoggingService())
		testBed.override(CommandQueue, queue)
		await queue.registerCommandHandler(testBed.resolve(SustainTypingPresence))
		queue.stopPolling() // deterministic: this suite calls tick() itself
	})

	afterEach(async () => {
		await queue.close()
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	/** How many typing beats are currently PENDING — the only fact every assertion below needs. */
	const pendingBeats = () => testBed.probe().count('scheduledCommands', { name: 'sustain_typing_presence' })

	/**
	 * Force BOTH derivable handles due, unconditionally — a WRITE used to drive `queue.tick()`
	 * deterministically, mirroring `ChannelCues.test.ts`'s `rewindRunAt`. Both ids are DERIVED from
	 * `channelId`/`remoteId` alone (never read off a row), so this never needs to know which of the
	 * two is actually the one currently armed: the update on the other id simply matches zero rows.
	 */
	const rewindBothHandles = async (channelId: string, remoteId: string) =>
		driver.transaction(tx =>
			tx
				.update(scheduledCommands)
				.set({ runAt: new Date(Date.now() - 1_000) })
				.where(inArray(scheduledCommands.id, [typingBeatJobId(channelId, remoteId, 0), typingBeatJobId(channelId, remoteId, 1)])),
		)

	const startLoop = (channelId: string, remoteId: string, untilEpochMs: number) =>
		queue.enqueueCommand<SustainTypingPresence>(
			'sustain_typing_presence',
			{ ownerId: MOCK_CLOUD_OWNER_ID, channelId, remoteId, untilEpochMs, slot: TYPING_FIRST_BEAT_SLOT },
			{ jobId: typingBeatJobId(channelId, remoteId, TYPING_FIRST_BEAT_SLOT) },
		)

	describe('the near-deadline case — a beat that ran, and whose successor will only wake up past the ceiling', () => {
		/**
		 * THE SUCCESSOR IS ARMED ANYWAY, and the change of mind is the fix.
		 *
		 * This used to arm nothing here, reasoning that a beat waking past its own deadline is dead
		 * weight. It is not: past the deadline, a beat is the only thing left that can PUBLISH THE STOP.
		 * Skipping it left the last `composing` of a hung turn standing with nothing scheduled to
		 * retract it — the indicator outliving not just the turn but the loop that fed it.
		 */
		it('publishes THIS beat and arms the successor that will put the indicator out', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
			const { channelId, contactRef } = thread
			const remoteId = contactRef.externalId

			// Less than one full interval away: the successor this beat arms will wake up PAST the ceiling.
			await startLoop(channelId, remoteId, Date.now() + TYPING_BEAT_INTERVAL_MS / 2)

			await queue.tick()

			// The indicator for THIS instant is still real — the contact is not lied to early.
			expect(sender.typingBeats).toHaveLength(1)
			expect(sender.typingStops).toHaveLength(0)
			// The successor exists, and it is the one that will publish the stop when it wakes up past the
			// ceiling — that half is pinned by `ChannelCues.test.ts`'s past-ceiling case, which can force
			// the deadline into the past without this suite having to wait out a real interval.
			expect(await pendingBeats()).toBe(1)
		})
	})

	describe('endTypingPresence — the cancellation seam extracted so a non-delivering terminal path can reach it too', () => {
		it('FALSEADOR (before this audit) — cancels BOTH derivable handles mid-loop, called by something that never started the loop', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
			const { channelId, contactRef } = thread
			const remoteId = contactRef.externalId

			await startLoop(channelId, remoteId, Date.now() + 60_000)
			await queue.tick()
			expect(sender.typingBeats).toHaveLength(1)
			expect(await pendingBeats()).toBe(1) // the successor is armed, on the OTHER handle

			// Before this audit, the only code that could do this was `DeliverChannelMessage`'s private
			// `stopTypingPresence` — unreachable from a caller in a different bounded context. This proves
			// the extracted primitive does the same job, from a caller that is not `DeliverChannelMessage`.
			await endTypingPresence({
				commands: queue,
				sender,
				logging: new MockLoggingService(),
				ownerId: MOCK_CLOUD_OWNER_ID,
				channelId,
				remoteId,
			})

			expect(await pendingBeats()).toBe(0)
			await queue.tick()
			expect(sender.typingBeats).toHaveLength(1) // no further beat — the loop is over
			// AND THE CONTACT'S SCREEN IS TOLD. Cancelling the rows only stops us from beating; the last
			// `composing` we published stays up until something retracts it.
			expect(sender.typingStops).toHaveLength(1)
			expect(sender.typingStops[0]).toMatchObject({ channelId, remoteId, ownerId: MOCK_CLOUD_OWNER_ID })
		})

		it('is best-effort per handle — a queue that refuses to cancel does not throw', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
			const { channelId, contactRef } = thread
			const remoteId = contactRef.externalId

			const refusingQueue = {
				async cancelCommand() {
					throw new Error('sqlite busy')
				},
			} as unknown as CommandQueue

			await expect(
				endTypingPresence({
					commands: refusingQueue,
					sender,
					logging: new MockLoggingService(),
					ownerId: MOCK_CLOUD_OWNER_ID,
					channelId,
					remoteId,
				}),
			).resolves.toBeUndefined()

			// A CHANNEL THAT REFUSES THE STOP MAY NOT THROW EITHER — same policy, the other half of the seam.
			const refusingSender = {
				async stopTyping() {
					throw new Error('gateway down')
				},
			} as unknown as MockChannelSender
			await expect(
				endTypingPresence({
					commands: queue,
					sender: refusingSender,
					logging: new MockLoggingService(),
					ownerId: MOCK_CLOUD_OWNER_ID,
					channelId,
					remoteId,
				}),
			).resolves.toBeUndefined()
		})
	})

	describe("THE FOUNDER'S REPORT — a turn that ends WITHOUT delivering leaves the indicator lit until the ceiling, not until the error", () => {
		/**
		 * Reproduces the shape of `RunOrchestratorTurn`'s non-completion return: the loop was armed
		 * (`beginTypingPresence`, confirmed elsewhere — `RunOrchestratorTurn.test.ts`'s AC-10 activation
		 * suite), the turn ends without ever reaching `DeliverChannelMessage`, and NOTHING calls
		 * `endTypingPresence` — because nothing in that file does today. The only thing left standing
		 * between the contact and a dangling "digitando…" is `untilEpochMs`.
		 *
		 * The ceiling here is generous in WALL-CLOCK terms (60s, matching `ChannelCues.test.ts`'s own
		 * convention) precisely so `Date.now()` never gets close to it while `rewindBothHandles`
		 * fast-forwards the QUEUE's notion of "due" across several beat intervals — the property under
		 * test is that NOTHING but that far-off wall-clock deadline stands between the contact and the
		 * indicator staying lit, run after run, with no reply, no error handler and no cancellation
		 * anywhere in the loop. In production the equivalent ceiling is `TYPING_MAX_DURATION_MS` — five
		 * minutes — so the real version of this same sequence does not stop after three beats; it stops
		 * after fifty.
		 */
		it('re-arms through every beat interval with no canceller in sight — the loop has no idea the turn ended', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
			const { channelId, contactRef } = thread
			const remoteId = contactRef.externalId

			// A turn that "errors" here: the ceiling is minted once, like `beginTypingPresence` does, and
			// then travels — this suite never calls a canceller, mirroring the missing call.
			await startLoop(channelId, remoteId, Date.now() + 60_000)

			// Beat 1 — the turn has already "failed" by now in the real scenario; the loop does not know.
			await queue.tick()
			expect(sender.typingBeats).toHaveLength(1)
			expect(await pendingBeats()).toBe(1) // successor armed — nobody has cancelled it

			// Beat 2 — still nobody cancels it. The indicator is STILL lit, well past any reply.
			await rewindBothHandles(channelId, remoteId)
			await queue.tick()
			expect(sender.typingBeats).toHaveLength(2)
			expect(await pendingBeats()).toBe(1)

			// Beat 3 — same story. Three re-arms in, and the ONLY reason this stops eventually is a
			// wall-clock deadline nobody in the turn's error path ever consults — never a recognition
			// that the turn is over. That gap is this audit's finding.
			await rewindBothHandles(channelId, remoteId)
			await queue.tick()
			expect(sender.typingBeats).toHaveLength(3)
			expect(await pendingBeats()).toBe(1) // and it would keep going
		})
	})
})
