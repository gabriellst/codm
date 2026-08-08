import { AggregateRoot, BaseError, Id, z } from '@codm/core-typescript'
import type Z from 'zod'
import {
	ProviderKind,
	AgentModelId,
	ContactKind,
	ThreadStatus,
	BufferSize,
	TranscriptKind,
	ClassificationMethod,
	StopKind,
	StopResolution,
} from '@codm/contracts-typescript/wire/enums'
// The DECLARED provider → models relation. A constant, no I/O — same family of import as the wire
// enums above, and deliberately the `/catalog` subpath rather than `/db`, so nothing about this line
// reads as persistence leaking into the domain.
import { effectiveModel, offersModel } from '@codm/contracts/catalog'
import type { DomainErrors } from '../errors'
import { OPERATOR_PARTICIPANT_ID } from '../objects/TranscriptSpeaker'
import { mentionsTag, stripMentionTag, MentionGateSchema, CustomPromptSchema } from '../schemas'
import { isResolutionApplicable } from '../utils/StopResolutions'
import { ThreadStopResolvedEvent } from '../events/ThreadStopResolvedEvent'

// ContactRef VO (embedded) — the channel counterparty. channelId lives on the Thread itself.
export const ContactRefSchema = z.object({
	externalId: z.string().min(1),
	displayName: z.string().min(1),
	kind: z.enum(ContactKind),
})

// Participant VO — everyone in the conversation; `canInvoke` gates who may trigger agents.
export const ParticipantSchema = z.object({
	participantId: z.string().min(1),
	name: z.string().min(1),
	source: z.string(),
	canInvoke: z.boolean(),
})

/**
 * A transcript entry — a CHILD RECORD of `Thread`, not an entity (B4, decision 1).
 *
 * No class, no identity of its own beyond `entryId`, no lifecycle: it is written once and never
 * transitions. What it does have is invariants, and those belong to the thread that owns it — which is
 * the whole point of the change. Before B4 this shape lived on `TranscriptRepository` as
 * `TranscriptEntryRow` and its id was minted inside `DrizzleTranscriptRepository.append()`, with no
 * aggregate anywhere in the path to reject a foreign citation or a `CONTACT` line with no sender.
 */
export const TranscriptEntrySchema = z.object({
	entryId: z.uuid(),
	ownerId: z.uuid(),
	threadId: z.uuid(),
	kind: z.enum(TranscriptKind),
	text: z.string(),
	issueId: z.string().optional(),
	quotedEntryId: z.string().optional(),
	senderExternalId: z.string().optional(),
	/**
	 * WHICH LOOP fired this whisper — ABSENT ⟺ a human typed it.
	 *
	 * A `WHISPER` is the operator instructing the agents privately, and a scheduled one used to be
	 * indistinguishable from a typed one: no sender on either, so both rendered to the model as
	 * `operator` and the agent answered a timer as if somebody had just spoken. The prompt grammar
	 * reads this to write `de="loop:<label>"` instead of lying.
	 *
	 * It carries the loop's LABEL (derived from its schedule) rather than its id, denormalized at fire
	 * time: a transcript records what happened, and a loop edited to another hour — or deleted — must
	 * not rewrite who spoke yesterday.
	 *
	 * NO ENTITY INVARIANT ties it to `WHISPER`. `SteerThread` is the only writer and records nothing
	 * else, so the pairing holds by construction; a named domain error for a state no caller can reach
	 * would cost an i18n catalog and an SDK regeneration to guard a hypothetical.
	 */
	firedByLoop: z.string().min(1).optional(),
	provider: z.enum(ProviderKind).optional(),
	classification: z.enum(ClassificationMethod).optional(),
	at: z.date(),
})

/**
 * A citation, RESOLVED (B4, decision D-B).
 *
 * `recordEntry` takes the quoted entry's `threadId` alongside its id rather than the id alone, because
 * the entity does no I/O and the invariant is about PROVABLE membership: you may cite an entry you can
 * show belongs to this thread. The caller is the one holding a transaction, and the caller that
 * actually needs this — `IngestChannelMessage` — already reads the quoted row inside its transaction to
 * decide `repliesToAgent`, so the proof costs nothing new. A citation that cannot be resolved degrades
 * to no citation at the call site; it is never written blind.
 */
export const QuotedEntryRefSchema = z.object({
	entryId: z.string().min(1),
	threadId: z.string().min(1),
})

/**
 * A stop — a CHILD RECORD of `Thread` (B4, spec decision 4), not an entity and no longer a child of
 * `Issue`.
 *
 * ### `issueId` is OPTIONAL, and that is the whole reason this moved
 * While the Stop hung off `Issue` with a mandatory `issueId`, a thread-level stop was UNREACHABLE:
 * `RaiseStopInputSchema` and `AskOperatorInputSchema` both demanded one, so the orchestrator could never
 * ask for approval before an issue existed. Re-parenting to `Thread` closes that hole by MODELLING
 * rather than by relaxing a validator: the thread is the aggregate that always exists.
 *
 * It also fixes where `ownerId` comes from. `RaiseStop` used to read it off `issue.ownerId` — impossible
 * for a raise with no issue. It is stamped from the aggregate here, which is the one place that always
 * knows it.
 */
export const StopSchema = z.object({
	stopId: z.uuid(),
	ownerId: z.uuid(),
	issueId: z.string().optional(),
	threadId: z.uuid(),
	kind: z.enum(StopKind),
	title: z.string().min(1),
	detail: z.string(),
	raisedAt: z.date(),
	resolution: z.enum(StopResolution).optional(),
	resolvedAt: z.date().optional(),
})

/** The UPDATE half of a resolution: `save` stamps these two columns on an already-persisted stop. */
export const StopResolutionPatchSchema = z.object({
	stopId: z.uuid(),
	resolution: z.enum(StopResolution),
	resolvedAt: z.date(),
})

export const ThreadSchema = z.object({
	ownerId: z.uuid(),
	channelId: z.uuid(),
	contactRef: ContactRefSchema,
	workspaceId: z.uuid(),
	// ≥1 provider (NO_PROVIDER_SELECTED is enforced at attach; this keeps the invariant post-hoc).
	providers: z.array(z.enum(ProviderKind)).min(1),
	paused: z.boolean(),
	mentionGate: MentionGateSchema,
	participants: z.array(ParticipantSchema),
	bufferSize: z.enum(BufferSize),
	/**
	 * WHICH MODEL this conversation asks each of its CLIs for — `{}` until the operator picks one.
	 *
	 * A MAP because the choice is per provider. `providers` is an array, and `opus` is vocabulary of one
	 * binary (`CLAUDE_MODEL_ALIASES` says so where it lives), so a single `model` field would hold a
	 * value that is right for at most one of the CLIs this thread declares and silently wrong for the
	 * rest. What each provider offers is declared once, in `contracts/catalog/agent-models.ts`.
	 *
	 * PARTIAL, and that is the invariant, not an accident of typing: a key exists only for a NON-default
	 * choice. `AgentModelId.DEFAULT` already means "omit `--model`, let the CLI pick" — exactly what an
	 * absent key means — so `configureModel(p, DEFAULT)` deletes rather than stores. Same rule, same
	 * reason as `customPrompt`: one fact gets one spelling. `modelFor()` is the read that collapses the
	 * other way, so no caller ever handles `undefined`.
	 */
	modelByProvider: z.partialRecord(z.enum(ProviderKind), z.enum(AgentModelId)),
	/**
	 * The operator's own standing instructions for this conversation — ABSENT until they write some.
	 *
	 * It lives on the aggregate rather than only on the row because the thread is what the instruction
	 * is ABOUT: one conversation may need a different voice, a different vocabulary, a different set of
	 * things never to do, and that is a property of the room, not of the installation. The global
	 * defaults keep coming from `OrchestratorPromptBuilder`; this composes with them.
	 *
	 * Optional and never `''` — see `CustomPromptSchema`. `configurePrompt(undefined)` is the way back.
	 */
	customPrompt: CustomPromptSchema.optional(),
	status: z.enum(ThreadStatus),
	/**
	 * SOFT DELETE (thread-deletion spec, decision 1) — absent while the conversation is configured.
	 *
	 * It sits on the aggregate rather than only on the row because two RULES read it: `delete()` refuses
	 * a second deletion, and `revive()` is the only way back. A column the entity could not see would
	 * push both into the repository, where neither is enforceable.
	 */
	deletedAt: z.date().optional(),
})

export type ThreadProps = Z.infer<typeof ThreadSchema>
export type ContactRef = Z.infer<typeof ContactRefSchema>
export type MentionGate = Z.infer<typeof MentionGateSchema>
export type Participant = Z.infer<typeof ParticipantSchema>
export type TranscriptEntry = Z.infer<typeof TranscriptEntrySchema>
export type QuotedEntryRef = Z.infer<typeof QuotedEntryRefSchema>
export type Stop = Z.infer<typeof StopSchema>
export type StopResolutionPatch = Z.infer<typeof StopResolutionPatchSchema>

/** What `ThreadRepository.save` drains and writes in the SAME transaction as the thread row. */
export interface PendingThreadWrites {
	entries: TranscriptEntry[]
	stops: Stop[]
	stopResolutions: StopResolutionPatch[]
}

/**
 * The roster id the OWNER always occupies — DECLARED in `objects/TranscriptSpeaker.ts` and re-exported
 * here, where every caller in this context has always read it from.
 *
 * It moved because the agent context needs the same word (the `de` attribute of an operator's block)
 * and may not import an entity across a boundary — `objects` is the sanctioned surface. One
 * declaration, two readers, no mirror.
 */
export { OPERATOR_PARTICIPANT_ID }

/**
 * How long an inbound stays SUMMONABLE — the freshness window `canInvoke` judges an inbound against.
 *
 * THE BACKLOG. When the gateway reconnects to WhatsApp, whatsmeow replays every message the phone
 * buffered while the socket was down — all at once, each still carrying the `occurredAt` the platform
 * stamped when it was originally SENT. Without a window every one of them clears the invocation gates
 * and schedules a turn of its own: the operator plugs the laptop back in and the agent answers an hour
 * of conversation in one burst, in someone's real chat. That enxurrada is what this constant exists to
 * stop, and it is why the threshold is stated once, here, with the reason attached.
 *
 * Five minutes is the "somebody is still sitting there waiting" horizon: long enough that a slow
 * gateway, a retried delivery or a laggy phone still gets its answer, short enough that a replay of
 * yesterday's chat does not.
 *
 * The stale message is NOT discarded. It is transcribed, buffered, quotable and visible in the console
 * exactly like any other (observation ≠ invocation) — it simply does not get a turn of its own.
 *
 * THE OPERATOR IS EXEMPT (`canInvoke`, 2026-08-05). Read the paragraph above again and notice what it
 * is afraid of: "an hour of CONVERSATION", "someone's real chat" — a replay of other people talking.
 * The operator's own message is not that. It is the instruction, and the cost of muting a late one is
 * the opposite of a flood: the operator watches a message sit delivered and unanswered, with nothing
 * anywhere saying why. That happened — a reconnect delivered "Consegue mergear esse pr na main?" 650s
 * after it was sent, 350s past this window, and it was swallowed in silence. So the window now judges
 * THIRD PARTIES, which is where the enxurrada actually comes from.
 */
export const INVOCATION_FRESHNESS_WINDOW_MS = 5 * 60 * 1000

/**
 * `Thread` (BC4 Thread & Routing, Core) — the binding of a conversation to a workspace + providers,
 * and its control plane: pause/resume, mention gate, participant invocation rights, and the rolling
 * context-buffer size. Invariants with teeth: providers non-empty and at least one invoker must
 * remain. The steer-vs-direct mode guard that used to live here is gone — see the note where the two
 * `assertCan*` methods stood.
 *
 * ### The transcript is PART of this aggregate (B4, decision 1)
 * It used to say "the transcript is a separate entity/record, not embedded here", and it said so as a
 * statement of fact with no reason attached — which is exactly the shape the new template rule calls
 * out: a child table with no aggregate in front of it and no lifecycle/scale justification in the
 * parent. There was no `TranscriptEntry` entity to make it true either; `TranscriptRepository` minted
 * ids in `DrizzleTranscriptRepository.append()` and inserted whatever it was handed. Now the WRITE goes
 * through `recordEntry`, which owns the two invariants nobody enforced before (a citation must belong
 * to this thread; `CONTACT` needs a sender and the system's own lines must not carry one), and
 * `ThreadRepository.save` persists the accumulated entries in the same transaction as the thread row.
 *
 * ### The STOP is part of this aggregate too (B4, spec decision 4)
 * A Stop used to hang off `Issue` through a `StopRepository` of its own, with a mandatory `issueId` —
 * which made the thread-level stop (the orchestrator asking for approval before any issue exists)
 * unreachable, and left `ownerId` to be derived from an issue that might not be there. It is raised and
 * resolved HERE now: `raiseStop` stamps owner + thread from the aggregate, `resolveStop` owns the three
 * rules that decide whether a resolution is legal, and both accumulate into the same pending-writes
 * drain the transcript uses.
 *
 * READS deliberately stay outside the aggregate: `findById` does NOT hydrate history or stops — loading
 * a thread stays one row, forever — and the query use cases keep reading Drizzle directly (BFF). The
 * agent's context window reads `ThreadRepository.recentEntries` and a resolver loads its stop with
 * `ThreadRepository.findStop`; both are the aggregate's persistence surface, not a second child-table
 * repository.
 */
export class Thread extends AggregateRoot<typeof ThreadSchema> {
	static override schema = ThreadSchema

	/**
	 * Entries recorded in THIS unit of work and not yet written.
	 *
	 * A subclass field initializer runs after `super(props)`, so the `Object.assign(this, …)` in
	 * `BaseEntity`'s constructor cannot clobber it, and `ThreadSchema` strips unknown keys so
	 * `validate()` cannot either. Same mechanism `BaseEntity.domainEvents` already uses.
	 */
	private pendingEntries: TranscriptEntry[] = []
	private pendingStops: Stop[] = []
	private pendingStopResolutions: StopResolutionPatch[] = []

	static create(data: {
		ownerId: string
		channelId: string
		contactRef: ContactRef
		workspaceId: string
		providers: ProviderKind[]
		/** The citation tag, minted by the caller from the linked workspace folder. */
		mentionTag: string
		participants: Participant[]
		bufferSize?: BufferSize
	}): Thread {
		if (data.providers.length === 0) throw new BaseError<DomainErrors>('NO_PROVIDER_SELECTED')
		if (!data.participants.some(p => p.canInvoke)) throw new BaseError<DomainErrors>('LAST_INVOKER', 'a thread needs at least one invoker')
		return new Thread({
			ownerId: data.ownerId,
			channelId: data.channelId,
			contactRef: data.contactRef,
			workspaceId: data.workspaceId,
			providers: data.providers,
			paused: false,
			// The gate is ON from birth and the tag is MINTED BY THE CALLER from the linked workspace
			// (`AttachThread`) — the entity has no workspace to derive it from. Required rather than
			// defaulted so an ungated thread is unconstructible, not merely unusual. Pre-existing rows are
			// untouched: this is create-time only, and `toPersistence` always writes the column explicitly,
			// so the schema's `.default(false)` never fires.
			mentionGate: { enabled: true, tag: data.mentionTag },
			participants: data.participants,
			bufferSize: data.bufferSize ?? BufferSize._50,
			// A fresh conversation has chosen nothing, and "chosen nothing" is the empty map — never a
			// pre-seeded `{ [provider]: DEFAULT }`, which would be the second spelling this field refuses.
			// The attach wizard does not ask for a model, so there is nothing here for it to carry.
			modelByProvider: {},
			status: ThreadStatus.IDLE,
		})
	}

	/**
	 * Apagar a conversa (thread-deletion spec, decisions 1 and 8) — a SOFT delete.
	 *
	 * Nothing is removed. The row stays, and so does every child it owns: the transcript, the issues, the
	 * stops, the artifacts. What changes is that the conversation stops being CONFIGURED — every console
	 * read filters this column out (decision 5) and an inbound from the contact is dropped exactly as if
	 * it had never been attached (decision 3).
	 *
	 * The double-delete guard is a domain rule and not a repository `WHERE deleted_at IS NULL`: a second
	 * delete is the operator acting on a stale screen, and the honest answer is a named refusal, not a
	 * silent no-op that reports success. The cross-aggregate half of "may I delete this" — an issue still
	 * WORKING, a stop still open — is deliberately NOT here: this aggregate hydrates neither, so it would
	 * have to be handed facts it cannot verify. `DeleteThread` reads them and raises THREAD_HAS_ACTIVE_WORK.
	 *
	 * It raises NO domain event, and that is decision 6 rather than an omission: the console is
	 * single-operator and invalidates its queries on the mutation's `onSuccess`, so there is no consumer
	 * for the fact. An event nobody subscribes to is an outbox row that costs a write and teaches a reader
	 * that something reacts.
	 */
	delete(): void {
		if (this.deletedAt) {
			throw new BaseError<DomainErrors>('THREAD_ALREADY_DELETED', `thread ${this.id.value} was deleted at ${this.deletedAt.toISOString()}`)
		}
		this.deletedAt = new Date()
	}

	/**
	 * Re-attach the same contact (thread-deletion spec, decision 4) — the way BACK from `delete()`.
	 *
	 * Why a transition and not a fresh `Thread.create`: the row never left, and
	 * `threads_owner_channel_contact_unq` would reject the second insert. Reviving in place is also what
	 * makes the promise in the decision true — the OLD TRANSCRIPT SURVIVES, because it hangs off this id
	 * and this id is unchanged. It is the same conversation, reconfigured.
	 *
	 * Everything the wizard just chose WINS: workspace, providers, citation tag, roster, contact display
	 * name, buffer. And the control plane resets to what a freshly attached thread has — a thread that
	 * was paused when it was deleted must not come back mute, because the operator who re-attached it
	 * never asked for silence.
	 *
	 * The two create-time invariants are re-checked rather than assumed: `revive` accepts the same
	 * caller-supplied data `create` does, so it admits exactly the same two ways of being wrong.
	 *
	 * ONE piece of the control plane deliberately SURVIVES: `customPrompt`. Everything reset above is
	 * something the wizard just re-chose or something a fresh thread is defined as having; the operator's
	 * standing instructions are neither. The wizard never asks for them, so clearing them here would
	 * destroy hand-written text with nothing in the flow that hints it happened — while the promise the
	 * delete confirmation makes is that re-attaching brings the conversation back.
	 *
	 * `modelByProvider` survives on the same argument — the wizard never asks for a model either — but
	 * NARROWED to the providers just re-chosen. It is the one field of the two that the wizard can
	 * contradict: re-attaching with a different CLI would otherwise leave behind a choice for a provider
	 * this conversation no longer runs, which is precisely the orphaned configuration `PROVIDER_NOT_BOUND`
	 * exists to make unrepresentable. Filtering here keeps that invariant true of every reachable state,
	 * not merely of the write path.
	 *
	 * There is deliberately no "this thread is not deleted" guard. `AttachThread` is the only caller and
	 * it reaches this method only on the deleted branch — the live branch raises THREAD_ALREADY_ATTACHED
	 * before getting here. Inventing a domain code for a state the one call site cannot produce would be
	 * vocabulary the product does not have.
	 */
	revive(data: {
		contactRef: ContactRef
		workspaceId: string
		providers: ProviderKind[]
		mentionTag: string
		participants: Participant[]
		bufferSize?: BufferSize
	}): void {
		if (data.providers.length === 0) throw new BaseError<DomainErrors>('NO_PROVIDER_SELECTED')
		if (!data.participants.some(p => p.canInvoke)) throw new BaseError<DomainErrors>('LAST_INVOKER', 'a thread needs at least one invoker')

		this.deletedAt = undefined
		this.contactRef = data.contactRef
		this.workspaceId = data.workspaceId
		this.providers = data.providers
		this.mentionGate = { enabled: true, tag: data.mentionTag }
		this.participants = data.participants
		this.bufferSize = data.bufferSize ?? BufferSize._50
		this.modelByProvider = Object.fromEntries(
			Object.entries(this.modelByProvider).filter(([provider]) => data.providers.includes(provider as ProviderKind)),
		)
		this.paused = false
		this.status = ThreadStatus.IDLE
		this.validate()
	}

	pause(): void {
		this.paused = true
		this.status = ThreadStatus.PAUSED
	}

	resume(): void {
		this.paused = false
		this.status = ThreadStatus.IDLE
	}

	configureMentionGate(gate: MentionGate): void {
		this.mentionGate = gate
		this.validate()
	}

	configureContextBuffer(size: BufferSize): void {
		this.bufferSize = size
	}

	/**
	 * Choose which model this conversation asks ONE of its CLIs for.
	 *
	 * ### `DEFAULT` is the ERASE, not a value
	 * Same shape as `configurePrompt('')`, and for the same reason: `DEFAULT` means "omit `--model` and
	 * let the binary choose", which is already what an absent key means. Storing it would create a second
	 * spelling that the persistence mapper, the settings DTO and the dispatcher would each have to
	 * normalize on their own, and the first one to forget would send `--model DEFAULT` to a CLI that has
	 * no such alias. So the collapse is decided ONCE, here — and the console does not need a second
	 * control for "back to automatic", because the catalog lists `DEFAULT` as a real option.
	 *
	 * ### Two invariants, and both are the SAME class of mistake: configuration nobody will ever read
	 * - `PROVIDER_NOT_BOUND` — the thread does not run that CLI. The dispatcher only ever asks
	 *   `modelFor(thread.providers[0])`, so a choice for an unbound provider is written, persisted,
	 *   re-rendered in the dialog as if it were in force, and never consulted by anything.
	 * - `MODEL_NOT_AVAILABLE` — the CLI does not offer that model. Answered by LOOKUP against the declared
	 *   relation (`offersModel`), never by parsing the member's name. It also covers "this provider offers
	 *   nothing at all" for free: an empty catalog rejects every model, including `DEFAULT`, which is the
	 *   honest answer for a binary this engine has never driven.
	 *
	 * It is a DOMAIN error rather than an application one — unlike `PROVIDER_COMING_SOON`, its neighbour —
	 * because the question is about the declared catalog, which the aggregate can see in full, not about
	 * which runners this deployment happens to have bound, which it cannot see at all.
	 */
	configureModel(provider: ProviderKind, model: AgentModelId): void {
		if (!this.providers.includes(provider)) {
			throw new BaseError<DomainErrors>('PROVIDER_NOT_BOUND', `this thread does not run ${provider}`)
		}
		if (!offersModel(provider, model)) {
			throw new BaseError<DomainErrors>('MODEL_NOT_AVAILABLE', `${provider} does not offer ${model}`)
		}

		const { [provider]: _dropped, ...rest } = this.modelByProvider
		this.modelByProvider = model === AgentModelId.DEFAULT ? rest : { ...rest, [provider]: model }
		this.validate()
	}

	/**
	 * WHICH MODEL a turn on `provider` must ask for — the read half of the collapse above.
	 *
	 * Always an `AgentModelId`, never `undefined`, so the dispatcher has no absence to interpret and the
	 * settings DTO has no optional field for the console to `?? DEFAULT` on its own. Absent key ⇒
	 * `DEFAULT` ⇒ the runner omits the flag, which is where the chain ends.
	 *
	 * Deliberately does NOT check that `provider` is bound: this answers "what would we ask for", and the
	 * honest answer for a CLI nobody chose anything on is the same as for a bound one with no choice.
	 * Refusing here would make the read stricter than the fallback it exists to provide.
	 *
	 * The collapse itself is `effectiveModel`, in contracts beside the catalog, because the settings BFF
	 * reads the ROW (no aggregate hydrated, by design) and must answer identically.
	 */
	modelFor(provider: ProviderKind): AgentModelId {
		return effectiveModel(this.modelByProvider, provider)
	}

	/**
	 * Write (or erase) the operator's standing instructions for this conversation.
	 *
	 * ### The empty string is not a value here, it is the ERASE
	 * The console sends whatever is in a textarea, and an operator who selects-all-and-deletes sends
	 * `''`. Storing that would create a second spelling of "no custom prompt" that every reader —
	 * the settings DTO, the prompt builder, the persistence mapper — would have to normalize
	 * independently, and the first one to forget renders an empty `OPERATOR INSTRUCTIONS` heading into
	 * a real conversation's system prompt. So blank-in means absent-out, decided ONCE, here.
	 *
	 * Whitespace-only counts as blank for the same reason: a newline the operator left behind is not an
	 * instruction, and `CustomPromptSchema` would trim it to `''` and then reject it as too short —
	 * turning a perfectly ordinary "clear the box" into a VALIDATION_ERROR the operator cannot explain.
	 *
	 * ### The cap is the SCHEMA's rule, not this method's
	 * `CustomPromptSchema` carries `error: 'PROMPT_TOO_LONG'` on its `.max()`, so `validate()` raises the
	 * named code and the console renders the operator's own limit — no hand-rolled `safeParse` here, and
	 * no format check duplicated between the schema and the behaviour (entity `bp-10`/`bp-11`).
	 */
	configurePrompt(customPrompt: string | undefined): void {
		this.customPrompt = customPrompt?.trim() || undefined
		this.validate()
	}

	/**
	 * Admit into the JSON roster a participant it has never recorded — the write-side counterpart of
	 * `GetThreadSettings`' live-membership join.
	 *
	 * The JSON roster (`this.participants`) is a snapshot `AttachThread` freezes at bind time; a GROUP
	 * member who joined afterward, or whose sync landed after the attach, is a real member the LIVE
	 * `gateway_remote_memberships` projection knows about and this JSON does not. Without this door,
	 * `setParticipantInvocation` on such a member always raised `PARTICIPANT_NOT_FOUND` — a toggle the
	 * settings dialog rendered but could never actually flip.
	 *
	 * No I/O here, same as every other mutator: the caller (`SetParticipantInvocation`) has already
	 * verified membership against `GroupMemberReader.isMember` before calling this. IDEMPOTENT rather
	 * than a guarded throw — the caller only calls it when the id is absent, so a second admission of
	 * the same id is not a business mistake worth a named error, just a no-op safety net.
	 */
	admitParticipant(participant: Participant): void {
		if (this.participants.some(p => p.participantId === participant.participantId)) return
		this.participants = [...this.participants, participant]
	}

	setParticipantInvocation(participantId: string, canInvoke: boolean): void {
		const participant = this.participants.find(p => p.participantId === participantId)
		if (!participant) throw new BaseError<DomainErrors>('PARTICIPANT_NOT_FOUND', `no participant ${participantId}`)
		// Toggling the last invoker off is rejected — a thread must keep at least one invoker.
		if (!canInvoke && participant.canInvoke && this.participants.filter(p => p.canInvoke).length === 1) {
			throw new BaseError<DomainErrors>('LAST_INVOKER', 'at least one participant must keep invocation rights')
		}
		participant.canInvoke = canInvoke
		// Reassign to trigger the embedded-array persistence path.
		this.participants = [...this.participants]
	}

	/**
	 * Record a line of the conversation (B4, decision 1) — the ONLY way a transcript entry comes to be.
	 *
	 * Returns the record so the caller has the id SYNCHRONOUSLY, before any write: three of the four
	 * call sites use it as the dedup key of something they enqueue in the same transaction
	 * (`mailbox.enqueue({ dedupKey: entry.entryId })`, `enqueueCommand(..., { jobId: entry.entryId })`)
	 * and two return it in their output schema. That is why the id is minted HERE and not by the
	 * repository: an id that only exists after `save` cannot be referenced by the rows that commit with
	 * it.
	 *
	 * Nothing is written. The entry is accumulated, and `ThreadRepository.save(thread, tx)` persists it
	 * in the same transaction as the thread row — which is also how the one non-transactional writer got
	 * fixed: before B3/B4, `DeliverOrchestratorReply` appended outside any transaction.
	 *
	 * ### Invariant (a) — a citation belongs to THIS thread
	 * Enforced against a RESOLVED reference, not an id (see `QuotedEntryRefSchema`). Nobody checked this
	 * before, and the failure it admits is not abstract: the reply-quote path resolves ids that come off
	 * the wire, and an id from another conversation would have been written into this one's history.
	 *
	 * ### Invariant (b) — the kind×sender matrix
	 * `CONTACT` is somebody else speaking, so it MUST carry the JID that spoke; `SYSTEM` (the agent) and
	 * `WHISPER` (the operator instructing the agent) are this system's own words and must NOT borrow a
	 * contact's identity — a `SYSTEM` line with a sender reads, everywhere downstream, as if a human
	 * said what the model said. `DIRECT` and `ACTION` are deliberately unconstrained: the matrix the
	 * decision names covers three kinds, and inventing rules for the other two would be over-building.
	 */
	recordEntry(input: {
		kind: TranscriptKind
		text: string
		senderExternalId?: string
		quotedEntry?: QuotedEntryRef
		issueId?: string
		firedByLoop?: string
		provider?: ProviderKind
		classification?: ClassificationMethod
		at?: Date
	}): TranscriptEntry {
		if (input.kind === TranscriptKind.CONTACT && !input.senderExternalId) {
			throw new BaseError<DomainErrors>('CONTACT_ENTRY_REQUIRES_SENDER', 'a CONTACT entry must carry the sender that spoke')
		}
		if ((input.kind === TranscriptKind.SYSTEM || input.kind === TranscriptKind.WHISPER) && input.senderExternalId) {
			throw new BaseError<DomainErrors>('AGENT_ENTRY_FORBIDS_SENDER', `a ${input.kind} entry must not carry a contact sender`)
		}
		if (input.quotedEntry && input.quotedEntry.threadId !== this.id.value) {
			throw new BaseError<DomainErrors>(
				'QUOTED_ENTRY_NOT_IN_THREAD',
				`entry ${input.quotedEntry.entryId} belongs to thread ${input.quotedEntry.threadId}`,
			)
		}

		const entry: TranscriptEntry = {
			entryId: Id.value(),
			ownerId: this.ownerId,
			threadId: this.id.value,
			kind: input.kind,
			text: input.text,
			issueId: input.issueId,
			quotedEntryId: input.quotedEntry?.entryId,
			senderExternalId: input.senderExternalId,
			firedByLoop: input.firedByLoop,
			provider: input.provider,
			classification: input.classification,
			at: input.at ?? new Date(),
		}
		this.pendingEntries.push(entry)
		return entry
	}

	/**
	 * Raise a stop on this thread (B4, spec decision 4) — with or without an issue behind it.
	 *
	 * `stopId` is accepted rather than always minted because the id is frequently DECIDED UPSTREAM: the
	 * terminal engine's stop fact carries one, and honouring it is what makes a redelivered fact land on
	 * the same row instead of a second Needs-you card. When the producer has none (the console path), one
	 * is minted here.
	 *
	 * What this method is FOR, since it enforces no state transition: identity and OWNERSHIP. `ownerId`
	 * and `threadId` are stamped from the aggregate, which is exactly the bug the re-parenting fixes —
	 * `RaiseStop` derived `ownerId` from `issue.ownerId`, and a stop with no issue had nowhere to get it.
	 *
	 * It raises NO domain event. The fact `integration.thread.stop_raised` is the CAUSE of this call, not
	 * its effect: it is published upstream by `PublishAgentIntegrationEvents` from
	 * `AgentRunStopRaisedEvent`, and this is the consumer materializing it. Re-announcing it here would
	 * be a loop.
	 */
	raiseStop(input: { stopId?: string; issueId?: string; kind: StopKind; title: string; detail: string }): Stop {
		const stop: Stop = {
			stopId: input.stopId ?? Id.value(),
			ownerId: this.ownerId,
			issueId: input.issueId,
			threadId: this.id.value,
			kind: input.kind,
			title: input.title,
			detail: input.detail,
			raisedAt: new Date(),
			resolution: undefined,
			resolvedAt: undefined,
		}
		this.pendingStops.push(stop)
		return stop
	}

	/**
	 * Resolve a stop of this thread (B4, spec decision 4).
	 *
	 * Takes the LOADED stop rather than an id, for the same reason `recordEntry` takes a resolved
	 * citation: the aggregate does no I/O, and `findById` does not hydrate children. The caller reads it
	 * with `ThreadRepository.findStop` and hands it over; the aggregate then owns all three invariants,
	 * one of which (`RESOLUTION_NOT_APPLICABLE`) used to be an application-level check inside the use
	 * case — it is a rule about the stop, so it is a DomainError now.
	 *
	 * Unlike `raiseStop` this DOES raise a domain event, and the asymmetry is the point: a resolution is
	 * a decision this system made, so `thread.stop_resolved` is a fact it authors and
	 * `PublishThreadIntegrationEvents` bridges. `pullDomainEvents()` — the mechanism `BaseEntity` has
	 * always exposed and no TypeScript aggregate had used yet (the Go `Channel` uses its twin) — is
	 * drained by the use case inside the same transaction as the write.
	 */
	resolveStop(stop: Stop, resolution: StopResolution): void {
		if (stop.threadId !== this.id.value) {
			throw new BaseError<DomainErrors>('STOP_NOT_IN_THREAD', `stop ${stop.stopId} belongs to thread ${stop.threadId}`)
		}
		if (stop.resolvedAt) {
			throw new BaseError<DomainErrors>('STOP_ALREADY_RESOLVED', `stop ${stop.stopId} was resolved at ${stop.resolvedAt.toISOString()}`)
		}
		if (!isResolutionApplicable(stop.kind, resolution)) {
			throw new BaseError<DomainErrors>('RESOLUTION_NOT_APPLICABLE', `${resolution} does not apply to a ${stop.kind} stop`)
		}

		this.pendingStopResolutions.push({ stopId: stop.stopId, resolution, resolvedAt: new Date() })
		this.addDomainEvent(
			new ThreadStopResolvedEvent({
				entityId: this.id.value,
				ownerId: this.ownerId,
				payload: { stopId: stop.stopId, issueId: stop.issueId, threadId: this.id.value, resolution },
			}),
		)
	}

	/**
	 * Drain the writes accumulated in this unit of work. Called by `ThreadRepository.save` only.
	 *
	 * Mirrors `pullDomainEvents()`: one drain, clears the buffer, so a second `save` of the same
	 * instance cannot re-insert what already committed.
	 */
	pullPendingWrites(): PendingThreadWrites {
		const writes: PendingThreadWrites = {
			entries: this.pendingEntries,
			stops: this.pendingStops,
			stopResolutions: this.pendingStopResolutions,
		}
		this.pendingEntries = []
		this.pendingStops = []
		this.pendingStopResolutions = []
		return writes
	}

	/**
	 * Whether this line is ADDRESSED to the agent at all (pause + permission + mention gate) — every
	 * invocation gate EXCEPT the freshness window.
	 *
	 * ### Replying to the agent IS addressing it
	 * `repliesToAgent` bypasses the MENTION GATE and nothing else. The gate exists to answer one
	 * question — "is this message for the agent?" — and a quote answers it better than a tag does:
	 * typing `@codm` is a convention someone has to remember, while replying to the agent's own
	 * message is what everyone does by reflex in a group chat. Demanding the tag on a reply meant the
	 * natural answer to the agent's own question fell on the floor, and the operator had to remember
	 * that this one conversation needs a prefix its other participants never see.
	 *
	 * It deliberately does NOT bypass the two checks above it: a paused thread stays silent and a
	 * read-only participant stays read-only. A quote is evidence of ADDRESS, never of permission.
	 *
	 * ### Why this is split out of `canInvoke`
	 * The two questions used to have the same answer and stopped having it when the freshness window
	 * landed. "Was this for the agent" is a property of the MESSAGE; "may it start a turn" is a
	 * property of the MOMENT. `RunOrchestratorTurn` renders the model's context window from transcript
	 * rows that are, by construction, already older than the window — asking `canInvoke` there would
	 * mark every line but the newest as unaddressed and quietly rewrite what the model reads.
	 */
	addressedToAgent(input: { senderExternalId: string; text: string; repliesToAgent?: boolean }): boolean {
		if (this.paused) return false
		const participant = this.participants.find(p => p.participantId === input.senderExternalId)
		if (participant && !participant.canInvoke) return false
		if (input.repliesToAgent) return true
		if (this.mentionGate.enabled && !mentionsTag(input.text, this.mentionGate.tag)) return false
		return true
	}

	/**
	 * Whether an inbound sender may invoke agents RIGHT NOW: addressed to the agent AND still fresh.
	 *
	 * Freshness is the last gate, and it COMPOSES with the others rather than replacing any of them —
	 * a stale message is refused, and so is a fresh one from a paused thread, a muted participant, or
	 * a sender who never cited the tag. See `INVOCATION_FRESHNESS_WINDOW_MS` for why the window exists.
	 *
	 * ### The clock is a PARAMETER, never read here
	 * `now` is passed in so the entity stays deterministic: the same thread and the same pair of
	 * instants always answer the same, which is what lets the boundary be pinned by a test instead of
	 * raced against wall time. Reading `Date.now()` in here would make the one rule anybody will ever
	 * want to prove the one rule nobody can.
	 *
	 * `sentAt` is the instant the PLATFORM says the message was sent (`occurredAt` on the gateway
	 * event), never the instant we observed it. On a backlog replay `observedAt` is "now" for every
	 * message in the burst — judging by it would let the whole enxurrada through, which is precisely
	 * the case this window exists for.
	 *
	 * ### The boundary is INCLUSIVE
	 * A message whose age is exactly the window still invokes (`age <= window`). "Within 5 minutes"
	 * includes the fifth minute, and the platform reports send times at SECOND granularity, so a
	 * message landing on the tick is a rounding artifact rather than a decision — the tie goes to
	 * answering the human. A `sentAt` in the FUTURE (platform clock skew) is fresh for the same
	 * reason: a clock running fast somewhere else must not mute somebody here.
	 */
	canInvoke(input: { senderExternalId: string; text: string; repliesToAgent?: boolean; sentAt: Date; now: Date }): boolean {
		if (!this.addressedToAgent(input)) return false
		// THE OPERATOR IS NOT A BACKLOG, and the window was never aimed at them. What it exists to stop
		// is a replay of CONVERSATION scheduling a turn per message; the operator's own line is the
		// INSTRUCTION, and a late instruction is still the instruction. Measured 2026-08-05: a reconnect
		// delivered "Consegue mergear esse pr na main?" 650s after it was sent, and it was transcribed
		// and silently never answered. Third parties keep the window — that is where the flood is.
		if (input.senderExternalId === OPERATOR_PARTICIPANT_ID) return true
		return input.now.getTime() - input.sentAt.getTime() <= INVOCATION_FRESHNESS_WINDOW_MS
	}

	/**
	 * The message as the AGENT should read it — a citation is ADDRESSING, not content.
	 *
	 * With the gate on, every inbound carries the tag, so leaving it in would put `@codm` at the head
	 * of every issue title and every slug key. The transcript keeps the text verbatim; only what is fed
	 * to the model is cleaned.
	 *
	 * Falls back to the ORIGINAL text when stripping empties it. A bare `@codm` is the most natural
	 * thing someone types once told to cite the agent, and it strips to `''` — which `RunIssueTurn`'s
	 * `prompt: z.string().trim().min(1)` rejects, turning a summon into a thrown VALIDATION_ERROR.
	 */
	textWithoutMention(text: string): string {
		if (!this.mentionGate.enabled) return text
		return stripMentionTag(text, this.mentionGate.tag) || text
	}

	/**
	 * WHO a JID is, as a human reads it — the roster's job, done in ONE place.
	 *
	 * The prompt grammar puts the author in an attribute (`de="…"`), so it has to be a NAME. Two call
	 * sites need the same answer and used to disagree: the conversation window resolved the roster while
	 * the live message went in as the raw JID, so the same person appeared twice under two identities in
	 * one prompt and the model read them as two people.
	 *
	 * A participant the gateway snapshot has since dropped falls back to the raw id rather than to a
	 * hole: losing WHO said something makes a transcript unreadable, and an empty attribute is worse than
	 * an ugly one. Absent sender ⟺ this system's own line (`SYSTEM` / `WHISPER` / `DIRECT`), which is
	 * the operator speaking through the console.
	 *
	 * The OWNER resolves to the sentinel itself rather than to their roster `name`, and that is the one
	 * deliberate exception. Every other paragraph of the prompt calls them "the operator"; rendering
	 * `de="Operator"` here would hand the model a second name for the person its instructions are about.
	 */
	displayNameOf(senderExternalId?: string): string {
		if (!senderExternalId || senderExternalId === OPERATOR_PARTICIPANT_ID) return OPERATOR_PARTICIPANT_ID
		return this.participants.find(p => p.participantId === senderExternalId)?.name ?? senderExternalId
	}

	/*
	 * `assertCanSteer` / `assertCanSendDirect` are GONE (founder, 29-jul).
	 *
	 * They were mirror-image locks — steering required the thread to be live, sending a direct message
	 * required it to be paused — and between them the operator could only ever take ONE of the two
	 * actions at any moment. That was tolerable while a selector let them pick, but F4 removed the
	 * selector and made `composerMode` a function of pause state, at which point every message hit the
	 * lock for the state it was in: composing while paused raised THREAD_PAUSED, composing while
	 * running raised THREAD_NOT_PAUSED. Both halves of "não consigo mandar direct sem pausar e não
	 * consigo steerar pausado" are these two methods.
	 *
	 * What replaces them is nothing: the composer already picks the action that fits the state, and the
	 * operator typing into their own console is a deliberate act that does not need the aggregate's
	 * permission. NOTE the consequence, which is a live design question and not settled here — pause is
	 * enforced at INGEST only (`canInvoke` returns false), and the mailbox dispatcher does not consult
	 * it, so a steer issued while paused RUNS rather than waiting for resume.
	 */

	setStatus(status: ThreadStatus): void {
		this.status = status
	}
}

export interface Thread extends ThreadProps {}
