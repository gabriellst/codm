import { AggregateRoot, BaseError, Id, z } from '@codm/core-typescript'
import type Z from 'zod'
import {
	ProviderKind,
	ContactKind,
	ThreadStatus,
	BufferSize,
	TranscriptKind,
	ClassificationMethod,
	StopKind,
	StopResolution,
} from '@codm/contracts-typescript/wire/enums'
import type { DomainErrors } from '../errors'
import { mentionsTag, stripMentionTag, MentionGateSchema } from '../schemas'
import { isResolutionApplicable } from '../objects/StopResolutions'
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
	status: z.enum(ThreadStatus),
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
 * The roster id the OWNER always occupies — seeded by `AttachThread`, always `canInvoke: true`.
 *
 * The roster is about OTHER PEOPLE: it exists so the operator can mute specific participants, and
 * muting yourself is meaningless. So a message the owner typed is attributed to THIS id whichever
 * device it came from — the phone, another web client, or the console — rather than to their own
 * phone-number JID, which the gateway snapshot also puts in the roster with `canInvoke: false`
 * (it enumerates every group participant with no self filter). Without this, the owner's own message
 * is denied by the participant check BEFORE the mention gate is ever consulted.
 */
export const OPERATOR_PARTICIPANT_ID = 'operator'

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
			status: ThreadStatus.IDLE,
		})
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
	 * Whether an inbound sender may invoke agents right now (pause + permission + mention gate).
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
	 */
	canInvoke(input: { senderExternalId: string; text: string; repliesToAgent?: boolean }): boolean {
		if (this.paused) return false
		const participant = this.participants.find(p => p.participantId === input.senderExternalId)
		if (participant && !participant.canInvoke) return false
		if (input.repliesToAgent) return true
		if (this.mentionGate.enabled && !mentionsTag(input.text, this.mentionGate.tag)) return false
		return true
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
