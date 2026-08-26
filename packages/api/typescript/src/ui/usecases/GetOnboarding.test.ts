import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { OnboardingStep } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenChannel, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { Onboarding } from '../entities/Onboarding'
import { OnboardingRepository } from '../repositories/OnboardingRepository'
import { GetOnboarding } from './GetOnboarding'

// O plano cita `OWNER = 'integration-tenant'`, mas `ownerId` é `z.uuid()` (na Onboarding entity e em
// Workspace) — uma string não-UUID quebra `INVALID_ENTITY` em qualquer given que grave uma entidade.
// Os outros testes de use case do contexto `ui` (ex.: GetHomeDashboard.test.ts) usam `MOCK_CLOUD_OWNER_ID`
// como dono, que também é o default de todo `given*` helper — segue o mesmo padrão aqui.
const OWNER = MOCK_CLOUD_OWNER_ID

/**
 * UMA LEITURA, DUAS NATUREZAS DE DADO — e é isso que os casos abaixo separam.
 *
 * `currentStep`/`completedAt` são JORNADA: persistidos, só mudam quando alguém os escreve.
 * `channelDone`/`workspaceDone`/`threadDone` são MUNDO: derivados por consulta de existência a cada
 * chamada, nunca gravados. Um passo de setup que fosse persistido mentiria assim que a linha que o
 * satisfazia sumisse — que é exatamente o que a AC-9 prova.
 */
describe('GetOnboarding', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let usecase: GetOnboarding
	let repo: OnboardingRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
		usecase = testBed.resolve(GetOnboarding)
		repo = testBed.resolve(OnboardingRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('para um dono que nunca começou: nada concluído, primeiro passo, nada satisfeito, rascunho vazio', async () => {
		const result = await usecase.execute({ ownerId: OWNER })

		expect(result.completedAt).toBeNull()
		expect(result.currentStep).toBe(OnboardingStep.VALUE)
		expect(result.state).toEqual({})
		expect(result.channelDone).toBe(false)
		expect(result.workspaceDone).toBe(false)
		expect(result.threadDone).toBe(false)
	})

	it('devolve a jornada que foi persistida', async () => {
		const onboarding = Onboarding.create({ ownerId: OWNER })
		onboarding.advanceTo(OnboardingStep.CHANNEL)
		await repo.save(onboarding)

		const result = await usecase.execute({ ownerId: OWNER })

		expect(result.currentStep).toBe(OnboardingStep.CHANNEL)
		expect(result.completedAt).toBeNull()
	})

	/**
	 * O RASCUNHO sobrevive a um reboot — o console repopula os passos WORKSPACE/CONTACT/AGENTS com
	 * isto em vez de perder o que já foi preenchido (spec 2026-08-26).
	 */
	it('devolve o rascunho (state) que foi salvo', async () => {
		const onboarding = Onboarding.create({ ownerId: OWNER })
		onboarding.setState({ workspace: { path: '/Users/dev/acme-api' } })
		await repo.save(onboarding)

		const result = await usecase.execute({ ownerId: OWNER })

		expect(result.state).toEqual({ workspace: { path: '/Users/dev/acme-api' } })
	})

	it('reporta os três derivados quando o setup está feito', async () => {
		// `givenAttachedThread` não existe neste repo — composto a partir dos givens reais: um canal
		// CONNECTED (channelDone), e uma thread viva (threadDone) que por sua vez cria o workspace
		// (workspaceDone) porque `givenThread` sem `workspaceId` chama `givenWorkspace` internamente.
		await givenChannel(testBed, { ownerId: OWNER })
		await givenThread(testBed, { ownerId: OWNER })

		const result = await usecase.execute({ ownerId: OWNER })

		expect(result.channelDone).toBe(true)
		expect(result.workspaceDone).toBe(true)
		expect(result.threadDone).toBe(true)
	})
})
