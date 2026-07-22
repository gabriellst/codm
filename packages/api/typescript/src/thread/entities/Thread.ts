import { AggregateRoot, BaseError, z } from '@codedm/core-typescript'
import type Z from 'zod'
import { ProviderKind, ContactKind, ThreadStatus, BufferSize } from '@codedm/contracts-typescript/wire/enums'
import type { ApplicationErrors, DomainErrors } from '../errors'

// ContactRef VO (embedded) — the channel counterparty. channelId lives on the Thread itself.
export const ContactRefSchema = z.object({
	externalId: z.string().min(1),
	displayName: z.string().min(1),
	kind: z.enum(ContactKind),
})

// MentionGate discriminated-union VO — a tag is required exactly when the gate is enabled.
export const MentionGateSchema = z.discriminatedUnion('enabled', [
	z.object({ enabled: z.literal(false) }),
	z.object({ enabled: z.literal(true), tag: z.string().trim().min(1) }),
])

// Participant VO — everyone in the conversation; `canInvoke` gates who may trigger agents.
export const ParticipantSchema = z.object({
	participantId: z.string().min(1),
	name: z.string().min(1),
	source: z.string(),
	canInvoke: z.boolean(),
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

/**
 * `Thread` (BC4 Thread & Routing, Core) — the binding of a conversation to a workspace + providers,
 * and its control plane: pause/resume, mention gate, participant invocation rights, and the rolling
 * context-buffer size. Invariants with teeth: providers non-empty, at least one invoker must
 * remain, and the steer-vs-direct mode guard (whispers only while live, direct messages only while
 * paused) lives on the aggregate via assertCanSteer/assertCanSendDirect since Thread owns `paused`.
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
			mentionGate: { enabled: false },
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

	/** Whether an inbound sender may invoke agents right now (pause + permission + mention gate). */
	canInvoke(input: { senderExternalId: string; text: string }): boolean {
		if (this.paused) return false
		const participant = this.participants.find(p => p.participantId === input.senderExternalId)
		if (participant && !participant.canInvoke) return false
		if (this.mentionGate.enabled && !input.text.includes(this.mentionGate.tag)) return false
		return true
	}

	/** Whispers (steer) are only valid while the thread is live — a paused thread uses direct mode. */
	assertCanSteer(): void {
		if (this.paused) throw new BaseError<ApplicationErrors>('THREAD_PAUSED', 'a paused thread uses direct mode')
	}

	/** Direct (operator) messages are only valid while paused — the agents must be silenced first. */
	assertCanSendDirect(): void {
		if (!this.paused) throw new BaseError<ApplicationErrors>('THREAD_NOT_PAUSED', 'direct conversation requires the agents to be paused')
	}

	setStatus(status: ThreadStatus): void {
		this.status = status
	}
}

export interface Thread extends ThreadProps {}
