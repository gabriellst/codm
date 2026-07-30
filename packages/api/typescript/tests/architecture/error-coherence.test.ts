import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CONTEXTS } from '@shared/contexts'

/**
 * Error-coherence guard — a context's error VOCABULARY (the string-literal members of the exported
 * `*Errors` type unions in `src/<ctx>/errors/index.ts`) and its error REGISTRATION (the keys passed
 * to `registerErrorCodes({...})` in that same file) must be the SAME set.
 *
 * Why both directions matter:
 *   - A union code with NO `registerErrorCodes` entry is an UNREACHABLE 500: `BaseError<Errors>`
 *     happily raises it, but `Controller.handleError` looks it up in `GlobalErrorMapper` and falls
 *     back to `HttpStatusCode.INTERNAL_SERVER_ERROR` — the client sees a blanket 500 instead of the
 *     intended 4xx, and the OpenAPI emitter never documents the code.
 *   - A registered key that is in NO union is a DEAD ENTRY: no `BaseError<Errors>` call site can
 *     ever raise it (the union rejects the literal at compile time), so the mapping is fossil
 *     weight that suggests a vocabulary the context does not actually have.
 *
 * The closed contract this rail scans (see `src/billing/errors/index.ts` for the canon): each
 * bounded context declares its codes as string-literal members of exported `*Errors` unions
 * (`<Ctx>DomainErrors`, `<Ctx>ApplicationErrors`, ... — `never` for an empty layer) and registers
 * every one of them in ONE inline `registerErrorCodes({ CODE: HttpStatusCode.X, ... })` call, both
 * in `src/<ctx>/errors/index.ts`. Codes referenced by bare identifier (e.g. `BaseDomainErrors`)
 * belong to core's own seed registry and are out of scope here. A context with no
 * `errors/index.ts` (e.g. `shared`) simply has an empty vocabulary — trivially coherent.
 *
 * This is a source-text scan (molde `console-discipline.test.ts`), not a type-level check — the
 * type system CANNOT hold this line (rung ladder, `tests/architecture/README.md`):
 * `registerErrorCodes` takes `Record<string, HttpStatusCode>`, so a missing or extra key never
 * fails `tsc`. Comments are stripped before matching, so a code mentioned (or quoted) in a comment
 * is invisible to the scan. The context list is DERIVED from `CONTEXTS` (`@shared/contexts`) —
 * adding a context grows the rail's scope automatically, zero context-name coupling here.
 */

const API_SRC = join(import.meta.dir, '..', '..', 'src')

/** App locale roots measured (not gated) for the `errors.<code>` translation convention. */
const LOCALE_DIRS = [join(import.meta.dir, '..', '..', '..', '..', 'app', 'react', 'src', 'locales')]

/** Strip block + line comments so quoted codes (or apostrophes) inside prose never reach the
 *  matchers. Error files contain no string literal with `//` or `/*` in it — SCREAMING_SNAKE codes
 *  and `HttpStatusCode.*` members only — so the naive strip is exact for this contract. */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

// A union member is a string literal ('CODE') or a bare identifier (BaseDomainErrors, never).
const UNION_MEMBER = String.raw`'[^'\n]*'|[A-Za-z_$][\w$]*`
// `export type <...>Errors = |? member ( | member )*` — members after the first REQUIRE a leading
// `|`, which is what stops the match at the next statement (its `export` keyword has no `|`).
const ERRORS_UNION_RE = new RegExp(String.raw`export type \w*Errors\s*=\s*\|?\s*((?:${UNION_MEMBER})(?:\s*\|\s*(?:${UNION_MEMBER}))*)`, 'g')

/** All string-literal members of every exported `*Errors` type union in the (comment-stripped) source. */
function extractUnionCodes(source: string): Set<string> {
	const out = new Set<string>()
	for (const union of source.matchAll(ERRORS_UNION_RE)) {
		for (const literal of (union[1] ?? '').matchAll(/'([^'\n]*)'/g)) {
			out.add(literal[1] ?? '')
		}
	}
	return out
}

/** All keys of every inline `registerErrorCodes({...})` object literal in the (comment-stripped)
 *  source. The object body is delimited by brace balancing, so a future nested value cannot
 *  silently truncate the scan. */
function extractRegisteredCodes(source: string): Set<string> {
	const out = new Set<string>()
	for (const call of source.matchAll(/registerErrorCodes\(\s*\{/g)) {
		const open = (call.index ?? 0) + call[0].length - 1
		let depth = 0
		let close = open
		for (let i = open; i < source.length; i++) {
			if (source[i] === '{') depth++
			else if (source[i] === '}') {
				depth--
				if (depth === 0) {
					close = i
					break
				}
			}
		}
		const body = source.slice(open, close + 1)
		for (const key of body.matchAll(/[{,]\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/g)) {
			out.add(key[1] ?? key[2] ?? key[3] ?? '')
		}
	}
	return out
}

interface ContextErrorDiff {
	/** Union codes with no registerErrorCodes entry → BaseError degrades to a blanket 500. */
	unreachable: string[]
	/** Registered keys absent from every union → dead entry no BaseError<Errors> can raise. */
	dead: string[]
}

/** Diffs `src/<ctx>/errors/index.ts` vocabulary vs registration. Missing file = empty vocabulary. */
function diffContext(srcRoot: string, context: string): ContextErrorDiff {
	const file = join(srcRoot, context, 'errors', 'index.ts')
	if (!existsSync(file)) return { unreachable: [], dead: [] }
	const source = stripComments(readFileSync(file, 'utf8'))
	const unionCodes = extractUnionCodes(source)
	const registeredCodes = extractRegisteredCodes(source)
	return {
		unreachable: [...unionCodes].filter(code => !registeredCodes.has(code)).sort(),
		dead: [...registeredCodes].filter(code => !unionCodes.has(code)).sort(),
	}
}

describe('error-coherence (*Errors union literals === registerErrorCodes keys, per context)', () => {
	test('every context error code is both declared in a *Errors union and registered with an HTTP status', () => {
		const problems: string[] = []
		for (const context of Object.keys(CONTEXTS)) {
			const { unreachable, dead } = diffContext(API_SRC, context)
			for (const code of unreachable) {
				problems.push(
					`  ${context}/errors/index.ts  '${code}' is in a *Errors union but NOT in registerErrorCodes({...}) — ` +
						`BaseError('${code}') would degrade to a blanket 500 (Controller.handleError falls back to INTERNAL_SERVER_ERROR). ` +
						`Add the key with its intended HttpStatusCode.`,
				)
			}
			for (const code of dead) {
				problems.push(
					`  ${context}/errors/index.ts  '${code}' is registered with an HTTP status but is in NO exported *Errors union — ` +
						`no BaseError<Errors> call site can raise it. Add it to the right layer union (Domain/Application/Interface/Infrastructure) ` +
						`or delete the fossil entry.`,
				)
			}
		}
		expect(
			problems.length,
			`Context error vocabulary and registration drifted — the contract is ONE set, declared twice in the ` +
				`same errors/index.ts (union literal + inline registerErrorCodes key):\n${problems.join('\n')}`,
		).toBe(0)
	})

	// MEASURE only (no gate yet) — do the app locales translate backend codes under errors.<code>?
	// Molde: the context-map liveness warning. Gate this only once coverage is a deliberate contract.
	test('measure: app locales expose an errors.<code> convention covering the context codes (warning only)', () => {
		const contextCodes = new Set<string>()
		for (const context of Object.keys(CONTEXTS)) {
			const file = join(API_SRC, context, 'errors', 'index.ts')
			if (!existsSync(file)) continue
			for (const code of extractUnionCodes(stripComments(readFileSync(file, 'utf8')))) contextCodes.add(code)
		}
		for (const dir of LOCALE_DIRS) {
			if (!existsSync(dir)) {
				console.warn(`[error-coherence] locale dir not found (skipped): ${dir}`)
				continue
			}
			for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
				const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<string, unknown>
				const errors = parsed.errors
				if (typeof errors !== 'object' || errors === null) {
					console.warn(`[error-coherence] ${join(dir, file)} has NO top-level "errors" object — errors.<code> convention absent`)
					continue
				}
				const localeKeys = new Set(Object.keys(errors))
				const covered = [...contextCodes].filter(code => localeKeys.has(code))
				const missing = [...contextCodes].filter(code => !localeKeys.has(code))
				console.warn(
					`[error-coherence] ${join(dir, file)}: errors.<code> present (${localeKeys.size} keys) — covers ` +
						`${covered.length}/${contextCodes.size} backend context codes; missing e.g. ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}`,
				)
			}
		}
		expect(true).toBe(true)
	})

	// Negative fixture — proves the scan catches BOTH drift directions in a real temp tree (molde
	// console-discipline.test.ts), and that comment decoys / `never` layers / coherent codes are NOT
	// flagged. Without this, the rail could pass simply because the real tree happens to be clean.
	test('fixture: an unregistered union code and an undeclared registered key are both flagged; decoys are not', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'error-coherence-fixture-'))
		try {
			const errorsDir = join(tmpRoot, 'tenancy', 'errors')
			mkdirSync(errorsDir, { recursive: true })
			writeFileSync(
				join(errorsDir, 'index.ts'),
				[
					`import { HttpStatusCode, registerErrorCodes } from '@codm/core-typescript'`,
					`import type { BaseDomainErrors, BaseInfrastructureErrors } from '@codm/core-typescript'`,
					``,
					`// prose with an apostrophe: this file isn't allowed to confuse the literal matcher`,
					`export type TenancyDomainErrors =`,
					`\t// 'DECOY_IN_COMMENT' must never be extracted as a union member`,
					`\t| 'GHOST_CODE'`,
					`\t| 'COHERENT_CODE'`,
					`export type DomainErrors = BaseDomainErrors | TenancyDomainErrors`,
					``,
					`export type TenancyInfrastructureErrors = never`,
					`export type InfrastructureErrors = BaseInfrastructureErrors | TenancyInfrastructureErrors`,
					``,
					`registerErrorCodes({`,
					`\t// ZOMBIE_CODE is registered but no union declares it — must be flagged as dead`,
					`\tCOHERENT_CODE: HttpStatusCode.BAD_REQUEST,`,
					`\tZOMBIE_CODE: HttpStatusCode.NOT_FOUND,`,
					`})`,
					``,
				].join('\n'),
			)

			const diff = diffContext(tmpRoot, 'tenancy')
			// GHOST_CODE → unreachable 500; ZOMBIE_CODE → dead entry. COHERENT_CODE, the identifier
			// members (BaseDomainErrors, never) and the commented decoy must NOT appear in either list.
			expect(diff).toEqual({ unreachable: ['GHOST_CODE'], dead: ['ZOMBIE_CODE'] })

			// Missing-file semantics pinned: a context without errors/index.ts is trivially coherent.
			expect(diffContext(tmpRoot, 'ghost-context')).toEqual({ unreachable: [], dead: [] })
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})
})
