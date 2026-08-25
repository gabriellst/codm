// packages/api/typescript/src/ui/repositories/OnboardingRepository/MockOnboardingRepository.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codm/core-typescript'
import { Onboarding } from '../../entities/Onboarding'
import { OnboardingRepository } from './OnboardingRepository'

/** Em memória, chaveado por `ownerId` — a mesma unicidade que o índice do banco garante. */
@injectable()
export class MockOnboardingRepository extends OnboardingRepository {
	readonly rows = new Map<string, Onboarding>()

	async findByOwnerId(ownerId: string, _tx?: Transaction): Promise<Onboarding | undefined> {
		return this.rows.get(ownerId)
	}

	async save(entity: Onboarding, _tx?: Transaction): Promise<Onboarding> {
		entity.incrementVersion()
		this.rows.set(entity.ownerId, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		for (const [ownerId, row] of this.rows) if (row.id.value === id) this.rows.delete(ownerId)
	}
}
