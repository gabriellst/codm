// Recipe: dev:packages/api/tests/support/given/auth.ts
// Simplified: no document (CPF), no clinic, video-streaming User shape.
import type { TestBed } from '../TestBed'
import { User } from '@auth/entities/User'
import { Account } from '@auth/entities/Account'
import { UserRepository } from '@auth/repositories/UserRepository'
import { AccountRepository } from '@auth/repositories/AccountRepository'
import { defaultEmail, defaultName, uniqueId } from './sequence'

export async function givenUser(
	testBed: TestBed,
	overrides: Partial<{ name: string | null; email: string; emailVerified: boolean; image: string | null }> = {},
): Promise<User> {
	const repository = testBed.resolve(UserRepository)

	const user = User.create({
		name: overrides.name ?? defaultName(),
		email: overrides.email ?? defaultEmail(),
		emailVerified: overrides.emailVerified ?? false,
		image: overrides.image ?? null,
	})

	return repository.save(user)
}

export async function givenAccount(
	testBed: TestBed,
	userId: string,
	overrides: Partial<{ accountId: string; providerId: string }> = {},
): Promise<Account> {
	const repository = testBed.resolve(AccountRepository)

	const account = Account.create({
		accountId: overrides.accountId ?? `external-account-${uniqueId()}`,
		providerId: overrides.providerId ?? 'credential',
		userId,
	})

	return repository.save(account)
}

export async function givenUserWithAccount(
	testBed: TestBed,
	overrides: {
		user?: Partial<{ name: string | null; email: string; emailVerified: boolean; image: string | null }>
		account?: Partial<{ accountId: string; providerId: string }>
	} = {},
): Promise<{ user: User; account: Account }> {
	const user = await givenUser(testBed, overrides.user)
	const account = await givenAccount(testBed, user.id.value, overrides.account)
	return { user, account }
}
