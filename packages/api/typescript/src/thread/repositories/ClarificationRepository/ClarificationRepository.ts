import type { Transaction } from '@template/core-typescript'

export interface ClarificationRow {
	id: string
	ownerId: string
	threadId: string
	entryId: string
	senderExternalId: string
	question: string
	candidateIssueIds: string[]
	askedAt: Date
	resolvedAt?: Date
}

export interface OpenClarificationInput {
	ownerId: string
	threadId: string
	entryId: string
	senderExternalId: string
	question: string
	candidateIssueIds: string[]
}

/**
 * The Router's pending-clarification record (Router is a Service, not an aggregate). Invariant
 * enforced here: at most ONE open clarification per (thread, sender). A new inbound from that sender
 * first tries to resolve the open one via reply-quote.
 */
export abstract class ClarificationRepository {
	abstract open(input: OpenClarificationInput, tx?: Transaction): Promise<ClarificationRow>
	abstract findOpen(threadId: string, senderExternalId: string, tx?: Transaction): Promise<ClarificationRow | undefined>
	abstract resolve(id: string, tx?: Transaction): Promise<void>
}
