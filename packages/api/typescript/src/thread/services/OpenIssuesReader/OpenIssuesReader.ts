/**
 * An open issue a message could be routed to — the element type this reader returns.
 *
 * It LIVES HERE, in the thread context, and Fase 5 moved it here from the agent context
 * (GOAL-agent-abstraction §5.3). The reason is direction, not tidiness: an "open issue of a thread" is
 * a THREAD concept, and having the agent context own it forced `thread/` to import a type from the
 * consumer of its own read seam. Owned here, the dependency points the way the CONTEXT_MAP already
 * declares — `agent → thread` — and `IssueRouter` (which renders these into the classification prompt)
 * is the importer rather than the exporter.
 */
export interface OpenIssueRef {
	issueId: string
	key: string
	title: string
}

/**
 * Reads the open (non-completed, non-archived) issues of a thread — the classifier's context-match
 * candidate set. Modeled as a read Service (BFF-style table read, not a cross-context write-model
 * import): the classification decision needs to know what issues already exist on the thread.
 */
export abstract class OpenIssuesReader {
	abstract openIssues(threadId: string): Promise<OpenIssueRef[]>
	/** Resolve which issue a transcript entry was routed to (for reply-quote authority). */
	abstract issueIdForEntry(entryId: string): Promise<string | undefined>
	/**
	 * Is an agent WORKING on this thread right now? The live-work half of the delete guard
	 * (thread-deletion spec, decision 2), which `DeleteThread` pairs with `ThreadRepository.openStops`.
	 *
	 * Deliberately narrower than `openIssues`, and the two must not be conflated: `openIssues` is the
	 * classifier's candidate set (anything non-archived and non-COMPLETED — a NEEDS_INPUT issue belongs
	 * in it), while this asks the far smaller question the decision names, "non-archived AND WORKING".
	 * An operator whose thread is full of issues waiting on THEM must still be able to delete it.
	 */
	abstract hasWorkingIssue(threadId: string): Promise<boolean>
}
