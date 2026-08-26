import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codm/core-typescript'
import { UserProfile } from '../../entities/UserProfile'
import { UserProfileRepository } from './UserProfileRepository'

@injectable()
export class MockUserProfileRepository extends UserProfileRepository {
	private profiles = new Map<string, UserProfile>()

	async findByUserId(userId: string, _tx?: Transaction): Promise<UserProfile | undefined> {
		return this.profiles.get(userId)
	}

	async save(entity: UserProfile, _tx?: Transaction): Promise<UserProfile> {
		this.profiles.set(entity.userId.value, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.profiles.delete(id)
	}

	seed(profile: UserProfile): void {
		this.profiles.set(profile.userId.value, profile)
	}

	clear(): void {
		this.profiles.clear()
	}
}
