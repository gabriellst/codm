/**
 * Turn free text into a URL-safe slug (`"Pix payment bug" → "pix-payment-bug"`): lower-cased,
 * NFKD-normalised so combining marks become dashes (`conversação` → `conversac-a-o`), capped at 40.
 *
 * THE FALLBACK IS A PARAMETER, and that is the whole point of this function living in `shared/`.
 * It used to hard-code `'issue'` — a general-purpose slugifier that silently knew one caller's
 * domain. Anything empty after normalisation came back as the string `issue`, which is correct for
 * an issue key and nonsense for anything else. A shared utility that names one context is not
 * shared; it is that context's function sitting in the wrong folder.
 *
 * Callers pass their own. `agent` passes `ISSUE_KEY_FALLBACK` because both of its use cases mint
 * issue keys (`DeclareIssueOpen` via `slugify`, `ForkIssue` via `uniqueSlugKey`); a future caller
 * with different subject matter passes its own and gets no surprise inherited from theirs.
 *
 * Deliberately NOT defaulted. A default would restore the coupling behind a nicer syntax: a caller
 * who forgot to think about the empty case would get `'issue'` and never find out. Required means
 * the compiler asks the question once, at the only place that can answer it.
 *
 * `thread/schemas/MentionGate.ts` mints its mention tag with its OWN rule rather than calling this,
 * and wrote down why: *"coupling the two would mean a future tweak to issue slugs silently changes
 * what people have to type in WhatsApp."* That refusal stands — parameterising the fallback removes
 * the naming leak, not the reason two different rules exist.
 *
 * It lives in `utils/` rather than `services/` because a pure string function is not a service:
 * nothing injects it, nothing binds it, it holds no state.
 */

/** The fallback `agent` passes: an issue whose title normalises to nothing still needs a key. */
export const ISSUE_KEY_FALLBACK = 'issue'

export function slugify(text: string, fallback: string): string {
	const slug = text
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40)
		.replace(/-+$/g, '')
	return slug || fallback
}

/**
 * A slug key UNIQUE within a thread — the invariant the modeling states for an issue key ("unique
 * per thread, e.g. 'coupon-focus'"). Collisions get a numeric suffix (`pix-payment` → `pix-payment-2`).
 */
export function uniqueSlugKey(title: string, existingKeys: readonly string[], fallback: string): string {
	const base = slugify(title, fallback)
	if (!existingKeys.includes(base)) return base
	let n = 2
	while (existingKeys.includes(`${base}-${n}`)) n++
	return `${base}-${n}`
}
