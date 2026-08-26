import { test as base, expect } from '@playwright/test'
import type { FileRouteTypes } from './app-routes'
import { createNetworkLogger } from './diagnostics'
import { authenticateDaemon, type DaemonSession } from './given'

type AppRoute = FileRouteTypes['to']

type ExtractParams<T extends string> = T extends `${string}$${infer Param}/${infer Rest}`
	? { [K in Param]: string } & ExtractParams<`/${Rest}`>
	: T extends `${string}$${infer Param}`
		? Record<Param, string>
		: // `unknown`, not `Record<string, never>`: this is the TERMINAL case of a recursion whose result
			// is intersected (`{ threadId } & ExtractParams<'/issues'>`). An empty-record terminal poisons
			// that intersection — every earlier param collapses to `never` — so a route with a param in one
			// segment and a literal in the next (`/threads/$threadId/issues`) was uncallable. `A & unknown`
			// is `A`.
			unknown

type HasParams<T extends string> = T extends `${string}$${string}` ? true : false

type GotoArgs<T extends AppRoute> = HasParams<T> extends true ? [route: T, params: ExtractParams<T>] : [route: T]

/**
 * App routes are typed WITHOUT the deployment basepath, because that is how TanStack Router's
 * generated `to` union spells them (`basepath: '/app'` is router config, not part of a route id). The
 * dev server serves the SPA under `/app/`, so a bare `page.goto('/threads/…')` would miss it — the
 * prefix is added HERE, once, rather than at every call site.
 */
function resolveRoute(route: string, params?: Record<string, string>): string {
	const resolved = params ? Object.entries(params).reduce((path, [key, value]) => path.replace(`$${key}`, value), route) : route
	return `/app${resolved}`
}

export const test = base.extend<
	{
		goto: <T extends AppRoute>(...args: GotoArgs<T>) => Promise<any>
		network: ReturnType<typeof createNetworkLogger>
	},
	{ daemonSession: DaemonSession }
>({
	/**
	 * AUTO E POR WORKER — a identidade do daemon é PROCESSO-WIDE (`CloudSession`: um operador por
	 * daemon, sem multi-conta por máquina), então autenticar por teste seria repetir um efeito global.
	 * `auto: true` porque nenhuma spec deve precisar LEMBRAR de logar: sem isto, esquecer a chamada dá
	 * 401 em toda rota local, que é o sintoma mais caro de diagnosticar desta suíte inteira.
	 */
	daemonSession: [
		// biome-ignore lint/correctness/noEmptyPattern: API do Playwright — o padrão vazio é como se DECLARA uma fixture sem dependências (ele parseia o destructuring para descobrir de quem a fixture depende). Trocar por `_` mudaria a declaração, não só o estilo.
		async ({}, use) => {
			const session = await authenticateDaemon()
			await use(session)
		},
		{ scope: 'worker', auto: true },
	],

	network: async ({ page }, use, testInfo) => {
		const logger = createNetworkLogger()
		logger.attach(page)
		await use(logger)
		if (testInfo.status !== 'passed') {
			await testInfo.attach('network-log', { body: logger.getReport(), contentType: 'text/plain' })
		}
		logger.clear()
	},

	goto: async ({ page }, use) => {
		await use(<T extends AppRoute>(...args: GotoArgs<T>) => {
			const [route, params] = args as [string, Record<string, string>?]
			return page.goto(resolveRoute(route, params))
		})
	},
})

export { expect }
