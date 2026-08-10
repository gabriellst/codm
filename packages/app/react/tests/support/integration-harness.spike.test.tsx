import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { getOnboarding } from '@codm/client-typescript/typescript'
import { loadBackendGivens, useIntegrationBackend, type IntegrationBackend } from './integration-harness'

/**
 * O SPIKE DA SPEC (Risks: "duas apostas a validar ANTES da massa") — e ao mesmo tempo a prova
 * ponta a ponta do harness: seed backend-style, leitura via SDK real, asserção no computado.
 * IMPRIME as medições que a AC-10 exige registrar.
 *
 * `createGivenHelpers(backend.asTestBed())` da forma proposta pelo plano original NÃO bastava por
 * duas razões, ambas registradas no relato da T3: (1) a facade em `given/index.ts` só compõe
 * `user`/`account`/`userWithAccount`/`activeSession`/`owner`/`ownerWithResponsible` — `thread` nunca
 * esteve nela (é `@deprecated`); o given real é a função solta `givenThread(testBed, overrides)`.
 * (2) o react não tem alias de tsconfig para os fontes do api (correção do founder) — nem
 * `createGivenHelpers` nem `givenThread` podem ser importados por um `@test/*` estático daqui; os
 * dois chegam pelo MESMO caminho computado que `startIntegrationBackend` usa
 * (`loadBackendGivens()`, em `./integration-harness`).
 */
describe('harness de integração — spike', () => {
	let backend: IntegrationBackend

	beforeAll(async () => {
		const t0 = performance.now()
		backend = await useIntegrationBackend()
		console.log(`[spike] boot do backend integration: ${Math.round(performance.now() - t0)}ms`)
	})
	afterAll(async () => {
		await backend.stop()
	})

	it('a SDK atravessa o servidor real e volta com o computado', async () => {
		await backend.reset()
		const t0 = performance.now()
		const onboarding = await getOnboarding({})
		console.log(`[spike] round-trip SDK→Fastify→SQLite: ${Math.round(performance.now() - t0)}ms`)

		// Sem linha => primeiro passo, não concluído — COMPUTADO pelo GetOnboarding real, não semeado.
		expect(onboarding.completedAt).toBeNull()
		expect(onboarding.channelDone).toBe(false)
	})

	it('given do backend semeia o MESMO banco que o servidor lê', async () => {
		await backend.reset()
		const { givenThread } = await loadBackendGivens()
		await givenThread(backend.asTestBed(), {})

		const onboarding = await getOnboarding({})
		expect(onboarding.threadDone).toBe(true) // o servidor VIU o seed — um banco só.
	})
})
