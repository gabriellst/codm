import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { givenOwner } from '@test/support'
import { TestBed, testId } from '@test/support'
import { OwnerKind } from '@codm/contracts-typescript/wire/enums'
import { GetUserInfo } from './GetUserInfo'
import { OwnerRepository } from '@owner/repositories'
import { Owner } from '@owner/entities/Owner'

const USER = testId('user', 'u1')

describe('GetUserInfo', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let getUserInfo: GetUserInfo
	let ownerRepo: OwnerRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		getUserInfo = testBed.resolve(GetUserInfo)
		ownerRepo = testBed.resolve(OwnerRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	// State via the shared repo-direct given — never a local seed helper.
	const seedOwner = async (name: string): Promise<string> =>
		(await givenOwner(testBed, { name, responsibleUserId: USER, timezone: 'UTC' })).id.value

	it('returns user identity + real owners (where user is responsible) + active owner', async () => {
		const ownerId = await seedOwner('Acme')
		const out = await getUserInfo.execute({ user: { id: USER, name: 'Gabriel', email: 'g@bk.app' }, ownerId })

		expect(out.user.name).toBe('Gabriel')
		expect(out.user.avatarUrl).toBeNull()
		expect(out.owners).toHaveLength(1)
		expect(out.owners[0]?.name).toBe('Acme')
		expect(out.current?.id).toBe(ownerId)
	})

	it('current is null when no active owner is selected', async () => {
		await seedOwner('Acme')
		const out = await getUserInfo.execute({ user: { id: USER, name: 'G', email: 'g@bk.app' }, ownerId: null })
		expect(out.current).toBeNull()
		expect(out.owners).toHaveLength(1)
	})

	it('excludes owners the user is not responsible for', async () => {
		await seedOwner('Mine')
		const other = Owner.create({ name: 'NotMine', kind: OwnerKind.ORGANIZATION, responsibleUserId: testId('user', 'u2'), timezone: 'UTC' })
		await ownerRepo.save(other)

		const out = await getUserInfo.execute({ user: { id: USER, name: 'G', email: 'g@bk.app' }, ownerId: null })
		expect(out.owners).toHaveLength(1)
		expect(out.owners[0]?.name).toBe('Mine')
	})
})
