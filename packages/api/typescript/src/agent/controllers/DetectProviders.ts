import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { ProviderKind, ProviderStatus } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { ProviderDetector } from '../services/ProviderDetector'
import { AgentRunnerFactory } from '../services/AgentRunnerFactory'

export const DetectProvidersInputSchema = z
	.object({
		// `?refresh=true` forces a re-probe (C07 RescanProviders); otherwise the cached catalog is served.
		// z.stringToBoolean() (z.stringbool) is the house boolean-query shape — no string enum + manual compare.
		query: z.object({ refresh: z.stringToBoolean().optional() }).optional(),
		ctx: z.object({ ownerId: z.uuid() }),
	})
	.example([{ query: { refresh: false }, ctx: { ownerId: '00000000-0000-4000-8000-000000000001' } }])

export const DetectProvidersOutputSchema = z
	.object({
		providers: z.array(
			z.object({
				name: z.enum(ProviderKind),
				status: z.enum(ProviderStatus),
				binaryPath: z.string().optional(),
				version: z.string().optional(),
				/**
				 * TWO AXES, NOT ONE — and this is the second.
				 *
				 * `status` answers "is the BINARY on this machine?" (DETECTED / NOT_INSTALLED). `comingSoon`
				 * answers a question detection cannot: "does this engine have a class that knows how to DRIVE
				 * that binary?". They are independent — `PROVIDER_BINARIES` declares real `bin` names for
				 * codex and opencode so the catalog reports them honestly, while exactly one CLI has a runner.
				 *
				 * They are NOT collapsed into a third `ProviderStatus` member, deliberately: a machine with
				 * the codex CLI installed is genuinely DETECTED, and re-labelling it would tell the operator
				 * to install something they already have — the enum would lose a fact rather than carry one
				 * more. Consumers that need a single yes/no compose them (`available = DETECTED &&
				 * !comingSoon`); the two screens rendering this both need the axes apart, to say "installed,
				 * but we can't drive it yet" instead of a bare "unavailable".
				 *
				 * DERIVED from `AgentRunnerFactory.supported` — never a literal list beside it. `supported` is
				 * itself derived from the map `AgentRunnerFactory.for()` reads, so "what we report" and "what
				 * we can actually run" are one declaration; a parallel array here is precisely the second copy
				 * that factory's docblock exists to prevent (it replaced exactly such a const).
				 */
				comingSoon: z.boolean(),
			}),
		),
	})
	.example([
		{
			providers: [
				{
					name: ProviderKind.CLAUDE_CODE,
					status: ProviderStatus.DETECTED,
					binaryPath: '/usr/local/bin/claude',
					version: '1.0.0',
					comingSoon: false,
				},
				{ name: ProviderKind.CODEX, status: ProviderStatus.NOT_INSTALLED, comingSoon: true },
				{ name: ProviderKind.OPENCODE, status: ProviderStatus.NOT_INSTALLED, comingSoon: true },
			],
		},
	])

/**
 * BFF read for provider detection — backs the Settings (T08) provider list and the Attach wizard
 * (T15) provider step. Reads the cached `ProviderDetector` catalog; `?refresh=true` forces a
 * re-probe of PATH + install dirs (C07 RescanProviders). No aggregate — detection is a Service.
 *
 * It injects the `AgentRunnerFactory` as well as the detector, because the catalog answers two
 * questions and the detector only knows one of them — see `comingSoon` on the OutputSchema.
 */
@injectable()
export class DetectProvidersController extends Controller<typeof DetectProvidersInputSchema, typeof DetectProvidersOutputSchema> {
	readonly path = '/terminal/providers'
	readonly method = 'get' as const
	readonly description =
		'Detected agent provider CLIs (claude-code / codex / opencode) with binary path, version, install status and whether a runner exists for them yet (comingSoon)'
	readonly inputSchema = DetectProvidersInputSchema
	readonly outputSchema = DetectProvidersOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(
		private readonly providerDetector: ProviderDetector,
		private readonly agentRunnerFactory: AgentRunnerFactory,
	) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const refresh = request.query?.refresh ?? false
		const detections = await this.providerDetector.detect({ refresh })
		// The runner-bearing set, read ONCE per request from the bound factory. Not a constant in this
		// file: the wiring layer is the only thing that knows which CLIs have a runner class, and a copy
		// here would go stale the day a second one is bound (see `comingSoon` on the OutputSchema).
		const drivable = this.agentRunnerFactory.supported
		// Map to the declared shape explicitly — same convention as GetSettings / GetAttachThreadWizard.
		// `ProviderDetection.caps` is an internal probe result (consumed by the runner's argv builder,
		// GOAL-agent-abstraction §4.7); core's `serializeBody` is a bare `JSON.stringify` with no
		// schema-based stripping, so returning `detections` verbatim would leak it onto the wire the
		// moment a real probe populates it, even though it was never declared in `OutputSchema`.
		const providers = detections.map(d => ({
			name: d.name,
			status: d.status,
			binaryPath: d.binaryPath,
			version: d.version,
			comingSoon: !drivable.includes(d.name),
		}))
		return { status: HttpStatusCode.OK, data: { providers } }
	}
}
