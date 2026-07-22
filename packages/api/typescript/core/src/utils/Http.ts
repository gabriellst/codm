import type { HttpCookie } from '../types/Http'

export function parseSetCookieHeaders(setCookieHeaders: string[]): Record<string, HttpCookie> {
	const cookies: Record<string, HttpCookie> = {}

	for (const cookieString of setCookieHeaders) {
		const parts = cookieString.split(';').map(part => part.trim())
		const nameValue = parts[0]
		if (!nameValue) continue

		const [name, value] = nameValue.split('=')

		if (!name || !value) continue

		// Just send the value, no attributes
		cookies[name] = { value }
	}

	return cookies
}
