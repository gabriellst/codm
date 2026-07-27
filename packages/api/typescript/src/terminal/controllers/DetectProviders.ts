import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { ProviderKind, ProviderStatus } from '@codedm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { ProviderDetector } from '../services/ProviderDetector'

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
			}),
		),
	})
	.example([
		{
			providers: [
				{ name: ProviderKind.CLAUDE_CODE, status: ProviderStatus.DETECTED, binaryPath: '/usr/local/bin/claude', version: '1.0.0' },
				{ name: ProviderKind.CODEX, status: ProviderStatus.NOT_INSTALLED },
				{ name: ProviderKind.OPENCODE, status: ProviderStatus.NOT_INSTALLED },
			],
		},
	])

/**
 * BFF read for provider detection — backs the Settings (T08) provider list and the Attach wizard
 * (T15) provider step. Reads the cached `ProviderDetector` catalog; `?refresh=true` forces a
 * re-probe of PATH + install dirs (C07 RescanProviders). No aggregate — detection is a Service.
 */
@injectable()
export class DetectProvidersController extends Controller<typeof DetectProvidersInputSchema, typeof DetectProvidersOutputSchema> {
	readonly path = '/terminal/providers'
	readonly method = 'get' as const
	readonly description = 'Detected agent provider CLIs (claude-code / codex / opencode) with binary path, version and status'
	readonly inputSchema = DetectProvidersInputSchema
	readonly outputSchema = DetectProvidersOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private readonly providerDetector: ProviderDetector) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const refresh = request.query?.refresh ?? false
		const detections = await this.providerDetector.detect({ refresh })
		// Map to the declared shape explicitly — same convention as GetSettings / GetAttachThreadWizard.
		// `ProviderDetection.caps` is an internal probe result (consumed by `ProviderDef.buildArgs`,
		// GOAL-agent-abstraction §4.7); core's `serializeBody` is a bare `JSON.stringify` with no
		// schema-based stripping, so returning `detections` verbatim would leak it onto the wire the
		// moment a real probe populates it, even though it was never declared in `OutputSchema`.
		const providers = detections.map(d => ({ name: d.name, status: d.status, binaryPath: d.binaryPath, version: d.version }))
		return { status: HttpStatusCode.OK, data: { providers } }
	}
}
