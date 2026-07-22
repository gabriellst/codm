import type { OpenIssueRef } from '@terminal/services/IssueClassifier'

/**
 * Reads the open (non-completed, non-archived) issues of a thread — the classifier's context-match
 * candidate set. Modeled as a read Service (BFF-style table read, not a cross-context write-model
 * import): the classification decision needs to know what issues already exist on the thread.
 */
export abstract class OpenIssuesReader {
	abstract openIssues(threadId: string): Promise<OpenIssueRef[]>
	/** Resolve which issue a transcript entry was routed to (for reply-quote authority). */
	abstract issueIdForEntry(entryId: string): Promise<string | undefined>
}
