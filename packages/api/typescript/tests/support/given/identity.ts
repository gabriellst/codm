// Identity given-helpers — repo-direct, compose givenUser for FK satisfaction.
// Replaces the per-file `seedAuthUser` duplicated across 8 identity test files (bp-17).
import type { TestBedLike } from './types'
import { UserProfile } from '@auth/entities/UserProfile'
import { UserProfileRepository } from '@auth/repositories/UserProfileRepository'
import { givenUser } from './users'

async function resolveUserId(testBed: TestBedLike, userId?: string): Promise<string> {
	if (userId) return userId
	const user = await givenUser(testBed)
	return user.id.value
}

export async function givenUserProfile(
	testBed: TestBedLike,
	overrides: Partial<{ userId: string; timezone: string; language: string }> = {},
): Promise<UserProfile> {
	const userId = await resolveUserId(testBed, overrides.userId)
	const profile = UserProfile.create({
		userId,
		timezone: overrides.timezone,
		language: overrides.language,
	})
	return testBed.resolve(UserProfileRepository).save(profile)
}
