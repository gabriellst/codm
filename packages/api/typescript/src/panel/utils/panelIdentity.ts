import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { Config } from '@codm/core-typescript'

/**
 * The numbers of "who is this device" (fase 2, item 6a — `.specs/2026-11-16-falar-e-parar-na-hora-design.md`).
 * Named once here so the use cases, the cookie and the tests read the same values.
 */
export const PANEL_IDENTITY = {
	/** A code is good for 10 minutes, counted on the cloud's clock from the moment the daemon pulled it. */
	codeTtlMs: 10 * 60 * 1000,
	/** Wrong tries a code survives. */
	maxAttempts: 5,
	/** Code requests per member: one a minute, five an hour. */
	perMinute: 1,
	perHour: 5,
	/**
	 * Code requests per GROUP an hour, across members. Anyone with the group link can ask; each ask makes
	 * the owner's number DM a member — without a group cap a link could turn that number into a spammer.
	 */
	perGroupPerHour: 15,
	/** A request nobody pulled in this long is dropped — the daemon was away and nobody is waiting anymore. */
	pendingWindowMs: 5 * 60 * 1000,
	/** A verified device stays verified for 30 days. */
	sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
	/** Code requests are kept a day (the hourly limit needs one hour of them), then purged. */
	requestRetentionMs: 24 * 60 * 60 * 1000,
	/** The device cookie's name. */
	cookieName: 'codm_panel',
} as const

/** A six-digit code, uniformly drawn. */
export function newPanelCode(): string {
	return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

/**
 * The stored form of a code: an HMAC bound to its request, keyed with a cloud-only secret. Six digits
 * are a million guesses, so a bare hash would fall to anyone holding the table; the key keeps the table
 * alone useless, and binding the request id makes a hash unusable for any other request.
 */
export function panelCodeHash(requestId: string, code: string): string {
	return createHmac('sha256', codeKey()).update(`${requestId}:${code}`).digest('base64url')
}

/** Compare a candidate code against the stored hash in constant time. */
export function panelCodeMatches(requestId: string, code: string, storedHash: string): boolean {
	const candidate = Buffer.from(panelCodeHash(requestId, code))
	const stored = Buffer.from(storedHash)
	return candidate.length === stored.length && timingSafeEqual(candidate, stored)
}

/** A device session token: 32 random bytes. Only its SHA-256 is stored (it already has full entropy). */
export function newPanelDeviceToken(): string {
	return randomBytes(32).toString('base64url')
}

export function panelDeviceTokenHash(token: string): string {
	return createHash('sha256').update(token).digest('base64url')
}

/**
 * The `Set-Cookie` value for the device session, scoped to ONE group's panel path. Written by hand: the
 * framework's cookie helper renders flags as `HttpOnly=true` and skips empty values, which would make
 * the cookie impossible to clear. `token` absent = clear it.
 */
export function panelDeviceCookie(groupToken: string, token?: string): string {
	const maxAge = token ? Math.floor(PANEL_IDENTITY.sessionTtlMs / 1000) : 0
	return `${PANEL_IDENTITY.cookieName}=${token ?? 'gone'}; Path=/panel/g/${groupToken}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`
}

function codeKey(): Buffer {
	// A sub-key of the cloud's auth secret, so the panel never shares a key with session signing.
	return createHmac('sha256', Config.env.BETTER_AUTH_SECRET).update('codm-panel-code').digest()
}
