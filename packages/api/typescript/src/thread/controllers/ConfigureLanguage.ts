import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codm/core-typescript'
import { Language, McpScope } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { ConfigureLanguage, ConfigureLanguageInputSchema, ConfigureLanguageOutputSchema } from '../usecases/ConfigureThreadSettings'
import { ThreadParam } from '../schemas'

/**
 * The door for the per-thread language (i18n-das-pistas spec).
 *
 * The body field is OPTIONAL and absence is the erase — "follow the account default" — exactly like
 * `ConfigurePrompt`'s. `.optional()` is restated here rather than `.pick()`ed with a note, so the
 * generated SDK schema the console validates against carries the same optionality the use case does.
 */
export const ConfigureLanguageControllerInputSchema = ThreadParam.extend({
	body: ConfigureLanguageInputSchema.pick({ language: true }),
}).example([
	{
		ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
		params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' },
		body: { language: Language.EN_US },
	},
])
export const ConfigureLanguageControllerOutputSchema = ConfigureLanguageOutputSchema

/** Which language this conversation speaks — the cues everyone sees, and the agent's own replies. */
@injectable()
export class ConfigureLanguageController extends Controller<
	typeof ConfigureLanguageControllerInputSchema,
	typeof ConfigureLanguageControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system, McpScope.orchestration]
	readonly path = '/threads/:threadId/language'
	readonly method = 'put' as const
	readonly description = 'Set the language this conversation speaks, or clear it to follow the account default'
	readonly inputSchema = ConfigureLanguageControllerInputSchema
	readonly outputSchema = ConfigureLanguageControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: ConfigureLanguage) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId, language: request.body.language })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
