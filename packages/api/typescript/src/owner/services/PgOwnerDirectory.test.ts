import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenOwner, givenUser, givenUserProfile } from '@test/support'
import { Language } from '@codm/contracts-typescript/wire/enums'
import { OwnerDirectory } from '@shared/services/OwnerDirectory'

/**
 * O idioma como TRANSPORTE: quem resolve um owner recebe o idioma junto, e nenhum chamador precisa
 * saber que ele mora num perfil de outro contexto.
 */
describe('PgOwnerDirectory — o idioma viaja com a tenancy', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant', db: 'pg' })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('devolve o idioma do perfil do usuário responsável', async () => {
		const { owner } = await givenOwnerWithProfileLanguage(testBed, 'en-US')

		const tenancy = await testBed.resolve(OwnerDirectory).getOwner(owner.id.value)

		expect(tenancy?.language).toBe(Language.EN_US)
	})

	it('devolve o idioma ausente quando o responsável nunca escolheu um', async () => {
		const { owner } = await givenOwnerWithProfileLanguage(testBed, undefined)

		const tenancy = await testBed.resolve(OwnerDirectory).getOwner(owner.id.value)

		expect(tenancy?.language).toBeUndefined()
	})

	it('não inventa idioma para um owner que não existe', async () => {
		expect(await testBed.resolve(OwnerDirectory).getOwner('019e4d24-6524-7041-9e1c-8108180cddff')).toBeNull()
	})
})

/**
 * Cria um user, um `UserProfile` com o `language` pedido (ou sem), e um `Owner` cujo
 * `responsibleUserId` é esse user.
 */
async function givenOwnerWithProfileLanguage(testBed: TestBed, language: string | undefined) {
	const user = await givenUser(testBed)
	await givenUserProfile(testBed, { userId: user.id.value, language })
	const owner = await givenOwner(testBed, { responsibleUserId: user.id.value })
	return { owner }
}
