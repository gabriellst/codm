import { singleton } from 'tsyringe-neo'
import { randomBytes } from 'node:crypto'
import type { AgentIdentity } from '../../types/AgentIdentity'
import { AgentIdentityService } from './AgentIdentityService'

/** 32 bytes of CSPRNG, base64url — ~256 bits of entropy, unguessable and opaque by construction. */
const TOKEN_BYTES = 32

/**
 * The implementation of the three verbs, in memory.
 *
 * ### Why in-memory is the RIGHT storage rather than a shortcut
 * A run token's lifetime is one agent run inside one daemon process: issued when the run starts,
 * carried to a child CLI, resolved by the destination controller in the SAME process, revoked by the
 * runner when the process dies. Persisting it would create a durable credential that outlives the
 * thing it authorizes — a token surviving a restart could authorize a write on behalf of a run whose
 * process is long gone, which is exactly the "late tool call from a dead run" this design answers
 * with a 401. A restart invalidating every token is CORRECT: no run survives a restart either.
 *
 * ### Opaque means opaque
 * Random bytes, not a signed envelope. Nothing about the identity can be read out of it — not by the
 * runner (which must not see identity at all), not by the CLI, not by the model. Resolution is a map
 * lookup, so the identity never travels outside this process.
 *
 * ### Expiry is a BACKSTOP
 * `revoke` at termination is the primary invalidation; `expiresAt` catches the run that died in a way
 * that skipped teardown. Both are checked on every resolve, and an expired entry is dropped ON READ so
 * a long-lived daemon does not accumulate dead identities.
 */
@singleton()
export class InMemoryAgentIdentityService<I extends AgentIdentity = AgentIdentity> extends AgentIdentityService<I> {
	private readonly tokens = new Map<string, I>()

	issue(identity: I): string {
		const token = randomBytes(TOKEN_BYTES).toString('base64url')
		this.tokens.set(token, identity)
		return token
	}

	resolve(token: string): I | null {
		const identity = this.tokens.get(token)
		if (!identity) return null
		if (identity.expiresAt.getTime() <= Date.now()) {
			this.tokens.delete(token)
			return null
		}
		return identity
	}

	revoke(token: string): void {
		this.tokens.delete(token)
	}
}
