import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { DrizzleClient } from '@codm/core-typescript'
import { scheduledCommands } from '@codm/contracts/db'
import { MailboxItemKind, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenThread } from '@test/support'
import { OPERATOR_ID } from '@auth/operator'
import { TYPING_FIRST_BEAT_SLOT, typingBeatJobId } from '@thread/utils'
import type { Thread } from '@thread/entities/Thread'
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
})
