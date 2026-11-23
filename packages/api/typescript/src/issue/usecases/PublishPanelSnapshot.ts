import { injectable } from 'tsyringe-neo'
import { createHash } from 'node:crypto'
import { and, asc, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import { Handler, LibSqlDatabaseDriver, LoggingService, z } from '@codm/core-typescript'
import { batchItems, batches, issues, threads } from '@codm/contracts/db'
import type { IssueStatus } from '@codm/contracts-typescript/wire/enums'
import { BatchItemDestinationSchema, type PanelHealth } from '@shared/objects'
import { PanelPublisher, type PanelBatchSnapshot, type PanelIssueSnapshot } from '../services/PanelPublisher'
import { lifeStateByIssue } from '../utils/issueLifeState'
import { panelHealthOf, QuotaStatusReader } from '@agent/services/QuotaStatusReader'
import { providerWaitByIssue, retryWaitByIssue } from '../utils/providerWaitByIssue'
import { assembleIssueTimeline } from '../utils/issueTimeline'

export const PublishPanelSnapshotInputSchema = z.object({})
export const PublishPanelSnapshotOutputSchema = z.object({
	/** Whether a batch went out (false: not logged in, or the cloud could not be reached). */
	sent: z.boolean(),
	groups: z.number().int(),
	issues: z.number().int(),
	batches: z.number().int(),
})

/** How long an archived issue keeps being reported — long enough for the panel to drop its card. */
const ARCHIVED_REPORT_WINDOW_MS = 48 * 60 * 60 * 1000
/** The cloud accepts at most this many timeline items per issue; the newest are kept. */
const TIMELINE_LIMIT = 2000
/** The cloud accepts at most this many issues per sync; the rest go on the next run. */
const BATCH_LIMIT = 500
/** How long a conversation's batch keeps being reported after its last change (fase 4, item 5). */
const BATCH_REPORT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
/** The cloud accepts at most this many batches per sync; the rest go on the next run. */
export const PANEL_BATCHES_LIMIT = 200

/**
 * Push the board to the cloud panel (fase 1, `.specs/2026-11-13-painel-na-nuvem-design.md`), every 15 s.
 *
 * Every run sends the groups (which is also the daemon's heartbeat — "sem contato há N min" on the panel)
 * and the owner's health badge (fase 4, item 7 — percentages and states only, `panelHealthOf`), and only the
 * issues and the batches (fase 4, item 5) whose content CHANGED since they were last sent, by fingerprint. A restart
 * forgets the fingerprints and resends everything once; the cloud's upserts make that harmless.
 *
 * Not logged in → nothing is sent and nothing is remembered. A cloud that cannot be reached is logged as a
 * warning and retried on the next run; it never fails the job queue.
 */
@injectable()
export class PublishPanelSnapshot extends Handler<typeof PublishPanelSnapshotInputSchema, typeof PublishPanelSnapshotOutputSchema> {
	readonly name = 'publish_panel_snapshot' as const
	readonly inputSchema = PublishPanelSnapshotInputSchema
	readonly outputSchema = PublishPanelSnapshotOutputSchema

	static readonly repeat = { every: 15 * 1000 }

	constructor(
		private readonly driver: LibSqlDatabaseDriver,
		private readonly publisher: PanelPublisher,
		private readonly logging: LoggingService,
		private readonly quota: QuotaStatusReader,
	) {
		super()
	}

	protected async handle(): Promise<this['output']> {
		const rows = await this.driver.db
			.select({
				issueId: issues.id,
				threadId: issues.threadId,
				key: issues.key,
				title: issues.title,
				status: issues.status,
				archived: issues.archived,
				threadName: threads.contactDisplayName,
			})
			.from(issues)
			.innerJoin(threads, and(eq(issues.threadId, threads.id), isNull(threads.deletedAt)))
			.where(or(eq(issues.archived, false), gt(issues.updatedAt, new Date(Date.now() - ARCHIVED_REPORT_WINDOW_MS))))

		const groups = [...new Map(rows.map(row => [row.threadId, { threadId: row.threadId, name: row.threadName }])).values()]
		const [life, waiting, retrying] = await Promise.all([
			lifeStateByIssue(
				this.driver,
				rows.map(row => ({ issueId: row.issueId, status: row.status as IssueStatus })),
				this.quota.holdsIssueLane(),
			),
			providerWaitByIssue(this.driver),
			retryWaitByIssue(this.driver),
		])

		const changed: { snapshot: PanelIssueSnapshot; fingerprint: string }[] = []
		const now = new Date().toISOString()
		for (const row of rows) {
			const lifeState = life.get(row.issueId)
			if (!lifeState) continue
			const timeline = (await assembleIssueTimeline(this.driver, row.issueId, row.title)).slice(-TIMELINE_LIMIT)
			const card = {
				issueId: row.issueId,
				threadId: row.threadId,
				key: row.key,
				title: row.title,
				status: row.status as IssueStatus,
				lifeState,
				waitingForProviderUntil: waiting.get(row.issueId)?.toISOString(),
				retryingAt: retrying.get(row.issueId)?.toISOString(),
				archived: row.archived,
				timeline,
			}
			const fingerprint = createHash('sha1').update(JSON.stringify(card)).digest('hex')
			if (this.publisher.changed(row.issueId, fingerprint)) changed.push({ snapshot: { ...card, updatedAt: now }, fingerprint })
		}
		const batch = changed.slice(0, BATCH_LIMIT)
		const changedBatches = (await this.batchesOf(groups.map(group => group.threadId)))
			.filter(item => this.publisher.changed(item.key, item.fingerprint))
			.slice(0, PANEL_BATCHES_LIMIT)
		const health = await this.health()

		try {
			const result = await this.publisher.publish({
				groups,
				issues: batch.map(item => item.snapshot),
				batches: changedBatches.map(item => item.snapshot),
				...(health && { health }),
			})
			if (result === undefined) return { sent: false, groups: groups.length, issues: 0, batches: 0 }
			for (const item of batch) this.publisher.rememberSent(item.snapshot.issueId, item.fingerprint)
			for (const item of changedBatches) this.publisher.rememberSent(item.key, item.fingerprint)
			return { sent: true, groups: groups.length, issues: batch.length, batches: changedBatches.length }
		} catch (error) {
			this.logging.warn({
				content: {
					message: 'panel sync failed — the next run retries',
					error: error instanceof Error ? error.message : String(error),
				},
			})
			return { sent: false, groups: groups.length, issues: 0, batches: 0 }
		}
	}

	/** The owner's badge as the dispatcher last saw it — absent before its first loop (nothing measured to report). */
	private async health(): Promise<PanelHealth | undefined> {
		const status = this.quota.current()
		if (!status) return undefined
		return panelHealthOf(status, (await this.quota.queue()).pending, new Date())
	}

	/** The reported groups' batches changed in the last `BATCH_REPORT_WINDOW_MS`, each with its fingerprint. */
	private async batchesOf(threadIds: readonly string[]): Promise<{ key: string; fingerprint: string; snapshot: PanelBatchSnapshot }[]> {
		if (threadIds.length === 0) return []
		const rows = await this.driver.db
			.select()
			.from(batches)
			.where(and(inArray(batches.threadId, [...threadIds]), gt(batches.updatedAt, new Date(Date.now() - BATCH_REPORT_WINDOW_MS))))
		if (rows.length === 0) return []
		const items = await this.driver.db
			.select()
			.from(batchItems)
			.where(
				inArray(
					batchItems.batchId,
					rows.map(row => row.id),
				),
			)
			.orderBy(asc(batchItems.n))
		return rows.map(row => {
			const snapshot: PanelBatchSnapshot = {
				threadId: row.threadId,
				batch: {
					code: row.code,
					status: row.status,
					sourceEntryId: row.sourceEntryId,
					items: items
						.filter(item => item.batchId === row.id)
						.map(item => ({
							n: item.n,
							excerpt: item.excerpt,
							...(item.destination !== null && { destination: BatchItemDestinationSchema.parse(item.destination) }),
						})),
				},
			}
			return { key: `batch:${row.id}`, fingerprint: createHash('sha1').update(JSON.stringify(snapshot)).digest('hex'), snapshot }
		})
	}
}
