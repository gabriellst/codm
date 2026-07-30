// Owner given helpers — set up Owners via the repository directly.
import { Id } from '@codm/core-typescript'
import type { TestBed } from '../TestBed'
import { OwnerKind } from '@codm/contracts-typescript/wire/enums'
import { Owner } from '@owner/entities/Owner'
import { OwnerRepository } from '@owner/repositories/OwnerRepository'
import { givenUserWithAccount } from './users'
import { uniqueId } from './sequence'

type OwnerOverrides = Partial<{
	name: string
	kind: OwnerKind
	responsibleUserId: string
	timezone: string
	pictureUrl: string
}>

export async function givenOwner(testBed: TestBed, overrides: OwnerOverrides = {}): Promise<Owner> {
	const repository = testBed.resolve(OwnerRepository)

	const owner = Owner.create({
		name: overrides.name ?? `Test Owner ${uniqueId()}`,
		kind: overrides.kind ?? OwnerKind.ORGANIZATION,
		responsibleUserId: overrides.responsibleUserId ?? Id.value(),
		timezone: overrides.timezone ?? 'America/Sao_Paulo',
		pictureUrl: overrides.pictureUrl,
	})

	await repository.save(owner)
	return owner
}

/**
 * Composite: a User (+ credential Account) who is the responsible user of a fresh
 * Owner (tenant) — `responsibleUserId` = that user. The workhorse for any
 * owner-scoped use case / controller test (RequireOwner passes for this user).
 */
export async function givenOwnerWithResponsible(
	testBed: TestBed,
	overrides: {
		user?: Parameters<typeof givenUserWithAccount>[1]
		owner?: OwnerOverrides
	} = {},
): Promise<{
	user: Awaited<ReturnType<typeof givenUserWithAccount>>['user']
	account: Awaited<ReturnType<typeof givenUserWithAccount>>['account']
	owner: Owner
}> {
	const { user, account } = await givenUserWithAccount(testBed, overrides.user)
	const owner = await givenOwner(testBed, { responsibleUserId: user.id.value, ...overrides.owner })
	return { user, account, owner }
}
