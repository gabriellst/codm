import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { FcmRegistrationToken } from '../../entities/FcmRegistrationToken'
import { FcmRegistrationTokenRepository } from './FcmRegistrationTokenRepository'

@injectable()
export class MockFcmRegistrationTokenRepository extends FcmRegistrationTokenRepository {
	private tokens = new Map<string, FcmRegistrationToken>()

	async findByToken(token: string, _tx?: Transaction): Promise<FcmRegistrationToken | undefined> {
		for (const t of this.tokens.values()) {
			if (t.token === token) return t
		}
		return undefined
	}

	async listByUserId(userId: string, _tx?: Transaction): Promise<FcmRegistrationToken[]> {
		const out: FcmRegistrationToken[] = []
		for (const t of this.tokens.values()) {
			if (t.userId.value === userId) out.push(t)
		}
		return out
	}

	async save(entity: FcmRegistrationToken, _tx?: Transaction): Promise<FcmRegistrationToken> {
		this.tokens.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.tokens.delete(id)
	}

	seed(token: FcmRegistrationToken): void {
		this.tokens.set(token.id.value, token)
	}

	clear(): void {
		this.tokens.clear()
	}
}
