import { injectable } from 'tsyringe-neo'
import { BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'

import type { DomainErrors } from '@quota/errors'
import { QuotaEntitlement } from './QuotaEntitlement'
import { QuotaUsageSource } from './QuotaUsageSource'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

@injectable()
export class QuotaGate {
	constructor(
		private entitlement: QuotaEntitlement,
		private usage: QuotaUsageSource,
	) {}

	/** Generic tell-don't-ask gate. Hard-limit key at/over its effective limit → QUOTA_LIMIT_EXCEEDED
	 *  (key in detail). Metered key → never blocks (overage is billed at period close). */
	async assertCanPerform(ownerId: string, key: QuotaKey, tx?: Transaction): Promise<void> {
		const ent = (await this.entitlement.entitlementFor(ownerId, tx))[key]
		if (!ent || ent.metered || ent.limit === null) return

		const used = await this.usage.usage(ownerId, key, undefined, tx)
		if (used >= ent.limit) throw new BaseError<DomainErrors>('QUOTA_LIMIT_EXCEEDED')
	}
}
