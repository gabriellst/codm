// Acceptance tests (UNIT) for the Sales coupon aggregate spec
// (.specs/2026-06-10-sales-coupon-aggregate.md). Authored by the feature-loop
// VERIFIER — the skill-evals harness injects this file at
// packages/api/typescript/src/sales/entities/Coupon.test.ts.
// RED at base: sales/entities/Coupon.ts and sales/enums/ do not exist yet.
// Goes green when spec Decisions 1–8 land.
//
// Pure unit test: direct instantiation, no TestBed/DI (test SKILL.md quick rule).
import { describe, expect, it } from 'bun:test'
import { BaseError } from '@template/core-typescript'
import { testId } from '@test/support'
import { Coupon, CouponSchema } from './Coupon'
import { CouponStatus, CouponType } from '../enums'

const STORE_ID = testId('store', 'a')
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000)

/**
 * Asserts `fn` throws a BaseError carrying the named Sales domain code.
 *
 * The spec places format + cross-field invariants IN CouponSchema (D3/D4:
 * `{ error: 'CODE' as SalesDomainErrors }`) and BaseEntity surfaces schema
 * failures as BaseError('INVALID_ENTITY', <issue message = CODE>), while
 * explicit guard throws (D6/D7) surface the code as the error NAME. Both
 * channels carry the same registered SalesDomainErrors code, so the test
 * asserts code ∈ {name, message} — faithful to the spec without forcing the
 * builder to duplicate schema rules as if-checks in create() (banned by D4).
 *
 * Not the banned hand-rolled try/catch idiom (test bp-19): `toBeInstanceOf`
 * fails loudly when nothing was thrown or a non-BaseError was thrown.
 */
function expectCouponError(fn: () => unknown, code: string): void {
	let thrown: unknown
	try {
		fn()
	} catch (error) {
		thrown = error
	}
	expect(thrown).toBeInstanceOf(BaseError)
	const err = thrown as BaseError
	expect([err.name, err.message]).toContain(code)
}

function validCreate(overrides: Partial<{ code: string; type: CouponType; value: number; expiresAt: Date | string }> = {}): Coupon {
	return Coupon.create({
		storeId: STORE_ID,
		code: overrides.code ?? 'SAVE10',
		type: overrides.type ?? CouponType.PERCENTAGE,
		value: overrides.value ?? 10,
		expiresAt: overrides.expiresAt,
	})
}

/** Rehydration-style construction — what the repository's toDomain does (D5/D13). */
function rehydrate(overrides: Partial<{ status: CouponStatus; expiresAt: Date }> = {}): Coupon {
	return new Coupon({
		id: testId('coupon', '1'),
		storeId: STORE_ID,
		code: 'SAVE10',
		type: CouponType.PERCENTAGE,
		value: 10,
		status: overrides.status ?? CouponStatus.ACTIVE,
		expiresAt: overrides.expiresAt,
	})
}

// ─── create() — defaults + format invariants (AC1–AC4, AC6) ────────────────

describe('Coupon.create()', () => {
	it('AC1: creates ACTIVE with normalized code and a generated UUID id — caller never passes status', () => {
		const coupon = validCreate({ code: ' save10 ' })

		expect(coupon.status).toBe(CouponStatus.ACTIVE) // OPTIONALITY: lifecycle default born in create()
		expect(coupon.code).toBe('SAVE10') // trim + toUpperCase normalization (D3)
		expect(coupon.id.value).toMatch(UUID_RE) // auto `new Id()` UUID (D1)
		expect(coupon.storeId.value).toBe(STORE_ID)
		expect(coupon.expiresAt).toBeUndefined()
	})

	it('AC6: empty code throws COUPON_CODE_REQUIRED', () => {
		expectCouponError(() => validCreate({ code: '' }), 'COUPON_CODE_REQUIRED')
	})

	it('AC6: whitespace-only code throws COUPON_CODE_REQUIRED (trim runs before min)', () => {
		expectCouponError(() => validCreate({ code: '   ' }), 'COUPON_CODE_REQUIRED')
	})

	it('AC6: 65-char code throws INVALID_COUPON_CODE', () => {
		expectCouponError(() => validCreate({ code: 'a'.repeat(65) }), 'INVALID_COUPON_CODE')
	})

	it('accepts a 64-char code (max boundary)', () => {
		expect(validCreate({ code: 'a'.repeat(64) }).code).toBe('A'.repeat(64))
	})

	it('AC2: PERCENTAGE value 0 and 101 throw INVALID_COUPON_VALUE — rejected at construction, not in a use case', () => {
		// VALIDATION-PLACEMENT: the cross-field type/value rule is a schema .refine (D4),
		// so an invalid combination cannot even be constructed.
		expectCouponError(() => validCreate({ type: CouponType.PERCENTAGE, value: 0 }), 'INVALID_COUPON_VALUE')
		expectCouponError(() => validCreate({ type: CouponType.PERCENTAGE, value: 101 }), 'INVALID_COUPON_VALUE')
	})

	it('AC2: PERCENTAGE values 1 and 100 are accepted (boundaries)', () => {
		expect(validCreate({ type: CouponType.PERCENTAGE, value: 1 }).value).toBe(1)
		expect(validCreate({ type: CouponType.PERCENTAGE, value: 100 }).value).toBe(100)
	})

	it('AC3: FIXED_AMOUNT value 0 and negative throw INVALID_COUPON_VALUE', () => {
		expectCouponError(() => validCreate({ type: CouponType.FIXED_AMOUNT, value: 0 }), 'INVALID_COUPON_VALUE')
		expectCouponError(() => validCreate({ type: CouponType.FIXED_AMOUNT, value: -5 }), 'INVALID_COUPON_VALUE')
	})

	it('AC3: FIXED_AMOUNT accepts any positive int (cents)', () => {
		expect(validCreate({ type: CouponType.FIXED_AMOUNT, value: 1 }).value).toBe(1)
		expect(validCreate({ type: CouponType.FIXED_AMOUNT, value: 19_900 }).value).toBe(19_900)
	})

	it('AC4: past expiresAt throws COUPON_EXPIRY_IN_PAST — Date and ISO-string inputs', () => {
		// D6: creation-time guard inside create(), AFTER string → Date normalization.
		expectCouponError(() => validCreate({ expiresAt: PAST }), 'COUPON_EXPIRY_IN_PAST')
		expectCouponError(() => validCreate({ expiresAt: PAST.toISOString() }), 'COUPON_EXPIRY_IN_PAST')
	})

	it('AC4: future expiresAt succeeds — ISO-string input normalized to Date', () => {
		const coupon = validCreate({ expiresAt: FUTURE.toISOString() })
		expect(coupon.expiresAt).toBeInstanceOf(Date)
		expect(coupon.expiresAt?.getTime()).toBe(FUTURE.getTime())
	})
})

// ─── Rehydration — stored state wins (AC5, D5/D6) ──────────────────────────

describe('Coupon rehydration (new Coupon({...row}))', () => {
	it('AC5: a stored INACTIVE row with a past expiresAt rehydrates without throwing and keeps INACTIVE', () => {
		// OPTIONALITY: the schema must NOT default the status back to ACTIVE, and
		// the expiry-in-past guard must live only in create(), never in the schema.
		const coupon = rehydrate({ status: CouponStatus.INACTIVE, expiresAt: PAST })

		expect(coupon.status).toBe(CouponStatus.INACTIVE)
		expect(coupon.expiresAt).toBeInstanceOf(Date)
	})

	it('D5: CouponSchema requires status — a row without one is rejected (no schema .default())', () => {
		const result = CouponSchema.safeParse({
			storeId: STORE_ID,
			code: 'SAVE10',
			type: CouponType.PERCENTAGE,
			value: 10,
			// status intentionally absent — a .default() would silently accept this
		})
		expect(result.success).toBe(false)
	})
})

// ─── deactivate() — tell-don't-ask guards, expired-first (AC7–AC9, D7) ─────

describe('Coupon.deactivate()', () => {
	it('AC7: deactivates an ACTIVE non-expired coupon — status INACTIVE, version untouched by the method', () => {
		const coupon = validCreate()

		coupon.deactivate()

		expect(coupon.status).toBe(CouponStatus.INACTIVE)
		expect(coupon.version).toBe(1) // repo save owns incrementVersion (D7)
	})

	it('AC8: an already-INACTIVE coupon throws COUPON_ALREADY_INACTIVE from inside the method', () => {
		// TELL-DON'T-ASK: the caller does no pre-check — the behavior method guards.
		const coupon = rehydrate({ status: CouponStatus.INACTIVE })
		expectCouponError(() => coupon.deactivate(), 'COUPON_ALREADY_INACTIVE')
	})

	it('AC9: an expired coupon throws COUPON_EXPIRED even when the stored status is ACTIVE', () => {
		// D7 guard order: (a) isExpired runs BEFORE (b) the status guard —
		// expiry IS deactivation, so the transition is refused with the expiry code.
		const coupon = rehydrate({ status: CouponStatus.ACTIVE, expiresAt: PAST })
		expectCouponError(() => coupon.deactivate(), 'COUPON_EXPIRED')
		expect(coupon.status).toBe(CouponStatus.ACTIVE) // guard threw before any mutation
	})

	it('D7 guard order: expired AND already-INACTIVE → COUPON_EXPIRED wins', () => {
		const coupon = rehydrate({ status: CouponStatus.INACTIVE, expiresAt: PAST })
		expectCouponError(() => coupon.deactivate(), 'COUPON_EXPIRED')
	})

	it('D7: deactivate(now) uses the injected clock — now past a future expiry → COUPON_EXPIRED', () => {
		const coupon = validCreate({ expiresAt: FUTURE })
		expectCouponError(() => coupon.deactivate(new Date(FUTURE.getTime() + 1000)), 'COUPON_EXPIRED')
	})

	it('D7: isExpired(now) — false without expiry; expiresAt <= now counts as expired (boundary)', () => {
		expect(validCreate().isExpired(new Date())).toBe(false)

		const coupon = validCreate({ expiresAt: FUTURE })
		expect(coupon.isExpired(new Date(FUTURE.getTime() - 1000))).toBe(false)
		expect(coupon.isExpired(FUTURE)).toBe(true)
		expect(coupon.isExpired(new Date(FUTURE.getTime() + 1000))).toBe(true)
	})
})
