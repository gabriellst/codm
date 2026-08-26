/**
 * strip-comments.ts — blank out PROSE so a scanner reads code, not commentary.
 *
 * Lifted verbatim (behaviour unchanged) from `scripts/detectors/gate-vacuity.ts`, which needed
 * exactly this and grew it first. It moved because two more scanners need it: `classify-edit-core`
 * (the PostToolUse edit hook plus its CLI) and `registry-scan` (the repo-wide batch). Three copies
 * of a character-level state machine is how they drift apart, and a drift here is silent — the
 * scanners would simply disagree about what counts as code.
 *
 * ── WHY THE SCANNERS NEED IT ─────────────────────────────────────────────────────────────────────
 *
 * The registries' whole method is to NAME the forbidden form. A skill playbook, a bad-practice
 * `wrong:` block, a docblock explaining why a cast was removed — every one of them spells the
 * literal string the rule detects. A scanner reading raw text therefore punishes the person
 * documenting the debt by its own name. Measured three times in this family: a docblock citing the
 * banned shape re-flagged as a fresh violation, and the doctrine that grew around it was "don't
 * spell it out in a comment" — the exact opposite of the doctrine the registries are for.
 *
 * ── WHAT SURVIVES THE STRIP, AND WHY ─────────────────────────────────────────────────────────────
 *
 * A comment the toolchain ACTS ON is not prose; it is code wearing a comment's clothes.
 * `@ts-expect-error` changes what tsc compiles. `eslint-disable` and `biome-ignore` change what the
 * linters report. Blanking those would silently disarm three of the six universal rules
 * (`ts-ignore`, `ts-expect-error`, `eslint-disable`), whose targets can ONLY appear in a comment —
 * a strip that makes the gate weaker in the name of making it fairer. So directive comments are
 * preserved verbatim.
 *
 * Sanctioned-exception MARKERS (`// TODO(stub): unblocked by …`, which the `query` registry reads
 * as a `detect_skip`) are a different mechanism and are NOT this function's job: the rule engine
 * evaluates `detect` against the stripped code and `detect_skip` against the original text, for
 * the reasons written on `ruleMatches` in `.claude/hooks/classify-edit-core.ts`.
 *
 * Offsets are preserved throughout: comments become spaces, newlines are kept. Callers can match
 * against the stripped text and still report the line number and excerpt from the ORIGINAL.
 */

/**
 * A comment the toolchain reads. Preserved verbatim by `stripProse` — see the header.
 *
 * Deliberately a short, closed list of things that ACT, not a general "looks important" heuristic.
 * Each entry earns its place by having a consumer in this repo: tsc (`@ts-*`), eslint
 * (`eslint-disable`), biome (`biome-ignore`), prettier (`prettier-ignore`) and the coverage tools
 * (`istanbul`/`c8`/`v8 ignore`). Nothing here is on the list for being "important-looking".
 */
const DIRECTIVE_RE = /@ts-(?:ignore|expect-error|nocheck)|eslint-disable|biome-ignore|prettier-ignore|(?:istanbul|c8|v8) ignore/

/**
 * 'js' (default): `"`, `'` and `` ` `` all treat `\` as an escape — a `` \` `` inside a template
 * literal does not close it. 'go': `"..."` (interpreted string) and `'...'` (rune) still escape via
 * `\` exactly like js, but `` `...` `` is Go's RAW string literal — `\` is a literal byte inside it,
 * never an escape, and the literal closes on the very NEXT backtick unconditionally (Go's own spec
 * forbids a backtick from appearing inside one at all, so "next backtick always closes" is exact,
 * not a heuristic). Raw strings may also span multiple lines. See `stripCLikeComments` for why this
 * matters (L5-r3-1).
 */
export type CommentDialect = 'js' | 'go'

/**
 * ── JS REGEX LITERALS (r10-1, MW-23) ─────────────────────────────────────────────────────────────
 *
 * Both state machines below were blind to regex literals, and both failure modes were proved
 * end-to-end against real repo files: `\//` at the END of a literal (`/^(pt|en)\//`) reads as a
 * line-comment opener and blanks real code on the same line (false NEGATIVE — a planted `as unknown`
 * was swallowed), and a quote INSIDE a char class (`/['"]/g`) opens a phantom string with no newline
 * recovery in `stripCLikeComments`, so real comments for the rest of the file stop being recognized
 * (false POSITIVE — a finding fired against prose).
 *
 * The cure is the classic lexer heuristic for the `/`-is-regex-or-division ambiguity, applied by the
 * two helpers below. `regexLiteralCanOpenAt` answers "may a regex literal start here?" from the last
 * significant token; `scanRegexLiteralEnd` walks the candidate to its close (escapes, char classes,
 * flags) and REFUSES candidates with no close before the newline — a JS regex cannot span lines, so
 * a heuristic misfire can never eat past EOL: the `/` falls back to plain division.
 *
 * Dialect-gated: Go has NO regex literal (a `/` in Go is division or a comment opener, nothing
 * else), so `{ dialect: 'go' }` never consults these helpers — the go branch stays byte-for-byte the
 * pre-MW-23 machine.
 */
/**
 * `of` is DELIBERATELY absent (r11-lex-2, `.specs/2026-08-12-varredura-rodada11.md`, MW-25) even
 * though it reads like `in`/`instanceof`: unlike those, `of` is not a JS reserved word at all — it
 * is only a CONTEXTUAL keyword inside `for (... of ...)`. `const of = 10; of / realCall('x') / 2`
 * is legal JS where `of` is a plain identifier in operand position, so treating it as a
 * regex-operand keyword misreads that `/` as a regex opener. See the REGEX_OPERAND_CHARS comment
 * below for why that misreading is the wrong bias to keep on an undecidable case.
 */
const REGEX_OPERAND_KEYWORDS = new Set([
	'return',
	'typeof',
	'instanceof',
	'in',
	'new',
	'delete',
	'void',
	'case',
	'do',
	'else',
	'yield',
	'await',
])

/**
 * After any of these a `/` starts an OPERAND — so a regex literal, not division.
 *
 * `>` is bare-absent from this flat list — see `regexLiteralCanOpenAt`'s dedicated `>` branch for why
 * it needs a one-char lookbehind instead of a flat membership test. `<` stays here (see
 * `regexLiteralCanOpenAt`'s JSX carve-out and its own comment for why `<` legitimately precedes a
 * regex, e.g. `x < /re/.test(s)`).
 *
 * ── THE `>` STORY, TWO ROUNDS ────────────────────────────────────────────────────────────────────
 *
 * Round 11 (r11-lex-1, `.specs/2026-08-12-varredura-rodada11.md`, MW-25) removed `>` outright: a
 * closing `>` is lexically ambiguous between a TS/TSX generic close (`Array<number>`, `calc<T>()`)
 * and a comparison operator (`x > y`) — nothing in a character-level scan can tell them apart from
 * the bare character alone. `Array<number>/calc(x)/2` is real code where the `/` after `>` is
 * division, not a regex opener; reading it as a regex swallows `calc(x)` into the "pattern" and
 * blanks it out of `sourceViews`'s `mask` — a live consumer (~10 rails) loses real code from its
 * structural view.
 *
 * Round 12 (r12-a, MW-27) found that removal too blunt: `=>`'s LAST character is also `>`, so the
 * same blanket exclusion mis-read every arrow-returns-regex expression — a real, common idiom this
 * repo's own `scripts/graph` adapters use (`facts.funcs.find(f => /^New/.test(f.name))`) — as
 * division. Unlike bare `>`, `=>` IS lexically decidable with exactly one lookbehind char: `=`
 * immediately before `>` can only be an arrow, never a generic close or a comparison. So
 * `regexLiteralCanOpenAt` special-cases `>`: look one char further back — `=` means arrow (operand
 * position, regex permitted, carved back IN), anything else means generic-close/comparison (division,
 * unchanged from round 11).
 *
 * ── WHY DIVISION IS STILL THE RIGHT DEFAULT ON WHAT'S LEFT ──────────────────────────────────────────
 *
 * `of` (see REGEX_OPERAND_KEYWORDS) and bare `>` (generic-close/comparison, now excluding `=>`) stay
 * lexically undecidable without a real parser — no lookbehind resolves them, so the bias is still
 * chosen by which misfire is cheaper THERE. But the old claim that "the division reading never
 * consumes anything" is not the reason, and it is not even true in general: r12-a is exactly a case
 * where the division reading, by walking the misread regex's own body as ordinary code, hit a `//`
 * inside it and opened a REAL comment that ate everything after — division can absolutely consume
 * code when the skipped-over span itself contains `//` or `/*`. The real reason division is the
 * correct bias for `of`/bare-`>` specifically is that a regex is implausible right after either in
 * real code — the same reading a real JS/TS parser would also produce there — so the misfire is rare
 * to begin with, not that it is free when it happens. `=>` is precisely the position where that
 * "implausible" premise breaks down (a trailing regex is common and legitimate), which is why it gets
 * its own operand-position carve-in instead of sharing the `of`/`>` division default.
 */
const REGEX_OPERAND_CHARS = '=(,[{;:!&|?+-*%^~<'

/**
 * May a regex literal open at index `end` of `processed`? `processed` is the machine's own already-
 * walked view (comments blanked to spaces, strings/regexes kept), so a decoy inside a comment can
 * never vote. Scans BACKWARD to the last significant char: operand-permitting punctuation or an
 * operand-position keyword ⇒ regex; identifier, number, `)`, `]`, a closed string/template (its
 * closing quote is what the scan sees), or start-of-nothing-permitting context ⇒ division. Start of
 * input ⇒ regex (a statement may open with one).
 *
 * Three deliberate carve-outs from the raw char list:
 *   - `</` ADJACENT (no whitespace) is a JSX closing tag — `</div>` in every .tsx/.astro file the
 *     scanners feed — never a regex opener. `< /re/.test(s)` (spaced) still permits a regex.
 *   - `++`/`--` immediately before the slash are POSTFIX (`i++ / 2`): the operand is the incremented
 *     value, so the slash is division.
 *   - `>` gets its OWN one-char lookbehind instead of the flat `REGEX_OPERAND_CHARS` test: `=>`
 *     (arrow, operand position, regex permitted) and bare `>` (generic-close/comparison, division)
 *     share a last character but are otherwise lexically distinct — see the REGEX_OPERAND_CHARS
 *     comment for the r11/r12 story behind this split (r12-a, MW-27).
 */
function regexLiteralCanOpenAt(processed: readonly string[], end: number): boolean {
	if (processed[end - 1] === '<') return false // JSX closing tag `</…>`
	let j = end - 1
	while (j >= 0) {
		const ch = processed[j] as string
		if (ch !== '' && !/\s/.test(ch)) break
		j--
	}
	if (j < 0) return true // start of input
	const ch = processed[j] as string
	if (ch === '>') {
		// `=` immediately before `>` can only be an arrow (`=>`) — never a generic close or a
		// comparison — so this one lookbehind char is enough to decide, unlike the undecidable bare
		// `>` case the REGEX_OPERAND_CHARS comment documents (r12-a, MW-27).
		return processed[j - 1] === '='
	}
	if (REGEX_OPERAND_CHARS.includes(ch)) {
		if ((ch === '+' || ch === '-') && processed[j - 1] === ch) return false // postfix ++/--
		return true
	}
	if (!/[A-Za-z0-9_$]/.test(ch)) return false
	let start = j
	while (start >= 0 && /[A-Za-z0-9_$]/.test(processed[start] as string)) start--
	// A property named like a keyword (`x.return / 2`) is a value, not a keyword.
	if (start >= 0 && processed[start] === '.') return false
	return REGEX_OPERAND_KEYWORDS.has(processed.slice(start + 1, j + 1).join(''))
}

/**
 * Walks the regex literal opening at `source[start]` (`=== '/'`): `\` escapes the next char, `[…]`
 * is a char class where `/` does not close, the first unescaped `/` outside a class closes, then
 * `[a-z]*` flags. Returns the index one PAST the last consumed char (close or last flag) — or `-1`
 * when no close exists before the newline/EOF, which means the candidate was never a regex at all.
 */
function scanRegexLiteralEnd(source: string, start: number): number {
	let inClass = false
	for (let i = start + 1; i < source.length; i++) {
		const c = source[i]
		if (c === '\n') return -1
		if (c === '\\') {
			if (source[i + 1] === '\n') return -1
			i++
			continue
		}
		if (inClass) {
			if (c === ']') inClass = false
			continue
		}
		if (c === '[') inClass = true
		else if (c === '/') {
			let end = i + 1
			while (end < source.length && /[a-z]/.test(source[end] as string)) end++
			return end
		}
	}
	return -1
}

/**
 * Does a `'`/`"` opened at `source[at]` have a matching, unescaped close before the next `\n` (or
 * EOF)? A single/double-quoted string never legitimately crosses a line in either JS or Go
 * (r12-item2, MW-27) — used as a lookahead GATE on opening quote state at all, rather than opening
 * unconditionally and hoping something later closes it. That reactive shape is what `sourceViews`
 * already does (it closes quote state ON `\n`, see its `c === state || (c === '\n' && state !== '\`')`
 * branch) — safe against permanent desync, but it can't rescue anything on the SAME corrupted line,
 * because by the time it reacts to the `\n` the damage for that line is already done. Gating at
 * OPEN-time instead means a decoy quote char — e.g. the apostrophe in `don't` sitting right after a
 * `/` that the division bias (see the REGEX_OPERAND_CHARS story above) correctly read as division —
 * never enters quote state in the first place, so a REAL `//` comment later on that same line is still
 * recognized normally. Not dialect-gated: Go's interpreted string (`"..."`) and rune (`'...'`) don't
 * cross lines either, same as JS — only backtick (JS template literal / Go raw string, both
 * legitimately multi-line) skips this gate entirely and opens unconditionally.
 */
function quoteClosesOnSameLine(source: string, at: number, quote: '"' | "'"): boolean {
	for (let i = at + 1; i < source.length; i++) {
		const c = source[i]
		if (c === '\n') return false
		if (c === '\\') {
			i++
			continue
		}
		if (c === quote) return true
	}
	return false
}

/**
 * Blank out `//` and block comments, preserving every line and column so positions stay true.
 *
 * `dialect` (see `CommentDialect`) controls ONLY string-escape semantics for the quote characters —
 * comment syntax (`//`, `/* *\/`) is identical either way. Default 'js' is byte-for-byte the
 * original behaviour; consumers reading Go source (`support/go-config-source.ts`,
 * union-parity.test.ts's `goDeclares`) pass `{ dialect: 'go' }` so a raw string like `` `C:\` `` — a
 * literal backslash immediately before the closing backtick — cannot desync the state machine and
 * leave the rest of the file's comments un-stripped (L5-r3-1, `.specs/2026-08-12-varredura-rodada3.md`).
 * One state machine, one loop — the dialect only changes what the quote-handling branch does when
 * the open quote is a backtick, and (r10-1, MW-23) whether a `/` may open a JS regex literal at all.
 *
 * A recognized regex literal is PRESERVED verbatim, like a string — this function only blanks
 * comments; what dies is the MISREADING (`\//` at a literal's end as a line-comment opener, a quote
 * inside its char class as a string opener). See the helpers above for the heuristic and its bail-out.
 */
export function stripCLikeComments(source: string, opts?: { dialect?: CommentDialect }): string {
	const goRawStrings = opts?.dialect === 'go'
	const jsRegexLiterals = opts?.dialect !== 'go' // Go has no regex literal — heuristic never consulted
	const out = source.split('')
	let quote: string | null = null
	let inLine = false
	let inBlock = false
	for (let i = 0; i < source.length; i++) {
		const c = source[i]
		const next = source[i + 1]
		if (inLine) {
			if (c === '\n') inLine = false
			else out[i] = ' '
			continue
		}
		if (inBlock) {
			if (c === '*' && next === '/') {
				out[i] = ' '
				out[i + 1] = ' '
				i++
				inBlock = false
			} else if (c !== '\n') out[i] = ' '
			continue
		}
		if (quote) {
			// Escapes matter only so a `\"` does not close the string early — EXCEPT a Go raw string
			// (backtick under `dialect: 'go'`), which has no escape at all: `\` is a literal byte, and
			// the string closes on the very next backtick no matter what precedes it (L5-r3-1).
			if (quote === '`' && goRawStrings) {
				if (c === quote) quote = null
				continue
			}
			if (c === '\\') i++
			else if (c === quote) quote = null
			continue
		}
		if (c === '`') {
			quote = c
			continue
		}
		if (c === '"' || c === "'") {
			// Gate: only enter quote state if this quote actually closes before the line ends (r12-item2,
			// MW-27) — see `quoteClosesOnSameLine`'s docblock. If it doesn't, this is a decoy — fall
			// through as an ordinary character, no state change.
			if (quoteClosesOnSameLine(source, i, c)) quote = c
			continue
		}
		if (c === '/' && next === '/') {
			out[i] = ' '
			inLine = true
			continue
		}
		if (c === '/' && next === '*') {
			out[i] = ' '
			out[i + 1] = ' '
			i++
			inBlock = true
			continue
		}
		if (c === '/' && jsRegexLiterals && regexLiteralCanOpenAt(out, i)) {
			// `out` already holds the original chars, so "preserve verbatim" is just: consume the
			// literal in one hop. No close before EOL ⇒ not a regex ⇒ the `/` stays a plain division
			// char and the loop moves on unharmed.
			const end = scanRegexLiteralEnd(source, i)
			if (end !== -1) i = end - 1
		}
	}
	return out.join('')
}

/**
 * Blank out `#` comments. A `#` only opens a comment at line start or after whitespace and outside
 * quotes — which leaves `${VAR#suffix}`, `$#` and `--flag#x` alone.
 */
export function stripHashComments(source: string): string {
	return source
		.split('\n')
		.map(line => {
			let quote: string | null = null
			for (let i = 0; i < line.length; i++) {
				const c = line[i]
				if (quote) {
					if (c === '\\') i++
					else if (c === quote) quote = null
					continue
				}
				if (c === '"' || c === "'") {
					quote = c
					continue
				}
				if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i)
			}
			return line
		})
		.join('\n')
}

/**
 * The scanner-facing entry point: code with prose blanked, directives kept, offsets intact.
 *
 * Directive preservation is LINE-granular, and that is the honest scope rather than a shortcut.
 * Restoring a whole original line is exact by construction (same content ⇒ same length ⇒ every
 * later offset unmoved), and a line like `const x = f() // eslint-disable-next-line` has code on
 * it that was never stripped anyway. The cost is narrow and named: a line of pure prose that
 * happens to quote a directive (`// never reach for @ts-expect-error here`) stays visible to the
 * scanners. That is the one case where citing the form still flags — preferable to the
 * alternative, which is a directive that no longer fires because someone put it in a comment,
 * which is the only place a directive can be.
 */
export function stripProse(source: string): string {
	const stripped = stripCLikeComments(source)
	if (!DIRECTIVE_RE.test(source)) return stripped

	const original = source.split('\n')
	const result = stripped.split('\n')
	for (let i = 0; i < original.length; i++) {
		const line = original[i]
		if (line !== undefined && DIRECTIVE_RE.test(line)) result[i] = line
	}
	return result.join('\n')
}

/**
 * Strip `//` and `/* *\/` comments from JSONC, STRING-AWARE. `stripCLikeComments` above is line/block
 * regex-only, which is exactly wrong for a `tsconfig.json`: its own `paths`/`include` values are glob
 * patterns (`"./src/*"`, `"src/**\/*.ts"`) that contain `/*` as ordinary string content, not comment
 * syntax — the regex stripper reads the first `/*` inside a string as a block-comment OPEN and eats
 * everything up to the next unrelated `*\/`, corrupting the JSON (measured: it silently mangled
 * `packages/api/typescript/tsconfig.json`'s `paths` block on the first run of the barrel-liveness
 * alias resolver this was lifted from — S4 T4; the alias fixture in scripts/barrel-liveness.test.ts
 * still carries the regression case). This walks the source char-by-char, tracking whether it is
 * inside a string literal, and only treats `//` / `/* *\/` as comments outside one.
 */
export function stripJsonComments(source: string): string {
	let out = ''
	let inString = false
	let escaped = false
	for (let i = 0; i < source.length; i++) {
		const ch = source[i] as string
		if (inString) {
			out += ch
			if (escaped) escaped = false
			else if (ch === '\\') escaped = true
			else if (ch === '"') inString = false
			continue
		}
		if (ch === '"') {
			inString = true
			out += ch
			continue
		}
		if (ch === '/' && source[i + 1] === '/') {
			while (i < source.length && source[i] !== '\n') i++
			out += '\n'
			continue
		}
		if (ch === '/' && source[i + 1] === '*') {
			i += 2
			while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++
			i++ // land on the closing '/', the loop's i++ then steps past it
			continue
		}
		out += ch
	}
	return out
}

/**
 * Two same-length views of a source: `blanked` = comment interiors replaced by spaces (string
 * literals kept — values stay readable at their original offsets); `mask` = comment interiors AND
 * string interiors blanked (only structure survives — brackets found here are real code brackets).
 * A JS regex literal (r10-1, MW-23) is treated AS a string by both views: `blanked` keeps its content
 * readable at its offsets, `mask` blanks the interior but keeps the two `/` delimiters and the flags
 * — so a quote or bracket inside a literal (`/['"}]/g`) can neither open a phantom string nor vote in
 * a bracket count. The old closed contract ("no regex literal contains a quote character or `//`")
 * is dead: the heuristic on `regexLiteralCanOpenAt`/`scanRegexLiteralEnd` handles both.
 *
 * `dialect` (see `CommentDialect`) mirrors `stripCLikeComments`'s option, on this SAME state machine
 * — no second copy of the loop. Default 'js' (byte-for-byte unchanged) treats backtick as a template
 * literal: `\` escapes (including a closing backtick), and `${…}` opens an interpolation. 'go' treats
 * backtick as Go's RAW string: no escape at all (`\` is a literal byte), no `${…}` interpolation, and
 * the string closes on the very next backtick unconditionally — exactly the semantics
 * `stripCLikeComments`'s `{ dialect: 'go' }` already gives comment-only stripping, now shared by
 * `mask`/`blanked` too, so a raw string like `` `C:\` `` cannot desync the state machine and leave
 * the rest of the file's comments AND strings un-masked (L5-r7-1, `.specs/2026-08-12-varredura-rodada7.md`).
 * `"..."` (interpreted string) and `'...'` (rune) keep escaping via `\` exactly like js either way.
 *
 * Template literals nest: `` `a ${ `b` } c` `` opens a SECOND template inside the first one's
 * interpolation. `templateStack` holds one frame per currently-open template literal; `braceDepth`
 * on the top frame is 0 while walking that template's literal text and ⩾1 while inside its active
 * `${…}` (incremented/decremented by `{`/`}` seen in 'code' state, so an object literal's own braces
 * inside the interpolation — or a decoy `}` inside a nested string — don't get mistaken for the one
 * that closes it). `${` simply hands control to 'code' state: quotes, comments and a fresh backtick
 * (which pushes ANOTHER frame) inside the interpolation all get ordinary code handling for free —
 * only the `}` that returns the top frame's depth to 0 flips back to that frame's template text.
 * Under 'go' dialect this machinery is simply never triggered (no `${` means no re-entry into 'code'
 * from inside a backtick), which is what makes "no nesting, next backtick always closes" fall out for
 * free: a Go raw string containing a stray backtick-adjacent `` ` `` pair reduces to two independent
 * strings, never a nested one — the same reduction `union-parity.test.ts`'s `goDeclares` relies on.
 */
export function sourceViews(source: string, opts?: { dialect?: CommentDialect }): { blanked: string; mask: string } {
	const goRawStrings = opts?.dialect === 'go'
	const jsRegexLiterals = opts?.dialect !== 'go' // Go has no regex literal — heuristic never consulted
	const blanked: string[] = []
	const mask: string[] = []
	let state: 'code' | 'line' | 'block' | "'" | '"' | '`' = 'code'
	const templateStack: { braceDepth: number }[] = []
	for (let i = 0; i < source.length; i++) {
		const c = source[i] as string
		const next = source[i + 1]
		const keep = c === '\n' ? '\n' : ' '
		const inGoRawString = state === '`' && goRawStrings
		if (state === 'code') {
			if (c === '/' && (next === '/' || next === '*')) {
				state = next === '/' ? 'line' : 'block'
				blanked.push(' ', ' ')
				mask.push(' ', ' ')
				i++
			} else if (c === '/' && jsRegexLiterals && regexLiteralCanOpenAt(blanked, blanked.length)) {
				// r10-1 (MW-23): a regex literal is a STRING to the two views — `blanked` keeps its
				// content readable, `mask` keeps only the delimiters and flags (structure) and blanks
				// the interior, so a quote/bracket/brace inside the literal can neither open a phantom
				// string nor vote in a bracket count (a `}` in a char class must not close a `${…}`).
				// `blanked.length` is exactly `i` here (1 element per consumed source char), so the
				// backward token scan runs over this machine's own already-walked view.
				const end = scanRegexLiteralEnd(source, i)
				if (end === -1) {
					// No close before EOL — not a regex, just a division slash: ordinary code char.
					blanked.push(c)
					mask.push(c)
				} else {
					let close = end - 1
					while (source[close] !== '/') close-- // walk back over the flags to the closing `/`
					for (let k = i; k < end; k++) {
						const ck = source[k] as string
						blanked.push(ck)
						mask.push(k === i || k >= close ? ck : ' ')
					}
					i = end - 1
				}
			} else {
				if (c === "'" || c === '"' || c === '`') {
					state = c
					if (c === '`') templateStack.push({ braceDepth: 0 })
				} else if (templateStack.length > 0) {
					const top = templateStack[templateStack.length - 1] as { braceDepth: number }
					if (c === '{') top.braceDepth++
					else if (c === '}') {
						top.braceDepth--
						if (top.braceDepth === 0) state = '`'
					}
				}
				blanked.push(c)
				mask.push(c)
			}
		} else if (state === 'line' || state === 'block') {
			const closes = state === 'line' ? c === '\n' : c === '*' && next === '/'
			if (closes && state === 'line') {
				state = 'code'
				blanked.push('\n')
				mask.push('\n')
			} else if (closes) {
				state = 'code'
				blanked.push(' ', ' ')
				mask.push(' ', ' ')
				i++
			} else {
				blanked.push(keep)
				mask.push(keep)
			}
		} else if (c === '\\' && !inGoRawString) {
			// A Go raw string has no escape at all (see the docblock above) — `\` inside one falls
			// through to the ordinary-content branch at the bottom instead, one char at a time.
			blanked.push(c, next ?? '')
			mask.push(' ', ' ')
			i++
		} else if (state === '`' && !goRawStrings && c === '$' && next === '{') {
			// Opens THIS template's interpolation — hand control back to 'code'. The `{` right after
			// is processed next iteration by the branch above, which sees the frame at depth 0 and
			// bumps it to 1, so there is exactly one place that increments braceDepth, not two.
			// Go raw strings have no interpolation at all (`!goRawStrings` above), so `$`/`{` inside
			// one are ordinary content — never reached, falls through to the last branch below.
			state = 'code'
			blanked.push(c)
			mask.push(c)
		} else if (c === state || (c === '\n' && state !== '`')) {
			if (state === '`') templateStack.pop()
			state = 'code'
			blanked.push(c)
			mask.push(c)
		} else {
			blanked.push(c)
			mask.push(keep)
		}
	}
	return { blanked: blanked.join(''), mask: mask.join('') }
}
