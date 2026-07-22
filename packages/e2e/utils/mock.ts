import type { Page, Route } from 'playwright'

type QueryKeyFn = (...args: any[]) => readonly [{ url: string }, ...any[]]

function extractUrl(queryKeyOrPattern: QueryKeyFn | string): string {
	if (typeof queryKeyOrPattern === 'string') return queryKeyOrPattern
	const key = queryKeyOrPattern({} as any)
	return `**${key[0].url}*`
}

/**
 * Type-safe route mocking. Accepts either:
 * - An SDK query key function (extracts the URL automatically)
 * - A glob string pattern
 *
 * Usage:
 *   import { listNotificationsQueryKey, type GetChannelSidebarQueryResponse } from '@codedm/client-typescript/typescript'
 *   await mockRoute<GetChannelSidebarQueryResponse>(page, listNotificationsQueryKey, { items: [...] })
 */
export async function mockRoute<TResponse>(
	page: Page,
	queryKeyOrPattern: QueryKeyFn | string,
	response: TResponse,
	options?: { status?: number; headers?: Record<string, string> },
) {
	const pattern = extractUrl(queryKeyOrPattern)
	await page.route(pattern, (route: Route) =>
		route.fulfill({
			status: options?.status ?? 200,
			contentType: 'application/json',
			headers: options?.headers,
			body: JSON.stringify(response),
		}),
	)
}

/**
 * Mocks an SSE/EventSource endpoint. Returns an empty event stream
 * that stays open, preventing retry loops.
 */
export async function mockSSE(page: Page, queryKeyOrPattern: QueryKeyFn | string, events?: Array<{ event?: string; data: string }>) {
	const pattern = extractUrl(queryKeyOrPattern)
	await page.route(pattern, (route: Route) => {
		const body = events ? events.map(e => `${e.event ? `event: ${e.event}\n` : ''}data: ${e.data}\n\n`).join('') : ''

		return route.fulfill({
			status: 200,
			contentType: 'text/event-stream',
			headers: {
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
			},
			body,
		})
	})
}

/**
 * Mocks a route to return an error response.
 */
export async function mockRouteError(
	page: Page,
	queryKeyOrPattern: QueryKeyFn | string,
	error: { code: string; message: string; status: number },
) {
	const pattern = extractUrl(queryKeyOrPattern)
	await page.route(pattern, (route: Route) =>
		route.fulfill({
			status: error.status,
			contentType: 'application/json',
			body: JSON.stringify(error),
		}),
	)
}
