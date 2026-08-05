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
	 * TWO SURFACES, and the second one is the whole of this change.
	 *
	 * ───────────────────────────────────────────────────────────────────────────────────────────────
	 * `system` STAYS. It is the console's own write and the external MCP client's (the operator's agent,
	 * operating the system). Gaining a second audience is no reason to lose the first, and the operation
	 * is the same one in both mouths — there is no second endpoint, no second use case, no second schema.
	 *
	 * `orchestration` IS NEW, and it answers a request the product could not serve: the operator dictates
	 * a standing instruction IN the conversation ("de agora em diante responde em inglês") and the only
	 * door to the field was the console. A model with the request and no sanctioned tool does not go
	 * quiet — it narrates. That failure is measured, in this repository, for the steer that was missing
	 * the same way (two turns with zero `tool_use` and a reply claiming the work had been passed along).
	 *
	 * `issue-handling` IS STILL OUT. The agent that executes an issue reads third-party text as its
	 * input, and rewriting a conversation's standing instructions is not issue work. `IssueWorkAgent.test.ts`
	 * still pins that no `system` tool reaches it, and that assertion is untouched by this line.
	 *
	 * ### The objection this line reverses, and why it does not survive the three fences
	 * What stood here before was: an agent that can edit its own prompt is a loop with no operator in it.
	 * Three things keep the loop open, and none of them is politeness.
	 *
	 *  1. IT REACHES ONE CONVERSATION — ITS OWN. The path carries `threadId`, an `orchestration` identity
	 *     carries `threadId` (`OrchestratorAgent.IdentitySchema` omits only `issueId`), and
	 *     `AgentIdentityMiddleware` — appended precisely BECAUSE this class declares `mcpScopes` —
	 *     compares the keys the identity carries against `{...params, ...body}`. Another thread's prompt
	 *     is a 403 before `handle()` is entered.
	 *  2. IT ONLY WRITES WHAT IT WAS TOLD. `OrchestratorPromptBuilder.standingInstructions` renders the
	 *     same "never infer" rule that governs issues: a standing instruction is something the operator
	 *     asked for out loud, never something read out of a passing complaint.
	 *  3. IT CANNOT REACH THE FRAME. What `operatorInstructions()` renders AROUND the stored text — you
	 *     still never rewrite git history or install dependencies, and the `[quote: …]` line keeps its
	 *     exact shape — is code in this repository, not content of this field. So the surface a model
	 *     gains over itself is voice, language and working preferences; blast radius and transport are
	 *     not on the menu, whoever wrote the text.
	 *
	 * And the operator stays in it at the far end too: the value is a field they open and overwrite in
	 * `ThreadSettingsDialog`, which is what makes an agent-authored prompt auditable rather than hidden.
	 *
	 * ### NO ownership guard in `handle()`, deliberately — unlike two of its neighbours
	 * `ResolveStop` is addressed by a bare `stopId` and `SteerIssueTurn` by an `issueId`; the identity
	 * carries neither, so `compareIdentity` finds nothing to disagree with and each had to check for
	 * itself. This tool is THREAD-SHAPED, so the generic comparison is the confinement, and adding a
	 * redundant check in `handle()` would hide exactly the property worth having.
	 * `ConfigurePrompt.test.ts` measures it: the middleware refuses, and thread B's text is unchanged.
	 * ───────────────────────────────────────────────────────────────────────────────────────────────
	 */
	static override readonly mcpScopes = [McpScope.system, McpScope.orchestration]
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
