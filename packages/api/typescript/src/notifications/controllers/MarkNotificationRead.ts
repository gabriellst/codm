import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { MarkNotificationRead, MarkNotificationReadInputSchema } from '../usecases/MarkNotificationRead'

export const MarkNotificationReadControllerInputSchema = z.object({
	ctx: z.object({
		user: z.object({ id: z.string() }),
	}),
	body: MarkNotificationReadInputSchema.omit({ userId: true }),
})

export const MarkNotificationReadControllerOutputSchema = z.void()

@injectable()
export class MarkNotificationReadController extends Controller<
	typeof MarkNotificationReadControllerInputSchema,
	typeof MarkNotificationReadControllerOutputSchema
> {
	readonly path = '/notifications/read'
	readonly method = 'post' as const
	readonly description = 'Mark notification deliveries as read (C55 MarkNotificationRead)'
	readonly inputSchema = MarkNotificationReadControllerInputSchema
	readonly outputSchema = MarkNotificationReadControllerOutputSchema

	override middlewares = [AuthAccountMiddleware]

	constructor(private cmd: MarkNotificationRead) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		await this.cmd.execute({
			userId: request.ctx.user.id,
			notificationDeliveryIds: request.body.notificationDeliveryIds,
		})
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
