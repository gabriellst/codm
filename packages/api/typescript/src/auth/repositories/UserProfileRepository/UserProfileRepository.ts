import { Repository } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { UserProfile } from '../../entities/UserProfile'

export abstract class UserProfileRepository extends Repository<UserProfile> {
	abstract findByUserId(userId: string, tx?: Transaction): Promise<UserProfile | undefined>
}
