import { injectable } from 'tsyringe-neo'
import type { Transaction } from '../UnitOfWork/UnitOfWork'
import { IdempotencyGuard } from './IdempotencyGuard'

/**
 * In-memory claim latch for mock-mode tests. Ported verbatim from origin-fork@f04e8a0f
 * (`packages/api/src/shared/services/IdempotencyGuard/MockIdempotencyGuard.ts`) — only `scope` widened
 * to `string`. Composite `scope::key` mirrors the DB's `(scope, key)` primary key.
 */
@injectable()
export class MockIdempotencyGuard extends IdempotencyGuard {
	private seen = new Set<string>()

	async claim(scope: string, key: string, _tx?: Transaction): Promise<boolean> {
		const compositeKey = `${scope}::${key}`
		if (this.seen.has(compositeKey)) return false
		this.seen.add(compositeKey)
		return true
	}

	async release(scope: string, key: string, _tx?: Transaction): Promise<void> {
		this.seen.delete(`${scope}::${key}`)
	}
}
