import { describe, expect, it } from 'bun:test'
import type { HttpControllerRequest } from '@codm/core-typescript'
import { HealthCheck, HealthService, type HealthComponentReport } from '@codm/core-typescript'
import { HealthController } from './Health'

class StubCheck extends HealthCheck {
	constructor(
		readonly name: string,
		readonly gate: boolean,
		private readonly report: HealthComponentReport,
	) {
		super()
	}
	async check(): Promise<HealthComponentReport> {
		return this.report
	}
}

/** Um request CRU — sem cookie, sem header de auth, sem ctx. É a metade do AC-1 que importa. */
function anonymousRequest(): HttpControllerRequest<unknown> {
	const raw = new Request('http://localhost/health')
	return { url: raw.url, ctx: {}, raw }
}

const healthy = () =>
	new HealthService(() => [
		new StubCheck('db', true, { status: 'up', gate: true }),
		new StubCheck('migrations', true, { status: 'up', gate: true, detail: '12 applied' }),
		new StubCheck('outboxDispatcher', true, { status: 'up', gate: true }),
		new StubCheck('mailboxDispatcher', true, { status: 'up', gate: true }),
		new StubCheck('sqlExternalMediator', true, { status: 'up', gate: true }),
		new StubCheck('channel', false, { status: 'up', gate: false, detail: 'CONNECTED' }),
	])

describe('HealthController — US-1/US-2/US-3, AC-1..AC-4', () => {
	it('AC-1: nenhum middleware na cadeia — um request anônimo recebe CORPO, não 401/403', async () => {
		// A cadeia REAL: executeController → effectiveMiddlewares. `middlewares` fica no default herdado
		// e a classe NÃO declara `static mcpScopes`, então nada é auto-anexado.
		expect(new HealthController(healthy()).middlewares).toEqual([])
		expect((HealthController as unknown as { mcpScopes?: readonly string[] }).mcpScopes).toBeUndefined()

		const response = await new HealthController(healthy()).executeController(anonymousRequest())
		expect(response.status).not.toBe(401)
		expect(response.status).not.toBe(403)
	})

	it('AC-2 / US-1: tudo saudável ⇒ 200 com os cinco componentes de gate + o diagnóstico', async () => {
		const response = await new HealthController(healthy()).executeController(anonymousRequest())
		expect(response.status).toBe(200)
		const body = (await response.json()) as { status: string; components: Record<string, { status: string }> }
		expect(body.status).toBe('ok')
		expect(Object.keys(body.components).sort()).toEqual([
			'channel',
			'db',
			'mailboxDispatcher',
			'migrations',
			'outboxDispatcher',
			'sqlExternalMediator',
		])
	})

	it('FALSEADOR AC-3 / US-2: migração pendente ⇒ 503 e o componente `migrations` marcado down', async () => {
		const service = new HealthService(() => [
			new StubCheck('db', true, { status: 'up', gate: true }),
			new StubCheck('migrations', true, { status: 'down', gate: true, detail: '1 pending: 0031_add_health.sql' }),
		])
		const response = await new HealthController(service).executeController(anonymousRequest())
		expect(response.status).toBe(503)
		const body = (await response.json()) as { status: string; components: Record<string, { status: string; detail?: string }> }
		expect(body.status).toBe('not_ready')
		expect(body.components.migrations!.status).toBe('down')
		expect(body.components.migrations!.detail).toContain('0031_add_health.sql')
		expect(body.components.db!.status).toBe('up')
	})

	it('FALSEADOR AC-3: cada um dos três dispatchers parado, isolado, reprova sozinho', async () => {
		for (const stopped of ['outboxDispatcher', 'mailboxDispatcher', 'sqlExternalMediator']) {
			const service = new HealthService(() =>
				['outboxDispatcher', 'mailboxDispatcher', 'sqlExternalMediator'].map(
					name =>
						new StubCheck(name, true, {
							status: name === stopped ? 'down' : 'up',
							gate: true,
							detail: name === stopped ? 'poll timer not running' : undefined,
						}),
				),
			)
			const response = await new HealthController(service).executeController(anonymousRequest())
			expect(response.status, `${stopped} parado deveria reprovar`).toBe(503)
		}
	})

	it('FALSEADOR AC-4 / US-3: canal DESCONECTADO com todo o resto saudável ⇒ continua 200', async () => {
		const service = new HealthService(() => [
			new StubCheck('db', true, { status: 'up', gate: true }),
			new StubCheck('channel', false, { status: 'up', gate: false, detail: 'DISCONNECTED' }),
		])
		const response = await new HealthController(service).executeController(anonymousRequest())
		expect(response.status).toBe(200)
		const body = (await response.json()) as { components: Record<string, { detail?: string }> }
		expect(body.components.channel!.detail).toBe('DISCONNECTED')
	})
})
