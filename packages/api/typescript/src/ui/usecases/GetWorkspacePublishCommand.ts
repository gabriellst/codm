import { injectable } from 'tsyringe-neo'
import { and, eq } from 'drizzle-orm'
import { BaseError, Handler, LibSqlDatabaseDriver, z } from '@codm/core-typescript'
import { workspaces } from '@codm/contracts/db'
import { PublishCommandSchema } from '@shared/objects'
import type { ApplicationErrors } from '@workspace/errors'

export const GetWorkspacePublishCommandInputSchema = z.object({
	ownerId: z.uuid(),
	workspaceId: z.uuid(),
})
/** The declared command, or `null` when the workspace has none. */
export const GetWorkspacePublishCommandOutputSchema = z.object({ command: PublishCommandSchema.nullable() })

/**
 * Read — the workspace's PUBLISH COMMAND for the console's form (fase 4, item 6c), the same table-read shape as
 * `ListWorkspaces`: ONE explicit column, so no other read ever has to select the whole row to get it — and no model
 * reads it (its controller has no `mcpScopes`).
 */
@injectable()
export class GetWorkspacePublishCommand extends Handler<
	typeof GetWorkspacePublishCommandInputSchema,
	typeof GetWorkspacePublishCommandOutputSchema
> {
	readonly name = 'get_workspace_publish_command' as const
	readonly inputSchema = GetWorkspacePublishCommandInputSchema
	readonly outputSchema = GetWorkspacePublishCommandOutputSchema

	constructor(private readonly driver: LibSqlDatabaseDriver) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const [row] = await this.driver.db
			.select({ publishCommand: workspaces.publishCommand })
			.from(workspaces)
			.where(and(eq(workspaces.id, input.workspaceId), eq(workspaces.ownerId, input.ownerId)))
			.limit(1)
		if (!row) throw new BaseError<ApplicationErrors>('WORKSPACE_NOT_FOUND', `no workspace ${input.workspaceId}`)
		return { command: row.publishCommand ? PublishCommandSchema.parse(row.publishCommand) : null }
	}
}
