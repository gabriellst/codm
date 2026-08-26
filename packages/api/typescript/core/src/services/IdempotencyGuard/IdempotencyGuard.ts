import type { Transaction } from '../UnitOfWork/UnitOfWork'

/**
 * Exactly-once claim latch — a generic kernel primitive over the `shared.idempotency_keys` table.
 *
 * `scope` is a plain `string` here (not a fixed enum): the KERNEL owns the mechanism, a PRODUCT owns
 * the vocabulary. Downstream code passes members of its own `IdempotencyScope` registry (a shared
 * SCREAMING_SNAKE enum whose values are strings — see `src/shared/enums/IdempotencyScope.ts`), which
 * widen to `string` at the call boundary. Ported from origin-fork@f04e8a0f
 * (`packages/api/src/shared/services/IdempotencyGuard/IdempotencyGuard.ts`); the only change is
 * `IdempotencyScope` → `string` so the primitive can live in the context-agnostic core.
 */
export abstract class IdempotencyGuard {
	/** Atomic claim. Returns true iff THIS call inserted the (scope, key) (first time). */
	abstract claim(scope: string, key: string, tx?: Transaction): Promise<boolean>

	/**
	 * Explicitly un-claims a (scope, key) — used by the claim-commit-effect pattern when the
	 * claim (tx1) already committed but the external effect that followed (run OUTSIDE any DB
	 * transaction, so it can no longer be rolled back with the claim) then failed. Releasing
	 * lets a later redelivery re-claim the same key and genuinely retry the effect, instead of
	 * silently no-op'ing forever against a claim that was never actually fulfilled.
	 *
	 * No-op (not an error) if the (scope, key) isn't currently claimed.
	 *
	 * Pass `tx` to release WITHIN the claiming transaction (e.g. a handler that claimed a per-invoice
	 * latch up-front but then found nothing to emit, and must not let that claim persist past commit).
	 * Omit `tx` for the post-commit release (an external effect failed after tx1 already committed).
	 */
	abstract release(scope: string, key: string, tx?: Transaction): Promise<void>
}
