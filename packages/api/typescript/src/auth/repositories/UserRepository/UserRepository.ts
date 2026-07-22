// Recipe: dev:packages/api/src/auth/repositories/UserRepository/UserRepository.ts
import { Repository } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { User } from '../../entities'

export abstract class UserRepository extends Repository<User> {
	abstract findById(userId: string, tx?: Transaction): Promise<User | undefined>
	abstract findByEmail(email: string, tx?: Transaction): Promise<User | undefined>
}
