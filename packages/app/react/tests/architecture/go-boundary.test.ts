import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { getBaseUrl } from '@codm/client-typescript/http'
import { health } from '@codm/client-typescript/go'
import { useIntegrationBackend } from '../support/integration-harness'
import type { IntegrationBackend } from '../support/integration-harness'

/**
 * RAIL (spec Decision 10, AC-6): dentro do harness de integração do console, o gateway Go NÃO sobe
 * — só o backend TS sobe em-processo (`integration-harness.ts`'s `useIntegrationBackend()`). Antes
 * desta task, `configureClient` apontava a URL do Go de volta para o servidor TS, então qualquer
 * endpoint do gateway respondia um 404 silencioso que parecia bug do teste, não ausência de
 * tooling — foi isso (não falta de given) que deixou 3 componentes só-visuais nas migrações T9–T11.
 *
 * DUAS asserções, de propósito:
 *
 * 1. A SDK REAL (`health()`, de `@codm/client-typescript/go`) chamada dentro do harness recebe
 *    `.status === 501` — nunca um 404 (a prova de que a fronteira falha ALTO, não silenciosamente).
 *
 * 2. O CORPO da mesma resposta nomeia a fronteira (`GO_GATEWAY_NOT_IN_HARNESS`) — lido por um
 *    `fetch` direto e ÚNICO contra a URL resolvida (`getBaseUrl('go')`), NÃO via
 *    `error.code` do erro que a SDK lança. Medido, não assumido: o `client.ts` gerado
 *    (`packages/client/dist/typescript/src/http/client.ts`) e o hook `beforeError` do `ky`
 *    interno CADA UM chama `err.response.clone().json()` para extrair o corpo — dois `.clone()`
 *    sucessivos na mesma resposta. Sob `happy-dom` (`tests/setup.ts`), `Response.clone()` de um
 *    corpo apoiado em stream do Node (`FetchBodyUtility.cloneBodyStream`) faz `pipe()` para DOIS
 *    `PassThrough` — uma corrida entre o consumo do primeiro clone e a montagem do segundo que
 *    derruba o corpo do segundo (`JSON Parse error: Unexpected EOF`), reproduzida IDENTICAMENTE
 *    contra o backend TS real (não uma peculiaridade deste stub) — pré-existente no ambiente de
 *    teste, fora do escopo desta task (a SDK gerada e `ky` são tooling congelado). Por isso
 *    `error.code` do lado da SDK sempre cai no fallback `'UNKNOWN_ERROR'` aqui; `.status` sobrevive
 *    porque vem de `err.response.status`, sem reler o corpo. A asserção 2 prova o MESMO corpo que a
 *    SDK recebeu, sem depender do caminho quebrado.
 *
 * FALSEADO manualmente durante o T8 (não codificado aqui — apontar `go` de volta para `backend.url`
 * é uma mudança transitória de UMA linha em `integration-harness.ts`): com a URL do Go apontando
 * para o backend TS, a asserção 1 fica VERMELHA (`.status` vira 404, o Fastify real não tem rota
 * `/health` do Go) e a asserção 2 também (o corpo do 404 do TS não tem `code:
 * 'GO_GATEWAY_NOT_IN_HARNESS'`); revertido, GREEN de novo. Ver o relato da Task T8 para os números.
 */
describe('rail: a fronteira do Go falha alto dentro do harness', () => {
	let backend: IntegrationBackend

	beforeAll(async () => {
		backend = await useIntegrationBackend()
	})

	afterAll(async () => {
		await backend.stop()
	})

	it('a SDK real recebe 501 ao chamar um endpoint Go dentro do harness — nunca um 404 fantasma', async () => {
		let caught: (Error & { status?: number }) | null = null
		try {
			await health()
		} catch (err) {
			caught = err as Error & { status?: number }
		}

		expect(caught).not.toBeNull()
		expect(caught?.status).toBe(501)
	})

	it('o corpo da resposta que a SDK recebeu nomeia a fronteira', async () => {
		const goUrl = getBaseUrl('go')
		expect(goUrl).toBeDefined()

		const res = await fetch(`${goUrl}/health`)
		expect(res.status).toBe(501)

		const body = (await res.json()) as { code?: string; message?: string }
		expect(body.code).toBe('GO_GATEWAY_NOT_IN_HARNESS')
		expect(body.message).toContain('gateway Go')
	})
})
