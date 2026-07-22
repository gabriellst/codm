import { describe, expect, it } from 'bun:test'

import { InvoiceStatus } from '../../enums/InvoiceStatus'
import { Subscription } from '../../entities'
import type { Invoice } from '../../entities'
import type { InvoiceRepository } from '../../repositories/InvoiceRepository'
import type { SubscriptionRepository } from '../../repositories/SubscriptionRepository'
import { InvoiceStatusDeriver, type DerivableInvoice, type DerivedInvoiceStatus } from '../InvoiceStatusDeriver'
import { DrizzleSubscriptionAccessDeriver } from './DrizzleSubscriptionAccessDeriver'
import { PlanName, SubscriptionStatus } from '@template/contracts-typescript/wire/enums'

// Unit test: the real deriver folds the record + ledger facts through the frozen derivation.
// Its three collaborators are hand-rolled fakes so every access/display-status branch is asserted
// directly — the SET of invoice ids the InvoiceStatusDeriver reports as backing access is seeded,
// exercising `paidThrough = MAX periodEnd over backing invoices` without a DB.
// (Grace-window arithmetic assumes the default BILLING_DUNNING_GRACE_DAYS = 3.)
describe('DrizzleSubscriptionAccessDeriver.derive', () => {
	const NOW = new Date('2026-07-07T00:00:00Z')
	const d = (iso: string) => new Date(iso)

	// A fake InvoiceStatusDeriver: an invoice backs access iff its id is in `backing`.
	class FakeInvoiceStatusDeriver extends InvoiceStatusDeriver {
		constructor(private backing: Set<string>) {
			super()
		}
		async derive(invoice: DerivableInvoice, _now: Date): Promise<DerivedInvoiceStatus> {
			const backsAccess = this.backing.has(invoice.invoiceId)
			return { status: backsAccess ? InvoiceStatus.PAID : InvoiceStatus.PENDING, paidAt: backsAccess ? NOW : null, backsAccess }
		}
		async deriveMany(invoices: DerivableInvoice[], now: Date): Promise<Map<string, DerivedInvoiceStatus>> {
			const entries = await Promise.all(invoices.map(async i => [i.invoiceId, await this.derive(i, now)] as const))
			return new Map(entries)
		}
	}

	const invoice = (invoiceId: string, periodEnd: Date | null): Invoice =>
		({ id: { value: invoiceId }, amountCents: 29900, dueDate: null, periodEnd }) as unknown as Invoice

	const subscription = (over: {
		planName?: PlanName
		trialEnd?: Date | null
		canceledAt?: Date | null
		cancelAtPeriodEnd?: boolean
		currentPeriodEnd?: Date | null
	}) =>
		Subscription.create({
			ownerId: 'owner_1',
			engineSubscriptionId: 'sub_1',
			planName: over.planName ?? PlanName.PRO,
			status: SubscriptionStatus.ACTIVE,
			currentPeriodEnd: over.currentPeriodEnd ?? null,
			trialEnd: over.trialEnd ?? null,
			canceledAt: over.canceledAt ?? null,
			cancelAtPeriodEnd: over.cancelAtPeriodEnd ?? false,
		})

	/** Build the deriver over the given record, invoice ledger, and the set of access-backing invoice ids. */
	const build = (record: Subscription | null, invoices: Invoice[], backingIds: string[]) => {
		const subscriptionRepo = {
			async findByOwnerId() {
				return record
			},
		} as unknown as SubscriptionRepository
		const invoiceRepo = {
			async findByOwnerId() {
				return invoices
			},
		} as unknown as InvoiceRepository
		return new DrizzleSubscriptionAccessDeriver(subscriptionRepo, invoiceRepo, new FakeInvoiceStatusDeriver(new Set(backingIds)))
	}

	it('trial access — now < trialEnd → TRIALING, access, plan = record plan', async () => {
		const deriver = build(subscription({ trialEnd: d('2026-08-01T00:00:00Z') }), [], [])
		const result = await deriver.derive('owner_1', NOW)
		expect(result).toEqual({ hasAccess: true, effectivePlan: PlanName.PRO, displayStatus: SubscriptionStatus.TRIALING, paidThrough: null })
	})

	it('paid access — paidThrough in the future, now <= paidThrough → ACTIVE, access', async () => {
		const deriver = build(subscription({}), [invoice('inv_1', d('2026-08-01T00:00:00Z'))], ['inv_1'])
		const result = await deriver.derive('owner_1', NOW)
		expect(result).toEqual({
			hasAccess: true,
			effectivePlan: PlanName.PRO,
			displayStatus: SubscriptionStatus.ACTIVE,
			paidThrough: d('2026-08-01T00:00:00Z'),
		})
	})

	it('dunning grace — paidThrough < now <= graceEnd → PAST_DUE, STILL access', async () => {
		// paidThrough = yesterday; grace default 3d → graceEnd = 2026-07-09; now (07-07) is within it.
		const deriver = build(subscription({}), [invoice('inv_1', d('2026-07-06T00:00:00Z'))], ['inv_1'])
		const result = await deriver.derive('owner_1', NOW)
		expect(result).toEqual({
			hasAccess: true,
			effectivePlan: PlanName.PRO,
			displayStatus: SubscriptionStatus.PAST_DUE,
			paidThrough: d('2026-07-06T00:00:00Z'),
		})
	})

	it('expired — now > graceEnd → INCOMPLETE, NO access, FREE', async () => {
		// paidThrough = 07-01; graceEnd = 07-04; now (07-07) is past it.
		const deriver = build(subscription({}), [invoice('inv_1', d('2026-07-01T00:00:00Z'))], ['inv_1'])
		const result = await deriver.derive('owner_1', NOW)
		expect(result).toEqual({
			hasAccess: false,
			effectivePlan: PlanName.FREE,
			displayStatus: SubscriptionStatus.INCOMPLETE,
			paidThrough: d('2026-07-01T00:00:00Z'),
		})
	})

	it('cancellation immediate — canceledAt <= now, cancelAtPeriodEnd = false → CANCELED, no access (even with a future paid invoice)', async () => {
		const deriver = build(
			subscription({ canceledAt: d('2026-07-01T00:00:00Z'), cancelAtPeriodEnd: false }),
			[invoice('inv_1', d('2026-08-01T00:00:00Z'))],
			['inv_1'],
		)
		const result = await deriver.derive('owner_1', NOW)
		expect(result.hasAccess).toBe(false)
		expect(result.displayStatus).toBe(SubscriptionStatus.CANCELED)
		expect(result.effectivePlan).toBe(PlanName.FREE)
	})

	it('cancellation at-period-end — now < currentPeriodEnd → still access', async () => {
		const deriver = build(
			subscription({ canceledAt: d('2026-07-01T00:00:00Z'), cancelAtPeriodEnd: true, currentPeriodEnd: d('2026-08-01T00:00:00Z') }),
			[invoice('inv_1', d('2026-08-01T00:00:00Z'))],
			['inv_1'],
		)
		const result = await deriver.derive('owner_1', NOW)
		expect(result.hasAccess).toBe(true)
		expect(result.displayStatus).toBe(SubscriptionStatus.ACTIVE)
		expect(result.effectivePlan).toBe(PlanName.PRO)
	})

	it('cancellation at-period-end — now >= currentPeriodEnd → CANCELED, no access', async () => {
		const deriver = build(
			subscription({ canceledAt: d('2026-07-01T00:00:00Z'), cancelAtPeriodEnd: true, currentPeriodEnd: d('2026-07-05T00:00:00Z') }),
			[invoice('inv_1', d('2026-08-01T00:00:00Z'))],
			['inv_1'],
		)
		const result = await deriver.derive('owner_1', NOW)
		expect(result.hasAccess).toBe(false)
		expect(result.displayStatus).toBe(SubscriptionStatus.CANCELED)
		expect(result.effectivePlan).toBe(PlanName.FREE)
	})

	it('cancel-at-period-end DURING a trial holds access until trialEnd, not immediately (trial-aware boundary)', async () => {
		// Trialing (trialEnd future, currentPeriodEnd null) + a scheduled cancel requested mid-trial.
		// Access must continue until the TRIAL end; without the trial-aware anchor the boundary fell back
		// to canceledAt and revoked trial access immediately.
		const deriver = build(
			subscription({
				trialEnd: d('2026-08-01T00:00:00Z'),
				canceledAt: d('2026-07-01T00:00:00Z'),
				cancelAtPeriodEnd: true,
				currentPeriodEnd: null,
			}),
			[],
			[],
		)
		const result = await deriver.derive('owner_1', NOW) // NOW 2026-07-07 < trialEnd
		expect(result.hasAccess).toBe(true)
		expect(result.displayStatus).toBe(SubscriptionStatus.TRIALING)
	})

	it('no record → FREE / no access / INCOMPLETE / paidThrough null', async () => {
		const deriver = build(null, [invoice('inv_1', d('2026-08-01T00:00:00Z'))], ['inv_1'])
		const result = await deriver.derive('owner_1', NOW)
		expect(result).toEqual({
			hasAccess: false,
			effectivePlan: PlanName.FREE,
			displayStatus: SubscriptionStatus.INCOMPLETE,
			paidThrough: null,
		})
	})

	it('paidThrough = MAX periodEnd over backing invoices — ignores null periodEnd and non-backing invoices', async () => {
		const deriver = build(
			subscription({}),
			[
				invoice('inv_backing_early', d('2026-07-20T00:00:00Z')),
				invoice('inv_backing_late', d('2026-08-10T00:00:00Z')), // the MAX
				invoice('inv_backing_no_period', null), // ignored: null periodEnd
				invoice('inv_not_backing', d('2026-09-01T00:00:00Z')), // ignored: not backing access
			],
			['inv_backing_early', 'inv_backing_late', 'inv_backing_no_period'],
		)
		const result = await deriver.derive('owner_1', NOW)
		expect(result.paidThrough).toEqual(d('2026-08-10T00:00:00Z'))
		expect(result.hasAccess).toBe(true)
		expect(result.displayStatus).toBe(SubscriptionStatus.ACTIVE)
	})

	it('effectivePlan is the record plan while access holds, else FREE', async () => {
		const withAccess = build(subscription({ planName: PlanName.STARTER }), [invoice('inv_1', d('2026-08-01T00:00:00Z'))], ['inv_1'])
		expect((await withAccess.derive('owner_1', NOW)).effectivePlan).toBe(PlanName.STARTER)

		const noAccess = build(subscription({ planName: PlanName.STARTER }), [], [])
		expect((await noAccess.derive('owner_1', NOW)).effectivePlan).toBe(PlanName.FREE)
	})
})
