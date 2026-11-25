/**
 * Turn free text into a URL-safe slug (`"Pix payment bug" → "pix-payment-bug"`): lower-cased, without
 * accents, cut at a word boundary (40 by default).
 *
 * THE FALLBACK IS A PARAMETER, and that is the whole point of this function living in `shared/`.
 * It used to hard-code `'issue'` — a general-purpose slugifier that silently knew one caller's
 * domain. Anything empty after normalisation came back as the string `issue`, which is correct for
 * an issue key and nonsense for anything else. A shared utility that names one context is not
 * shared; it is that context's function sitting in the wrong folder.
 *
 * Callers pass their own. `agent` passes `ISSUE_KEY_FALLBACK` because both of its use cases mint
 * issue keys (`issueKeyOf`); a future caller with different subject matter passes its own and gets no
 * surprise inherited from theirs.
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

/** The fallback `agent` passes: an issue whose name normalises to nothing still needs a key. */
export const ISSUE_KEY_FALLBACK = 'tarefa'

/**
 * Accents are DROPPED, not turned into dashes (`conversação` → `conversacao`; it used to give `conversac-a-o`):
 * NFKD splits a letter from its mark, and the marks (`\p{M}`) go before anything else is replaced. The slug is
 * cut at a WORD boundary under `maxLength`, so a key never ends in half a word.
 */
export function slugify(text: string, fallback: string, maxLength = 40): string {
	const words = text
		.toLowerCase()
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.split('-')
		.filter(Boolean)
	let slug = ''
	for (const word of words) {
		const next = slug ? `${slug}-${word}` : word
		if (next.length > maxLength) break
		slug = next
	}
	// A first word longer than the cap is cut rather than dropped — something of the name must survive.
	return slug || (words[0] ?? '').slice(0, maxLength) || fallback
}
