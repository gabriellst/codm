// packages/api/typescript/src/ui/repositories/OnboardingRepository/OnboardingRepository.ts — arquivo final COMPLETO
import { Repository } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { Onboarding } from '../../entities/Onboarding'

/**
 * O vocabulário é mínimo de propósito: há UMA linha por dono, e todo caminho de leitura passa pelo
 * `ownerId`. Não existe `findById` porque ninguém tem o id do onboarding na mão — quem pergunta
 * tem o dono.
 */
export abstract class OnboardingRepository extends Repository<Onboarding> {
	abstract findByOwnerId(ownerId: string, tx?: Transaction): Promise<Onboarding | undefined>
}
