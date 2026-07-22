import { describe, expect, it } from 'bun:test'
import { OwnerKind } from '@codedm/contracts-typescript/wire/enums'
import { testId } from '@test/support'
import { OwnerCreatedEvent, OwnerSettingsUpdatedEvent, OwnerDisabledEvent, OwnerEnabledEvent } from './index'

const OWNER_ID = testId('owner', '1')
const USER_ID = testId('user', '1')
const NOW = new Date().toISOString()

describe('Owner domain events', () => {
	it('event names follow the owner.<verb> convention', () => {
		expect(OwnerCreatedEvent.name).toBe('owner.created')
		expect(OwnerSettingsUpdatedEvent.name).toBe('owner.settings_updated')
		expect(OwnerDisabledEvent.name).toBe('owner.disabled')
		expect(OwnerEnabledEvent.name).toBe('owner.enabled')
	})

	it('OwnerCreatedEvent carries ownerId + name', () => {
		const e = new OwnerCreatedEvent({
			entityId: OWNER_ID,
			ownerId: USER_ID,
			payload: { ownerId: OWNER_ID, name: 'Acme' },
		})
		expect(e.payload.ownerId).toBe(OWNER_ID)
		expect(e.payload.name).toBe('Acme')
	})

	it('OwnerSettingsUpdatedEvent carries the full Owner entity snapshot', () => {
		const e = new OwnerSettingsUpdatedEvent({
			entityId: OWNER_ID,
			ownerId: USER_ID,
			payload: {
				owner: {
					name: 'Acme',
					kind: OwnerKind.ORGANIZATION,
					responsibleUserId: USER_ID,
					pictureUrl: undefined,
					timezone: 'UTC',
					isDisabled: false,
					disabledReason: undefined,
				} as never,
			},
		})
		expect(e.payload.owner).toBeDefined()
	})

	it('OwnerDisabledEvent + OwnerEnabledEvent carry verb-specific ISO timestamps', () => {
		const disabled = new OwnerDisabledEvent({
			entityId: OWNER_ID,
			ownerId: USER_ID,
			payload: { ownerId: OWNER_ID, disabledAt: NOW, disabledReason: 'admin' },
		})
		const enabled = new OwnerEnabledEvent({
			entityId: OWNER_ID,
			ownerId: USER_ID,
			payload: { ownerId: OWNER_ID, enabledAt: NOW },
		})
		expect(disabled.payload.disabledReason).toBe('admin')
		expect(enabled.payload.enabledAt).toBe(NOW)
	})
})
