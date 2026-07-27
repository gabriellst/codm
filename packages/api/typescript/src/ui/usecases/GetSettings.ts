import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { Handler, z, DrizzleClient, Config } from '@codedm/core-typescript'
import { owners } from '@codedm/contracts/db'
import { ProviderKind, ProviderStatus } from '@codedm/contracts-typescript/wire/enums'
import { ProviderDetector } from '@agent/services/ProviderDetector'
import { StopPolicyConfigRepository } from '@issue/repositories/StopPolicyConfigRepository'

import pkg from '../../../package.json' with { type: 'json' }

/** App version — SOURCED from package.json so the About row can never drift from the real version. */
const APP_VERSION: string = pkg.version

const ProviderAvailabilitySchema = z.object({
	provider: z.enum(ProviderKind),
	status: z.enum(ProviderStatus),
	available: z.boolean(),
	version: z.string().optional(),
})

export const GetSettingsInputSchema = z.object({ ownerId: z.uuid() })
export const GetSettingsOutputSchema = z.object({
	providers: z.array(ProviderAvailabilitySchema),
	stopCriteria: z.object({
		serverErrors: z.boolean(),
		blockedByClassification: z.boolean(),
		humanRequested: z.boolean(),
		approvalNeeded: z.boolean(),
		authRequired: z.boolean(),
	}),
	general: z.object({
		operatorName: z.string(),
		timezone: z.string(),
		dataDir: z.string(),
	}),
	appVersion: z.string(),
})

/**
 * Read — Settings (T08). The settings screen's four panels, composed in the ui BFF context:
 *   - providers    — per-CLI availability (the detection Service probe: DETECTED + version, or
 *                    NOT_INSTALLED), the same shape the attach wizard renders.
 *   - stopCriteria — the per-owner stop-policy toggles (BC5 settings row, defaulted when unset).
 *   - general      — operator identity + the embedded data directory (local-daemon config).
 *   - appVersion   — the About row.
 */
@injectable()
export class GetSettings extends Handler<typeof GetSettingsInputSchema, typeof GetSettingsOutputSchema> {
	readonly name = 'get_settings' as const
	readonly inputSchema = GetSettingsInputSchema
	readonly outputSchema = GetSettingsOutputSchema

	constructor(
		private readonly db: DrizzleClient,
		private readonly providerDetector: ProviderDetector,
		private readonly stopPolicy: StopPolicyConfigRepository,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const detections = await this.providerDetector.detect()
		const providers = detections.map(d => ({
			provider: d.name,
			status: d.status,
			available: d.status === ProviderStatus.DETECTED,
			version: d.version,
		}))

		const stopCriteria = await this.stopPolicy.get(input.ownerId)

		const ownerRow = await this.db
			.select({ name: owners.name, timezone: owners.timezone })
			.from(owners)
			.where(eq(owners.id, input.ownerId))
			.limit(1)

		return {
			providers,
			stopCriteria,
			general: {
				// Empty when unnamed — the frontend renders its own i18n placeholder; never an EN literal from the API.
				operatorName: ownerRow[0]?.name ?? '',
				timezone: ownerRow[0]?.timezone ?? '',
				dataDir: Config.env.CODEDM_DATA_DIR,
			},
			appVersion: APP_VERSION,
		}
	}
}
