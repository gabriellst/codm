import { BaseError } from '@codedm/core-typescript'
import type { RunTokenClaims } from '../services/RunTokenService'
import type { AgentInterfaceErrors } from '../errors'

/**
 * THE MANDATORY MITIGATION of the design amendment's conscious regression (AC-6.6).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT REGRESSED, stated plainly. Fase 1 froze the four tool schemas with NO identity field at all,
 * which made "declare against the wrong issue" INEXPRESSIBLE — there was no key in which to say it.
 * A tool GENERATED from a controller inherits that controller's parameters, `issueId` and `threadId`
 * included, so the guarantee degrades from IMPOSSIBLE to VALIDATED. This file is the validation, and
 * without it the phase does not close.
 *
 * WHY IT WALKS RATHER THAN CHECKING TWO NAMED FIELDS — measured, not assumed. Driving the generated
 * server through a real MCP `Client`, a `tools/call` for `RecordArtifact` with
 * `threadId: 'ATTACKER-CHOSEN-THREAD-ID'` and `data.issueId: '1111…'` issued
 * `POST /v1/threads/ATTACKER-CHOSEN-THREAD-ID/artifacts` CARRYING THAT issueId IN THE BODY.
 * `RecordArtifactInputSchema` has `issueId: z.uuid().optional()` and the controller composes its body
 * with `.omit({ ownerId, threadId })`, so the id survives into the payload. A check that only compared
 * the path parameter would pass the cross-issue test while the body still targeted issue B.
 *
 * The walk is therefore over the WHOLE argument object, at any depth. That covers all three axes at
 * once — path params and query live at the top level of a generated tool's arguments, the request body
 * lives under `data` — and it keeps covering them when a controller grows a field, which a
 * hand-maintained list of paths would not.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * It is deliberately a DENY-list of identity keys rather than an allow-list of safe ones: a new
 * identity-shaped key would otherwise pass unchecked, and these three names are the whole vocabulary
 * of "on whose behalf" in this codebase.
 */
const IDENTITY_KEYS = ['ownerId', 'issueId', 'threadId'] as const
type IdentityKey = (typeof IDENTITY_KEYS)[number]

function isIdentityKey(key: string): key is IdentityKey {
	return (IDENTITY_KEYS as readonly string[]).includes(key)
}

/** One disagreement found by the walk, with enough context to log WHERE it was hiding. */
export interface IdentityMismatch {
	/** Dotted path from the tool's argument root, e.g. `threadId` or `data.issueId`. */
	at: string
	key: IdentityKey
	claimed: string
	supplied: string
}

/**
 * Find every identity key anywhere in `args` whose value disagrees with the run token's claims.
 *
 * Returns ALL mismatches rather than the first, so the log records the full shape of an attempt
 * instead of whichever axis happened to be walked first — the difference between "someone tried a
 * cross-issue write" and knowing they tried it on two axes at once.
 *
 * A key whose value is not a string is ignored: it cannot name an id, and coercing would invent a
 * comparison the schema never promised.
 */
export function findIdentityMismatches(args: unknown, claims: RunTokenClaims): IdentityMismatch[] {
	const mismatches: IdentityMismatch[] = []

	const walk = (node: unknown, path: string): void => {
		if (node === null || typeof node !== 'object') return
		if (Array.isArray(node)) {
			node.forEach((child, index) => {
				walk(child, `${path}[${index}]`)
			})
			return
		}
		for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
			const at = path ? `${path}.${key}` : key
			if (isIdentityKey(key) && typeof value === 'string') {
				const claimed = claims[key]
				// An empty claim cannot confine anything, so it is not compared. It is also not
				// reachable: only an agent with a NON-EMPTY tool scope mints a token, and the base
				// `Agent` narrows `issueId` at that single minting point (§4.6) precisely so that a run
				// which can call tools always carries the issue it is confined to. The guard is the
				// belt to that braces — a token that somehow arrived without an issue claim gets no
				// implicit permission from the absence.
				if (claimed && value !== claimed) mismatches.push({ at, key, claimed, supplied: value })
				continue
			}
			walk(value, at)
		}
	}

	walk(args, '')
	return mismatches
}

/**
 * Throw `AGENT_RUN_SCOPE_MISMATCH` (403) when the arguments target anything but the run's own
 * identity. 403 and not 401 on purpose: the token is VALID here and the target is wrong, so telling
 * the caller to authenticate again would be a lie to both the client and the log.
 */
export function assertIdentityMatchesClaims(args: unknown, claims: RunTokenClaims): void {
	const mismatches = findIdentityMismatches(args, claims)
	if (mismatches.length === 0) return
	const detail = mismatches.map(m => `${m.at}=${m.supplied} (run is scoped to ${m.claimed})`).join('; ')
	throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_SCOPE_MISMATCH', `tool call targets another run's identity: ${detail}`)
}
