import { Handler, IdempotencyGuard, z } from '@template/core-typescript'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'
import type { Transaction } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { IdempotencyScope } from '@shared/enums'
import { QuotaOverrideRepository } from '@quota/repositories'
import { QuotaOverride } from '@quota/entities'
import { QuotaOverrideAppliedEvent } from '@quota/events'

export const ApplyQuotaOverrideInputSchema = z.object({
	ownerId: z.string().min(1),
	meter: z.enum(QuotaKey),
	delta: z.number().int(),
	idempotencyKey: z.string().min(1),
})

export const ApplyQuotaOverrideOutputSchema = z.void()

@injectable()
export class ApplyQuotaOverride extends Handler<typeof ApplyQuotaOverrideInputSchema, typeof ApplyQuotaOverrideOutputSchema> {
	readonly name = 'apply_quota_override' as const
	readonly inputSchema = ApplyQuotaOverrideInputSchema
	readonly outputSchema = ApplyQuotaOverrideOutputSchema

	constructor(
		private quotaOverrideRepository: QuotaOverrideRepository,
		private idempotencyGuard: IdempotencyGuard,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// The override is a NATIVE DB write (quota.quota_overrides, owned by @quota), READ back by
		// QuotaEntitlement to raise the effective limit — no external engine call. No
		// subscription-existence check here: an override is not an invariant of a subscription's
		// lifecycle, so it can be granted independent of whether a subscription currently exists.
		// With no off-transaction external call, the whole thing runs in ONE transaction: claim →
		// write the override → record the audit event. The repository's own UNIQUE(idem_key) makes
		// `applyIfNew` idempotent even independent of the claim.
		return this.withTransaction(tx, async tx => {
			if (!(await this.idempotencyGuard.claim(IdempotencyScope.QUOTA_OVERRIDE, input.idempotencyKey, tx))) return

			const override = QuotaOverride.create({
				ownerId: input.ownerId,
				meter: input.meter,
				delta: input.delta,
				idemKey: input.idempotencyKey,
			})
			await this.quotaOverrideRepository.applyIfNew(override, tx)

			await this.domainEventRepository.save(
				new QuotaOverrideAppliedEvent({
					entityId: input.ownerId,
					ownerId: input.ownerId,
					payload: { ownerId: input.ownerId, meter: input.meter, delta: input.delta, idempotencyKey: input.idempotencyKey },
				}),
				tx,
			)
		})
	}
}
