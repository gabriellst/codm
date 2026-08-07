import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codm/core-typescript'
import { DeviceToken } from '../../entities/DeviceToken'
import { DeviceTokenRepository, type ConsumedDeviceCode } from './DeviceTokenRepository'

interface MockDeviceCode {
	userId: string
	expiresAt: Date
	consumedAt?: Date
}

@injectable()
export class MockDeviceTokenRepository extends DeviceTokenRepository {
	private tokens = new Map<string, DeviceToken>()
	private codes = new Map<string, MockDeviceCode>()

	async findById(id: string, _tx?: Transaction): Promise<DeviceToken | undefined> {
		return this.tokens.get(id)
	}

	async findByHash(tokenHash: string, _tx?: Transaction): Promise<DeviceToken | undefined> {
		return [...this.tokens.values()].find(token => token.tokenHash === tokenHash)
	}

	async save(entity: DeviceToken, _tx?: Transaction): Promise<DeviceToken> {
		entity.incrementVersion()
		this.tokens.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.tokens.delete(id)
	}

	async issueCode(code: string, userId: string, expiresAt: Date, _tx?: Transaction): Promise<void> {
		this.codes.set(code, { userId, expiresAt })
	}

	async consumeCode(code: string, now: Date, _tx?: Transaction): Promise<ConsumedDeviceCode | undefined> {
		const entry = this.codes.get(code)
		if (!entry || entry.consumedAt || entry.expiresAt <= now) return undefined
		entry.consumedAt = now
		return { userId: entry.userId }
	}

	clear(): void {
		this.tokens.clear()
		this.codes.clear()
	}
}
