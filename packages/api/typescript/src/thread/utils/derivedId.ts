import { createHash } from 'node:crypto'

/**
 * A UUID that is the SAME every time for the same parts (name-based, version 5 layout over SHA-1) — the id of an
 * entry derived from another one, so a redelivered signal records nothing twice: the print a signal shows on its
 * own is `derivedId(signalId, artifactId)`, and its entry's primary key refuses the second write.
 */
export function derivedId(...parts: readonly string[]): string {
	const hash = createHash('sha1').update(parts.join('\u0000')).digest()
	hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50
	hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80
	const hex = hash.subarray(0, 16).toString('hex')
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
