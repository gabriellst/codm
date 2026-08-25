import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codm/core-typescript'
import { McpScope, ProviderKind, AgentModelId } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { ConfigureModel, ConfigureModelInputSchema, ConfigureModelOutputSchema } from '../usecases/ConfigureThreadSettings'
import { ThreadParam } from '../schemas'

export const ConfigureModelControllerInputSchema = ThreadParam.extend({
	body: ConfigureModelInputSchema.pick({ provider: true, model: true }),
}).example([
	{
		ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
		params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' },
		body: { provider: ProviderKind.CLAUDE_CODE, model: AgentModelId.OPUS },
	},
])
export const ConfigureModelControllerOutputSchema = ConfigureModelOutputSchema

// C16
@injectable()
export class ConfigureModelController extends Controller<
	typeof ConfigureModelControllerInputSchema,
	typeof ConfigureModelControllerOutputSchema
> {
	/**
	 * TWO SURFACES, the same pair — and for the same reasons — as `ConfigurePrompt`.
	 *
	 * ───────────────────────────────────────────────────────────────────────────────────────────────
	 * `system` is the console's own write and the external MCP client's (the operator's agent, operating
	 * the system). `orchestration` is the operator saying "passa pro opus" IN the conversation, which is
	 * where they are when they notice the model is wrong for it — a triage thread burning the expensive
	 * model, or an architecture thread answering with the cheap one.
	 *
	 * `issue-handling` is OUT. The agent that executes an issue reads third-party text as its input, and
	 * choosing the conversation's model is not issue work. The assertion in `IssueWorkAgent.test.ts` that
	 * no `system` tool reaches it stays true and untouched by this line.
	 *
	 * ### The confinement is the GENERIC one — no guard in `handle()`, deliberately
	 * The path carries `threadId`, an `orchestration` identity carries `threadId`
	 * (`OrchestratorAgent.IdentitySchema` omits only `issueId`), and `AgentIdentityMiddleware` — appended
	 * precisely BECAUSE this class declares `mcpScopes` — compares the keys the identity carries against
	 * `{...params, ...body}`. Another conversation's model is a 403 before `handle()` is entered.
	 *
	 * That is the same property `ConfigurePrompt` documents at length, and the same reason not to add a
	 * redundant ownership check here: this tool is THREAD-SHAPED, so the generic comparison IS the
	 * confinement, and a hand-written check would hide exactly the fact worth having. (`ResolveStop` and
	 * `SteerIssueTurn` need their own guards only because they are addressed by a `stopId` / `issueId`
	 * the identity does not carry.)
	 *
	 * ### What an agent can and cannot do to itself here
	 * It can ask for a different model of a CLI its own conversation already runs — `Thread.configureModel`
	 * refuses an unbound provider and a model outside that provider's declared catalog. It cannot reach
	 * another conversation, cannot add a CLI, and cannot invent a model: the catalog is code in this
	 * repository, not content of this field. And the operator sees the result in `ThreadSettingsDialog`,
	 * which is what makes an agent-authored choice auditable rather than hidden.
	 * ───────────────────────────────────────────────────────────────────────────────────────────────
	 */
	static override readonly mcpScopes = [McpScope.system, McpScope.orchestration]
	readonly path = '/threads/:threadId/model'
	readonly method = 'put' as const
	readonly description = 'Choose which model this conversation asks one of its agent CLIs for. DEFAULT means let the CLI pick (C16)'
	readonly inputSchema = ConfigureModelControllerInputSchema
	readonly outputSchema = ConfigureModelControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: ConfigureModel) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			threadId: request.params.threadId,
			provider: request.body.provider,
			model: request.body.model,
		})
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
