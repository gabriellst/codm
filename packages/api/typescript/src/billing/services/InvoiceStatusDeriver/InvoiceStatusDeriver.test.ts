import { describe, expect, it } from 'bun:test'
import { InvoiceStatusDeriver } from './InvoiceStatusDeriver'
import { InvoiceStatus } from '../../enums/InvoiceStatus'

// Pure predicate — no DB. The single source of the status ordering; the Drizzle/Mock impls only
// resolve `paid`/`creditedCents`/`paidAt` and delegate here.
describe('InvoiceStatusDeriver.deriveInvoiceStatus (pure predicate)', () => {
	const NOW = new Date('2026-07-07T00:00:00Z')
	const PAST = new Date('2026-06-01T00:00:00Z')
	const FUTURE = new Date('2026-08-01T00:00:00Z')

	const derive = (over: Partial<Parameters<typeof InvoiceStatusDeriver.deriveInvoiceStatus>[0]>) =>
		InvoiceStatusDeriver.deriveInvoiceStatus({ total: 29900, paid: false, creditedCents: 0, dueDate: null, now: NOW, ...over })

	it('PENDING — unpaid, uncredited, no due date', () => {
		expect(derive({})).toBe(InvoiceStatus.PENDING)
	})

	it('PENDING — unpaid but not yet past a future due date', () => {
		expect(derive({ dueDate: FUTURE })).toBe(InvoiceStatus.PENDING)
	})

	it('PAID — a succeeded charge with nothing credited', () => {
		expect(derive({ paid: true })).toBe(InvoiceStatus.PAID)
	})

	it('PAID — a zero-total invoice is paid by construction, even with no charge', () => {
		expect(derive({ total: 0, paid: false })).toBe(InvoiceStatus.PAID)
	})

	it('VOID — unpaid and superseded (voidedAt set)', () => {
		expect(derive({ voidedAt: PAST })).toBe(InvoiceStatus.VOID)
	})

	it('money wins over a void — paid + voidedAt still reads PAID', () => {
		expect(derive({ paid: true, voidedAt: PAST })).toBe(InvoiceStatus.PAID)
	})

	it('OVERDUE — unpaid and now is past the due date', () => {
		expect(derive({ dueDate: PAST })).toBe(InvoiceStatus.OVERDUE)
	})

	it('PARTIALLY_REFUNDED — a partial credit against the invoice (regardless of paid)', () => {
		expect(derive({ paid: true, creditedCents: 10000 })).toBe(InvoiceStatus.PARTIALLY_REFUNDED)
		expect(derive({ paid: false, creditedCents: 10000 })).toBe(InvoiceStatus.PARTIALLY_REFUNDED)
	})

	it('REFUNDED — credited for the full amount (wins over PAID)', () => {
		expect(derive({ paid: true, creditedCents: 29900 })).toBe(InvoiceStatus.REFUNDED)
		expect(derive({ paid: true, creditedCents: 30000 })).toBe(InvoiceStatus.REFUNDED)
	})

	it('a zero-total invoice with a credit is NOT REFUNDED (total must be > 0)', () => {
		expect(derive({ total: 0, creditedCents: 0 })).toBe(InvoiceStatus.PAID)
	})
})
