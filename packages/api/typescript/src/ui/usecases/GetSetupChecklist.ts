import { injectable } from 'tsyringe-neo'
import { and, eq } from 'drizzle-orm'
import { Handler, z, DrizzleClient } from '@codedm/core-typescript'
import { channels, workspaces, threads } from '@codedm/contracts/db'
import { ChannelStatus } from '@codedm/contracts-typescript/wire/enums'

export const GetSetupChecklistInputSchema = z.object({ ownerId: z.uuid() })
export const GetSetupChecklistOutputSchema = z.object({
	channelDone: z.boolean(),
	workspaceDone: z.boolean(),
	threadDone: z.boolean(),
})

/**
 * Read — SetupChecklist. The onboarding gate's three "done" flags, a cross-context BFF read in the ui
 * context spanning BC1 (gateway `channels`), BC2 (`workspaces`) and BC4 (`threads`):
 *   - channelDone   — at least one channel is CONNECTED (a paired platform session).
 *   - workspaceDone — at least one workspace folder is registered.
 *   - threadDone    — at least one conversation is attached.
 * A pure existence read (no aggregate orchestration) — direct table reads, the BFF pattern.
 */
@injectable()
export class GetSetupChecklist extends Handler<typeof GetSetupChecklistInputSchema, typeof GetSetupChecklistOutputSchema> {
	readonly name = 'get_setup_checklist' as const
	readonly inputSchema = GetSetupChecklistInputSchema
	readonly outputSchema = GetSetupChecklistOutputSchema

	constructor(private readonly db: DrizzleClient) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const [connectedChannels, ownerWorkspaces, ownerThreads] = await Promise.all([
			this.db
				.select({ id: channels.id })
				.from(channels)
				.where(and(eq(channels.ownerId, input.ownerId), eq(channels.status, ChannelStatus.CONNECTED)))
				.limit(1),
			this.db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerId, input.ownerId)).limit(1),
			this.db.select({ id: threads.id }).from(threads).where(eq(threads.ownerId, input.ownerId)).limit(1),
		])

		return {
			channelDone: connectedChannels.length > 0,
			workspaceDone: ownerWorkspaces.length > 0,
			threadDone: ownerThreads.length > 0,
		}
	}
}
