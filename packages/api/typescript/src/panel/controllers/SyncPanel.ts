import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares'
import { SyncPanel, SyncPanelInputSchema, SyncPanelOutputSchema } from '../usecases/SyncPanel'

export const SyncPanelControllerInputSchema = z
	.object({
		ctx: z.object({ session: z.object({ ownerId: z.uuid() }) }),
		// The owner comes from the session, never from the body.
		body: SyncPanelInputSchema.omit({ ownerId: true }),
	})
	.example([
		{
			ctx: { session: { ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' } },
			body: { groups: [{ threadId: '019e4d24-6524-7041-9e1c-8108180cddaf', name: 'Equipe de produto' }], issues: [] },
		},
	])
export const SyncPanelControllerOutputSchema = SyncPanelOutputSchema

/** The daemon pushes its groups and changed issues; the cloud answers with each group's link token. */
@injectable()
export class SyncPanelController extends Controller<typeof SyncPanelControllerInputSchema, typeof SyncPanelControllerOutputSchema> {
	readonly path = '/panel/sync'
	readonly method = 'put' as const
	readonly description = "Upsert the daemon's panel snapshot (groups + changed issues) and return each group's link token"
	readonly inputSchema = SyncPanelControllerInputSchema
	readonly outputSchema = SyncPanelControllerOutputSchema
	override middlewares = [AuthAccountMiddleware]
	constructor(private useCase: SyncPanel) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({ ownerId: request.ctx.session.ownerId, ...request.body })
		return { status: HttpStatusCode.OK, data }
	}
}
