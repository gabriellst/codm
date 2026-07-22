import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'

import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { SendNotification, SendNotificationInputSchema, SendNotificationOutputSchema } from '../usecases/SendNotification'

export const SendNotificationControllerInputSchema = z.object({
	ctx: z.object({
		user: z.object({ id: z.string() }),
	}),
	body: SendNotificationInputSchema.omit({ userId: true }).extend({
		// Body arrives as a JSON string — coerce to Date before use case receives it
		scheduledAt: z.stringToDate().optional(),
	}),
})

export const SendNotificationControllerOutputSchema = SendNotificationOutputSchema

@injectable()
export class SendNotificationController extends Controller<
	typeof SendNotificationControllerInputSchema,
	typeof SendNotificationControllerOutputSchema
> {
	readonly path = '/notifications'
	readonly method = 'post' as const
	readonly description = 'Send a notification (C53 SendNotification)'
	readonly inputSchema = SendNotificationControllerInputSchema
	readonly outputSchema = SendNotificationControllerOutputSchema

	override middlewares = [AuthAccountMiddleware]

	constructor(private cmd: SendNotification) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.cmd.execute({
			userId: request.ctx.user.id,
			ownerId: request.body.ownerId,
			targetUserIds: request.body.targetUserIds,
			title: request.body.title,
			content: request.body.content,
			category: request.body.category,
			important: request.body.important,
			pushEnabled: request.body.pushEnabled,
			emailEnabled: request.body.emailEnabled,
			contentType: request.body.contentType,
			payload: request.body.payload,
			scheduledAt: request.body.scheduledAt,
		})
		return { status: HttpStatusCode.CREATED, data }
	}
}
