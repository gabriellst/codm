import { BaseDomainEvent, z } from '@codm/core-typescript'
import { ProviderKind } from '@codm/contracts-typescript/wire/enums'

export const IssueForkedEventSchema = z.domainEvent({
	issueId: z.string(),
	threadId: z.string(),
	key: z.string(),
	title: z.string(),
	/** The operator's ask, in their words — becomes the subagent's prompt. */
	goal: z.string(),
	/** The transcript entry that asked. The anchor the finished answer quotes (§7.6). */
	originEntryId: z.string(),
	/** Which CLI works it — resolved from the thread, carried so the materializer need not re-read. */
	provider: z.enum(ProviderKind),
})

/**
 * An issue was FORKED from a conversation (orchestrator pivot §7.2): the operator asked for it out
 * loud and the orchestrator declared it through the `issue/create` tool.
 *
 * ### Why it is an AGENT fact and not an issue one
 * Same reason `AgentRunStartedEvent` is: the agent runtime is what witnessed the declaration, and the
 * issue context learns about it the way it learns about every execution fact — through the integration
 * event, materialising its own row. Putting the fact in `issue` would mean the agent context raising
 * another context's domain event, which the cross-context policy forbids outright.
 *
 * ### Why it is separate from `AgentRunStartedEvent` / `issue.opened`
 * They answer different questions at different moments. `issue.opened` says "a worker's first turn is
 * spawning". This says "an issue was born because someone asked", and no work has started. Collapsing
 * them would erase exactly the distinction D1 protects — that an issue is a DECLARED fork, never a
 * side effect of something running.
 *
 * It carries the full shape because it has two independent consumers that cannot re-read the row:
 * the bridge that maps it to `integration.issue.created`, and (in the issue context) the materialiser
 * that creates the row itself.
 */
export class IssueForkedEvent extends BaseDomainEvent<typeof IssueForkedEventSchema> {
	static override readonly name = 'agent.issue_forked' as const
	static readonly schema = IssueForkedEventSchema
}
