// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { describe, expect, it } from 'bun:test'
import { BaseError } from '@codedm/core-typescript'
import { Role as OwnerRole } from '../enums/Role'
import { testId } from '@test/support'
import { OwnerMembership } from './OwnerMembership'

const OWNER_ID = testId('owner', '1')
const USER_ID = testId('user', '1')

describe('OwnerMembership aggregate', () => {
	it('forOwner constructs with role=OWNER + immediate lastAccess snapshot', () => {
		const before = Date.now()
		const m = OwnerMembership.forOwner({ ownerId: OWNER_ID, userId: USER_ID })
		const after = Date.now()

		expect(m.ownerId.value).toBe(OWNER_ID)
		expect(m.userId.value).toBe(USER_ID)
		expect(m.role).toBe(OwnerRole.RESPONSIBLE)
		expect(m.lastAccess).toBeInstanceOf(Date)
		expect(m.lastAccess!.getTime()).toBeGreaterThanOrEqual(before)
		expect(m.lastAccess!.getTime()).toBeLessThanOrEqual(after)
	})

	it('forInvitee constructs with provided role + no lastAccess', () => {
		const m = OwnerMembership.forInvitee({ ownerId: OWNER_ID, userId: USER_ID, role: OwnerRole.ADMIN })
		expect(m.role).toBe(OwnerRole.ADMIN)
		expect(m.lastAccess).toBeUndefined()
	})

	it('forInvitee accepts each non-OWNER role variant', () => {
		const admin = OwnerMembership.forInvitee({ ownerId: OWNER_ID, userId: USER_ID, role: OwnerRole.ADMIN })
		const member = OwnerMembership.forInvitee({ ownerId: OWNER_ID, userId: USER_ID, role: OwnerRole.MEMBER })
		expect(admin.role).toBe(OwnerRole.ADMIN)
		expect(member.role).toBe(OwnerRole.MEMBER)
	})

	it('changeRole mutates role + revalidates', () => {
		const m = OwnerMembership.forInvitee({ ownerId: OWNER_ID, userId: USER_ID, role: OwnerRole.MEMBER })
		m.changeRole(OwnerRole.ADMIN)
		expect(m.role).toBe(OwnerRole.ADMIN)
	})

	it('changeRole accepts OWNER promotion (last-owner guard lives in use case, not entity)', () => {
		const m = OwnerMembership.forInvitee({ ownerId: OWNER_ID, userId: USER_ID, role: OwnerRole.MEMBER })
		m.changeRole(OwnerRole.RESPONSIBLE)
		expect(m.role).toBe(OwnerRole.RESPONSIBLE)
	})

	it('touchAccess advances lastAccess; default uses now()', () => {
		const m = OwnerMembership.forInvitee({ ownerId: OWNER_ID, userId: USER_ID, role: OwnerRole.MEMBER })
		expect(m.lastAccess).toBeUndefined()
		m.touchAccess()
		expect(m.lastAccess).toBeInstanceOf(Date)
	})

	it('touchAccess accepts an explicit date', () => {
		const m = OwnerMembership.forInvitee({ ownerId: OWNER_ID, userId: USER_ID, role: OwnerRole.MEMBER })
		const specific = new Date('2026-01-01T00:00:00Z')
		m.touchAccess(specific)
		expect(m.lastAccess!.getTime()).toBe(specific.getTime())
	})

	it('rejects unknown role at the schema level (e.g. on direct construction)', () => {
		expect(
			() =>
				new OwnerMembership({
					ownerId: OWNER_ID,
					userId: USER_ID,
					role: 'SUPER_ADMIN' as OwnerRole,
				}),
		).toThrow(BaseError)
	})
})
