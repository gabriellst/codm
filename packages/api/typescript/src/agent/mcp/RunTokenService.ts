import { singleton } from 'tsyringe-neo'
import { randomBytes } from 'node:crypto'
import { RunTokenService, type RunTokenClaims } from '../services/RunTokenService'

/** 32 bytes of CSPRNG, base64url — ~256 bits of entropy, unguessable and opaque by construction. */
const TOKEN_BYTES = 32

/**
 * The implementation of the three verbs Fase 1 froze as an abstract signature.
 *
 * ### Why in-memory, and why that is the RIGHT storage rather than a shortcut
 * A run token's lifetime is a single agent run inside a single daemon process. It is minted by the
 * base `Agent` when the run starts, carried to a child CLI, verified by the router in the SAME
 * process, and revoked by the runner when the process dies. Persisting it would create a durable
 * credential that outlives the thing it authorizes — a token surviving a daemon restart could
 * authorize a write on behalf of a run whose process is long gone, which is precisely the "late tool
 * call from a dead run" this design exists to answer with a 401. A restart invalidating every token
 * is CORRECT: no run survives a restart either.
 *
 * ### Opaque means opaque
 * The token is random bytes, not a signed envelope. Nothing about the claims can be read out of it —
 * not by the runner (which must not see identity at all, AC-6.12), not by the CLI, not by the model.
 * Verification is a map lookup, so the claims never travel outside this process.
 *
 * ### Expiry is a BACKSTOP, not the mechanism
 * `revoke` at run termination is the primary invalidation; `expiresAt` catches the case where a run
 * dies in a way that skipped teardown (SIGKILL of the daemon's own process tree). Both are checked on
 * every verify, and an expired entry is dropped on read so a long-lived daemon does not accumulate
 * dead claims.
 */
@singleton()
export class InMemoryRunTokenService extends RunTokenService {
	private readonly tokens = new Map<string, RunTokenClaims>()

	/** Issue an opaque token for one run. Called EXCLUSIVELY by the base `Agent` (AC-6.12). */
	mint(claims: RunTokenClaims): string {
		const token = randomBytes(TOKEN_BYTES).toString('base64url')
		this.tokens.set(token, claims)
		return token
	}

	/** Resolve a token to its claims, or `null` when unknown / expired / revoked. Called per tool call. */
	verify(token: string): RunTokenClaims | null {
		const claims = this.tokens.get(token)
		if (!claims) return null
		if (claims.expiresAt.getTime() <= Date.now()) {
			this.tokens.delete(token)
			return null
		}
		return claims
	}

	/** Invalidate at run termination — normal, error or cancellation. Idempotent by contract. */
	revoke(token: string): void {
		this.tokens.delete(token)
	}
}
