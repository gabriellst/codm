/**
 * The prefix of a workspace's short issue keys (`<PREFIX>-<n>`, fase 0 item 4), DERIVED from the folder
 * the workspace points at — the name a person already uses for the project.
 *
 * Rule: split the folder name into alphanumeric words; one word → its first three letters (`codm` → `COD`);
 * several words → the first letter of each word but the last, plus the first two of the last
 * (`web-app` → `WAP`, `acme-store` → `AST`). Uppercased, never empty (`ISS` when nothing is left).
 *
 * Derived on purpose, not stored: the folder name is the declared fact and the prefix is a pure function
 * of it. A workspace that needs a different prefix is a later, declared setting — not a parse here.
 */
export function issuePrefixOf(path: string): string {
	const folder = path.split(/[\\/]/).filter(Boolean).at(-1) ?? ''
	const words = folder.split(/[^a-zA-Z0-9]+/).filter(Boolean)
	const last = words.at(-1)
	if (!last) return 'ISS'
	const prefix =
		words.length === 1
			? last.slice(0, 3)
			: `${words
					.slice(0, -1)
					.map(word => word[0])
					.join('')}${last.slice(0, 2)}`
	return prefix.toUpperCase()
}
