import type { Page } from 'playwright'

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
			if (!url.includes('/v1/') && !url.includes('/api/')) return

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
