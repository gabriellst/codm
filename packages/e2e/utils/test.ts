import { test as base, expect } from '@playwright/test'
import type { FileRouteTypes } from '../../app/react/src/routeTree.gen'
import { createNetworkLogger } from './diagnostics'
import { givenFreshUser } from './given'
import { t } from './i18n'

type AppRoute = FileRouteTypes['to']

type ExtractParams<T extends string> = T extends `${string}$${infer Param}/${infer Rest}`
	? { [K in Param]: string } & ExtractParams<`/${Rest}`>
	: T extends `${string}$${infer Param}`
		? Record<Param, string>
		: Record<string, never>

type HasParams<T extends string> = T extends `${string}$${string}` ? true : false

type GotoArgs<T extends AppRoute> = HasParams<T> extends true ? [route: T, params: ExtractParams<T>] : [route: T]

function resolveRoute(route: string, params?: Record<string, string>): string {
	if (!params) return route
	return Object.entries(params).reduce((path, [key, value]) => path.replace(`$${key}`, value), route)
}

type DropFirst<T extends (...args: any[]) => any> = T extends (first: any, ...rest: infer R) => infer Ret ? (...args: R) => Ret : never

export const test = base.extend<{
	goto: <T extends AppRoute>(...args: GotoArgs<T>) => Promise<any>
	loginAs: (credentials: { email: string; password: string }) => Promise<void>
	given: {
		freshUser: DropFirst<typeof givenFreshUser>
	}
	network: ReturnType<typeof createNetworkLogger>
}>({
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

	given: async ({ context }, use) => {
		await use({
			freshUser: params => givenFreshUser(context, params),
		})
	},

	loginAs: async ({ page, network }, use) => {
		await use(async credentials => {
			await page.goto('/sign-in')
			await page.getByLabel(t('auth.signIn.email')).fill(credentials.email)
			await page.getByLabel(t('auth.signIn.password'), { exact: true }).fill(credentials.password)
			await page.getByRole('button', { name: t('auth.signIn.submit') }).click()
			await Promise.race([page.waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15_000 }), network.waitForFailure()])
		})
	},
})

export { expect }
