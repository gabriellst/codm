import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenChannel, givenRemote, givenThread, givenWorkspace } from '@test/support'
import { TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { OPERATOR_PARTICIPANT_ID } from '../objects'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { GetSessionChat } from './GetSessionChat'

/**
 * F4 — THE COMPOSER HAS NO SELECTOR, SO THIS READ IS THE WHOLE DECISION.
 *
 * The console used to render a two-way STEER/DIRECT toggle, seeded from `composerMode` and flippable
 * per message. Two things were wrong with it: it asked the operator, on every message, a question the
 * app already knew the answer to; and because the seed was copied into local state on mount, a thread
 * that paused or resumed while the box was focused left Enter doing one thing while the header said
 * another.
 *
 * With the toggle gone this field alone decides what pressing Enter does — which is why it is worth a
 * test of its own, and why the test asserts the DISTINCTION rather than one state: a mapping that is
 * constant satisfies either half alone.
 */
describe('GetSessionChat — composerMode is a state, not a preference', () => {
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

	const thread = async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		return givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value })
	}

	const chatFor = async (threadId: string) => testBed.resolve(GetSessionChat).execute({ ownerId: OPERATOR_ID, threadId })

	/**
	 * AC-F4.1 — paused sends a STEER, running does not.
	 *
	 * Read it as "who is my typing FOR". A paused thread answers nobody, so what the operator types is
	 * instruction for the agents, queued and acted on at resume. A running thread is a live conversation
	 * the orchestrator is holding, so what the operator types is for the PEOPLE in it.
	 *
	 * NOTE: this INVERTS the previous mapping (`paused ? DIRECT : STEER`). The inversion is the change,
	 * not a side effect of one.
	 *
	 * FALSIFIER: flip the ternary in `GetSessionChat` back and both halves go red at once.
	 */
	it('AC-F4.1 — a PAUSED thread composes a STEER', async () => {
		const t = await thread()
		t.pause()
		await testBed.resolve(ThreadRepository).save(t)

		expect((await chatFor(t.id.value)).composerMode).toBe('STEER')
	})

	it('AC-F4.1 — a RUNNING thread does NOT: it composes a DIRECT message', async () => {
		const t = await thread()

		const chat = await chatFor(t.id.value)

		expect(chat.paused).toBe(false)
		expect(chat.composerMode).toBe('DIRECT')
	})

	it('the mode follows the thread across pause and resume — nothing caches the first answer', async () => {
		const t = await thread()
		const threads = testBed.resolve(ThreadRepository)

		t.pause()
		await threads.save(t)
		expect((await chatFor(t.id.value)).composerMode).toBe('STEER')

		t.resume()
		await threads.save(t)
		expect((await chatFor(t.id.value)).composerMode).toBe('DIRECT')
	})
})

/**
 * WHO SPOKE — the attribution a group conversation is unreadable without.
 *
 * Before this field the CONTACT bubble carried the text and the time and NOTHING else: in a 1:1 the
 * reader could infer the speaker from the header, and in a GROUP — where every inbound line is a
 * different person — it was simply not recoverable from the screen. The data was always there
 * (`transcript_entries.sender_external_id`, written by `ConsumeInboundMessage`); this read discarded
 * it in the `.map()` on the way out.
 *
 * The resolution joins the gateway's contact book by the THREAD's channel — `gateway_remotes` has no
 * owner column of its own, so the thread's own owner gate (asserted a few tests up) is what scopes it.
 */
describe('GetSessionChat — every inbound line names the person who typed it', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	const ADA = '5511900000001@s.whatsapp.net'
	const RAFA = '5511900000002@s.whatsapp.net'
	const ADA_PHOTO = 'https://pps.whatsapp.net/v/t61.24694-24/ada_n.jpg?oh=sig&oe=6900'

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

	/** A group thread with two named contacts in the channel's book — only one of them has a photo. */
	const groupThread = async () => {
		const { channelId } = await givenChannel(testBed, { ownerId: OPERATOR_ID })
		await givenRemote(testBed, { channelId, remoteId: ADA, name: 'Ada Lovelace', avatarUrl: ADA_PHOTO })
		await givenRemote(testBed, { channelId, remoteId: RAFA, name: 'Rafa Lima' })
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, channelId, workspaceId: workspace.id.value })
		return { thread, channelId }
	}

	const senderByText = async (threadId: string) => {
		const chat = await testBed.resolve(GetSessionChat).execute({ ownerId: OPERATOR_ID, threadId })
		return new Map(chat.transcript.map(entry => [entry.text, entry.sender]))
	}

	it('resolves the name and the photo flag per speaker — two contacts on one thread do not share one identity', async () => {
		const { thread, channelId } = await groupThread()
		thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'ada speaks', senderExternalId: ADA })
		thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'rafa speaks', senderExternalId: RAFA })
		await testBed.resolve(ThreadRepository).save(thread)

		const senders = await senderByText(thread.id.value)

		expect(senders.get('ada speaks')).toEqual({ channelId, externalId: ADA, displayName: 'Ada Lovelace', hasAvatar: true })
		// Same thread, same channel, no photo in the book — the flag is per CONTACT, not per thread.
		expect(senders.get('rafa speaks')).toEqual({ channelId, externalId: RAFA, displayName: 'Rafa Lima', hasAvatar: false })
	})

	/**
	 * The operator's own lines are attributed to the `operator` SENTINEL, not to their JID — every
	 * device they type from collapses onto it. There is no contact row behind that word, so a read
	 * that resolved it would either invent a face or hand the console a 404 to draw.
	 */
	it('gives the operator’s own line no identity at all', async () => {
		const { thread } = await groupThread()
		thread.recordEntry({ kind: TranscriptKind.DIRECT, text: 'operator answers', senderExternalId: OPERATOR_PARTICIPANT_ID })
		await testBed.resolve(ThreadRepository).save(thread)

		expect((await senderByText(thread.id.value)).get('operator answers')).toBeUndefined()
	})

	/** The agent's own lines cannot carry a sender at all (`Thread.recordEntry`'s kind×sender matrix). */
	it('gives the agent’s line no identity either', async () => {
		const { thread } = await groupThread()
		thread.recordEntry({ kind: TranscriptKind.SYSTEM, text: 'agent replies' })
		await testBed.resolve(ThreadRepository).save(thread)

		expect((await senderByText(thread.id.value)).get('agent replies')).toBeUndefined()
	})

	/**
	 * The contact sync is eventually consistent — a message can land before the remote's row does. The
	 * line still says WHO said it (by JID), because "somebody unnamed" is strictly more than the
	 * nothing this field replaced.
	 */
	it('still attributes a speaker the contact book has never heard of', async () => {
		const { thread, channelId } = await groupThread()
		const stranger = '5511900000003@s.whatsapp.net'
		thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'unknown speaks', senderExternalId: stranger })
		await testBed.resolve(ThreadRepository).save(thread)

		expect((await senderByText(thread.id.value)).get('unknown speaks')).toEqual({
			channelId,
			externalId: stranger,
			displayName: stranger,
			hasAvatar: false,
		})
	})
})
