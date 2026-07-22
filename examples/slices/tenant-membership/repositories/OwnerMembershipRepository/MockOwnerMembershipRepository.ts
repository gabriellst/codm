// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { Role as OwnerRole } from '../../enums/Role'
import { OwnerMembership } from '../../entities/OwnerMembership'
import { OwnerMembershipRepository } from './OwnerMembershipRepository'
import { MockOwnerRepository } from '../OwnerRepository'

@injectable()
export class MockOwnerMembershipRepository extends OwnerMembershipRepository {
	// Composite PK encoded as `${ownerId}:${userId}` for the in-memory map key.
	private memberships = new Map<string, OwnerMembership>()
	// Optional email directory for ALREADY_A_MEMBER lookup (tests seed this).
	private emailByUserId = new Map<string, string>()

	constructor(private readonly ownerRepo: MockOwnerRepository) {
		super()
	}

	private compositeKey(ownerId: string, userId: string): string {
		return `${ownerId}:${userId}`
	}

	async findByOwnerAndUser(ownerId: string, userId: string, _tx?: Transaction): Promise<OwnerMembership | undefined> {
		return this.memberships.get(this.compositeKey(ownerId, userId))
	}

	async findById(membershipId: string, _tx?: Transaction): Promise<OwnerMembership | undefined> {
		const [ownerId, userId] = membershipId.split(':')
		if (!ownerId || !userId) return undefined
		return this.memberships.get(this.compositeKey(ownerId, userId))
	}

	async findByOwnerId(ownerId: string, _tx?: Transaction): Promise<OwnerMembership[]> {
		const out: OwnerMembership[] = []
		for (const m of this.memberships.values()) {
			if (m.ownerId.value === ownerId) out.push(m)
		}
		return out
	}

	async findByUserId(userId: string, _tx?: Transaction): Promise<OwnerMembership[]> {
		const out: OwnerMembership[] = []
		for (const m of this.memberships.values()) {
			if (m.userId.value === userId) out.push(m)
		}
		return out
	}

	async countOwnersByOwnerId(ownerId: string, _tx?: Transaction): Promise<number> {
		let n = 0
		for (const m of this.memberships.values()) {
			if (m.ownerId.value === ownerId && m.role === OwnerRole.RESPONSIBLE) n++
		}
		return n
	}

	async findByOwnerAndEmail(ownerId: string, email: string, _tx?: Transaction): Promise<OwnerMembership | undefined> {
		for (const [userId, mail] of this.emailByUserId) {
			if (mail !== email) continue
			const m = this.memberships.get(this.compositeKey(ownerId, userId))
			if (m) return m
		}
		return undefined
	}

	async save(entity: OwnerMembership, _tx?: Transaction): Promise<OwnerMembership> {
		this.memberships.set(this.compositeKey(entity.ownerId.value, entity.userId.value), entity)
		// Cross-wire MockOwnerRepository.membershipsByUser so its
		// countActiveOwnersByUserId stays consistent without separate seeding.
		this.ownerRepo.seedMembership(entity.userId.value, entity.ownerId.value)
		return entity
	}

	async removeByOwnerAndUser(ownerId: string, userId: string, _tx?: Transaction): Promise<void> {
		this.memberships.delete(this.compositeKey(ownerId, userId))
	}

	async delete(membershipId: string, _tx?: Transaction): Promise<void> {
		const [ownerId, userId] = membershipId.split(':')
		if (!ownerId || !userId) return
		this.memberships.delete(this.compositeKey(ownerId, userId))
	}

	seed(membership: OwnerMembership): void {
		this.memberships.set(this.compositeKey(membership.ownerId.value, membership.userId.value), membership)
		this.ownerRepo.seedMembership(membership.userId.value, membership.ownerId.value)
	}

	seedEmailForUser(userId: string, email: string): void {
		this.emailByUserId.set(userId, email)
	}

	clear(): void {
		this.memberships.clear()
		this.emailByUserId.clear()
	}
}
