import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { OwnerRepository } from '@owner/repositories/OwnerRepository'
import { OwnerDirectory } from '@shared/services/OwnerDirectory'
import { registerAll, resolve } from '@codm/core-typescript'
import { INSTANCE_REGISTRY as OWNER_REGISTRY } from '@owner/registry'
import { INSTANCE_REGISTRY as AUTH_REGISTRY } from '@auth/registry'
import { IdentityAuthHooks } from './IdentityAuthHooks'

/**
 * IDN-HOOK — QUEM ENTRA GANHA UM ESPAÇO, e a sessão dele aponta para ele.
 *
 * Estes casos guardam a costura que estava FALTANDO por inteiro: `CreateOwner` e `SetActiveOwner`
 * existiam com zero chamadores, `owner_owners` tinha zero linhas, `active_owner_id` era nulo, e todo
 * controller gateado (que declara `ctx.ownerId: z.uuid()`) respondia 400 — inclusive o
 * `GetOnboarding`, que é como o console descobriria precisar de onboarding. Entrar funcionava e nada
 * depois funcionava.
 *
 * Rodam contra a família pg porque é onde as tabelas de `owner` vivem (ADR 0005) — o mesmo motivo
 * pelo qual o contexto inteiro deixou de falar com libsql.
 */
describe('IdentityAuthHooks — o provisionamento do Owner no login', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	const userId = '019e4d24-6524-7041-9e1c-8108180cddae'

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, db: 'pg' })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('IDN-HOOK-01: um usuário novo ganha um Owner, e ele é o responsável', async () => {
		const hooks = testBed.resolve(IdentityAuthHooks)
		const owners = testBed.resolve(OwnerRepository)

		await hooks.onUserCreated({ userId, email: 'operador@example.test', name: 'Operador' })

		const owned = await owners.findByResponsibleUserId(userId)
		expect(owned).toHaveLength(1)
		expect(owned[0]?.name).toBe('Operador')
	})

	it('IDN-HOOK-02: sem nome, o espaço herda a parte local do e-mail — nunca fica sem nome', async () => {
		// Um nome vazio reprovaria na invariante da entidade, e recusar o provisionamento por causa de
		// um perfil social sem `name` deixaria a conta inutilizável — o estado que esta costura encerra.
		const hooks = testBed.resolve(IdentityAuthHooks)
		const owners = testBed.resolve(OwnerRepository)

		await hooks.onUserCreated({ userId, email: 'semnome@example.test', name: null })

		const owned = await owners.findByResponsibleUserId(userId)
		expect(owned).toHaveLength(1)
		expect(owned[0]?.name).toBe('semnome')
	})

	it('IDN-HOOK-03: IDEMPOTENTE — o caminho de criação do better-auth pode repetir, e dois donos é pior que nenhum', async () => {
		const hooks = testBed.resolve(IdentityAuthHooks)
		const owners = testBed.resolve(OwnerRepository)

		await hooks.onUserCreated({ userId, email: 'operador@example.test', name: 'Operador' })
		await hooks.onUserCreated({ userId, email: 'operador@example.test', name: 'Operador' })

		expect(await owners.findByResponsibleUserId(userId)).toHaveLength(1)
	})

	it('IDN-HOOK-04: o `sessionContext` GARANTE o dono — é o que cura contas criadas antes desta costura', async () => {
		// A prova de que a segunda chamada não é redundância. Uma conta anterior nunca dispara
		// `user.create` de novo; se `sessionContext` apenas CONSULTASSE, ela ficaria sem dono para
		// sempre e o operador levaria 400 em toda rota escopada — medido em 2026-08-17.
		const hooks = testBed.resolve(IdentityAuthHooks)
		const owners = testBed.resolve(OwnerRepository)

		expect(await owners.findByResponsibleUserId(userId)).toHaveLength(0)

		const { activeOwnerId } = await hooks.sessionContext(userId)

		expect(activeOwnerId).toBeTruthy()
		expect(await owners.findByResponsibleUserId(userId)).toHaveLength(1)
	})

	/**
	 * IDN-HOOK-05 — RESOLVER ANTES DO BINDING EXISTIR, que é a ordem que a produção usa.
	 *
	 * Os quatro casos acima não podiam pegar o defeito que derrubou o login: o harness aplica TODOS os
	 * registries de uma vez, então `OwnerDirectory` já está bindado quando qualquer coisa resolve.
	 *
	 * A produção não faz isso. `BoundedContext.create` aplica o registry de UM contexto e, na linha
	 * seguinte, constrói o `Router`, que resolve cada controller — então a cadeia
	 * `AuthPassthroughController` → `BetterAuth` → `IdentityAuthHooks` → `OwnerDirectory` era percorrida
	 * enquanto o `auth` registrava rotas, antes de o registry do `owner` existir. Sem binding, o
	 * tsyringe constrói a classe ABSTRATA: um objeto sem métodos. Medido em 2026-08-17 no callback do
	 * Google — `this.owners.ensureOwnerFor is not a function`, 500 na cara do operador depois de ele
	 * já ter autorizado.
	 *
	 * Este caso reproduz essa ordem: resolve o hook com só o `auth` registrado, DEPOIS registra o
	 * `owner`, e só então chama. FALSIFICADOR: trocar o thunk por injeção de construtor
	 * (`constructor(private owners: OwnerDirectory)`) deixa este caso vermelho e os outros quatro
	 * verdes — que é exatamente o que aconteceu.
	 */
	it('IDN-HOOK-05: resolvido ANTES de o `owner` ser registrado, ainda funciona quando chamado', async () => {
		const isolated = container.createChildContainer()
		registerAll(isolated, AUTH_REGISTRY.integration)

		// Aqui o `OwnerDirectory` AINDA NÃO EXISTE no container — é o instante que a produção vivia.
		const hooks = resolve(isolated, IdentityAuthHooks)

		registerAll(isolated, OWNER_REGISTRY.integration)
		isolated.registerInstance(OwnerDirectory as never, testBed.resolve(OwnerDirectory) as never)

		const { activeOwnerId } = await hooks.sessionContext(userId)
		expect(activeOwnerId).toBeTruthy()
	})
})
