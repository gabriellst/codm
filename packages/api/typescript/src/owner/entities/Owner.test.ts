import { describe, expect, it } from 'bun:test'
import { BaseError } from '@codm/core-typescript'
import { OwnerKind } from '@codm/contracts-typescript/wire/enums'
import { Owner } from './Owner'

const base = { name: 'Acme', kind: OwnerKind.ORGANIZATION, responsibleUserId: 'user-1' }

describe('Owner aggregate', () => {
	it('creates with tenancy fields and sensible defaults', () => {
		const s = Owner.create({ ...base, timezone: 'America/Sao_Paulo' })
		expect(s.name).toBe('Acme')
		expect(s.kind).toBe(OwnerKind.ORGANIZATION)
		expect(s.responsibleUserId).toBe('user-1')
		expect(s.timezone).toBe('America/Sao_Paulo')
		expect(s.isDisabled).toBe(false)
		expect(s.disabledReason).toBeUndefined()
	})

	it('accepts UTC alias as timezone', () => {
		const s = Owner.create({ ...base, timezone: 'UTC' })
		expect(s.timezone).toBe('UTC')
	})

	it('allows omitting timezone (thin aggregate)', () => {
		const s = Owner.create({ ...base })
		expect(s.timezone).toBeUndefined()
	})

	it('rejects an empty name', () => {
		expect(() => Owner.create({ ...base, name: '' })).toThrow(BaseError)
	})

	it('rejects an unknown timezone shape', () => {
		expect(() => Owner.create({ ...base, timezone: 'no-slash' })).toThrow(BaseError)
	})

	it('updateSettings mutates the entity — name and picture change', () => {
		const s = Owner.create({ ...base })
		s.updateSettings({ name: 'Acme Co', pictureUrl: 'https://cdn.test/logo.png' })
		expect(s.name).toBe('Acme Co')
		expect(s.pictureUrl).toBe('https://cdn.test/logo.png')
	})

	it('updateSettings with same value is a no-op mutation (idempotent)', () => {
		const s = Owner.create({ ...base })
		s.updateSettings({ name: 'Acme' })
		expect(s.name).toBe('Acme')
	})

	it('updateSettings returns void', () => {
		const s = Owner.create({ ...base })
		const result = s.updateSettings({ name: 'Acme Co' })
		expect(result).toBeUndefined()
	})

	it('updateSettings can change timezone', () => {
		const s = Owner.create({ ...base, timezone: 'UTC' })
		s.updateSettings({ timezone: 'America/New_York' })
		expect(s.timezone).toBe('America/New_York')
	})

	it('disable() flips isDisabled + records reason; enable() clears both', () => {
		const s = Owner.create({ ...base })
		s.disable('manual')
		expect(s.isDisabled).toBe(true)
		expect(s.disabledReason).toBe('manual')
		s.enable()
		expect(s.isDisabled).toBe(false)
		expect(s.disabledReason).toBeUndefined()
	})

	it('disable() throws OWNER_ALREADY_DISABLED when already disabled', () => {
		const s = Owner.create({ ...base })
		s.disable('first')
		expect(() => s.disable('second')).toThrow(expect.objectContaining({ name: 'OWNER_ALREADY_DISABLED' }))
	})

	it('enable() throws OWNER_NOT_DISABLED when active', () => {
		const s = Owner.create({ ...base })
		expect(() => s.enable()).toThrow(expect.objectContaining({ name: 'OWNER_NOT_DISABLED' }))
	})
})
