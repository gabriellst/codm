import type { Page } from 'playwright'

/**
 * As origens que SÃO nossas — derivadas das portas que o runner fixa (`scripts/run-e2e.ts`
 * `pinnedAddresses`), nunca transcritas. Inclui as duas grafias de host porque o browser e as sondas
 * de servidor legitimamente usam grafias diferentes (ver o docblock de `baseURL` no
 * `playwright.config.ts`). O gateway entra pela porta que o runner exporta como `CHANNEL_PORT`; a
 * nuvem, por `E2E_CLOUD_PORT`.
 */
const OUR_ORIGINS = ['localhost', '127.0.0.1'].flatMap(host => [
	`http://${host}:${Number(process.env.API_PORT ?? 3130)}`,
	`http://${host}:${Number(process.env.CHANNEL_PORT ?? 3132)}`,
	`http://${host}:${Number(process.env.E2E_CLOUD_PORT ?? 3134)}`,
	`http://${host}:${Number(process.env.VITE_PORT ?? 5273)}`,
])

export interface ApiCall {
	method: string
	url: string
	status: number
	responseBody: string
	timestamp: number
}

/**
 * Attaches to a Page and records every API response automatically.
 * `waitForFailure()` returns a promise that rejects as soon as any API call fails (4xx/5xx).
 */
export function createNetworkLogger() {
	const calls: ApiCall[] = []
	let failReject: ((error: Error) => void) | null = null

	function attach(page: Page) {
		page.on('response', async response => {
			const url = response.url()
			// ANCORADO NA ORIGEM, não num prefixo de caminho.
			//
			// Este filtro casava `/v1/` e `/api/`. Um filtro assim é frágil por construção: ele pressupõe
			// que toda chamada da nossa API carrega um segmento fixo, e o dia em que o prefixo sai — foi o
			// que aconteceu — ele para de gravar QUALQUER coisa, em silêncio. O diagnóstico some exatamente
			// quando a mudança que o quebrou precisa ser diagnosticada.
			//
			// A pergunta real é "esta resposta veio de um servidor NOSSO?", e isso é a ORIGEM.
			if (!OUR_ORIGINS.some(origin => url.startsWith(origin))) return

			let responseBody = ''
			try {
				responseBody = await response.text()
			} catch {
				responseBody = '<unreadable>'
			}

			const call: ApiCall = {
				method: response.request().method(),
				url,
				status: response.status(),
				responseBody,
				timestamp: Date.now(),
			}

			calls.push(call)

			if (call.status >= 400 && failReject) {
				failReject(new Error(`API call failed: ${call.method} ${call.url} → ${call.status}\n${call.responseBody.slice(0, 500)}`))
			}
		})
	}

	/**
	 * Returns a promise that rejects the moment any API call returns 4xx/5xx.
	 * Use in Promise.race with navigation waits to fail fast.
	 */
	function waitForFailure(): Promise<never> {
		return new Promise<never>((_, reject) => {
			// Check if there's already a failure
			const existing = calls.find(c => c.status >= 400)
			if (existing) {
				reject(
					new Error(`API call failed: ${existing.method} ${existing.url} → ${existing.status}\n${existing.responseBody.slice(0, 500)}`),
				)
				return
			}
			failReject = reject
		})
	}

	function getReport(): string {
		if (calls.length === 0) return 'No API calls captured.'

		return calls
			.map(c => {
				const icon = c.status >= 400 ? 'FAIL' : 'OK'
				const body = c.status >= 400 ? `\n  → ${c.responseBody.slice(0, 300)}` : ''
				return `[${icon}] ${c.method} ${c.url} → ${c.status}${body}`
			})
			.join('\n')
	}

	function getFailed(): ApiCall[] {
		return calls.filter(c => c.status >= 400)
	}

	function clear() {
		calls.length = 0
		failReject = null
	}

	return { attach, waitForFailure, getReport, getFailed, clear, calls }
}
