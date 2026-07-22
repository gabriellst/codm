import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { ArtifactKind } from '@codedm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { RecordArtifact } from '../usecases/RecordArtifact'
import { ListArtifacts, ListArtifactsOutputSchema } from '../usecases/ListArtifacts'

// C30 RecordArtifact
export const RecordArtifactControllerInputSchema = z.object({
	ctx: z.object({ ownerId: z.uuid() }),
	params: z.object({ threadId: z.uuid() }),
	body: z.object({
		issueId: z.uuid().optional(),
		kind: z.enum(ArtifactKind),
		name: z.string().trim().min(1),
		ref: z.string().trim().min(1),
		meta: z.string(),
	}),
})
export const RecordArtifactControllerOutputSchema = z.object({ artifactId: z.uuid() })

@injectable()
export class RecordArtifactController extends Controller<typeof RecordArtifactControllerInputSchema, typeof RecordArtifactControllerOutputSchema> {
	readonly path = '/threads/:threadId/artifacts'
	readonly method = 'post' as const
	readonly description = 'Record a non-code agent output (image / file / link) (C30)'
	readonly inputSchema = RecordArtifactControllerInputSchema
	readonly outputSchema = RecordArtifactControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: RecordArtifact) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId, ...request.body })
		return { status: HttpStatusCode.CREATED, data }
	}
}

// T13 Artifacts
export const ListArtifactsControllerInputSchema = z.object({ ctx: z.object({ ownerId: z.uuid() }), params: z.object({ threadId: z.uuid() }) })
export const ListArtifactsControllerOutputSchema = ListArtifactsOutputSchema

@injectable()
export class ListArtifactsController extends Controller<typeof ListArtifactsControllerInputSchema, typeof ListArtifactsControllerOutputSchema> {
	readonly path = '/threads/:threadId/artifacts'
	readonly method = 'get' as const
	readonly description = 'The non-code outputs of a thread (T13)'
	readonly inputSchema = ListArtifactsControllerInputSchema
	readonly outputSchema = ListArtifactsControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private query: ListArtifacts) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId })
		return { status: HttpStatusCode.OK, data }
	}
}
