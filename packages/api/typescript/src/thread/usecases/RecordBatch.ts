import { injectable } from 'tsyringe-neo'
import { BaseError, CommandQueue, Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import {
	BatchItemDestinationKind,
	MailboxClaimClass,
	MailboxItemKind,
	MailboxTargetKind,
	OutputRouting,
	PermissionPosture,
	StopResolution,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { ForkedIssueReader } from '@agent/services/ForkedIssueReader'
import { PanelPublisher } from '@issue/services/PanelPublisher'
import { ReopenIssue } from '@issue/usecases/ReopenIssue'
import { CloudSession } from '@shared/services/CloudSession'
import { resolveThreadLanguage } from '@shared/i18n/messages'
import { BATCH_ITEMS_MAX, BatchItemDestinationSchema, BatchItemSchema, BatchSchema } from '@shared/objects'
import { type Batch, linkedIssueOf } from '../entities/Batch'
import type { Thread, TranscriptEntry } from '../entities/Thread'
import { THREAD_MESSAGES } from '../i18n/messages'
import { BatchRepository } from '../repositories/BatchRepository'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { OpenIssuesReader } from '../services/OpenIssuesReader'
import { enqueueSignalDelivery, issueLink, QUOTES_ORIGIN } from '../utils/issueSignal'
import { BATCH_RECEIPT_LEVEL, routeSignal } from '../utils/OutputPolicy'
import type { ApplicationErrors } from '../errors'

export const RecordBatchInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	batchCode: BatchSchema.shape.code,
	items: z
		.array(z.object({ n: BatchItemSchema.shape.n, destination: BatchItemDestinationSchema }))
		.min(1)
		.max(BATCH_ITEMS_MAX),
})
export const RecordBatchOutputSchema = z.object({
	batchCode: z.string(),
	/** The receipt's transcript entry — the same one when the batch was already recorded. */
	receiptEntryId: z.uuid(),
	/** Where the receipt went — the policy's routing for the group's mode. */
	routing: z.enum(OutputRouting),
})

/**
 * How the batch's own `STALLED` notice closes when the batch is recorded after it (`FollowUpIncompleteBatches` raised
 * it under the batch's id). `RETRY` is the STALLED resolution that means "the work went on" (`RESOLUTIONS_BY_KIND`);
 * the stop has no issue, so `ResumeIssueOnStopResolved` queues nothing for it. Resolved by codm, never elevating.
 */
export const BATCH_STALL_CLOSED_BY = StopResolution.RETRY

/**
 * What an ATTACHED item does besides being recorded — it is guidance to that task, queued as its steer. Total over
 * the destination kinds: every other destination is a record and nothing more (a new issue was forked by the turn
 * itself, a decision is already asked, the rest go nowhere).
 */
const STEERS_ISSUE: Readonly<Record<BatchItemDestinationKind, boolean>> = {
	[BatchItemDestinationKind.ATTACHED]: true,
	[BatchItemDestinationKind.NEW_ISSUE]: false,
	[BatchItemDestinationKind.ALREADY_LIVE]: false,
	[BatchItemDestinationKind.NEEDS_DECISION]: false,
	[BatchItemDestinationKind.DECLINED]: false,
	[BatchItemDestinationKind.DEFERRED]: false,
}

/**
 * THE ORCHESTRATOR RECORDS WHERE EACH ITEM OF A BATCH WENT (fase 4, item 5), and the group gets ONE receipt.
 *
 * In one transaction:
 *  1. every issue a destination names must be of THIS conversation — asked of the agent (`ForkedIssueReader`), which
 *     answers from the table its fork writes, so an issue forked in this very turn already counts; else
 *     `BATCH_ISSUE_NOT_IN_THREAD`;
 *  2. the `Batch` records the whole set — every item 1..N exactly once, or `BATCH_ITEMS_MISMATCH` naming what is
 *     missing, and nothing is written;
 *  3. an ATTACHED item becomes that task's steer, signed by whoever listed it;
 *  4. the receipt is composed (no model) and goes through the OUTPUT POLICY at `BATCH_RECEIPT_LEVEL` — the group's
 *     mode decides between its own message and the panel's line — and the batch turns `RECORDED` with it;
 *  5. the batch's `STALLED` notice, when the sweep already raised one, is resolved (`BATCH_STALL_CLOSED_BY`).
 *
 * A batch already `RECORDED` answers with its receipt and does nothing else: the receipt is said once.
 */
@injectable()
export class RecordBatch extends Handler<typeof RecordBatchInputSchema, typeof RecordBatchOutputSchema> {
	readonly name = 'record_batch' as const
	readonly inputSchema = RecordBatchInputSchema
	readonly outputSchema = RecordBatchOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly batches: BatchRepository,
		private readonly forkedIssues: ForkedIssueReader,
		private readonly openIssues: OpenIssuesReader,
		private readonly reopenIssue: ReopenIssue,
		private readonly mailbox: MailboxRepository,
		private readonly commands: CommandQueue,
		private readonly session: CloudSession,
		private readonly panel: PanelPublisher,
		private readonly consumed: ConsumedMessageRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const thread = await this.threads.findById(input.threadId, tx)
		if (!thread || thread.deletedAt || thread.ownerId !== input.ownerId) {
			throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)
		}
		const ownerLanguage = thread.language ? undefined : (await this.session.identity())?.user.language
		const language = resolveThreadLanguage(thread.language, ownerLanguage)

		return this.withTransaction(tx, async tx => {
			const batch = await this.batches.findByCode(thread.id.value, input.batchCode, tx)
			if (!batch) throw new BaseError<ApplicationErrors>('BATCH_NOT_FOUND', `no batch ${input.batchCode} in this conversation`)
			if (batch.recorded && batch.receiptEntryId) {
				const said = await this.threads.findEntry(batch.receiptEntryId, tx)
				return { batchCode: batch.code, receiptEntryId: batch.receiptEntryId, routing: said?.routing ?? OutputRouting.PANEL }
			}

			for (const { destination } of input.items) {
				const issueId = linkedIssueOf(destination)
				if (issueId !== undefined && !(await this.forkedIssues.isOfThread(issueId, thread.id.value, tx))) {
					throw new BaseError<ApplicationErrors>('BATCH_ISSUE_NOT_IN_THREAD', `issue ${issueId} is not of this conversation`)
				}
			}
			batch.recordDestinations(input.items, new Date())

			const source = await this.threads.findEntry(batch.sourceEntryId, tx)
			for (const item of batch.items) {
				if (item.destination && STEERS_ISSUE[item.destination.kind]) await this.steer(thread, batch, item, source, tx)
			}

			const receipt = this.receipt(thread, batch, source, language)
			// The batch's STALLED notice, if the sweep raised one, is answered by this record — never left open.
			const stalled = await this.threads.findStop(batch.id.value, tx)
			if (stalled && !stalled.resolvedAt) thread.resolveStop(stalled, BATCH_STALL_CLOSED_BY, PermissionPosture.AUTO)
			await this.threads.save(thread, tx)
			await this.domainEventRepository.saveMany(thread.pullDomainEvents(), tx)
			batch.recordReceipt(receipt.entry.entryId)
			await this.batches.save(batch, tx)
			const quotedMessageId = receipt.entry.quotedEntryId ? await this.consumed.findPlatformId(receipt.entry.quotedEntryId, tx) : undefined
			await enqueueSignalDelivery(this.commands, thread, receipt.entry, receipt.routing, tx, { quotedMessageId })
			return { batchCode: batch.code, receiptEntryId: receipt.entry.entryId, routing: receipt.routing }
		})
	}

	/** The receipt on the conversation, routed by the group's mode at the receipt's level — recorded on `thread`. */
	private receipt(
		thread: Thread,
		batch: Batch,
		source: TranscriptEntry | undefined,
		language: ReturnType<typeof resolveThreadLanguage>,
	): { entry: TranscriptEntry; routing: OutputRouting } {
		const kinds = Object.values(BatchItemDestinationKind)
		const counts = Object.fromEntries(kinds.map(kind => [kind, 0])) as Record<BatchItemDestinationKind, number>
		for (const { destination } of batch.items) if (destination) counts[destination.kind] += 1
		const reasons = batch.receiptReasons()
		const routing = routeSignal(thread.outputMode, BATCH_RECEIPT_LEVEL)
		const quotes = QUOTES_ORIGIN[BATCH_RECEIPT_LEVEL] && source?.threadId === thread.id.value
		const entry = thread.recordEntry({
			kind: TranscriptKind.SYSTEM,
			text: THREAD_MESSAGES.batchReceipt(language, {
				code: batch.code,
				total: batch.items.length,
				counts,
				reasons,
				link: issueLink(this.panel.linkOf(thread.id.value), batch.code),
			}),
			quotedEntry: quotes && source ? { entryId: source.entryId, threadId: source.threadId } : undefined,
			level: BATCH_RECEIPT_LEVEL,
			routing,
			// The person the receipt answers — whoever listed the items.
			addresseeId: source?.senderExternalId,
		})
		return { entry, routing }
	}

	/** An ATTACHED item is guidance to that task — its steer, in the words of whoever listed it. */
	private async steer(
		thread: Thread,
		batch: Batch,
		item: Batch['items'][number],
		source: TranscriptEntry | undefined,
		tx: Transaction,
	): Promise<void> {
		const issueId = item.destination ? linkedIssueOf(item.destination) : undefined
		if (issueId === undefined) return
		const target = await this.openIssues.steerableIssue(thread.id.value, issueId, tx)
		if (!target) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no steerable issue ${issueId} here`)
		// Same order as SteerIssueTurn: a finished issue is reopened in the SAME transaction as the enqueue.
		if (target.needsReopen) await this.reopenIssue.execute({ ownerId: thread.ownerId, issueId }, tx)
		const sender = source?.senderExternalId
		const speaker = sender ? thread.displayNameOf(sender) : undefined
		await this.mailbox.enqueue(
			{
				ownerId: thread.ownerId,
				targetKind: MailboxTargetKind.ISSUE,
				targetId: issueId,
				kind: MailboxItemKind.STEER,
				claimClass: MailboxClaimClass.STEER,
				posture: sender ? thread.postureOf(sender) : PermissionPosture.AUTO,
				payload: {
					issueId,
					threadId: thread.id.value,
					key: target.key,
					title: target.title,
					// The PERSON's words, signed by them — never a paraphrase — and which item of which batch they are.
					text: `${speaker ? `${speaker}: ` : ''}${item.excerpt}\n(item ${item.n} do lote ${batch.code})`,
				},
				dedupKey: `batch:${batch.id.value}:${item.n}`,
			},
			tx,
		)
	}
}
