// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { injectable } from 'tsyringe-neo'
import { inArray } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@codedm/core-typescript'
import { users } from '@codedm/contracts/db'
import { type UserDirectoryEntry, UserDirectoryService } from '../../owner/services/UserDirectoryService'

/**
 * Real implementation of Tenancy's cross-BC UserDirectoryService
 * port. Reads from authentication.users — BetterAuth owns the
 * canonical users table, so this adapter lives inside the Auth BC and
 * is bound via auth/registry.ts (overrides tenancy's Mock binding via
 * load order: tenancy registers first; auth's later entry wins).
 *
 * `getMany` returns a batched lookup over a userId list — used by
 * T10 StoreMembers to hydrate member rows with email + display name
 * without per-row roundtrips. Missing userIds are silently dropped
 * (matches the Mock's "deterministic stubs" contract; callers handle
 * orphan member rows via their own logic).
 */
@injectable()
export class AuthUserDirectoryService extends UserDirectoryService {
	constructor(private db: DrizzleClient) {
		super()
	}

	async getMany(userIds: string[]): Promise<UserDirectoryEntry[]> {
		if (userIds.length === 0) return []
		const result = await tryCatchAsync(async () => {
			return await this.db
				.select({ id: users.id, email: users.email, name: users.name, image: users.image })
				.from(users)
				.where(inArray(users.id, userIds))
		})
		if (!result.success) throw result.error
		return result.data.map(r => ({
			userId: r.id,
			email: r.email,
			name: r.name,
			image: r.image,
		}))
	}
}
