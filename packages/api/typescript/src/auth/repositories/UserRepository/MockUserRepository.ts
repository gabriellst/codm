// Recipe: dev:packages/api/src/auth/repositories/UserRepository/MockUserRepository.ts
import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codm/core-typescript'
import { User } from '../../entities'
import { UserRepository } from './UserRepository'

@injectable()
export class MockUserRepository extends UserRepository {
	private users = new Map<string, User>()

	async findById(userId: string, _tx?: Transaction): Promise<User | undefined> {
		return this.users.get(userId)
	}

	async findByEmail(email: string, _tx?: Transaction): Promise<User | undefined> {
		for (const user of this.users.values()) {
			if (user.email === email) return user
		}
		return undefined
	}

	async save(entity: User, _tx?: Transaction): Promise<User> {
		this.users.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.users.delete(id)
	}

	seed(user: User): void {
		this.users.set(user.id.value, user)
	}

	clear(): void {
		this.users.clear()
	}
}
