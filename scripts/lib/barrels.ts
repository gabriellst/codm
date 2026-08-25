// scripts/lib/barrels.ts — what counts as a BARREL, in one place.
//
// Extracted from `scripts/barrel-liveness.test.ts` on 2026-08-14 because a second rail
// (`scripts/context-barrels.test.ts`) needs the same predicate, and importing it from a `*.test.ts`
// makes bun RUN that file's suite as a side effect of the import — the "module that executes at
// import" defect shape, arriving through the back door. A predicate two gates agree on belongs in
// `lib/`, where importing it costs nothing.

import { stripCLikeComments } from './strip-comments'

/** One re-export statement, anchored at the cursor. `[^}]*` spans newlines — see `isBarrel`. */
const REEXPORT = /^export\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+['"][^'"]+['"];?/

/**
 * A BARREL is an `index.ts` whose every statement is a re-export. A file that also declares
 * something is a module with its own content — deleting it is not the same conversation, so it is
 * out of scope for the barrel rails even if nobody imports it.
 *
 * SCANNED AS A STATEMENT STREAM, NOT LINE BY LINE (fixed 2026-08-14). The first version split on
 * `\n` and required each line to match on its own. A named re-export long enough for the formatter
 * to wrap it —
 *
 *     export {
 *       AgentRunner,
 *       MockAgentRunner,
 *     } from './AgentRunner'
 *
 * — has no line that matches, so `isBarrel` returned false and the file left the rails' scope
 * ENTIRELY: not exempted, not reported, invisible. Measured then: 10 pure re-export `index.ts`
 * inside `exports`-declaring packages were out of scope for that reason alone. None was dead, so
 * nothing leaked — but a Biome line width was deciding which files the gates watch. Consuming the
 * source as a stream of statements removes the line from the question.
 */
export function isBarrel(source: string): boolean {
	const body = stripCLikeComments(source).trim()
	let cursor = 0
	let statements = 0
	while (cursor < body.length) {
		const rest = body.slice(cursor).trimStart()
		if (rest === '') break
		cursor = body.length - rest.length
		const match = REEXPORT.exec(rest)
		if (!match) return false
		cursor += match[0].length
		statements++
	}
	return statements > 0
}
