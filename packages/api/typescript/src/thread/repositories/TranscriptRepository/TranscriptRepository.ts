import type { Transaction } from '@template/core-typescript'
import type { TranscriptKind, ProviderKind, ClassificationMethod } from '@template/contracts-typescript/wire/enums'

export interface TranscriptEntryRow {
	entryId: string
	ownerId: string
	threadId: string
	kind: TranscriptKind
	text: string
	issueId?: string
	quotedEntryId?: string
	senderExternalId?: string
	provider?: ProviderKind
	classification?: ClassificationMethod
	at: Date
}

export interface AppendTranscriptInput {
	ownerId: string
	threadId: string
	kind: TranscriptKind
	text: string
	issueId?: string
	quotedEntryId?: string
	senderExternalId?: string
	provider?: ProviderKind
	classification?: ClassificationMethod
	at?: Date
}

/**
 * The TranscriptEntry store (the conversation + audit log). A distinct entity within BC4 — queried
 * per thread (T09 SessionChat) and per issue (T12 IssueDetail). Every classification decision, chat
 * bubble, whisper and direct message is appended here (auditability NFR).
 */
export abstract class TranscriptRepository {
	abstract append(input: AppendTranscriptInput, tx?: Transaction): Promise<TranscriptEntryRow>
	abstract findById(entryId: string, tx?: Transaction): Promise<TranscriptEntryRow | undefined>
	// Rolling context buffer: the most recent N entries for a thread (chronological).
	abstract recentByThread(threadId: string, limit: number, tx?: Transaction): Promise<TranscriptEntryRow[]>
	abstract listByThread(threadId: string, tx?: Transaction): Promise<TranscriptEntryRow[]>
	abstract listByIssue(issueId: string, tx?: Transaction): Promise<TranscriptEntryRow[]>
	// Open issues on a thread (their ids) — the classifier's context-match candidate set.
	abstract setIssueId(entryId: string, issueId: string, tx?: Transaction): Promise<void>
}
