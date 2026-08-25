import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { backendGeneratorsFor } from '../index'

const go = backendGeneratorsFor('go')
const FIX = join(import.meta.dir, '__fixtures__')
const golden = (f: string) => readFileSync(join(FIX, f), 'utf8')
const content = async (a: string, pos: string[], flags = {}) => (await go[a]!(pos, flags))[0]!.content
const contentAt = async (idx: number, a: string, pos: string[], flags = {}) => (await go[a]!(pos, flags))[idx]!.content

describe('go generator golden equivalence (pilot)', () => {
	it('entity', async () => expect(await content('entity', ['sales', 'Coupon'])).toBe(golden('entity.txt')))
	it('value-object', async () => expect(await content('value-object', ['sales', 'CouponCode'])).toBe(golden('value-object.txt')))
	it('enum', async () => expect(await content('enum', ['sales', 'CouponStatus'])).toBe(golden('enum.txt')))
	it('errors', async () => expect(await content('errors', ['sales'])).toBe(golden('errors.txt')))
})

describe('go generator golden equivalence (remaining)', () => {
	// schema
	it('schema', async () => expect(await content('schema', ['sales', 'Coupon'])).toBe(golden('schema.txt')))

	// usecase
	it('usecase', async () => expect(await content('usecase', ['sales', 'CreateCoupon'])).toBe(golden('usecase.txt')))

	// query
	it('query', async () => expect(await content('query', ['sales', 'GetCoupon'])).toBe(golden('query.txt')))

	// controller — default (POST/create → Created)
	it('controller (post/create)', async () => expect(await content('controller', ['sales', 'CreateCoupon'])).toBe(golden('controller.txt')))

	// controller — GET → OK
	it('controller (get → ok)', async () => expect(await content('controller', ['sales', 'GetCoupon'])).toBe(golden('controller-get.txt')))

	// controller — DELETE → NoContent
	it('controller (delete → nocontent)', async () =>
		expect(await content('controller', ['sales', 'DeleteCoupon'])).toBe(golden('controller-delete.txt')))

	// repository — 3 files
	it('repository (interface)', async () =>
		expect(await contentAt(0, 'repository', ['sales', 'Coupon'])).toBe(golden('repository-interface.txt')))
	it('repository (pg)', async () => expect(await contentAt(1, 'repository', ['sales', 'Coupon'])).toBe(golden('repository-pg.txt')))
	it('repository (mock)', async () => expect(await contentAt(2, 'repository', ['sales', 'Coupon'])).toBe(golden('repository-mock.txt')))

	// service
	it('service', async () => expect(await content('service', ['sales', 'PaymentGateway'])).toBe(golden('service.txt')))

	// event (domain)
	it('event (domain)', async () =>
		expect(await content('event', ['sales', 'CouponApplied'], { integration: 'false' })).toBe(golden('domain-event.txt')))

	// event (integration)
	it('event (integration)', async () =>
		expect(await content('event', ['sales', 'CouponApplied'], { integration: 'true' })).toBe(golden('integration-event.txt')))

	// handler (internal)
	it('handler (internal)', async () =>
		expect(await content('handler', ['sales', 'CouponApplied'], { external: 'false' })).toBe(golden('internal-handler.txt')))

	// handler (external)
	it('handler (external)', async () =>
		expect(await content('handler', ['sales', 'CouponApplied'], { external: 'true' })).toBe(golden('external-handler.txt')))

	// projection — 4 files
	it('projection (struct)', async () => expect(await contentAt(0, 'projection', ['sales', 'Coupon'])).toBe(golden('projection.txt')))
	it('projection (repository interface)', async () =>
		expect(await contentAt(1, 'projection', ['sales', 'Coupon'])).toBe(golden('projection-repository.txt')))
	it('projection (repository mock)', async () =>
		expect(await contentAt(2, 'projection', ['sales', 'Coupon'])).toBe(golden('projection-repository-mock.txt')))
	it('projection (repository pg)', async () =>
		expect(await contentAt(3, 'projection', ['sales', 'Coupon'])).toBe(golden('projection-repository-pg.txt')))

	// projector
	it('projector', async () => expect(await content('projector', ['sales', 'Coupon'])).toBe(golden('projector.txt')))

	// middleware
	it('middleware', async () => expect(await content('middleware', ['sales', 'ApiKey'])).toBe(golden('middleware.txt')))

	// test
	it('test', async () => expect(await content('test', ['sales', 'CreateCoupon'])).toBe(golden('test.txt')))
})
