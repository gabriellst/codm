import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { ConfigurePrompt, ConfigurePromptInputSchema, ConfigurePromptOutputSchema } from '../usecases/ConfigureThreadSettings'
import { ThreadParam } from '../schemas'

export const ConfigurePromptControllerInputSchema = ThreadParam.extend({
	body: ConfigurePromptInputSchema.pick({ customPrompt: true }),
}).example([
	{
		ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
		params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' },
		body: { customPrompt: 'Fale sempre em português. Nunca sugira migrar de framework.' },
	},
])
export const ConfigurePromptControllerOutputSchema = ConfigurePromptOutputSchema

// C15
@injectable()
export class ConfigurePromptController extends Controller<
	typeof ConfigurePromptControllerInputSchema,
	typeof ConfigurePromptControllerOutputSchema
> {
	/**
	 * `system`, like its four siblings in this file's neighbourhood — which today means NO agent can
	 * call it: `IssueWorkAgent` takes `ISSUE_HANDLING`, `OrchestratorAgent` takes `orchestration`, and
	 * an assertion in `IssueWorkAgent.test.ts` pins that no `system` tool leaks into either. That is the
	 * right default here for a reason stronger than symmetry: this endpoint rewrites the standing
	 * instructions of the very agent that would be calling it, and an agent that can edit its own prompt
	 * is a loop with no operator in it.
	 */
	static override readonly mcpScopes = [McpScope.system]
	readonly path = '/threads/:threadId/prompt'
	readonly method = 'put' as const
	readonly description = "Set (or clear, with an empty body value) the operator's custom prompt for this conversation (C15)"
	readonly inputSchema = ConfigurePromptControllerInputSchema
	readonly outputSchema = ConfigurePromptControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: ConfigurePrompt) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			threadId: request.params.threadId,
			customPrompt: request.body.customPrompt,
		})
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
