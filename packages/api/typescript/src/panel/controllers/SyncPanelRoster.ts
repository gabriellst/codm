import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares'
import { SyncPanelRoster, SyncPanelRosterInputSchema, SyncPanelRosterOutputSchema } from '../usecases/SyncPanelRoster'

export const SyncPanelRosterControllerInputSchema = z
	.object({
		ctx: z.object({ session: z.object({ ownerId: z.uuid() }) }),
		// The owner comes from the session, never from the body.
		body: SyncPanelRosterInputSchema.omit({ ownerId: true }),
	})
	.example([
		{
			ctx: { session: { ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' } },
			body: {
				groups: [
					{
						threadId: '019e4d24-6524-7041-9e1c-8108180cddaf',
						members: [{ memberId: 'q8ZK1x0Lr3mT5aVb2cN7dE', name: 'Ana', canRelease: true }],
					},
				],
			},
		},
	])
export const SyncPanelRosterControllerOutputSchema = SyncPanelRosterOutputSchema

/** The daemon pushes each group's roster and pulls the panel codes it must deliver by WhatsApp (fase 2, item 6a). */
@injectable()
export class SyncPanelRosterController extends Controller<
	typeof SyncPanelRosterControllerInputSchema,
	typeof SyncPanelRosterControllerOutputSchema
> {
	readonly path = '/panel/roster'
	readonly method = 'put' as const
	readonly description = "Replace each group's panel roster (opaque member ids) and pull the identification codes to deliver"
	readonly inputSchema = SyncPanelRosterControllerInputSchema
	readonly outputSchema = SyncPanelRosterControllerOutputSchema
	override middlewares = [AuthAccountMiddleware]
	constructor(private useCase: SyncPanelRoster) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({ ownerId: request.ctx.session.ownerId, ...request.body })
		return { status: HttpStatusCode.OK, data, headers: { 'Cache-Control': 'no-store' } }
	}
}
