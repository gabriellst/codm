import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'

import { InvoiceRepository } from '../../repositories/InvoiceRepository'
import { SubscriptionRepository } from '../../repositories/SubscriptionRepository'
import { InvoiceStatusDeriver } from '../InvoiceStatusDeriver'
import { SubscriptionAccessDeriver, type DerivedAccess } from './SubscriptionAccessDeriver'
import { PlanName, SubscriptionStatus } from '@template/contracts-typescript/wire/enums'

/**
 * The real (DB-backed) access deriver. Holds no SQL of its own — it delegates entirely to the
 * Drizzle-backed subscription + invoice repositories and the InvoiceStatusDeriver, then folds the facts
 * through the pure `SubscriptionAccessDeriver.computeAccess`. Named `Drizzle*` to match the sibling
 * binding idiom (bound in the integration + real profiles).
 */
@injectable()
export class DrizzleSubscriptionAccessDeriver extends SubscriptionAccessDeriver {
	constructor(
		private subscriptionRepository: SubscriptionRepository,
		private invoiceRepository: InvoiceRepository,
		private invoiceStatusDeriver: InvoiceStatusDeriver,
	) {
		super()
	}

	async derive(ownerId: string, now: Date, tx?: Transaction): Promise<DerivedAccess> {
		const record = await this.subscriptionRepository.findByOwnerId(ownerId, tx)
		if (!record) {
			return { hasAccess: false, effectivePlan: PlanName.FREE, displayStatus: SubscriptionStatus.INCOMPLETE, paidThrough: null }
		}

		const paidThrough = await this.resolvePaidThrough(ownerId, now, tx)
		return SubscriptionAccessDeriver.computeAccess({
			record,
			paidThrough,
			now,
			graceDays: ProductConfig.env.BILLING_DUNNING_GRACE_DAYS,
		})
	}

	/**
	 * MAX `periodEnd` over the owner's invoices that currently back access — a SUCCEEDED charge ∧
	 * not fully credited (exactly `InvoiceStatusDeriver.derive(...).backsAccess`). Invoices with a
	 * null periodEnd are ignored; null when none qualify.
	 */
	private async resolvePaidThrough(ownerId: string, now: Date, tx?: Transaction): Promise<Date | null> {
		const invoices = await this.invoiceRepository.findByOwnerId(ownerId, tx)
		let paidThrough: Date | null = null
		for (const invoice of invoices) {
			const periodEnd = invoice.periodEnd
			if (periodEnd == null) continue
			const derived = await this.invoiceStatusDeriver.derive(
				{ invoiceId: invoice.id.value, amountCents: invoice.amountCents, dueDate: invoice.dueDate },
				now,
				tx,
			)
			if (!derived.backsAccess) continue
			if (paidThrough == null || periodEnd > paidThrough) paidThrough = periodEnd
		}
		return paidThrough
	}
}
