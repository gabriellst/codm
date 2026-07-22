// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { injectable } from 'tsyringe-neo'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { BaseError, Config, tryCatch } from '@codedm/core-typescript'
import type { ApplicationErrors } from '../errors'

export interface InvitationTokenPayload {
	sid: string // ownerInvitationId
	email: string
	exp: number // unix seconds
}

const DEFAULT_TTL_SEC = 7 * 24 * 3600

/**
 * HMAC-signed invitation token envelope: `${base64url(payload)}.${plainToken}.${sig}`.
 *
 * - `plainToken` is what `OwnerInvitation.token` sha256-hashes during issue() —
 *   the entity owners only the hash; the plain value travels in the envelope.
 * - `sig` covers `${payload}.${plainToken}` with HMAC-SHA256(JWT_SECRET) to bind
 *   the payload (sid, email, exp) to the plain token. A leaked plain token
 *   without the matching payload won't verify.
 *
 * AcceptInvitation (C16) `verify`s the envelope → routes the entity by `sid` →
 *  calls `ownerInvitation.accept({ userId, plainToken })` for the hash check.
 */
@injectable()
export class InvitationTokenService {
	generate(input: { ownerInvitationId: string; email: string; ttlSec?: number; plainToken: string }): string {
		const exp = Math.floor(Date.now() / 1000) + (input.ttlSec ?? DEFAULT_TTL_SEC)
		const payload: InvitationTokenPayload = {
			sid: input.ownerInvitationId,
			email: input.email,
			exp,
		}
		const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
		const sig = createHmac('sha256', Config.env.JWT_SECRET).update(`${b64}.${input.plainToken}`).digest('base64url')
		return `${b64}.${input.plainToken}.${sig}`
	}

	verify(token: string): InvitationTokenPayload & { plainToken: string } {
		const parts = token.split('.')
		if (parts.length !== 3) throw new BaseError<ApplicationErrors>('INVALID_INVITATION_TOKEN')
		const [b64, plainToken, sig] = parts as [string, string, string]
		if (!b64 || !plainToken || !sig) {
			throw new BaseError<ApplicationErrors>('INVALID_INVITATION_TOKEN')
		}

		const expected = createHmac('sha256', Config.env.JWT_SECRET).update(`${b64}.${plainToken}`).digest('base64url')
		const a = Buffer.from(sig)
		const b = Buffer.from(expected)
		if (a.length !== b.length || !timingSafeEqual(a, b)) {
			throw new BaseError<ApplicationErrors>('INVALID_INVITATION_TOKEN')
		}

		const parsedResult = tryCatch<InvitationTokenPayload>(() => JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')))
		if (!parsedResult.success) {
			throw new BaseError<ApplicationErrors>('INVALID_INVITATION_TOKEN')
		}
		const payload = parsedResult.data

		if (payload.exp < Math.floor(Date.now() / 1000)) {
			throw new BaseError<ApplicationErrors>('INVITATION_EXPIRED')
		}

		return { ...payload, plainToken }
	}
}
