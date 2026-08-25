import { describe, expect, it } from 'bun:test'
import { extractErrorCode } from './errors'

/**
 * HOW A REFUSED CONNECTION IS RECOGNISED. (The other half of the regression — what the console then
 * DOES about it — is `errors.toast.test.tsx`.)
 *
 * REGRESSION: opening the console with both sidecars down stacked three identical red toasts saying
 * "Ocorreu um erro / Erro desconhecido". Unknown was a lie: the app knew perfectly well that nothing
 * had answered. `extractErrorCode` classified the failure with `error.message.includes('fetch')`,
 * which is CHROMIUM's wording ("Failed to fetch"). This app ships in a WKWebView (tauri on macOS),
 * where the identical failure reads "Load failed" — no 'fetch' in it — so every query fell through
 * to UNKNOWN_ERROR.
 *
 * The dialect table below is the entire point of this suite. Pinning one engine's phrasing is what
 * caused the bug, so the test pins all three engines AND the shape that actually identifies a
 * transport failure (a TypeError carrying no HTTP status). Revert the classifier to the substring
 * test and the WebKit row goes red — that is the row the founder hit.
 */

describe('extractErrorCode — a refused connection, in every engine dialect', () => {
	const dialects: [engine: string, message: string][] = [
		['Chromium', 'Failed to fetch'],
		['WebKit / WKWebView', 'Load failed'],
		['Firefox', 'NetworkError when attempting to fetch resource.'],
	]

	for (const [engine, message] of dialects) {
		it(`reads a TypeError("${message}") from ${engine} as NETWORK_ERROR`, () => {
			expect(extractErrorCode(new TypeError(message))).toBe('NETWORK_ERROR')
		})
	}

	it('accepts a TypeError that lost its prototype crossing a realm (name only, no instanceof)', () => {
		expect(extractErrorCode({ name: 'TypeError', message: 'Load failed' })).toBe('NETWORK_ERROR')
	})

	it('does NOT claim a TypeError carrying an HTTP status — that one answered, so it is not transport', () => {
		expect(extractErrorCode({ name: 'TypeError', message: 'Load failed', status: 500 })).toBe('UNKNOWN_ERROR')
	})

	it('leaves a plain programming Error alone', () => {
		expect(extractErrorCode(new Error('x is not a function'))).toBe('UNKNOWN_ERROR')
	})
})

describe('extractErrorCode — the HTTP path must not regress', () => {
	/**
	 * The generated client parses `code` out of the response body and re-throws with it (plus a
	 * `status`). That path was never broken and the shape-based transport check must not shadow it.
	 */
	it('keeps the code the generated client parsed out of the response body', () => {
		expect(extractErrorCode({ code: 'GATEWAY_UNAVAILABLE', status: 503, message: 'gateway down' })).toBe('GATEWAY_UNAVAILABLE')
	})

	it('keeps a domain code the same way', () => {
		expect(extractErrorCode({ code: 'THREAD_NOT_FOUND', status: 404, message: 'nope' })).toBe('THREAD_NOT_FOUND')
	})

	it('falls back to UNKNOWN_ERROR for a code no backend registered', () => {
		expect(extractErrorCode({ code: 'NOT_A_REAL_CODE', status: 500 })).toBe('UNKNOWN_ERROR')
	})
})
