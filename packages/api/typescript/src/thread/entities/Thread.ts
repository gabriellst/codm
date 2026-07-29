import { AggregateRoot, BaseError, z } from '@codedm/core-typescript'
import type Z from 'zod'
import { ProviderKind, ContactKind, ThreadStatus, BufferSize } from '@codedm/contracts-typescript/wire/enums'
import type { ApplicationErrors, DomainErrors } from '../errors'
import { mentionsTag, stripMentionTag, MentionGateSchema } from '../schemas'

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

/**
 * `Thread` (BC4 Thread & Routing, Core) — the binding of a conversation to a workspace + providers,
 * and its control plane: pause/resume, mention gate, participant invocation rights, and the rolling
 * context-buffer size. Invariants with teeth: providers non-empty and at least one invoker must
 * remain. The steer-vs-direct mode guard that used to live here is gone — see the note where the two
 * `assertCan*` methods stood.
 * The transcript + pending clarifications are separate entities/records, not embedded here.
 */
export class Thread extends AggregateRoot<typeof ThreadSchema> {
	static override schema = ThreadSchema

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
	 * Whether an inbound sender may invoke agents right now (pause + permission + mention gate).
	 *
	 * ### Replying to the agent IS addressing it
	 * `repliesToAgent` bypasses the MENTION GATE and nothing else. The gate exists to answer one
	 * question — "is this message for the agent?" — and a quote answers it better than a tag does:
	 * typing `@codedm` is a convention someone has to remember, while replying to the agent's own
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
	 * With the gate on, every inbound carries the tag, so leaving it in would put `@codedm` at the head
	 * of every issue title and every slug key. The transcript keeps the text verbatim; only what is fed
	 * to the model is cleaned.
	 *
	 * Falls back to the ORIGINAL text when stripping empties it. A bare `@codedm` is the most natural
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
