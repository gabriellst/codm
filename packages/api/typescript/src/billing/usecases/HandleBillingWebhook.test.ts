// HandleBillingWebhook.test.ts — the single billing-webhook entry point routes `source` to the
// verifier + mapper factories; a source with no binding is rejected up front. Ported from
// medscall's HandleBillingWebhook.test.ts.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { HandleBillingWebhook } from './HandleBillingWebhook'
import { BillingWebhookSource } from '@billing/enums'
import { BaseError } from '@template/core-typescript'

// InfinitePay/Getnet/Rede were removed as live integrations (gateway-consolidation). Their
// BillingWebhookSource enum members stay (DECOMMISSIONED — historical rows must remain readable),
// but no verifier/mapper is bound for them anymore — HandleBillingWebhook's existing "no verifier
// or mapper" branch is what now covers them, same as any never-configured source.
describe('HandleBillingWebhook — decommissioned sources', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let usecase: HandleBillingWebhook

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'o1' })
		usecase = testBed.resolve(HandleBillingWebhook)
	})

	beforeEach(async () => {
		await testBed.reset()
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	const decommissioned = [BillingWebhookSource.GETNET, BillingWebhookSource.INFINITEPAY, BillingWebhookSource.REDE]

	for (const source of decommissioned) {
		it(`a ${source} webhook is rejected with WEBHOOK_SOURCE_UNKNOWN (no verifier/mapper bound)`, async () => {
			expect.assertions(2)
			try {
				await usecase.execute({ source, request: new Request(`http://localhost/webhooks/${source.toLowerCase()}`, { method: 'POST' }) })
			} catch (error) {
				expect(error).toBeInstanceOf(BaseError)
				expect((error as BaseError).name).toBe('WEBHOOK_SOURCE_UNKNOWN')
			}
		})
	}
})
