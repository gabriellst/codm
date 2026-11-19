import type { Transaction } from '@codm/core-typescript'

/**
 * "IS THIS ISSUE OF THIS CONVERSATION?" — answered by the agent, which births every issue (fase 4, S0c).
 *
 * The batch receipt (S8, `thread/usecases/RecordBatch`) has to confirm that every issue a destination names is of
 * the conversation the batch came from, in the SAME turn the orchestrator forked them. `issue_issues` cannot answer
 * that: its row is materialized later, off the `issue.created` fact. `agent_issue_attributes` can — it is written
 * in the birth's own transaction — and issues older than fase 4 are there through migration 0037's backfill.
 *
 * A port on the `services` surface the `thread → agent` edge already consumes (its note in `thread/context.ts`).
 */
export abstract class ForkedIssueReader {
	abstract isOfThread(issueId: string, threadId: string, tx?: Transaction): Promise<boolean>
}
