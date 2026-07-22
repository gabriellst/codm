import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetAttachThreadWizard, GetAttachThreadWizardOutputSchema } from '../usecases/GetAttachThreadWizard'

export const GetAttachThreadWizardControllerInputSchema = z.object({ ctx: z.object({ ownerId: z.uuid() }) })
export const GetAttachThreadWizardControllerOutputSchema = GetAttachThreadWizardOutputSchema

@injectable()
export class GetAttachThreadWizardController extends Controller<
	typeof GetAttachThreadWizardControllerInputSchema,
	typeof GetAttachThreadWizardControllerOutputSchema
> {
	readonly path = '/ui/attach-thread-wizard'
	readonly method = 'get' as const
	readonly description = 'Attach-thread wizard — contacts, workspaces, providers + attached/no-channel flags (T15)'
	readonly inputSchema = GetAttachThreadWizardControllerInputSchema
	readonly outputSchema = GetAttachThreadWizardControllerOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private query: GetAttachThreadWizard) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId })
		return { status: HttpStatusCode.OK, data }
	}
}
