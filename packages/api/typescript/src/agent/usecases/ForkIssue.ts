import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { uniqueSlugKey } from '@shared/services'
import { OpenIssuesReader } from '@thread/services'
import { MailboxRepository } from '../repositories'
import { IssueForkedEvent } from '../events/IssueForkedEvent'

export const ForkIssueInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	/** The operator's ask, in their words (§7.2 — `{ goal }` is all the tool takes from the model). */
	goal: z.string().trim().min(1).max(2000),
	/**
	 * The transcript entry that asked. INJECTED from the run token's claims, never an argument the
	 * model supplies (§7.2): a model able to name the message it was "answering" could attribute its
	 * issue to any line in the conversation, and the finished answer would quote a message nobody
	 * wrote it about.
	 */
	originEntryId: z.uuid(),
	/** The CLI that will work it — the thread's choice, not the model's. */
	provider: z.enum(ProviderKind),
})

export const ForkIssueOutputSchema = z.object({ issueId: z.uuid(), key: z.string() })

/**
 * Fork an issue out of a conversation (orchestrator pivot §7.2) — the write half of `issue/create`.
 *
 * ### Where the row comes from, and why not from here
 * This context does not create issue rows; it never has. `DeclareIssueOpen` mints an id and raises a
 * fact, and the ISSUE context materialises the aggregate off the integration event
 * (`MaterializeIssueFromExecution`). This use case is the same shape, and deliberately so: the
 * alternative — importing `IssueRepository` to write the row inline — would turn the `agent → issue`
 * edge from what its note in `context-map.ts` says it is ("a DECLARATION, not a call: nothing is
 * constructed, nothing is invoked, no state crosses") into a live runtime data dependency, and the
 * note would silently become false while the rail stayed green.
 *
 * ### What IS atomic here, and why that is the part that matters
 * §7.2 asks for "row + item `WORK` na mailbox da issue (mesma tx)". The row and the mailbox live in
 * different contexts, so that literal transaction is not expressible. What this commits together is
 * the `WORK` item and the FACT — which is the pairing the requirement was actually protecting:
 *
 *   - the item is what SCHEDULES the turn, so committing it with the fact means an issue that was
 *     declared always gets worked, and one that was rolled back never does;
 *   - the row is a read-model of the same fact, materialised at-least-once off the outbox, and the
 *     mailbox's unique `dedupKey` makes redelivery enqueue nothing.
 *
 * The ack (D4) does not wait for the row: the id and key are minted HERE, so the tool answers in the
 * same turn it was called, which is the whole point of the acknowledgement.
 *
 * ### Why the key is slugged against the THREAD's open issues
 * `key` is thread-unique and doubles as the outbound label ("criei a issue dark-mode-toggle"), so it
 * is read by a human in a chat message. `OpenIssuesReader` is the read seam this context already uses
 * for exactly this — the same one `IssueRouter` slugs against today — which is why no new dependency
 * appears here.
 */
@injectable()
export class ForkIssue extends Handler<typeof ForkIssueInputSchema, typeof ForkIssueOutputSchema> {
	readonly name = 'fork_issue' as const
	readonly inputSchema = ForkIssueInputSchema
	readonly outputSchema = ForkIssueOutputSchema

	constructor(
		private readonly openIssues: OpenIssuesReader,
		private readonly mailbox: MailboxRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const issueId = uuidv7()
		// The title IS the goal, truncated: the operator described the work in words and there is no
		// second field to invent one from. The key stays short because a human reads it in a chat
		// message; `goal` stays whole because a CLI reads it as a prompt.
		const title = input.goal.slice(0, 200)
		const open = await this.openIssues.openIssues(input.threadId)
		const key = uniqueSlugKey(
			title,
			open.map(issue => issue.key),
		)

		await this.withTransaction(tx, async tx => {
			await this.mailbox.enqueue(
				{
					ownerId: input.ownerId,
					targetKind: MailboxTargetKind.ISSUE,
					targetId: issueId,
					kind: MailboxItemKind.WORK,
					// `originEntryId` rides along so the finished turn can put it on the ISSUE_RESULT without
					// reading the issue row — the agent context has no runtime read of `issue` (the declared
					// edge is declaration-only), and the value is already in hand here.
					payload: {
						issueId,
						threadId: input.threadId,
						key,
						title,
						goal: input.goal,
						provider: input.provider,
						originEntryId: input.originEntryId,
					},
					// The issue can be forked exactly once, so its own id IS the idempotency key. A redelivered
					// fact re-inserts, conflicts on the unique index, and schedules nothing.
					dedupKey: `work:${issueId}`,
				},
				tx,
			)
			await this.domainEventRepository.save(
				new IssueForkedEvent({
					entityId: issueId,
					ownerId: input.ownerId,
					payload: {
						issueId,
						threadId: input.threadId,
						key,
						title,
						goal: input.goal,
						originEntryId: input.originEntryId,
						provider: input.provider,
					},
				}),
				tx,
			)
		})

		return { issueId, key }
	}
}
