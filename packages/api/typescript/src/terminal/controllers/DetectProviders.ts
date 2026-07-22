import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { ProviderKind, ProviderStatus } from '@codedm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { ProviderDetector } from '../services/ProviderDetector'

export const DetectProvidersInputSchema = z
	.object({
		// `?refresh=true` forces a re-probe (C07 RescanProviders); otherwise the cached catalog is served.
		query: z.object({ refresh: z.enum(['true', 'false']).optional() }).optional(),
		ctx: z.object({ session: z.object({ ownerId: z.uuid() }) }),
	})
	.example([{ query: { refresh: 'false' }, ctx: { session: { ownerId: '00000000-0000-4000-8000-000000000001' } } }])

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
		const refresh = request.query?.refresh === 'true'
		const providers = await this.providerDetector.detect({ refresh })
		return { status: HttpStatusCode.OK, data: { providers } }
	}
}
