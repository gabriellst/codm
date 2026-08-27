import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { AGENT_SCENARIO_IDS, AgentScenarioSelection } from '../services/AgentScenario'

export const TestSelectAgentScenarioInputSchema = z.object({
	body: z.object({
		/**
		 * A CLOSED set, validated here. The daemon owns every roteiro it can perform
		 * (`services/AgentScenario/scenarios.ts`); this door only chooses among them, so an unknown id
		 * is a 4xx rather than a run that silently performs nothing.
		 */
		scenarioId: z.enum(AGENT_SCENARIO_IDS),
	}),
})

export const TestSelectAgentScenarioOutputSchema = z.object({
	scenarioId: z.enum(AGENT_SCENARIO_IDS),
})

/**
 * TEST-ONLY door that selects WHICH roteiro the deterministic stand-in performs from here on.
 *
 * ### Why the selection is a door and not an env key
 * `.env.example` is GENERATED from the env registry in `template.config.ts` for every fresh clone,
 * and `tests/architecture/product-residue.test.ts` exists to keep harness concerns off the product's
 * public surface. A `CODM_AGENT_SCENARIO` key shipped to every clone so that a promotional capture
 * can pick its script is exactly that residue. A door is also strictly more capable: the harness boots
 * ONE daemon per run (`packages/e2e/scripts/run-e2e.ts` mints a scratch data dir per invocation), so
 * an env key would mean one boot per roteiro.
 *
 * ### Why this is not the same decision the Go gateway made
 * The channel gateway's scenario is fixed at construction and its own comment forbids mutating it
 * afterwards (`internal/channel/overlay.go`). That is right there: what it scripts — connecting,
 * pairing, the seeded contacts — is behaviour a channel exhibits once, at boot. An agent's roteiro is
 * performed per RUN, many times per boot, and which one is wanted is a property of the SPEC that is
 * running. See `AgentScenarioSelection` for the lifetime argument.
 *
 * Mounted ONLY under the `e2e` boot environment (`controllers/index.ts`, `byEnvironment`), refused
 * under NODE_ENV=production by `setBoundedContextEnvironment` (src/server.ts), and never emitted to
 * the SDK/OpenAPI — emission runs with `EMIT_OPENAPI=true`, which never selects `e2e`, so this
 * controller is not in the map the emitter walks. Same discipline as `TestRunIssueTurnController`
 * beside it.
 */
@injectable()
export class TestSelectAgentScenarioController extends Controller<
	typeof TestSelectAgentScenarioInputSchema,
	typeof TestSelectAgentScenarioOutputSchema
> {
	readonly path = '/_test/agent/scenario'
	readonly method = 'post' as const
	readonly description = 'TEST-ONLY: select which declared agent scenario the stand-in runner performs'
	readonly inputSchema = TestSelectAgentScenarioInputSchema
	readonly outputSchema = TestSelectAgentScenarioOutputSchema

	override middlewares = [CloudSessionMiddleware]

	constructor(private readonly scenarios: AgentScenarioSelection) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		this.scenarios.select(request.body.scenarioId)
		// Echoed back from the holder, not from the request — a caller that asserts on this is asserting
		// that the selection LANDED, which is the only thing worth asserting about a write like this.
		return { status: HttpStatusCode.OK, data: { scenarioId: this.scenarios.currentId } }
	}
}
