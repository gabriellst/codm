import { describe, it, expect } from 'bun:test'
import { IntegrationEventSchema } from '@codedm/contracts-typescript/wire'

// The base template ships a single integration event (billing subscription-changed) since W3 moved
// the membership event to examples/slices/tenant-membership. The discriminator machinery is still exercised:
// resolve-by-name on the thin variant + reject-unknown. A product grafting more events re-widens the
// union and can add a multi-field variant case here.
describe('IntegrationEventSchema (generated)', () => {
	it('resolves the thin billing subscription-changed variant (no payload fields)', () => {
		const parsed = IntegrationEventSchema.parse({
			name: 'integration.billing.subscription_changed',
			payload: {},
			ownerId: 'tenant-1',
		})
		expect(parsed.name).toBe('integration.billing.subscription_changed')
	})

	it('throws on unknown discriminator value', () => {
		expect(() =>
			IntegrationEventSchema.parse({
				name: 'integration.unknown',
				payload: {},
				ownerId: 'tenant-1',
			}),
		).toThrow()
	})
})
