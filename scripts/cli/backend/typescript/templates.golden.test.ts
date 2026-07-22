import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { backendGenerators } from './index'
import { backendTemplates } from './templates'

const FIX = join(import.meta.dir, '__fixtures__')
const golden = (f: string) => readFileSync(join(FIX, f), 'utf8')

const PLACEHOLDER_RE = /\{\{[^}]+\}\}/g

describe('backend generator golden equivalence', () => {
	it('entity (BaseEntity) is unchanged', () => {
		const [file] = backendGenerators.entity(['sales', 'Order'], {})
		expect(file.content).toBe(golden('entity.txt'))
	})

	it('entity --aggregate is unchanged', () => {
		const [file] = backendGenerators.entity(['sales', 'Order'], { aggregate: 'true' })
		expect(file.content).toBe(golden('entity.aggregate.txt'))
	})

	it('value-object (object) is unchanged', () => {
		const [file] = backendGenerators['value-object'](['sales', 'Address'], {})
		expect(file.content).toBe(golden('value-object.txt'))
	})

	it('value-object --primitive is unchanged', () => {
		const [file] = backendGenerators['value-object'](['sales', 'Sku'], { primitive: 'true' })
		expect(file.content).toBe(golden('value-object.primitive.txt'))
	})

	it('usecase is unchanged', () => {
		const [file] = backendGenerators.usecase(['sales', 'CreateOrder'], {})
		expect(file.content).toBe(golden('usecase.txt'))
	})

	for (const [name, fixture] of [
		['CreateOrder', 'controller.create.txt'],
		['ListOrders', 'controller.list.txt'],
		['GetOrder', 'controller.get.txt'],
		['UpdateOrder', 'controller.update.txt'],
		['DeleteOrder', 'controller.delete.txt'],
		['ArchiveOrder', 'controller.default.txt'],
	] as const) {
		it(`controller ${name} is unchanged`, () => {
			const [file] = backendGenerators.controller(['sales', name], {})
			expect(file.content).toBe(golden(fixture))
		})
	}

	it('controller --mock is unchanged', () => {
		const [file] = backendGenerators.controller(['sales', 'CreateOrder'], { mock: 'true' })
		expect(file.content).toBe(golden('controller.create.mock.txt'))
	})

	it('handler (internal) is unchanged', () => {
		const [file] = backendGenerators.handler(['sales', 'OrderCreated'], {})
		expect(file.content).toBe(golden('handler.internal.txt'))
	})

	it('handler --external is unchanged', () => {
		const [file] = backendGenerators.handler(['sales', 'OrderCreated'], { external: 'true' })
		expect(file.content).toBe(golden('handler.external.txt'))
	})

	it('service is unchanged', () => {
		const [file] = backendGenerators.service(['sales', 'Pricing'], {})
		expect(file.content).toBe(golden('service.txt'))
	})

	it('event (domain) is unchanged', () => {
		const [file] = backendGenerators.event(['sales', 'OrderCreated'], {})
		expect(file.content).toBe(golden('event.domain.txt'))
	})

	it('event --integration is unchanged', () => {
		const [file] = backendGenerators.event(['sales', 'OrderCreated'], { integration: 'true' })
		expect(file.content).toBe(golden('event.integration.txt'))
	})

	it('middleware is unchanged', () => {
		const [file] = backendGenerators.middleware(['sales', 'Auth'], {})
		expect(file.content).toBe(golden('middleware.txt'))
	})

	it('enum is unchanged', () => {
		const [file] = backendGenerators.enum(['sales', 'OrderStatus'], {})
		expect(file.content).toBe(golden('enum.txt'))
	})

	it('repository abstract file is unchanged', () => {
		const [file] = backendGenerators.repository(['sales', 'Order'], {})
		expect(file.content).toBe(golden('repository.abstract.txt'))
	})

	it('repository drizzle file is unchanged', () => {
		const [, file] = backendGenerators.repository(['sales', 'Order'], {})
		expect(file.content).toBe(golden('repository.drizzle.txt'))
	})

	it('schema is unchanged', () => {
		const [file] = backendGenerators.schema(['sales', 'CreateOrder'], {})
		expect(file.content).toBe(golden('schema.txt'))
	})

	it('errors is unchanged', () => {
		const [file] = backendGenerators.errors(['sales'], {})
		expect(file.content).toBe(golden('errors.txt'))
	})

	it('projection class file is unchanged', () => {
		const [file] = backendGenerators.projection(['sales', 'Message'], {})
		expect(file.content).toBe(golden('projection.txt'))
	})

	it('projection repository file is unchanged', () => {
		const [, file] = backendGenerators.projection(['sales', 'Message'], {})
		expect(file.content).toBe(golden('projection.repository.txt'))
	})

	it('projector is unchanged', () => {
		const [file] = backendGenerators.projector(['sales', 'Message'], {})
		expect(file.content).toBe(golden('projector.txt'))
	})

	it('query is unchanged', () => {
		const [file] = backendGenerators.query(['ListDashboardOrders'], {})
		expect(file.content).toBe(golden('query.txt'))
	})
})

describe('test/given snippet rendering (no leftover placeholders)', () => {
	it('test usecase renders without unresolved placeholders', () => {
		const output = backendTemplates.test('billing', 'CancelSubscription', 'usecase')
		expect(output).not.toMatch(PLACEHOLDER_RE)
		expect(output).toContain('CancelSubscription')
		expect(output).toContain('integration-tenant')
		expect(output).toContain('rejects.toMatchObject')
	})

	it('test repository renders without unresolved placeholders', () => {
		const output = backendTemplates.test('billing', 'Subscription', 'repository')
		expect(output).not.toMatch(PLACEHOLDER_RE)
		expect(output).toContain('SubscriptionRepository')
		expect(output).toContain('integration-tenant')
	})

	it('test handler renders without unresolved placeholders', () => {
		const output = backendTemplates.test('billing', 'SubscriptionCreated', 'handler')
		expect(output).not.toMatch(PLACEHOLDER_RE)
		expect(output).toContain('SubscriptionCreatedHandler')
		expect(output).toContain('@billing/events')
		expect(output).toContain('integration-tenant')
	})

	it('test query renders without unresolved placeholders', () => {
		const output = backendTemplates.test('ui', 'ListDashboardOrders', 'query')
		expect(output).not.toMatch(PLACEHOLDER_RE)
		expect(output).toContain('ListDashboardOrders')
		expect(output).toContain('integration-tenant')
	})

	it('given helper renders without unresolved placeholders', () => {
		const output = backendTemplates.given('billing', 'Coupon')
		expect(output).not.toMatch(PLACEHOLDER_RE)
		expect(output).toContain('givenCoupon')
		expect(output).toContain('@billing/entities/Coupon')
		expect(output).toContain('@billing/repositories/CouponRepository')
	})

	it('usecase co-emission yields two files: usecase + test', () => {
		const files = backendGenerators.usecase(['billing', 'TmpCoemit'], {})
		expect(files).toHaveLength(2)
		expect(files[0].filePath).toMatch(/TmpCoemit\.ts$/)
		expect(files[1].filePath).toMatch(/TmpCoemit\.test\.ts$/)
		expect(files[1].content).not.toMatch(PLACEHOLDER_RE)
	})

	it('handler co-emission yields two files: handler + test', () => {
		const files = backendGenerators.handler(['billing', 'SubscriptionCreated'], {})
		expect(files).toHaveLength(2)
		expect(files[0].filePath).toMatch(/SubscriptionCreatedHandler\.ts$/)
		expect(files[1].filePath).toMatch(/SubscriptionCreatedHandler\.test\.ts$/)
		expect(files[1].content).not.toMatch(PLACEHOLDER_RE)
	})

	it('repository co-emission yields three files: abstract + drizzle + test', () => {
		const files = backendGenerators.repository(['billing', 'Subscription'], {})
		expect(files).toHaveLength(3)
		expect(files[2].filePath).toMatch(/SubscriptionRepository\.test\.ts$/)
		expect(files[2].content).not.toMatch(PLACEHOLDER_RE)
	})

	it('query co-emission yields two files: query + test', () => {
		const files = backendGenerators.query(['ListDashboardOrders'], {})
		expect(files).toHaveLength(2)
		expect(files[0].filePath).toMatch(/ListDashboardOrders\.ts$/)
		expect(files[1].filePath).toMatch(/ListDashboardOrders\.test\.ts$/)
		expect(files[1].content).not.toMatch(PLACEHOLDER_RE)
	})
})
