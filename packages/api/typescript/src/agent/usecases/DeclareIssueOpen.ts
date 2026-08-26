import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { AgentRunStartedEvent } from '../events/AgentRunStartedEvent'
import { ISSUE_KEY_FALLBACK, slugify } from '@shared/utils/slug'

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
 * wire. The key is a slug of the title; uniqueness within the thread is the DB's invariant and
 * `OpenIssue` is a no-op on a redelivery, so a collision degrades to "same issue" rather than a crash.
 */
@injectable()
export class DeclareIssueOpen extends Handler<typeof DeclareIssueOpenInputSchema, typeof DeclareIssueOpenOutputSchema> {
	readonly name = 'declare_issue_open' as const
	readonly inputSchema = DeclareIssueOpenInputSchema
	readonly outputSchema = DeclareIssueOpenOutputSchema

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const issueId = uuidv7()
		const key = slugify(input.title, ISSUE_KEY_FALLBACK)
		await this.withTransaction(tx, async tx => {
			await this.domainEventRepository.save(
				new AgentRunStartedEvent({
					entityId: issueId,
					ownerId: input.ownerId,
					payload: { issueId, threadId: input.threadId, key, title: input.title, provider: input.provider },
				}),
				tx,
			)
		})
		return { issueId, key }
	}
}
