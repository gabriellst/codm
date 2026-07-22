import Z from 'zod'
import { z } from '@template/core-typescript'
import { MoneySchema } from '@shared/objects'

import { CurrencyCode, PlanName, QuotaKey } from '@template/contracts-typescript/wire/enums'

/** Per-quota-key policy. `overage` absent → hard-limit (exceed → reject). `overage` present → metered
 *  (exceed → billed). `limit: null` → unlimited. The `included` amount is `limit` for meters too. */
export const QuotaPolicySchema = z.object({
	limit: z.number().int().nonnegative().nullable(),
	overage: MoneySchema.optional(),
})
export type QuotaPolicy = Z.infer<typeof QuotaPolicySchema>

export const PlanConfigSchema = z.object({
	planCode: z.string().min(1),
	basePrice: MoneySchema,
	// The quota dimensions this plan carries, keyed by the shared QuotaKey. The catalog is the only
	// place resource kinds are named — as DATA, never in billing's types/logic.
	quotas: z.record(z.enum(QuotaKey), QuotaPolicySchema),
	trialDays: z.number().int().nonnegative(),
})
export type PlanConfig = Z.infer<typeof PlanConfigSchema>

const brl = (amountCents: number) => ({ amountCents, currency: CurrencyCode.BRL })

/**
 * Config-as-code plan catalog — the PRODUCT PLUG (medscall@f04e8a0f port, genericized). Each entry
 * is validated at module load (`PlanConfigSchema.parse`), so a malformed catalog fails boot, never
 * a charge. A downstream product replaces the members of `PlanName`, the prices, and the quota
 * dimensions (keyed by the shared `QuotaKey` — see `src/shared/enums/QuotaKey.ts`; the quota
 * context owns that vocabulary). The `satisfies Record<PlanName, PlanConfig>` clause guarantees
 * every `PlanName` member has a catalog entry — dropping one is a compile error.
 *
 * The concrete quotas below are GENERIC PLACEHOLDERS over the single `QuotaKey.EXAMPLE_KEY`
 * (FREE hard-limits low, STARTER meters with overage, PRO meters higher/cheaper) — they exist to
 * demonstrate the three policy archetypes, not to mean anything.
 */
const PLAN_CONFIGS = {
	[PlanName.FREE]: PlanConfigSchema.parse({
		planCode: 'free',
		basePrice: brl(0),
		trialDays: 0,
		quotas: {
			[QuotaKey.EXAMPLE_KEY]: { limit: 50 },
		},
	}),
	[PlanName.STARTER]: PlanConfigSchema.parse({
		planCode: 'starter',
		basePrice: brl(9900),
		trialDays: 0,
		quotas: {
			[QuotaKey.EXAMPLE_KEY]: { limit: 1000, overage: brl(5) },
		},
	}),
	[PlanName.PRO]: PlanConfigSchema.parse({
		planCode: 'pro',
		basePrice: brl(29900),
		trialDays: 0,
		quotas: {
			[QuotaKey.EXAMPLE_KEY]: { limit: 5000, overage: brl(4) },
		},
	}),
} satisfies Record<PlanName, PlanConfig>

export class PlanRegistry {
	static names(): PlanName[] {
		return Object.keys(PLAN_CONFIGS) as PlanName[]
	}
	static get(name: PlanName): PlanConfig {
		return PLAN_CONFIGS[name]
	}
	static isPaid(name: PlanName): boolean {
		return name !== PlanName.FREE
	}
	static trialDays(name: PlanName): number {
		return PLAN_CONFIGS[name].trialDays
	}
	/** The policy a plan sets for a quota key (undefined if the plan doesn't carry that key). */
	static policy(name: PlanName, key: QuotaKey): QuotaPolicy | undefined {
		return PLAN_CONFIGS[name].quotas[key]
	}
	/** Every quota key the plan carries. */
	static quotaKeys(name: PlanName): QuotaKey[] {
		return Object.keys(PLAN_CONFIGS[name].quotas) as QuotaKey[]
	}
}
