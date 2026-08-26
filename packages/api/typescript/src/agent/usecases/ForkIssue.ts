import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'
import { ISSUE_KEY_FALLBACK, uniqueSlugKey } from '@shared/utils/slug'
import { OpenIssuesReader } from '@thread/services/OpenIssuesReader'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { MailboxRepository } from '../repositories/MailboxRepository'
import { IssueForkedEvent } from '../events/IssueForkedEvent'
import type { AgentApplicationErrors, AgentInterfaceErrors } from '../errors'

export const ForkIssueInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	/** What the operator asked for, in their words (§7.2 — `{ goal }` is all the tool takes from the model). */
	goal: z.string().trim().min(1).max(2000),
	/**
	 * The transcript entry that asked. INJECTED from the run token's claims, never an argument the
	 * model supplies (§7.2): a model able to name the message it was "answering" could attribute its
	 * issue to any line in the conversation, and the finished answer would quote a message nobody
	 * wrote it about.
	 */
	originEntryId: z.uuid(),
	// NO `provider` FIELD. It used to arrive on the wire — the controller resolved it via
	// `ThreadRepository` and forwarded it. import-direction#R1 moved that repository lookup HERE
	// (controllers never touch repositories), so `handle()` now resolves it itself from `threadId`
	// instead of trusting a caller-supplied value.
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
 *
 * ### Why the thread + provider lookup lives HERE (moved from `ForkIssueController`, import-direction#R1)
 * `ThreadRepository` was injected in the controller only to answer two questions the use case needs
 * anyway before it can act: "does this thread still exist" and "which CLI does it run". Both gate what
 * `handle()` does next (the mailbox payload and the event both carry `provider`), so the read belongs
 * on this side of the HTTP boundary — the controller's job is validating the request shape and calling
 * a use case, not resolving domain state. `agent → thread` is already the documented partnership edge
 * (`context-map.ts`) other use cases in this context read through (`GetOpenStops`, `RunOrchestratorTurn`).
 */
@injectable()
export class ForkIssue extends Handler<typeof ForkIssueInputSchema, typeof ForkIssueOutputSchema> {
	readonly name = 'fork_issue' as const
	readonly inputSchema = ForkIssueInputSchema
	readonly outputSchema = ForkIssueOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly openIssues: OpenIssuesReader,
		private readonly mailbox: MailboxRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// A thread that vanished between minting and this call. Reported as a SCOPE failure rather than a
		// new error code: the run is confined to a thread that no longer resolves, so the call is out of
		// scope in the most literal sense.
		const thread = await this.threads.findById(input.threadId)
		if (!thread) throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_SCOPE_MISMATCH', 'the thread this run is scoped to no longer exists')

		const provider = thread.providers[0]
		if (!provider) throw new BaseError<AgentApplicationErrors>('PROVIDER_NOT_DETECTED', 'this thread has no provider bound')

		const issueId = uuidv7()
		// The title IS the goal, truncated: the operator described the work in words and there is no
		// second field to invent one from. The key stays short because a human reads it in a chat
		// message; `goal` stays whole because a CLI reads it as a prompt.
		const title = input.goal.slice(0, 200)
		const open = await this.openIssues.openIssues(input.threadId)
		const key = uniqueSlugKey(
			title,
			open.map(issue => issue.key),
			ISSUE_KEY_FALLBACK,
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
						provider,
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
						provider,
					},
				}),
				tx,
			)
		})

		return { issueId, key }
	}
}
