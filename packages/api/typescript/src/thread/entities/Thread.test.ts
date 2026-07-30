import { describe, expect, it } from 'bun:test'
import { BaseError } from '@codm/core-typescript'
import { ProviderKind, ContactKind, TranscriptKind, StopKind, StopResolution } from '@codm/contracts-typescript/wire/enums'
import { ThreadStopResolvedEvent } from '../events/ThreadStopResolvedEvent'
import { Thread } from './Thread'

const base = {
	ownerId: '00000000-0000-4000-8000-000000000001',
	channelId: '00000000-0000-4000-8000-0000000000aa',
	contactRef: { externalId: 'c1', displayName: 'Contact', kind: ContactKind.USER },
	workspaceId: '00000000-0000-4000-8000-0000000000bb',
	providers: [ProviderKind.CLAUDE_CODE],
	mentionTag: '@base',
	participants: [
		{ participantId: 'operator', name: 'Operator', source: 'Mac', canInvoke: true },
		{ participantId: 'c1', name: 'Contact', source: 'WA', canInvoke: false },
	],
}

describe('Thread entity', () => {
	it('creates attached, idle, unpaused, and GATED on the minted tag', () => {
		const t = Thread.create(base)
		expect(t.paused).toBe(false)
		// The gate is an INVARIANT, not a default: `mentionTag` is required, so an ungated thread is
		// unconstructible. `AttachThread` mints it from the linked workspace folder.
		expect(t.mentionGate).toEqual({ enabled: true, tag: '@base' })
		expect(t.status).toBe('IDLE')
	})

	it('rejects an empty provider set', () => {
		expect(() => Thread.create({ ...base, providers: [] })).toThrow(BaseError)
	})

	it('rejects a roster with no invoker', () => {
		expect(() =>
			Thread.create({ ...base, participants: [{ participantId: 'c1', name: 'Contact', source: 'WA', canInvoke: false }] }),
		).toThrow(BaseError)
	})

	it('pause() flips status to PAUSED; resume() back to IDLE', () => {
		const t = Thread.create(base)
		t.pause()
		expect(t.paused).toBe(true)
		expect(t.status).toBe('PAUSED')
		t.resume()
		expect(t.paused).toBe(false)
		expect(t.status).toBe('IDLE')
	})

	it('setParticipantInvocation rejects removing the last invoker (LAST_INVOKER)', () => {
		const t = Thread.create(base)
		expect(() => t.setParticipantInvocation('operator', false)).toThrow(BaseError)
	})

	it('setParticipantInvocation rejects an unknown participant (PARTICIPANT_NOT_FOUND)', () => {
		const t = Thread.create(base)
		expect(() => t.setParticipantInvocation('nobody', true)).toThrow(BaseError)
	})

	it('canInvoke: false when paused', () => {
		const t = Thread.create(base)
		t.pause()
		// CITES the tag, so the refusal can only come from the pause — with a bare 'hi' this test would
		// pass on the mention gate and prove nothing about pausing.
		expect(t.canInvoke({ senderExternalId: 'operator', text: '@base hi' })).toBe(false)
	})

	it('canInvoke: false when the sender is a read-only participant', () => {
		const t = Thread.create(base)
		// Cites the tag for the same reason as above: isolate the participant-deny branch.
		expect(t.canInvoke({ senderExternalId: 'c1', text: '@base hi' })).toBe(false)
	})

	it('canInvoke: mention gate requires the tag as a STANDALONE token', () => {
		const t = Thread.create(base)
		t.configureMentionGate({ enabled: true, tag: '@bot' })
		expect(t.canInvoke({ senderExternalId: 'operator', text: 'hello' })).toBe(false)
		expect(t.canInvoke({ senderExternalId: 'operator', text: 'hey @bot go' })).toBe(true)
		// Case-insensitive: the mint lowercases while every UI surface renders the raw folder path, so an
		// operator reading `/Users/x/MyApp` tells the group to type `@MyApp`.
		expect(t.canInvoke({ senderExternalId: 'operator', text: 'hey @BOT go' })).toBe(true)
		// THE REASON THIS IS NOT `String.includes`. The tag is derived from a folder name, so it collides
		// with the vocabulary of the project it names — this repo's own packages are `@codm/*` and its
		// live thread mints `@codedm`. A scoped package name must NOT summon the agent.
		expect(t.canInvoke({ senderExternalId: 'operator', text: 'bump @bot/core to 2.0' })).toBe(false)
		expect(t.canInvoke({ senderExternalId: 'operator', text: 'see bot.ts and @botanical' })).toBe(false)
	})

	it('textWithoutMention strips the citation, and never empties a bare summon', () => {
		const t = Thread.create(base)
		expect(t.textWithoutMention('@base fix the login bug')).toBe('fix the login bug')
		// A bare summon strips to '' — which `RunIssueTurn`'s `prompt: z.string().trim().min(1)` rejects,
		// turning the most natural message in the product into a thrown VALIDATION_ERROR. Fall back.
		expect(t.textWithoutMention('@base')).toBe('@base')
		// Gate off ⇒ verbatim.
		t.configureMentionGate({ enabled: false })
		expect(t.textWithoutMention('@base hi')).toBe('@base hi')
	})

	/**
	 * The mirror-image locks are GONE (founder, 29-jul). They allowed steering only while live and
	 * direct messages only while paused, so exactly one of the two actions was legal at any moment —
	 * fine while a selector let the operator choose, fatal once F4 made the composer a function of
	 * pause state, because then every message hit the lock for the state it was in.
	 *
	 * Asserted as an ABSENCE on the aggregate rather than by calling the removed methods (which would
	 * not compile): the point is that the entity does not arbitrate this at all any more.
	 */
	it('neither mode is gated by pause any more — the aggregate carries no steer/direct lock', () => {
		const t = Thread.create(base) as unknown as Record<string, unknown>

		expect(t.assertCanSteer).toBeUndefined()
		expect(t.assertCanSendDirect).toBeUndefined()
	})

	/**
	 * A REPLY to the agent is addressing it, so the mention gate steps aside.
	 *
	 * The gate exists to ask "is this for the agent?", and quoting its message answers that better than
	 * a typed tag does: replying is reflex, remembering `@codedm` is a convention. Untagged replies used
	 * to fall on the floor — the operator answered the agent's own question and nothing happened.
	 */
	it('a reply to the agent invokes WITHOUT the mention tag, while the same text alone does not', () => {
		const t = Thread.create(base)
		const untagged = { senderExternalId: 'operator', text: 'sim, pode fazer' }

		expect(t.canInvoke(untagged)).toBe(false)
		expect(t.canInvoke({ ...untagged, repliesToAgent: true })).toBe(true)
	})

	it('a reply does NOT buy permission — pause and read-only participants still win', () => {
		const paused = Thread.create(base)
		paused.pause()
		expect(paused.canInvoke({ senderExternalId: 'operator', text: 'oi', repliesToAgent: true })).toBe(false)

		// `c1` is read-only in the fixture. It may quote the agent all day: a quote is address, not rights.
		const live = Thread.create(base)
		expect(live.canInvoke({ senderExternalId: 'c1', text: 'oi', repliesToAgent: true })).toBe(false)
	})
})

/**
 * B4 decision 2 — the two invariants nobody enforced before. Pure entity, no DB (AC-1/AC-2).
 *
 * THE FALSIFIER, and it is the reason this Task exists at all: `TranscriptRepository.append()` accepted
 * every one of the four cases below and inserted the row. So each case is written to FAIL if the guard
 * is deleted — comment out the corresponding `throw` in `recordEntry` and the matching `it` goes red
 * with a useful message, rather than passing because nothing was asserted.
 */
describe('Thread.recordEntry — the thread owns who may cite what, and who needs a sender', () => {
	const threadOf = (mentionTag = '@ws') =>
		Thread.create({
			ownerId: base.ownerId,
			channelId: base.channelId,
			contactRef: { externalId: 'contact-1', displayName: 'Contact', kind: ContactKind.USER },
			workspaceId: base.workspaceId,
			providers: [ProviderKind.CLAUDE_CODE],
			mentionTag,
			participants: [{ participantId: 'operator', name: 'Operator', source: 'console', canInvoke: true }],
		})

	// ── AC-1: quotedEntry must belong to THIS thread ───────────────────────────────────────────────

	it('AC-1 FALSEADOR — a citation of an entry from ANOTHER thread is rejected and nothing is accumulated', () => {
		const threadA = threadOf()
		const threadB = threadOf()
		const e1 = threadA.recordEntry({ kind: TranscriptKind.CONTACT, text: 'olá', senderExternalId: 'contact-1' })

		expect(() =>
			threadB.recordEntry({
				kind: TranscriptKind.CONTACT,
				text: 'respondendo',
				senderExternalId: 'contact-1',
				quotedEntry: { entryId: e1.entryId, threadId: threadA.id.value },
			}),
		).toThrow(expect.objectContaining({ name: 'QUOTED_ENTRY_NOT_IN_THREAD' }))

		// The REJECTION half: a thrown invariant must leave the aggregate untouched. Without this the
		// guard could throw AFTER pushing and the test above would still pass.
		expect(threadB.pullPendingWrites().entries).toHaveLength(0)
	})

	it('a citation of an entry of the SAME thread is accepted, including one recorded in this same unit of work', () => {
		const thread = threadOf()
		const first = thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'pergunta', senderExternalId: 'contact-1' })

		const second = thread.recordEntry({
			kind: TranscriptKind.SYSTEM,
			text: 'resposta',
			quotedEntry: { entryId: first.entryId, threadId: thread.id.value },
		})

		expect(second.quotedEntryId).toBe(first.entryId)
		expect(thread.pullPendingWrites().entries).toHaveLength(2)
	})

	// ── AC-2: the kind × sender matrix ────────────────────────────────────────────────────────────

	it('AC-2 FALSEADOR — CONTACT without a sender is rejected', () => {
		const thread = threadOf()

		expect(() => thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'quem falou?' })).toThrow(
			expect.objectContaining({ name: 'CONTACT_ENTRY_REQUIRES_SENDER' }),
		)
		expect(thread.pullPendingWrites().entries).toHaveLength(0)
	})

	it('AC-2 FALSEADOR — SYSTEM and WHISPER carrying a contact sender are both rejected', () => {
		const thread = threadOf()

		expect(() => thread.recordEntry({ kind: TranscriptKind.SYSTEM, text: 'pronto', senderExternalId: 'contact-1' })).toThrow(
			expect.objectContaining({ name: 'AGENT_ENTRY_FORBIDS_SENDER' }),
		)
		expect(() => thread.recordEntry({ kind: TranscriptKind.WHISPER, text: 'pergunte de novo', senderExternalId: 'contact-1' })).toThrow(
			expect.objectContaining({ name: 'AGENT_ENTRY_FORBIDS_SENDER' }),
		)
		expect(thread.pullPendingWrites().entries).toHaveLength(0)
	})

	it('the four production shapes all pass — CONTACT with sender, SYSTEM/WHISPER without, DIRECT unconstrained', () => {
		const thread = threadOf()

		thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'oi', senderExternalId: 'contact-1' })
		thread.recordEntry({ kind: TranscriptKind.SYSTEM, text: 'oi de volta' })
		thread.recordEntry({ kind: TranscriptKind.WHISPER, text: 'seja breve' })
		thread.recordEntry({ kind: TranscriptKind.DIRECT, text: 'eu mesmo respondo' })

		expect(thread.pullPendingWrites().entries.map(e => e.kind)).toEqual([
			TranscriptKind.CONTACT,
			TranscriptKind.SYSTEM,
			TranscriptKind.WHISPER,
			TranscriptKind.DIRECT,
		])
	})

	// ── The record the callers depend on ──────────────────────────────────────────────────────────

	it('mints the id SYNCHRONOUSLY and stamps owner + thread from the aggregate', () => {
		const thread = threadOf()

		const entry = thread.recordEntry({ kind: TranscriptKind.DIRECT, text: 'texto' })

		expect(entry.entryId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/)
		expect(entry.ownerId).toBe(thread.ownerId)
		expect(entry.threadId).toBe(thread.id.value)
	})

	it('pullPendingWrites DRAINS — a second call returns nothing, so a re-saved instance cannot double-insert', () => {
		const thread = threadOf()
		thread.recordEntry({ kind: TranscriptKind.DIRECT, text: 'uma vez' })

		expect(thread.pullPendingWrites().entries).toHaveLength(1)
		expect(thread.pullPendingWrites().entries).toHaveLength(0)
	})
})

/**
 * B4 spec decision 4 — the Stop as a child of the Thread. Pure entity, no DB.
 *
 * The first case is the one the whole re-parenting exists for: it was UNREACHABLE before, because both
 * `RaiseStopInputSchema` and `AskOperatorInputSchema` demanded an `issueId`.
 */
describe('Thread.raiseStop / resolveStop — a stop belongs to the thread, with or without an issue', () => {
	const threadOf = () =>
		Thread.create({
			ownerId: base.ownerId,
			channelId: base.channelId,
			contactRef: { externalId: 'contact-1', displayName: 'Contact', kind: ContactKind.USER },
			workspaceId: base.workspaceId,
			providers: [ProviderKind.CLAUDE_CODE],
			mentionTag: '@ws',
			participants: [{ participantId: 'operator', name: 'Operator', source: 'console', canInvoke: true }],
		})

	it('US-5 — a stop with NO issue is raised, and carries the owner + thread from the aggregate', () => {
		const thread = threadOf()

		const stop = thread.raiseStop({ kind: StopKind.HUMAN_REQUESTED, title: 'preciso de você', detail: '' })

		expect(stop.issueId).toBeUndefined()
		expect(stop.ownerId).toBe(thread.ownerId)
		expect(stop.threadId).toBe(thread.id.value)
		expect(thread.pullPendingWrites().stops).toHaveLength(1)
	})

	it('honours a stopId decided upstream — a redelivered fact lands on the same row', () => {
		const thread = threadOf()
		const stopId = '019e4d24-6524-7041-9e1c-8108180cddb1'

		expect(thread.raiseStop({ stopId, kind: StopKind.APPROVAL_NEEDED, title: 't', detail: 'd' }).stopId).toBe(stopId)
	})

	it('raiseStop raises NO domain event — the integration fact is its CAUSE, not its effect', () => {
		const thread = threadOf()

		thread.raiseStop({ kind: StopKind.SERVER_ERROR, title: 't', detail: 'd' })

		expect(thread.pullDomainEvents()).toHaveLength(0)
	})

	it('FALSEADOR — resolving a stop of ANOTHER thread is rejected', () => {
		const threadA = threadOf()
		const threadB = threadOf()
		const stop = threadA.raiseStop({ kind: StopKind.APPROVAL_NEEDED, title: 't', detail: 'd' })

		expect(() => threadB.resolveStop(stop, StopResolution.APPROVE)).toThrow(expect.objectContaining({ name: 'STOP_NOT_IN_THREAD' }))
		expect(threadB.pullPendingWrites().stopResolutions).toHaveLength(0)
	})

	it('FALSEADOR — a resolution that does not apply to the kind is rejected (APPROVE only on APPROVAL_NEEDED)', () => {
		const thread = threadOf()
		const serverError = thread.raiseStop({ kind: StopKind.SERVER_ERROR, title: 't', detail: 'd' })

		expect(() => thread.resolveStop(serverError, StopResolution.APPROVE)).toThrow(
			expect.objectContaining({ name: 'RESOLUTION_NOT_APPLICABLE' }),
		)
		// TAKE_OVER applies to every kind — the guard rejects the wrong pair, not every pair.
		thread.resolveStop(serverError, StopResolution.TAKE_OVER)
		expect(thread.pullPendingWrites().stopResolutions).toHaveLength(1)
	})

	it('FALSEADOR — resolving an already-resolved stop is rejected', () => {
		const thread = threadOf()
		const resolved = { ...thread.raiseStop({ kind: StopKind.SERVER_ERROR, title: 't', detail: 'd' }), resolvedAt: new Date() }

		expect(() => thread.resolveStop(resolved, StopResolution.RETRY)).toThrow(expect.objectContaining({ name: 'STOP_ALREADY_RESOLVED' }))
	})

	it('resolveStop raises thread.stop_resolved, carrying threadId always and issueId only when there is one', () => {
		const thread = threadOf()
		const withoutIssue = thread.raiseStop({ kind: StopKind.HUMAN_REQUESTED, title: 't', detail: 'd' })

		thread.resolveStop(withoutIssue, StopResolution.TAKE_OVER)

		const [event] = thread.pullDomainEvents()
		expect(event).toBeInstanceOf(ThreadStopResolvedEvent)
		expect((event as ThreadStopResolvedEvent).payload).toMatchObject({
			stopId: withoutIssue.stopId,
			threadId: thread.id.value,
			resolution: StopResolution.TAKE_OVER,
		})
		expect((event as ThreadStopResolvedEvent).payload.issueId).toBeUndefined()
	})
})
