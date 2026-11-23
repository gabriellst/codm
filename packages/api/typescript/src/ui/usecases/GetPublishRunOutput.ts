import { injectable } from 'tsyringe-neo'
import { and, asc, eq } from 'drizzle-orm'
import { BaseError, Handler, LibSqlDatabaseDriver, z } from '@codm/core-typescript'
import { issues, terminalLines } from '@codm/contracts/db'
import type { ApplicationErrors } from '@issue/errors'

export const GetPublishRunOutputInputSchema = z.object({
	ownerId: z.uuid(),
	issueId: z.uuid(),
	/** The `PUBLISH_RAN` timeline item — the id of its `agent.publish.ran` fact. */
	timelineItemId: z.uuid(),
})
export const GetPublishRunOutputOutputSchema = z.object({
	lines: z.array(z.object({ at: z.string(), line: z.string() })),
})

/**
 * Read — what ONE publish run printed (fase 4, item 6c): the task's terminal lines linked to that `PUBLISH_RAN` item by
 * `timeline_item_id`, by equality. The console's alone (its controller has no `mcpScopes`): a command's output may
 * print a credential, so it never rides the MCP-exposed issue detail, the timeline or the cloud panel.
 */
@injectable()
export class GetPublishRunOutput extends Handler<typeof GetPublishRunOutputInputSchema, typeof GetPublishRunOutputOutputSchema> {
	readonly name = 'get_publish_run_output' as const
	readonly inputSchema = GetPublishRunOutputInputSchema
	readonly outputSchema = GetPublishRunOutputOutputSchema

	constructor(private readonly driver: LibSqlDatabaseDriver) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const [issue] = await this.driver.db.select({ ownerId: issues.ownerId }).from(issues).where(eq(issues.id, input.issueId)).limit(1)
		if (!issue || issue.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${input.issueId}`)
		const rows = await this.driver.db
			.select({ at: terminalLines.at, line: terminalLines.line })
			.from(terminalLines)
			.where(and(eq(terminalLines.issueId, input.issueId), eq(terminalLines.timelineItemId, input.timelineItemId)))
			.orderBy(asc(terminalLines.seq))
		return { lines: rows.map(row => ({ at: row.at.toISOString(), line: row.line })) }
	}
}
