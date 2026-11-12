import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { BaseError, Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { WorkspaceRepository } from '@workspace/repositories/WorkspaceRepository'
import { issuePrefixOf } from '@workspace/objects'
import { AgentRunStartedEvent } from '../events/AgentRunStartedEvent'
import { IssueSequenceRepository } from '../repositories/IssueSequenceRepository'
import type { AgentInterfaceErrors } from '../errors'

export const DeclareIssueOpenInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	title: z.string().trim().min(1).max(200),
	provider: z.enum(ProviderKind),
})

export const DeclareIssueOpenOutputSchema = z.object({ issueId: z.uuid(), key: z.string() })

/**
 * The agent DECLARES a new issue (GOAL-agent-abstraction Fase 6). Until this phase an issue could
 * only ever materialize as a side effect of a run starting — there was no way for an agent that
 * discovered a second, separable unit of work to say so.
 *
 * ### It reuses `AgentRunStartedEvent`, and that is the point rather than a shortcut
 * §4.3 rule 7 and §4.4 both forbid a SECOND publisher of a frozen integration event. The only
 * publisher of `integration.issue.opened` is `PublishAgentIntegrationEvents`, driven by this exact
 * domain-event class, and `OpenIssue` on the far side is idempotent. Minting a parallel
 * `AgentIssueDeclaredEvent` would give the bridge a second branch mapping to the same frozen event —
 * which is the double-publish shape AC-6.4 exists to catch, arriving through a different door.
 *
 * ### Ids are minted HERE, not accepted from the caller
 * A model does not get to choose an issue's identity: it would let one run adopt another run's issue
 * by guessing a uuid, and it would make the row's identity depend on a value that arrives over the
 * wire. The key is the short `<PREFIX>-<n>` drawn per workspace (`IssueSequenceRepository`); uniqueness is the DB's invariant and
 * `OpenIssue` is a no-op on a redelivery, so a collision degrades to "same issue" rather than a crash.
 */
@injectable()
export class DeclareIssueOpen extends Handler<typeof DeclareIssueOpenInputSchema, typeof DeclareIssueOpenOutputSchema> {
	readonly name = 'declare_issue_open' as const
	readonly inputSchema = DeclareIssueOpenInputSchema
	readonly outputSchema = DeclareIssueOpenOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly workspaces: WorkspaceRepository,
		private readonly sequences: IssueSequenceRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const issueId = uuidv7()
		const thread = await this.threads.findById(input.threadId)
		if (!thread) throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_SCOPE_MISMATCH', 'the thread this run is scoped to no longer exists')
		const workspace = await this.workspaces.findById(thread.workspaceId)
		if (!workspace)
			throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_SCOPE_MISMATCH', 'the workspace this run is scoped to is no longer bound')

		const key = await this.withTransaction(tx, async tx => {
			// Same short key as `ForkIssue` — `<PREFIX>-<n>`, drawn in this transaction.
			const key = `${issuePrefixOf(workspace.path)}-${await this.sequences.next(workspace.id.value, tx)}`
			await this.domainEventRepository.save(
				new AgentRunStartedEvent({
					entityId: issueId,
					ownerId: input.ownerId,
					payload: { issueId, threadId: input.threadId, key, title: input.title, provider: input.provider },
				}),
				tx,
			)
			return key
		})
		return { issueId, key }
	}
}
