// Identity given-helpers — repo-direct, compose givenUser for FK satisfaction.
// Replaces the per-file `seedAuthUser` duplicated across 8 identity test files (bp-17).
import type { TestBed } from '../TestBed'
import { FcmPlatform } from '@template/contracts-typescript/wire/enums'
import { UserProfile } from '@auth/entities/UserProfile'
import { FcmRegistrationToken } from '@auth/entities/FcmRegistrationToken'
import { UserProfileRepository } from '@auth/repositories/UserProfileRepository'
import { FcmRegistrationTokenRepository } from '@auth/repositories/FcmRegistrationTokenRepository'
import { givenUser } from './users'
import { uniqueId } from './sequence'

async function resolveUserId(testBed: TestBed, userId?: string): Promise<string> {
	if (userId) return userId
	const user = await givenUser(testBed)
	return user.id.value
}

export async function givenUserProfile(
	testBed: TestBed,
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

export async function givenFcmRegistrationToken(
	testBed: TestBed,
	overrides: Partial<{ userId: string; token: string; platform: FcmPlatform }> = {},
): Promise<{ token: FcmRegistrationToken; userId: string }> {
	const userId = await resolveUserId(testBed, overrides.userId)
	const token = FcmRegistrationToken.create({
		userId,
		token: overrides.token ?? `fcm-token-${uniqueId()}`,
		platform: overrides.platform ?? FcmPlatform.ANDROID,
	})
	const saved = await testBed.resolve(FcmRegistrationTokenRepository).save(token)
	return { token: saved, userId }
}
