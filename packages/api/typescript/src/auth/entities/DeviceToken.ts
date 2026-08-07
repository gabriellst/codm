// Recipe: dev:packages/api/src/auth/entities/DeviceToken.ts
import { createHash, randomBytes } from 'node:crypto'
import { AggregateRoot, BaseError, Id, z } from '@codm/core-typescript'
import Z from 'zod'
import type { DomainErrors } from '../errors'

// sha256 hex digest is always 64 lowercase hex chars. No named error code: `tokenHash` is never
// user input — it is produced exclusively by DeviceToken.issue()/hashOf() — so a mismatch here is
// an infra-corruption signal, not a business invariant a caller can trigger; it falls through to
// BaseEntity's generic INVALID_ENTITY rather than adding a context-specific code for an
// unreachable-from-outside shape check.
export const DeviceTokenSchema = z.object({
	userId: z.instance(Id),
	tokenHash: z.string().length(64),
	label: z.string().trim().min(1).max(120),
	revokedAt: z.date().optional(),
})

export type DeviceTokenProps = Z.infer<typeof DeviceTokenSchema>

/**
 * The long-lived credential a desktop install trades a one-time code for (spec decision 4). The
 * PLAINTEXT exists exactly once — inside `issue()`'s return value — and is never persisted: the row
 * (and every read path) only ever sees `tokenHash`. This mirrors how a password would be handled,
 * even though a device token is bearer-only (no username pairing) — the hash-at-rest invariant is
 * the point of AC-2.
 */
export class DeviceToken extends AggregateRoot<typeof DeviceTokenSchema> {
	static override schema = DeviceTokenSchema

	/**
	 * Mint a fresh device token for `userId`. Returns BOTH the entity (hash-only, ready to persist)
	 * and the PLAINTEXT — the one and only time it exists outside the caller's memory and the OS
	 * keychain it is about to be written into.
	 */
	static issue(userId: string, label: string): { entity: DeviceToken; plaintext: string } {
		const plaintext = randomBytes(32).toString('hex')
		return { entity: new DeviceToken({ userId, tokenHash: DeviceToken.hashOf(plaintext), label }), plaintext }
	}

	/** sha256 hex digest of a plaintext token — the ONLY form ever written to disk. */
	static hashOf(plaintext: string): string {
		return createHash('sha256').update(plaintext).digest('hex')
	}

	/** True when `plaintext`'s hash matches this token's stored hash. */
	matches(plaintext: string): boolean {
		return this.tokenHash === DeviceToken.hashOf(plaintext)
	}

	isRevoked(): boolean {
		return this.revokedAt !== undefined
	}

	/**
	 * Idempotent-REFUSE, not idempotent-no-op: revoking an already-revoked token throws rather than
	 * silently succeeding a second time. A caller asking to revoke a token it believes is live must
	 * learn that it was not — logout (T6) and a defensive double-submit both fold into the same
	 * `DEVICE_TOKEN_INVALID` the bearer-lookup miss in GetEntitlement/RevokeDevice throws (spec T2),
	 * so a caller can never distinguish "never existed" from "already gone".
	 */
	revoke(): void {
		if (this.isRevoked()) throw new BaseError<DomainErrors>('DEVICE_TOKEN_INVALID')
		this.revokedAt = new Date()
	}
}

// Declaration merging — interface BELOW class
export interface DeviceToken extends DeviceTokenProps {}
