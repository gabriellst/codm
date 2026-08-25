import { describe, expect, it } from 'bun:test'
import { GetIssuesOverviewControllerInputSchema } from './GetIssuesOverview'

const ctx = { ownerId: '00000000-0000-4000-8000-000000000001' }

describe('GetIssuesOverview query parsing (boolean query regression)', () => {
	it('?includeArchived=false is honored as FALSE (the z.coerce.boolean bug turned it into true)', () => {
		const parsed = GetIssuesOverviewControllerInputSchema.parse({ ctx, query: { includeArchived: 'false' } })
		expect(parsed.query.includeArchived).toBe(false)
	})

	it('?includeArchived=true parses to true', () => {
		const parsed = GetIssuesOverviewControllerInputSchema.parse({ ctx, query: { includeArchived: 'true' } })
		expect(parsed.query.includeArchived).toBe(true)
	})

	it('absent includeArchived defaults to false', () => {
		const parsed = GetIssuesOverviewControllerInputSchema.parse({ ctx, query: {} })
		expect(parsed.query.includeArchived).toBe(false)
	})
})
