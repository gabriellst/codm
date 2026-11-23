import { injectable } from 'tsyringe-neo'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { LibSqlDatabaseDriver, Handler, z, BaseError } from '@codm/core-typescript'
import { agentMailbox, issues, stops, terminalLines, transcriptEntries } from '@codm/contracts/db'
import {
	IssueLifeState,
	IssueStatus,
	MailboxItemKind,
	MailboxTargetKind,
	ProviderKind,
	StopKind,
	TranscriptKind,
	ClassificationMethod,
} from '@codm/contracts-typescript/wire/enums'
import type { ApplicationErrors } from '../errors'
import { providerWaitByIssue, retryWaitByIssue } from '../utils/providerWaitByIssue'
import { lifeStateByIssue } from '../utils/issueLifeState'
import { QuotaStatusReader } from '@agent/services/QuotaStatusReader'
import { DeclaredWaitReader } from '@agent/services/DeclaredWaitReader'

/** A STEER item's payload carries the message as `text` (`SteerIssueTurn`); anything else reads as empty. */
const SteerPayloadSchema = z.object({ text: z.string() })

function steerText(payload: unknown): string {
	const parsed = SteerPayloadSchema.safeParse(payload)
	return parsed.success ? parsed.data.text : ''
}

export const GetIssueDetailInputSchema = z.object({ ownerId: z.uuid(), issueId: z.uuid() })
export const GetIssueDetailOutputSchema = z.object({
	issue: z.object({
		issueId: z.uuid(),
		key: z.string(),
		title: z.string(),
		status: z.enum(IssueStatus),
		meta: z.string().optional(),
		archived: z.boolean(),
		/**
		 * Someone paused THIS issue (fase 2, item 2) — what the pause/resume button reads. The conversation's
		 * own pause is not folded in: it is shown on the conversation, and `lifeState` = PAUSED covers both.
		 */
		paused: z.boolean(),
		/** ISO instant until which the issue waits on the provider's usage limit; absent when it is not. */
		waitingForProviderUntil: z.string().optional(),
		/** Fase 5 — ISO instant of a failed turn's next attempt (`WAITING_RETRY`); absent otherwise (filled from S2). */
		retryingAt: z.string().optional(),
		/** Fase 5 — ISO instant the supervisor last escalated the issue (badge only; nobody is messaged); absent otherwise (filled from S5). */
		escalatedAt: z.string().optional(),
		/** Where the work stands right now, by rule (`lifeStateOf`). */
		lifeState: z.enum(IssueLifeState),
	}),
	provider: z.enum(ProviderKind),
	terminalLog: z.array(z.object({ at: z.string(), line: z.string() })),
	routedMessages: z.array(
		z.object({
			entryId: z.uuid(),
			kind: z.enum(TranscriptKind),
			text: z.string(),
			at: z.string(),
			classification: z.enum(ClassificationMethod).optional(),
		}),
	),
	stops: z.array(z.object({ stopId: z.uuid(), kind: z.enum(StopKind), title: z.string(), detail: z.string(), raisedAt: z.string() })),
	/**
	 * Every message steered to this issue, oldest first, with the three instants a person asks about:
	 * sent (`sentAt`), handed to the issue's session (`deliveredAt`, "entregue") and done with by that
	 * turn (`readAt`, "lido"). `failed` when the queue gave up on it (poisoned). Absent instants mean the
	 * step has not happened yet — a steer waiting behind a running turn has `sentAt` only.
	 */
	steers: z.array(
		z.object({
			text: z.string(),
			sentAt: z.string(),
			deliveredAt: z.string().optional(),
			readAt: z.string().optional(),
			failed: z.boolean(),
		}),
	),
})

/** Read — IssueDetail (T12). One issue drill-down: terminal session log, the messages routed here,
 *  and its open stops. */
@injectable()
export class GetIssueDetail extends Handler<typeof GetIssueDetailInputSchema, typeof GetIssueDetailOutputSchema> {
	readonly name = 'get_issue_detail' as const
	readonly inputSchema = GetIssueDetailInputSchema
	readonly outputSchema = GetIssueDetailOutputSchema

	constructor(
		private readonly driver: LibSqlDatabaseDriver,
		private readonly quota: QuotaStatusReader,
		private readonly declaredWait: DeclaredWaitReader,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const [issue] = await this.driver.db.select().from(issues).where(eq(issues.id, input.issueId)).limit(1)
		if (!issue || issue.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${input.issueId}`)

		const lines = await this.driver.db
			.select()
			.from(terminalLines)
			// A publish command's captured output (fase 4, item 6c) is the console's alone (`GetPublishRunOutput`): this
			// read is an MCP tool, and a command's output may print a credential.
			.where(and(eq(terminalLines.issueId, input.issueId), isNull(terminalLines.timelineItemId)))
			.orderBy(asc(terminalLines.seq))
		const routed = await this.driver.db
			.select()
			.from(transcriptEntries)
			.where(eq(transcriptEntries.issueId, input.issueId))
			.orderBy(asc(transcriptEntries.at))
		const openStops = await this.driver.db
			.select()
			.from(stops)
			.where(and(eq(stops.issueId, input.issueId), isNull(stops.resolvedAt)))
		const waiting = await providerWaitByIssue(this.driver, [input.issueId])
		const retrying = await retryWaitByIssue(this.driver, [input.issueId])
		const life = await lifeStateByIssue(this.driver, [{ issueId: issue.id, status: issue.status as IssueStatus }], {
			budgetHeld: this.quota.holdsIssueLane(),
			declaredWait: this.declaredWait,
		})
		const steerRows = await this.driver.db
			.select()
			.from(agentMailbox)
			.where(
				and(
					eq(agentMailbox.targetKind, MailboxTargetKind.ISSUE),
					eq(agentMailbox.targetId, input.issueId),
					eq(agentMailbox.kind, MailboxItemKind.STEER),
				),
			)
			.orderBy(asc(agentMailbox.createdAt))

		return {
			issue: {
				issueId: issue.id,
				key: issue.key,
				title: issue.title,
				status: issue.status as IssueStatus,
				meta: issue.meta ?? undefined,
				archived: issue.archived,
				paused: issue.paused,
				waitingForProviderUntil: waiting.get(issue.id)?.toISOString(),
				retryingAt: retrying.get(issue.id)?.toISOString(),
				lifeState: life.get(issue.id) ?? IssueLifeState.STALLED,
			},
			provider: issue.provider as ProviderKind,
			terminalLog: lines.map(l => ({ at: l.at.toISOString(), line: l.line })),
			routedMessages: routed.map(e => ({
				entryId: e.id,
				kind: e.kind as TranscriptKind,
				text: e.text,
				at: e.at.toISOString(),
				classification: (e.classification ?? undefined) as ClassificationMethod | undefined,
			})),
			stops: openStops.map(s => ({
				stopId: s.id,
				kind: s.kind as StopKind,
				title: s.title,
				detail: s.detail,
				raisedAt: s.raisedAt.toISOString(),
			})),
			steers: steerRows.map(m => ({
				text: steerText(m.payload),
				sentAt: m.createdAt.toISOString(),
				deliveredAt: m.firstClaimedAt?.toISOString(),
				readAt: m.consumedAt?.toISOString(),
				failed: m.deadAt !== null,
			})),
		}
	}
}
