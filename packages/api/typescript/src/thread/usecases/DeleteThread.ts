import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { OpenIssuesReader } from '../services/OpenIssuesReader'
import type { ApplicationErrors } from '../errors'

export const DeleteThreadInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid() })
export const DeleteThreadOutputSchema = z.void()

/**
 * C-DEL DeleteThread — apagar uma conversa configurada (thread-deletion spec, decisions 1, 2, 6, 8).
 *
 * SOFT: `Thread.delete()` stamps `deletedAt` and nothing else moves. The transcript, the issues, the
 * stops and the artifacts all stay in the database (decision 1) — what the operator is removing is the
 * CONFIGURATION, not the history. Every console read filters the column out (decision 5) and inbound
 * messages from that contact go back to being treated as unattached (decision 3).
 *
 * ### The guard this use case owns, and why it is not on the entity
 * "Trabalho vivo bloqueia" (decision 2) is CROSS-AGGREGATE. A WORKING issue is a row of another bounded
 * context, reached here through the sanctioned read seam `OpenIssuesReader`; an open stop is a child
 * `Thread` deliberately does not hydrate (`findById` is one row, forever). The aggregate can verify
 * neither, so handing it the two booleans would be pretending it decided something it was told. It reads
 * both and raises THREAD_HAS_ACTIVE_WORK — an ApplicationError, never a 200.
 *
 * Both facts are read BEFORE the transaction opens. They are reads of rows this use case does not write,
 * and the alternative — holding SQLite's single write lock across them — buys no atomicity that matters:
 * an issue that starts working in the microseconds after the check is the same race as one that starts
 * the microsecond after the commit, and the ingest gate (decision 3) is what actually keeps a deleted
 * thread from acquiring new work.
 *
 * ### No event, and that is decision 6
 * Nothing is published. The console is single-operator and invalidates its queries on the mutation's
 * `onSuccess`, so there is no consumer for `thread.deleted` — an outbox row nobody reads costs a write
 * and tells the next reader that something reacts to it.
 */
@injectable()
export class DeleteThread extends Handler<typeof DeleteThreadInputSchema, typeof DeleteThreadOutputSchema> {
	readonly name = 'delete_thread' as const
	readonly inputSchema = DeleteThreadInputSchema
	readonly outputSchema = DeleteThreadOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly openIssues: OpenIssuesReader,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		// NOT filtered on `deletedAt` — deliberately. This is the write-side read, and it must see the
		// deleted row for `Thread.delete()` to be able to refuse the second call (AC-1). A repository that
		// hid it would turn a stale-screen double-delete into a THREAD_NOT_FOUND, which says the wrong
		// thing: the thread exists, it is just already gone.
		const thread = await this.threads.findById(input.threadId)
		if (!thread || thread.ownerId !== input.ownerId)
			throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)

		const [hasWorkingIssue, openStops] = await Promise.all([
			this.openIssues.hasWorkingIssue(input.threadId),
			this.threads.openStops(input.threadId),
		])
		if (hasWorkingIssue || openStops.length > 0) {
			throw new BaseError<ApplicationErrors>(
				'THREAD_HAS_ACTIVE_WORK',
				hasWorkingIssue ? 'an agent is still working on this thread' : 'this thread has an unresolved stop',
			)
		}

		thread.delete()

		await this.withTransaction(tx, async tx => {
			await this.threads.save(thread, tx)
		})
	}
}
