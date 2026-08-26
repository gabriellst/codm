import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { SendArtifact, SendArtifactInputSchema, SendArtifactOutputSchema } from '../usecases/SendArtifact'

export const SendArtifactControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		params: SendArtifactInputSchema.pick({ threadId: true, artifactId: true }),
		body: SendArtifactInputSchema.pick({ caption: true }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', artifactId: '019e4d24-6524-7041-9e1c-8108180cddaf' },
			body: { caption: 'Here is the report' },
		},
	])
export const SendArtifactControllerOutputSchema = SendArtifactOutputSchema

/**
 * The delivery half of "envio de artefatos pelo canal" (decision 1) — `mcp__codm__SendArtifact`. An
 * agent's run pairs this with `RecordArtifact`: record the file, then send it. See `SendArtifact`
 * (the use case) for the validation order and `DeliverChannelAttachment` for the actual send.
 */
@injectable()
export class SendArtifactController extends Controller<typeof SendArtifactControllerInputSchema, typeof SendArtifactControllerOutputSchema> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.ISSUE_HANDLING, McpScope.orchestration]
	readonly path = '/threads/:threadId/artifacts/:artifactId/send'
	readonly method = 'post' as const
	readonly description = 'Deliver an already-recorded artifact to the contact on the channel'
	readonly inputSchema = SendArtifactControllerInputSchema
	readonly outputSchema = SendArtifactControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]

	constructor(private useCase: SendArtifact) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			threadId: request.params.threadId,
			artifactId: request.params.artifactId,
			caption: request.body.caption,
		})
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
