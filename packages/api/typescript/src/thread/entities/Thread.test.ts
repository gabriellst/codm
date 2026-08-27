import { describe, expect, it } from 'bun:test'
import { BaseError } from '@codm/core-typescript'
import {
	ProviderKind,
	AgentModelId,
	ContactKind,
	TranscriptKind,
	StopKind,
	StopResolution,
	ThreadStatus,
	Language,
} from '@codm/contracts-typescript/wire/enums'
import { ThreadStopResolvedEvent } from '../events/ThreadStopResolvedEvent'
import { CUSTOM_PROMPT_MAX_LENGTH } from '../schemas'
import { INVOCATION_FRESHNESS_WINDOW_MS, Thread } from './Thread'

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
		expect(t.status).toBe(ThreadStatus.IDLE)
		// Default ON (thinking-indicator spec, per-thread setting) — the pre-existing always-on behaviour.
		expect(t.thinkingIndicatorEnabled).toBe(true)
	})

	it('configureThinkingIndicator flips the "Pensando" placeholder setting for this thread', () => {
		const t = Thread.create(base)
		expect(t.thinkingIndicatorEnabled).toBe(true)

		t.configureThinkingIndicator(false)
		expect(t.thinkingIndicatorEnabled).toBe(false)

		t.configureThinkingIndicator(true)
		expect(t.thinkingIndicatorEnabled).toBe(true)
	})

	it('is born with NO language of its own — absence is what "follow the account default" means', () => {
		const t = Thread.create(base)
		// NOT `Language.PT_BR`. A stored default and an inherited one behave identically today and diverge
		// the moment the operator changes their account language, so only one of them may be representable
		// for "nobody chose" — and absence is it.
		expect(t.language).toBeUndefined()
	})

	it("configureLanguage declares the conversation's language, and undefined hands it back to the account", () => {
		const t = Thread.create(base)

		t.configureLanguage(Language.EN_US)
		expect(t.language).toBe(Language.EN_US)

		t.configureLanguage(Language.PT_BR)
		expect(t.language).toBe(Language.PT_BR)

		// The ERASE — and it is a distinct state from having chosen pt-BR right above.
		t.configureLanguage(undefined)
		expect(t.language).toBeUndefined()
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
		expect(t.status).toBe(ThreadStatus.PAUSED)
		t.resume()
		expect(t.paused).toBe(false)
		expect(t.status).toBe(ThreadStatus.IDLE)
	})

	it('setParticipantInvocation rejects removing the last invoker (LAST_INVOKER)', () => {
		const t = Thread.create(base)
		expect(() => t.setParticipantInvocation('operator', false)).toThrow(BaseError)
	})

	it('setParticipantInvocation rejects an unknown participant (PARTICIPANT_NOT_FOUND)', () => {
		const t = Thread.create(base)
		expect(() => t.setParticipantInvocation('nobody', true)).toThrow(BaseError)
	})

	it('addressedToAgent: false when paused', () => {
		const t = Thread.create(base)
		t.pause()
		// CITES the tag, so the refusal can only come from the pause — with a bare 'hi' this test would
		// pass on the mention gate and prove nothing about pausing.
		expect(t.addressedToAgent({ senderExternalId: 'operator', text: '@base hi' })).toBe(false)
	})

	it('addressedToAgent: false when the sender is a read-only participant', () => {
		const t = Thread.create(base)
		// Cites the tag for the same reason as above: isolate the participant-deny branch.
		expect(t.addressedToAgent({ senderExternalId: 'c1', text: '@base hi' })).toBe(false)
	})

	it('addressedToAgent: mention gate requires the tag as a STANDALONE token', () => {
		const t = Thread.create(base)
		t.configureMentionGate({ enabled: true, tag: '@bot' })
		expect(t.addressedToAgent({ senderExternalId: 'operator', text: 'hello' })).toBe(false)
		expect(t.addressedToAgent({ senderExternalId: 'operator', text: 'hey @bot go' })).toBe(true)
		// Case-insensitive: the mint lowercases while every UI surface renders the raw folder path, so an
		// operator reading `/Users/x/MyApp` tells the group to type `@MyApp`.
		expect(t.addressedToAgent({ senderExternalId: 'operator', text: 'hey @BOT go' })).toBe(true)
		// THE REASON THIS IS NOT `String.includes`. The tag is derived from a folder name, so it collides
		// with the vocabulary of the project it names — this repo's own packages are `@codm/*` and its
		// live thread mints `@codm`. A scoped package name must NOT summon the agent.
		expect(t.addressedToAgent({ senderExternalId: 'operator', text: 'bump @bot/core to 2.0' })).toBe(false)
		expect(t.addressedToAgent({ senderExternalId: 'operator', text: 'see bot.ts and @botanical' })).toBe(false)
	})

	/**
	 * BLANK MEANS ERASE, and it is decided exactly here.
	 *
	 * The console sends the contents of a textarea, so "the operator cleared the box" arrives as `''` and
	 * "the operator left a stray newline" arrives as `'\n'`. Neither is an instruction. If either were
	 * stored, "no custom prompt" would have three spellings and every reader downstream — the settings
	 * DTO, the persistence mapper, the prompt builder that renders a heading iff there is text — would
	 * have to normalize it independently. The first one to forget prints an empty `INSTRUCTIONS FROM THE
	 * OPERATOR` heading into a real conversation's system prompt.
	 */
	it('configurePrompt: text is kept trimmed; blank and whitespace ERASE it', () => {
		const t = Thread.create(base)
		expect(t.customPrompt).toBeUndefined()

		t.configurePrompt('  Fale sempre em inglês com este cliente.  ')
		expect(t.customPrompt).toBe('Fale sempre em inglês com este cliente.')

		t.configurePrompt('')
		expect(t.customPrompt).toBeUndefined()

		t.configurePrompt('Nunca prometa prazo.')
		t.configurePrompt('   \n  ')
		expect(t.customPrompt).toBeUndefined()

		// Omission erases too — an MCP client with no concept of an empty text box sends nothing.
		t.configurePrompt('Nunca prometa prazo.')
		t.configurePrompt(undefined)
		expect(t.customPrompt).toBeUndefined()
	})

	/**
	 * The cap is an INVARIANT, not a form hint. This text is prepended to every turn this conversation
	 * ever answers, so an unbounded box is an unbounded per-message cost the operator pays forever.
	 *
	 * Asserted on the CODE, never the message: the code is what the console translates and what the
	 * frontend's error catalogue is compile-time checked against. It reaches `BaseError` because
	 * `CustomPromptSchema` carries `error: 'PROMPT_TOO_LONG'` on its `.max()` — the house way of naming
	 * an invariant the schema owns, rather than re-checking the length inside the behaviour.
	 */
	it('configurePrompt: refuses a prompt past the cap with PROMPT_TOO_LONG', () => {
		const t = Thread.create(base)
		expect(() => t.configurePrompt('x'.repeat(CUSTOM_PROMPT_MAX_LENGTH + 1))).toThrow(expect.objectContaining({ name: 'PROMPT_TOO_LONG' }))
		// Exactly at the cap is ALLOWED — an off-by-one here is a limit the operator cannot reach.
		expect(() => t.configurePrompt('x'.repeat(CUSTOM_PROMPT_MAX_LENGTH))).not.toThrow()
	})

	/**
	 * Re-attaching a deleted conversation resets the control plane — pause, status, buffer, roster, tag —
	 * because each of those is either something the wizard just re-chose or part of what a fresh thread
	 * IS. The operator's own instructions are neither, and the wizard never asks for them, so clearing
	 * them would destroy hand-written text with nothing in the flow that hints it happened.
	 */
	it('revive() keeps the operator custom prompt while resetting everything else', () => {
		const t = Thread.create(base)
		t.configurePrompt('Fale sempre em inglês com este cliente.')
		t.pause()
		t.delete()

		t.revive({ ...base, contactRef: base.contactRef })

		expect(t.customPrompt).toBe('Fale sempre em inglês com este cliente.')
		expect(t.paused).toBe(false)
		expect(t.deletedAt).toBeUndefined()
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
	 * a typed tag does: replying is reflex, remembering `@codm` is a convention. Untagged replies used
	 * to fall on the floor — the operator answered the agent's own question and nothing happened.
	 */
	it('a reply to the agent invokes WITHOUT the mention tag, while the same text alone does not', () => {
		const t = Thread.create(base)
		const untagged = { senderExternalId: 'operator', text: 'sim, pode fazer' }

		expect(t.addressedToAgent(untagged)).toBe(false)
		expect(t.addressedToAgent({ ...untagged, repliesToAgent: true })).toBe(true)
	})

	it('a reply does NOT buy permission — pause and read-only participants still win', () => {
		const paused = Thread.create(base)
		paused.pause()
		expect(paused.addressedToAgent({ senderExternalId: 'operator', text: 'oi', repliesToAgent: true })).toBe(false)

		// `c1` is read-only in the fixture. It may quote the agent all day: a quote is address, not rights.
		const live = Thread.create(base)
		expect(live.addressedToAgent({ senderExternalId: 'c1', text: 'oi', repliesToAgent: true })).toBe(false)
	})

	/**
	 * THE BOUNDARY, pinned deterministically. Both instants are parameters, so this is the one place
	 * the exact tie can be asserted without racing wall time — a use-case-level version would have to
	 * subtract from `Date.now()` and lose milliseconds to the trip through the repository.
	 *
	 * The choice under test: `age <= window` invokes, `age > window` does not.
	 */
	it('canInvoke: the freshness window is INCLUSIVE at exactly 5 minutes, and refuses one ms past it', () => {
		const t = Thread.create(base)
		const now = new Date('2026-07-31T12:00:00.000Z')
		// A THIRD PARTY, deliberately — not the operator, who is exempt from the window (next test).
		// Pinning the boundary with the exempt sender would assert nothing: it would return true on
		// both sides of the tie.
		const summon = { senderExternalId: 'teammate', text: '@base ship it', now }

		expect(INVOCATION_FRESHNESS_WINDOW_MS).toBe(5 * 60 * 1000)

		// 4:59.999 — inside.
		expect(t.canInvoke({ ...summon, sentAt: new Date(now.getTime() - (INVOCATION_FRESHNESS_WINDOW_MS - 1)) })).toBe(true)
		// 5:00.000 exactly — THE TIE, and it goes to answering the human (platform send times land on
		// whole seconds, so a message on the tick is a rounding artifact, not a decision).
		expect(t.canInvoke({ ...summon, sentAt: new Date(now.getTime() - INVOCATION_FRESHNESS_WINDOW_MS) })).toBe(true)
		// 5:00.001 — out. One millisecond is the whole difference, which is what makes `<=` a CHOICE.
		expect(t.canInvoke({ ...summon, sentAt: new Date(now.getTime() - (INVOCATION_FRESHNESS_WINDOW_MS + 1)) })).toBe(false)
	})

	/**
	 * THE OPERATOR IS NOT A BACKLOG.
	 *
	 * Measured 2026-08-05: the gateway lost its socket and, on reconnect, replayed eleven minutes of
	 * traffic with every `observedAt` collapsed onto one instant. Among it was the operator's own
	 * "Consegue mergear esse pr na main?", sent 650s earlier — 350s past the window. It was
	 * transcribed like any other message and never got a turn, so it sat in the chat looking
	 * delivered while nothing answered it.
	 *
	 * The window exists to stop a REPLAY OF CONVERSATION from scheduling a turn per message — the
	 * constant's own note names the fear exactly: "the agent answers an hour of conversation in one
	 * burst, in someone's real chat". The operator's own line is not conversation to react to, it is
	 * the INSTRUCTION, and a late instruction is still the instruction. Third parties keep the window,
	 * which is where the flood actually comes from.
	 *
	 * Why the rule is not "the latest operator message": at ingest time nothing knows it is the
	 * latest. A replay arrives oldest-first, so each message in turn IS the newest the thread has
	 * seen, and "latest" would admit all of them — identical behaviour to this rule, with a lookup
	 * bolted on to disguise it.
	 */
	it('canInvoke: the operator is exempt from the freshness window; a third party is not', () => {
		const t = Thread.create(base)
		const now = new Date('2026-07-31T12:00:00.000Z')
		// 11 minutes — the measured 2026-08-05 gap, rounded up. More than twice the window.
		const longStale = new Date(now.getTime() - 11 * 60 * 1000)

		expect(t.canInvoke({ senderExternalId: 'operator', text: '@base ship it', sentAt: longStale, now })).toBe(true)
		expect(t.canInvoke({ senderExternalId: 'teammate', text: '@base ship it', sentAt: longStale, now })).toBe(false)
	})

	/**
	 * The exemption is about FRESHNESS ONLY — it does not make the operator omnipotent. A paused
	 * thread still refuses them, because pause is a decision the operator themselves made and a stale
	 * message must not sneak past it.
	 */
	it('canInvoke: the operator exemption does not survive a paused thread', () => {
		const t = Thread.create(base)
		t.pause()
		const now = new Date('2026-07-31T12:00:00.000Z')

		expect(t.canInvoke({ senderExternalId: 'operator', text: '@base ship it', sentAt: now, now })).toBe(false)
	})

	/**
	 * Clock skew on the PLATFORM side must not mute anybody. A `sentAt` in the future yields a negative
	 * age, and `age <= window` admits it — deliberately, and asserted so nobody "fixes" it into a
	 * `Math.abs` that would start dropping messages from a phone whose clock runs fast.
	 */
	it('canInvoke: a future-dated sentAt (platform clock skew) is fresh, not stale', () => {
		const t = Thread.create(base)
		const now = new Date('2026-07-31T12:00:00.000Z')
		const sentAt = new Date(now.getTime() + 60 * 1000) // the phone thinks it is one minute later

		expect(t.canInvoke({ senderExternalId: 'operator', text: '@base ship it', sentAt, now })).toBe(true)
	})
})

/**
 * The per-provider model choice. Pure entity, no DB.
 *
 * THE FALSIFIER of the whole feature is the first two cases: `DEFAULT` must not be STORED, because a
 * stored `DEFAULT` is a second spelling of "nothing chosen" that the dispatcher, the mapper and the
 * settings DTO would each have to normalize on their own — and the first one to forget hands
 * `--model DEFAULT` to a binary with no such alias. Delete the collapse in `configureModel` and the
 * `erases` case goes red on the persisted shape, not merely on the read.
 */
describe('Thread.configureModel / modelFor — one model per provider, absence IS the default', () => {
	const bothProviders = { ...base, providers: [ProviderKind.CLAUDE_CODE, ProviderKind.CODEX] }

	it('starts with no choice at all, and reads back as DEFAULT', () => {
		const t = Thread.create(base)
		expect(t.modelByProvider).toEqual({})
		expect(t.modelFor(ProviderKind.CLAUDE_CODE)).toBe(AgentModelId.DEFAULT)
	})

	it('records a choice and reads it back', () => {
		const t = Thread.create(base)
		t.configureModel(ProviderKind.CLAUDE_CODE, AgentModelId.OPUS)
		expect(t.modelFor(ProviderKind.CLAUDE_CODE)).toBe(AgentModelId.OPUS)
		expect(t.modelByProvider).toEqual({ [ProviderKind.CLAUDE_CODE]: AgentModelId.OPUS })
	})

	it('erases the key on DEFAULT rather than storing it — one spelling of "nothing chosen"', () => {
		const t = Thread.create(base)
		t.configureModel(ProviderKind.CLAUDE_CODE, AgentModelId.OPUS)
		t.configureModel(ProviderKind.CLAUDE_CODE, AgentModelId.DEFAULT)

		expect(t.modelByProvider).toEqual({})
		expect(t.modelFor(ProviderKind.CLAUDE_CODE)).toBe(AgentModelId.DEFAULT)
	})

	it('keeps the choices of the OTHER providers when one changes', () => {
		const t = Thread.create(bothProviders)
		t.configureModel(ProviderKind.CLAUDE_CODE, AgentModelId.SONNET)
		t.configureModel(ProviderKind.CLAUDE_CODE, AgentModelId.HAIKU)

		expect(t.modelFor(ProviderKind.CLAUDE_CODE)).toBe(AgentModelId.HAIKU)
		// CODEX offers nothing, so it was never choosable — and it still reads as the default.
		expect(t.modelFor(ProviderKind.CODEX)).toBe(AgentModelId.DEFAULT)
	})

	it('refuses a provider this conversation does not run (PROVIDER_NOT_BOUND), leaving the map untouched', () => {
		const t = Thread.create(base)
		expect(() => t.configureModel(ProviderKind.CODEX, AgentModelId.OPUS)).toThrow(BaseError)
		expect(t.modelByProvider).toEqual({})
	})

	it('refuses a model the provider does not offer (MODEL_NOT_AVAILABLE), leaving the map untouched', () => {
		const t = Thread.create(bothProviders)
		t.configureModel(ProviderKind.CLAUDE_CODE, AgentModelId.OPUS)
		// CODEX is BOUND here — so this can only be refused by the catalog lookup, not by the bound check.
		expect(() => t.configureModel(ProviderKind.CODEX, AgentModelId.OPUS)).toThrow(BaseError)
		expect(t.modelByProvider).toEqual({ [ProviderKind.CLAUDE_CODE]: AgentModelId.OPUS })
	})

	it('names the two refusals apart — the codes are what the console renders', () => {
		const t = Thread.create(bothProviders)
		expect(() => t.configureModel(ProviderKind.OPENCODE, AgentModelId.OPUS)).toThrow(
			expect.objectContaining({ name: 'PROVIDER_NOT_BOUND' }),
		)
		expect(() => t.configureModel(ProviderKind.CODEX, AgentModelId.OPUS)).toThrow(expect.objectContaining({ name: 'MODEL_NOT_AVAILABLE' }))
	})

	/**
	 * `revive()` keeps the choice — the wizard never asks for a model, so clearing it would destroy a
	 * setting with nothing in the flow that hints it happened (the same argument `customPrompt` makes).
	 * But it keeps it NARROWED: re-attaching with a different CLI must not leave behind a choice for a
	 * provider this conversation no longer runs, which is exactly what `PROVIDER_NOT_BOUND` forbids on
	 * the write path. Without the filter, that invariant would be true of writes and false of states.
	 */
	it('revive keeps the choices of providers still bound and drops the rest', () => {
		const t = Thread.create(bothProviders)
		t.configureModel(ProviderKind.CLAUDE_CODE, AgentModelId.OPUS)
		t.delete()

		t.revive({
			contactRef: base.contactRef,
			workspaceId: base.workspaceId,
			providers: [ProviderKind.CODEX],
			mentionTag: '@base',
			participants: base.participants,
		})

		expect(t.modelByProvider).toEqual({})
	})

	it('revive keeps a choice whose provider is re-chosen', () => {
		const t = Thread.create(base)
		t.configureModel(ProviderKind.CLAUDE_CODE, AgentModelId.HAIKU)
		t.delete()

		t.revive({
			contactRef: base.contactRef,
			workspaceId: base.workspaceId,
			providers: [ProviderKind.CLAUDE_CODE],
			mentionTag: '@base',
			participants: base.participants,
		})

		expect(t.modelFor(ProviderKind.CLAUDE_CODE)).toBe(AgentModelId.HAIKU)
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

	// ── Soft delete (thread-deletion spec, decisions 1, 4 and 8) ────────────────────────────────────

	it('delete() stamps deletedAt — a born thread has none', () => {
		const t = Thread.create(base)
		expect(t.deletedAt).toBeUndefined()

		t.delete()

		expect(t.deletedAt).toBeInstanceOf(Date)
	})

	it('AC-1 — deleting twice is rejected (THREAD_ALREADY_DELETED)', () => {
		const t = Thread.create(base)
		t.delete()

		expect(() => t.delete()).toThrow(expect.objectContaining({ name: 'THREAD_ALREADY_DELETED' }))
	})

	/**
	 * AC-5, the ENTITY half. The row SURVIVES a delete, so reviving it is a state transition on the same
	 * aggregate rather than a construction — which is exactly why `AttachThread` cannot simply call
	 * `Thread.create` again: the unique on (owner, channel, contact) would reject the insert (decision 4).
	 */
	it('revive() keeps the thinking-indicator setting — the wizard never asks about it, like customPrompt', () => {
		const t = Thread.create(base)
		t.configureThinkingIndicator(false)
		t.delete()

		t.revive({
			contactRef: base.contactRef,
			workspaceId: base.workspaceId,
			providers: base.providers,
			mentionTag: '@base',
			participants: base.participants,
		})

		expect(t.thinkingIndicatorEnabled).toBe(false)
	})

	it('revive() keeps the declared language — re-deriving it is the detection the spec forbids', () => {
		const t = Thread.create(base)
		t.configureLanguage(Language.EN_US)
		t.delete()

		t.revive({
			contactRef: base.contactRef,
			workspaceId: base.workspaceId,
			providers: base.providers,
			mentionTag: '@base',
			participants: base.participants,
		})

		expect(t.language).toBe(Language.EN_US)
	})

	it('AC-5 — revive() clears deletedAt and re-applies the new attach settings', () => {
		const t = Thread.create(base)
		t.pause()
		t.delete()

		t.revive({
			contactRef: { externalId: 'c1', displayName: 'Contact Renamed', kind: ContactKind.USER },
			workspaceId: '00000000-0000-4000-8000-0000000000cc',
			providers: [ProviderKind.CODEX],
			mentionTag: '@other-workspace',
			participants: [
				{ participantId: 'operator', name: 'Operator', source: 'Mac', canInvoke: true },
				{ participantId: 'c1', name: 'Contact Renamed', source: 'WA', canInvoke: false },
			],
		})

		expect(t.deletedAt).toBeUndefined()
		expect(t.workspaceId).toBe('00000000-0000-4000-8000-0000000000cc')
		expect(t.providers).toEqual([ProviderKind.CODEX])
		expect(t.mentionGate).toEqual({ enabled: true, tag: '@other-workspace' })
		expect(t.contactRef.displayName).toBe('Contact Renamed')
		// A revived thread behaves like a freshly attached one — the pause it carried to its grave does
		// not survive the re-configuration.
		expect(t.paused).toBe(false)
		expect(t.status).toBe(ThreadStatus.IDLE)
	})

	it('revive() keeps the create-time invariants — no providers, no invoker, no revival', () => {
		const deleted = () => {
			const t = Thread.create(base)
			t.delete()
			return t
		}
		const settings = { contactRef: base.contactRef, workspaceId: base.workspaceId, mentionTag: '@base' }

		expect(() => deleted().revive({ ...settings, providers: [], participants: base.participants })).toThrow(
			expect.objectContaining({ name: 'NO_PROVIDER_SELECTED' }),
		)
		expect(() =>
			deleted().revive({
				...settings,
				providers: [ProviderKind.CLAUDE_CODE],
				participants: [{ participantId: 'c1', name: 'Contact', source: 'WA', canInvoke: false }],
			}),
		).toThrow(expect.objectContaining({ name: 'LAST_INVOKER' }))
	})
})
