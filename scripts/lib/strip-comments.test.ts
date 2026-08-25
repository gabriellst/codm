import { describe, expect, it } from 'bun:test'
import { sourceViews, stripCLikeComments, stripHashComments, stripJsonComments, stripProse } from './strip-comments'

describe('stripProse', () => {
	it('blanks prose while preserving every offset, so line/column stay true', () => {
		const source = ['// never write `as any` here', 'const ok = 1', '/* as unknown */', 'const b = 2'].join('\n')
		const out = stripProse(source)

		expect(out).not.toContain('as any')
		expect(out).not.toContain('as unknown')
		expect(out.length).toBe(source.length)
		expect(out.split('\n').length).toBe(source.split('\n').length)
		expect(out).toContain('const ok = 1')
		expect(out).toContain('const b = 2')
	})

	it('keeps directives — a comment the toolchain acts on is code, not prose', () => {
		const source = [
			'// @ts-ignore',
			'/* eslint-disable no-console */',
			'// biome-ignore lint/suspicious/noExplicitAny: schema record is app-defined',
			'// @ts-expect-error',
		].join('\n')

		expect(stripProse(source)).toBe(source)
	})

	it('keeps the directive line only — prose around it in the same block still goes', () => {
		const source = ['/**', ' * A docblock mentioning `as any` in passing.', ' */', '// @ts-ignore', 'const x = 1'].join('\n')
		const out = stripProse(source)

		expect(out).not.toContain('as any')
		expect(out).toContain('@ts-ignore')
	})

	it('does not mistake a string literal for a comment', () => {
		const source = [`const url = 'https://example.test/x' // as any`, `const s = "/* not a comment */"`].join('\n')
		const out = stripProse(source)

		expect(out).toContain(`'https://example.test/x'`)
		expect(out).toContain(`"/* not a comment */"`)
		expect(out).not.toContain('as any')
	})

	it('leaves a file with no comments byte-identical', () => {
		const source = 'export const x = 1\nexport const y = x\n'
		expect(stripProse(source)).toBe(source)
	})
})

describe('stripCLikeComments / stripHashComments (moved here from gate-vacuity)', () => {
	it('stripCLikeComments blanks line and block comments', () => {
		expect(stripCLikeComments('a // b\nc /* d */ e').replace(/ +/g, ' ')).toBe('a \nc e')
	})

	it('stripHashComments only opens a comment at line start or after whitespace', () => {
		expect(stripHashComments('echo ${VAR#suffix}')).toBe('echo ${VAR#suffix}')
		// Slices AT the `#`, so the separating space survives — behaviour carried over unchanged.
		expect(stripHashComments('echo hi # a comment')).toBe('echo hi ')
		expect(stripHashComments('# whole line')).toBe('')
	})
})

/**
 * L5-r3-1 (`.specs/2026-08-12-varredura-rodada3.md`, via go-config-source + union-parity's
 * `goDeclares`): `stripCLikeComments` treated backtick with JS template-literal escape semantics —
 * `\` escapes the next character, including a closing backtick. Go's raw string literal (also
 * backtick-delimited) has NO escape at all: `\` is a literal byte and the literal closes on the
 * very NEXT backtick, unconditionally — Go's own spec forbids a backtick from appearing inside one
 * at all, so "next backtick always closes" is exact, not a heuristic. Reading a Go raw string under
 * JS rules desyncs the state machine: a trailing `` `C:\` `` never finds its close, so "inside a
 * string" never turns back off, and EVERY comment for the rest of the file goes un-stripped — a
 * banned string quoted only in a real comment survives (false-red for a scanner expecting it gone)
 * and a struct name cited only inside a `/* *\/` block resolves as if it were live code (false-GREEN
 * for union-parity's `goDeclares`).
 *
 * Fixed as a `dialect` option on the SAME state machine — no second copy of the loop. 'js' (the
 * default, byte-for-byte unchanged) keeps escaping all three quote kinds; 'go' keeps `"..."`
 * (interpreted string) and `'...'` (rune) escaping via `\` exactly like js, but treats a backtick as
 * Go's raw string: no escape, closes on the very next backtick, may span multiple lines.
 */
describe('stripCLikeComments — go dialect: backtick is a Go RAW STRING, not a JS template literal (L5-r3-1)', () => {
	it('a trailing `\\` before the closing backtick does not swallow the next comment — go dialect strips it, default (js) dialect does not', () => {
		const source = ['var p = `C:\\`', '// comment with getEnvOrDefault("PHANTOM", "x")'].join('\n')

		const go = stripCLikeComments(source, { dialect: 'go' })
		expect(go).not.toContain('PHANTOM')
		expect(go).toContain('var p = `C:\\`')

		// Same source, default (js) dialect: the backslash "escapes" the closing backtick, the raw
		// string never closes, and the comment after it is read as still being INSIDE the unclosed
		// string — so it survives the strip untouched. This is the bug L5-r3-1 names.
		const js = stripCLikeComments(source)
		expect(js).toContain('PHANTOM')
	})

	it('a raw string spanning multiple lines keeps its literal `\\` — including one right before the close — and the real close still ends it', () => {
		const source = ['const winPath = `C:\\Users\\', 'name\\` // getEnvOrDefault("PHANTOM_MULTI", "x")'].join('\n')
		const out = stripCLikeComments(source, { dialect: 'go' })
		expect(out).toContain('C:\\Users\\')
		expect(out).toContain('name\\`')
		expect(out).not.toContain('PHANTOM_MULTI')
		// Offsets preserved: same length, same line count.
		expect(out.length).toBe(source.length)
		expect(out.split('\n').length).toBe(source.split('\n').length)
	})

	it('a double-quoted string with an escaped quote is unaffected — only backtick loses its escape in go dialect', () => {
		const source = ['s := "quoted \\" with escape"', '// trailing comment after the real close'].join('\n')
		const out = stripCLikeComments(source, { dialect: 'go' })
		expect(out).toContain('s := "quoted \\" with escape"')
		expect(out).not.toContain('trailing comment')
	})

	it('`//` inside a raw string is literal content, not a line-comment opener', () => {
		const source = 'const u = `https://example.test/x`\nconst v = 2'
		const out = stripCLikeComments(source, { dialect: 'go' })
		expect(out).toContain('`https://example.test/x`')
		expect(out).toContain('const v = 2')
	})
})

/**
 * r10-1 (`.specs/2026-08-12-varredura-rodada10.md`, MW-23): the two state machines had NO notion of
 * a JS regex literal, and both failure modes were proved end-to-end against real repo files:
 *
 *   (a) FALSE NEGATIVE — a regex ending in `\//` (`/^(pt|en)\//`, the real
 *       `packages/app/astro/src/pages/[locale]/blog/[...slug].astro:9` shape): the escaped slash
 *       sitting against the closing delimiter reads as `//` to the char-pair comment detector, which
 *       blanks the REST OF THE REAL LINE — a planted `as unknown` after the regex was swallowed by
 *       classify-edit-core's real scanFile.
 *   (b) FALSE POSITIVE — a quote inside a regex char class (`/['"]/g`, the real
 *       `packages/e2e/demo/render-svg.ts:276` shape) opens a phantom string; `stripCLikeComments`
 *       has no newline recovery for strings, so the desync persists to EOF and REAL comments stop
 *       being recognized — a finding fired against prose.
 *
 * The fix teaches both machines the classic lexer regex-vs-division heuristic: a `/` opens a regex
 * literal iff the last significant token permits an OPERAND (after `= ( , [ { ; : ! & | ? + - * % ^
 * ~ <`, after the operand-position keywords, at start of input); after an identifier, number, `)`,
 * `]` or a closed string/template it is division. Inside the literal: `\` escapes, `[...]` is a char
 * class where `/` does not close, the first unescaped `/` outside a class closes, `[a-z]*` flags
 * follow. A candidate with no close before the newline is NOT a regex (JS regexes cannot span lines)
 * — the `/` falls back to plain division, so a heuristic misfire can never eat past EOL.
 * `stripCLikeComments` preserves the literal verbatim (it only blanks comments — what dies is the
 * MISREADING); `sourceViews` masks the interior like a string (delimiters and flags survive in
 * `mask`, content is kept in `blanked` — the string contract). The 'go' dialect is untouched: Go has
 * no regex literal, so its `/` is only ever division or a comment opener.
 */
describe('stripCLikeComments — js regex literals (r10-1, MW-23)', () => {
	it('r10-1a: a regex ending in `\\//` is not a line-comment opener — code after it on the same line survives', () => {
		// Replica of the real [...slug].astro:9 line, with the planted `as unknown` that the round-10
		// end-to-end proof showed being swallowed by classify-edit-core's scanFile.
		const source = [
			"const slugOf = (id: string) => id.replace(/^(pt|en)\\//, '').replace(/\\.mdx?$/, '') as unknown",
			'const next = 1',
		].join('\n')
		// No comment anywhere in the source — the strip must be byte-identical, not merely "similar".
		expect(stripCLikeComments(source)).toBe(source)
	})

	it("r10-1b: quotes inside a regex char class don't open a phantom string — a REAL comment lines later is still stripped", () => {
		// Replica of the real render-svg.ts:276 shape, plus a real comment a few lines further down —
		// the one the round-10 proof showed firing a finding against prose.
		const source = [
			'function resolveRealFontName(cssFamily: string): string {',
			"\treturn cssFamily.split(',')[0].replace(/['\"]/g, '').trim()",
			'}',
			'const filler = 1',
			'// PROSE quoting the banned shape: never write `as any` here',
			'const after = 2',
		].join('\n')
		const out = stripCLikeComments(source)
		expect(out).not.toContain('as any')
		expect(out).toContain(`/['"]/g`)
		expect(out).toContain('const after = 2')
		expect(out.length).toBe(source.length)
	})

	it('division stays division: chained, after `)`, and with a trailing comment', () => {
		const s1 = 'const x = a / b / c'
		expect(stripCLikeComments(s1)).toBe(s1)

		const out2 = stripCLikeComments('const y = 4 / 2; // comment')
		expect(out2).toContain('const y = 4 / 2;')
		expect(out2).not.toContain('comment')

		const out3 = stripCLikeComments('const r = (total)/(count) // note')
		expect(out3).toContain('(total)/(count)')
		expect(out3).not.toContain('note')
	})

	it('a regex in return position is a regex — `.test(` after it survives byte-identical', () => {
		const source = 'function f(s: string) { return /^re$/.test(s) }'
		expect(stripCLikeComments(source)).toBe(source)
	})

	it('the unresolvable ASI shape reads as division — `x = x / 2` then a /shape?/ line, nothing eaten', () => {
		// After a number the heuristic says DIVISION — the classic lexer bias. The point of the fixture
		// is not which reading wins but that NEITHER reading may eat code or open a phantom comment.
		const source = ['x = x / 2', '/vira?/.test(s)'].join('\n')
		expect(stripCLikeComments(source)).toBe(source)
	})

	it('a regex with escaped slashes inside — /https:\\/\\// — does not open a line comment mid-literal', () => {
		const source = 'const isUrl = /https:\\/\\//.test(s) // trailing comment'
		const out = stripCLikeComments(source)
		expect(out).toContain('/https:\\/\\//.test(s)')
		expect(out).not.toContain('trailing comment')
	})

	it('multi-char-class regex /[\'"]([^\'"]+)[\'"]/ survives verbatim and string state stays coherent after it', () => {
		const source = ['const m = v.match(/[\'"]([^\'"]+)[\'"]/)', "const s = 'after' // real comment"].join('\n')
		const out = stripCLikeComments(source)
		expect(out).toContain(`/['"]([^'"]+)['"]/`)
		expect(out).toContain("'after'")
		expect(out).not.toContain('real comment')
	})

	it('template literal with slashes inside stays untouched — regex handling never reaches string interiors', () => {
		const out = stripCLikeComments('const p = `a/${x}/b` // comment')
		expect(out).toContain('`a/${x}/b`')
		expect(out).not.toContain('comment')
	})

	it('JSX closing tags: `</div>` is not a regex opener — a following real comment still dies', () => {
		// `<` is in the operand-permitting set (a regex may legally follow `x < /re/.test(s)`), but the
		// ADJACENT pair `</` is a JSX closing tag in every .tsx/.astro file the scanners feed — the one
		// deliberate carve-out from the classic heuristic: `<` immediately against `/` reads as JSX.
		const source = ['return <div>{a / b}</div> // note', 'const jsx = <span>x</span> <em>y</em>'].join('\n')
		const out = stripCLikeComments(source)
		expect(out).toContain('return <div>{a / b}</div>')
		expect(out).not.toContain('note')
		expect(out).toContain('<span>x</span> <em>y</em>')
	})

	it('go dialect: division and a // comment on the same line — behavior untouched', () => {
		const out = stripCLikeComments('avg := total / count // halve it', { dialect: 'go' })
		expect(out).toContain('avg := total / count')
		expect(out).not.toContain('halve it')
	})

	it("go dialect: a '/' in operand position is NEVER a regex opener — Go has no regex literal", () => {
		// Differential proof the heuristic is dialect-gated: on the same bytes, js reads `/a/` as a
		// regex literal (the `//` after it is division by a variable named b — preserved), while go
		// reads the char pair `//` as a comment opener and blanks the rest of the line.
		const source = 'v = /a// b'
		expect(stripCLikeComments(source)).toBe(source)
		const go = stripCLikeComments(source, { dialect: 'go' })
		expect(go).toContain('v = /a')
		expect(go).not.toContain(' b')
	})
})

describe('sourceViews — js regex literals (r10-1, MW-23)', () => {
	it('quotes inside a regex are masked string-like — delimiters and flags survive in mask, real trailing comment still dies', () => {
		const source = "const clean = s.replace(/['\"]/g, '').trim() // real comment"
		const { blanked, mask } = sourceViews(source)
		expect(blanked.length).toBe(source.length)
		expect(mask.length).toBe(source.length)
		// blanked keeps the literal's content readable at its offsets — the string contract.
		expect(blanked).toContain(`/['"]/g`)
		// mask blanks the INTERIOR only: `(/['"]/g,` → `(/    /g,` — delimiters and flags survive.
		expect(mask).toContain('(/    /g,')
		expect(blanked).not.toContain('real comment')
		expect(mask).not.toContain('real comment')
	})

	it('r10-1a shape: a regex ending in `\\//` does not open a comment — code after it stays code in both views', () => {
		const source = "const slug = id.replace(/^(pt|en)\\//, '') as unknown"
		const { blanked, mask } = sourceViews(source)
		expect(blanked.length).toBe(source.length)
		expect(mask.length).toBe(source.length)
		expect(blanked).toContain('as unknown')
		expect(mask).toContain('as unknown')
	})

	it('division with a trailing comment is untouched by the heuristic', () => {
		const source = 'const y = 4 / 2 // comment'
		const { blanked, mask } = sourceViews(source)
		expect(blanked).toContain('4 / 2')
		expect(mask).toContain('4 / 2')
		expect(blanked).not.toContain('comment')
		expect(mask).not.toContain('comment')
	})

	it('a regex inside `${}` masks its interior — a `}` inside its char class cannot close the interpolation early', () => {
		const source = 'const t = `x ${/[\'"}]/.test(v) ? a : b} y`'
		const { mask } = sourceViews(source)
		expect(mask.length).toBe(source.length)
		// Real code inside the interpolation survives as structure…
		expect(mask).toContain('test')
		// …and brace-counting reaches the REAL close: exactly one `{` (the `${`'s) and one `}` (the
		// interpolation's) — the `}` inside the regex char class is masked interior, never counted.
		expect((mask.match(/\{/g) ?? []).length).toBe(1)
		expect((mask.match(/\}/g) ?? []).length).toBe(1)
	})
})

/**
 * r11-lex-1/r11-lex-2 (`.specs/2026-08-12-varredura-rodada11.md`, MW-25): the MW-23 heuristic still had two
 * lexically-undecidable false positives in REGEX_OPERAND_CHARS/REGEX_OPERAND_KEYWORDS, both proved
 * end-to-end against `sourceViews`'s `mask` (the view ~10 rails read for real structure):
 *
 *   (a) `>` — a closing TS/TSX generic (`Array<number>`) is char-level indistinguishable from a
 *       comparison operator. `Array<number>/calc(x)/2` had its `/` after `>` read as a regex opener,
 *       swallowing `calc(x)` into the "pattern" — real code vanished from the mask.
 *   (b) `of` — NOT a real JS reserved word, only a CONTEXTUAL keyword inside `for (... of ...)`.
 *       `const of = 10; of / realCall('x') / 2` legally uses `of` as a plain identifier in operand
 *       position; treating it as a regex-operand keyword misread the following `/` the same way.
 *
 * Fixed by removing `>` from REGEX_OPERAND_CHARS (keeping `<` — see its own carve-out comment) and
 * `of` from REGEX_OPERAND_KEYWORDS. Both cases are undecidable without a real parser; DIVISION is the
 * correct bias because a wrong "division" call consumes nothing (every `/` is re-evaluated
 * independently — proven by (c) below), while a wrong "regex" call eats forward to the next `/` and
 * blanks/masks real code out from under a live consumer.
 */
describe('stripCLikeComments / sourceViews — regex-vs-division bias favors division on undecidable cases (r11-lex-1/r11-lex-2, MW-25)', () => {
	it('(a) a `/` right after a generic close `>` is division, not a regex opener — calc(x) survives in the mask, paren count preserved', () => {
		const source = 'type X<T> = T\nconst r = Array<number>/calc(x)/2'
		expect(stripCLikeComments(source)).toBe(source)

		const { mask } = sourceViews(source)
		expect(mask.length).toBe(source.length)
		expect(mask).toContain('calc(x)')
		expect((mask.match(/\(/g) ?? []).length).toBe((source.match(/\(/g) ?? []).length)
		expect((mask.match(/\)/g) ?? []).length).toBe((source.match(/\)/g) ?? []).length)
	})

	it('(b) `of` used as a plain identifier (not the for...of contextual keyword) does not force a regex reading on the `/` after it — realCall(...) survives in the mask', () => {
		const source = "const of = 10; const r2 = of / realCall('x') / 2"
		expect(stripCLikeComments(source)).toBe(source)

		const { mask } = sourceViews(source)
		expect(mask.length).toBe(source.length)
		// The call and its parens survive as real structure — only the STRING LITERAL's own interior
		// is masked, which is ordinary string-masking (the contract every other fixture in this file
		// relies on), not a regressed regex bug: `realCall('x')` → `realCall(' ')`.
		expect(mask).toContain("realCall(' ')")
	})

	it('(c) the accepted cost, proven harmless not merely different: `x > /re/.test(s) // comment` now reads the `/`s as division — the real comment still dies, and NOTHING before it is consumed (division never eats)', () => {
		const source = 'x > /re/.test(s) // comment'
		const out = stripCLikeComments(source)
		expect(out).not.toContain('comment')
		expect(out.length).toBe(source.length)
		// Byte-identical up to (and including) the space before the real comment — the division
		// misfire on `/re/` swallows nothing; only the genuine `// comment` at the end is blanked.
		expect(out.startsWith('x > /re/.test(s) ')).toBe(true)
	})

	it('(d) `for (const m of items) // comment` — removing `of` from the keyword set leaves normal for...of parsing untouched, and the real trailing comment still dies', () => {
		const source = 'for (const m of items) // comment\nconst next = 1'
		const out = stripCLikeComments(source)
		expect(out).toContain('for (const m of items)')
		expect(out).not.toContain('comment')
		expect(out).toContain('const next = 1')
	})

	// (e) regression: none of the MW-23 fixtures above anchor a regex on `>` or `of` — grepped for
	// `> /`, `of /`, `>/`, `of/` across this file; the only hit is `</div>` (JSX, gated by the
	// separate `<` ADJACENT carve-out in `regexLiteralCanOpenAt`, untouched by this change). No
	// existing fixture needed adjustment — see the MW-25 worker report for the grep evidence.
})

/**
 * r12-a (`.claude` desgambiarrar-harness rodada 12, MW-27, regression of MW-25): removing bare `>`
 * from REGEX_OPERAND_CHARS (r11-lex-1) also blinded the scanner to `=>` — whose LAST character is
 * also `>` — so an arrow function returning a regex literal (`x => /re/.test(x)`, a real idiom this
 * repo's own `scripts/graph` adapters use, e.g. `f => /^New/.test(f.name)`) started reading its `/` as
 * division. That misfire is NOT harmless the way the `of`/bare-`>` misfire is: walking the regex's own
 * body as ordinary code, an escaped-slash pair inside it (`\/\/`) reads as a real `//` comment opener
 * and blanks everything after it on that line — proven end-to-end pre/post-MW-25 (worked before,
 * broke after). Fixed with a one-char lookbehind on `>` in `regexLiteralCanOpenAt`: `=` immediately
 * before `>` can only be an arrow (never a generic close or a comparison), so `=>` is carved back IN
 * as an operand position while bare `>` (generic-close/comparison) stays division, unchanged from
 * round 11. See the REGEX_OPERAND_CHARS docblock for the full two-round story and the corrected claim
 * about why the division bias is safe on the cases that remain undecidable.
 */
describe('stripCLikeComments / sourceViews — `=>` (arrow) is carved back into operand position (r12-a, MW-27)', () => {
	it('the refutation probe: an arrow returning a regex with escaped slashes inside survives byte-identical — `.test(x)` is not swallowed by the escaped `\\/\\/` reading as a comment opener', () => {
		const source = 'arr.filter(x => /https:\\/\\//.test(x))'
		expect(stripCLikeComments(source)).toBe(source)

		const { mask } = sourceViews(source)
		expect(mask.length).toBe(source.length)
		expect(mask).toContain('.test(x)')
		// Paren balance preserved — nothing got eaten as a fake "pattern" nor as a fake comment.
		expect((mask.match(/\(/g) ?? []).length).toBe((source.match(/\(/g) ?? []).length)
		expect((mask.match(/\)/g) ?? []).length).toBe((source.match(/\)/g) ?? []).length)
	})

	it('MW-25 fixture stays intact: a `/` right after a generic close `>` (not an arrow) is still division — calc(x) survives', () => {
		const source = 'type X<T> = T\nconst r = Array<number>/calc(x)/2'
		expect(stripCLikeComments(source)).toBe(source)

		const { mask } = sourceViews(source)
		expect(mask).toContain('calc(x)')
		expect((mask.match(/\(/g) ?? []).length).toBe((source.match(/\(/g) ?? []).length)
		expect((mask.match(/\)/g) ?? []).length).toBe((source.match(/\)/g) ?? []).length)
	})

	it("(iii) `>=` was never broken by MW-25 and needs no code change here: the last SIGNIFICANT char before the `/` in `x >= /re/.test(s)` is `=`, not `>` — arrow's `=` comes BEFORE its `>` (`=>`), while comparison's `=` comes AFTER its `>` (`>=`), so the backward scan lands on `=` first and takes the existing REGEX_OPERAND_CHARS('=') branch, unaffected by the new `>`-lookbehind branch entirely", () => {
		const source = 'x >= /re/.test(s)'
		expect(stripCLikeComments(source)).toBe(source)
	})
})

/**
 * r12-item2 (MW-27): `sourceViews` already closes single/double-quoted string state on `\n` (strings
 * never legitimately cross a line in JS or Go), but `stripCLikeComments` did not — a decoy quote char
 * (e.g. the apostrophe in `don't`, exposed right after a `/` the division bias correctly reads as
 * division rather than a regex opener — see the REGEX_OPERAND_CHARS story) opens quote state with no
 * closing partner anywhere in the rest of the FILE, so the scanner stays "inside a string" forever:
 * not even a later, well-formed, unrelated comment gets stripped (proven:
 * `stripCLikeComments(source) === source`).
 *
 * Fixed with a lookahead GATE at quote-open time (`quoteClosesOnSameLine`) rather than a reactive
 * close-on-`\n`: a `'`/`"` only enters quote state if a matching, unescaped close exists before the
 * next newline. This is strictly stronger than a reactive close — it also rescues a REAL comment
 * sharing the SAME line as the decoy quote, which a reactive-only fix cannot (the reactive fix only
 * stops the corruption from bleeding into LATER lines). Not dialect-gated — Go's interpreted string
 * and rune don't cross lines either. Backtick (JS template literal / Go raw string) is exempt: both
 * are legitimately multi-line and keep opening unconditionally.
 */
describe('stripCLikeComments — newline recovery for `\'`/`"` quote state (r12-item2, MW-27)', () => {
	it('a decoy apostrophe (from a division-biased misread) no longer strands the scanner for the rest of the file — the trailing comment on the SAME line dies', () => {
		const source = ['const x = total / 2', "/don't-care/.test(s) // trailing", 'const y = 3'].join('\n')
		// RED (pre-fix): nothing stripped at all — `stripCLikeComments(source) === source`.
		const out = stripCLikeComments(source)
		expect(out).not.toBe(source)
		expect(out).not.toContain('trailing')
		expect(out).toContain("/don't-care/.test(s)")
		expect(out).toContain('const y = 3')
		expect(out.length).toBe(source.length)
		expect(out.split('\n').length).toBe(source.split('\n').length)
	})

	it('a real, unrelated comment on a LATER line still dies even when an earlier decoy quote never finds a same-line close', () => {
		// The leading `total / 2` forces the SAME division bias as the main probe (digit before the
		// `/`, same as the ASI-shape fixture above) so `/don't-care/` is division-biased here too —
		// without that setup the leading `/` sits at start-of-input and is correctly read as a regex,
		// never triggering the bug at all.
		const source = ['const x = total / 2', "/don't-care/.test(s)", '// a real comment further down', 'const after = 1'].join('\n')
		const out = stripCLikeComments(source)
		expect(out).not.toContain('a real comment')
		expect(out).toContain('const after = 1')
	})

	it('a genuine same-line string is unaffected — the lookahead gate only rejects quotes with no same-line close', () => {
		const source = "const s = 'hello world' // real comment"
		const out = stripCLikeComments(source)
		expect(out).toContain("'hello world'")
		expect(out).not.toContain('real comment')
	})

	it('go dialect: a decoy apostrophe is gated the same way — a genuine trailing comment still dies', () => {
		const source = ['x := total / 2', "y := 1 / don't / 2 // comment"].join('\n')
		const out = stripCLikeComments(source, { dialect: 'go' })
		expect(out).not.toContain('comment')
	})
})

describe('stripJsonComments (moved here from barrel-liveness — JSONC, string-aware)', () => {
	it('strips // and block comments while leaving string/number values untouched', () => {
		const source = ['{', '  // a leading comment', '  "a": 1,', '  /* an inline block */ "b": 2', '}'].join('\n')
		const out = stripJsonComments(source)
		expect(out).not.toContain('a leading comment')
		expect(out).not.toContain('an inline block')
		expect(out).toContain('"a": 1,')
		expect(out).toContain('"b": 2')
		expect(JSON.parse(out)).toEqual({ a: 1, b: 2 })
	})

	it('does not mistake a glob string value for a block comment — the corruption this fn exists to prevent', () => {
		// The exact shape that broke the naive line/block regex on a real tsconfig.json: a `//`
		// comment PLUS a glob-shaped `include` value in the SAME file. A regex-only stripper reads
		// the first `/*` inside the string as a block-comment open and eats forward to an unrelated
		// `*/`, corrupting the JSON before `JSON.parse` ever runs — this is the unit-level proof that
		// the char-by-char, string-aware walk does not.
		const source = ['{', '  // a comment, same line-shape as a real tsconfig', '  "include": ["src/**/*.ts", "./src/*"]', '}'].join('\n')
		const out = stripJsonComments(source)
		expect(out).not.toContain('a comment')
		expect(JSON.parse(out)).toEqual({ include: ['src/**/*.ts', './src/*'] })
	})

	it('leaves a file with no comments byte-identical', () => {
		const source = '{\n  "a": 1\n}\n'
		expect(stripJsonComments(source)).toBe(source)
	})
})

describe('sourceViews (moved here from allowlist-liveness — two comment/string-aware views)', () => {
	it('blanked keeps string content readable at its original offset; comments become spaces', () => {
		const source = `const a = "keep me" // a trailing comment\nconst b = 1`
		const { blanked } = sourceViews(source)
		expect(blanked).toContain('"keep me"')
		expect(blanked).not.toContain('a trailing comment')
		expect(blanked).toContain('const b = 1')
	})

	it('mask blanks BOTH comment and string interiors — only code structure (brackets) survives', () => {
		const source = `const a = "keep me" // a trailing comment\nconst arr = [1, 2]`
		const { mask } = sourceViews(source)
		expect(mask).not.toContain('keep me')
		expect(mask).not.toContain('a trailing comment')
		expect(mask).toContain('[')
		expect(mask).toContain(']')
		// The quote delimiters themselves survive in the mask (only the INTERIOR is blanked) — that
		// is what lets a caller balance brackets inside a string-adjacent region without miscounting.
		expect(mask).toContain('"')
	})

	it('preserves offsets in both views — same length as source, same line count, block comments spanning lines keep their newline', () => {
		const source = 'line one /* block\ncomment */ line two\n// trailing\nline three'
		const { blanked, mask } = sourceViews(source)
		expect(blanked.length).toBe(source.length)
		expect(mask.length).toBe(source.length)
		expect(blanked.split('\n').length).toBe(source.split('\n').length)
		expect(mask.split('\n').length).toBe(source.split('\n').length)
	})
})

/**
 * L5-10 (`.specs/2026-08-12-varredura-rodada2.md`): a template literal nested inside another
 * template's `${…}` was not tracked — the state machine only knew "am I inside a backtick", so the
 * FIRST backtick reached inside the interpolation (the nested template's opener, or a stray one in
 * a nested string) was read as the CLOSE of the outer template. Everything after that point parses
 * under the wrong state until something else resyncs it — nested content leaks into `mask` as if it
 * were real code, and real code inside `${…}` (identifiers, object-literal braces) gets masked away
 * as if it were string interior.
 *
 * The fix gives `sourceViews` a stack of open template literals, one frame per nesting level, each
 * tracking the brace depth of ITS currently-open `${…}` (0 = walking template text, ⩾1 = inside the
 * interpolation). `${` hands control back to `'code'` state — the same state top-level code walks —
 * so quotes, comments, nested backticks and `{`/`}` inside the interpolation get ordinary 'code'
 * handling; only the `}` that returns the top frame's depth to 0 flips back to template text. A
 * backtick opened from inside an interpolation pushes ANOTHER frame (real nesting, not aliasing).
 */
describe('sourceViews — nested template literals track ${} depth (L5-10)', () => {
	it('a template literal nested inside ${} does not leak its content into the mask as code', () => {
		const source = 'const x = `outer ${ `inner` } end`'
		const { blanked, mask } = sourceViews(source)
		expect(mask.length).toBe(source.length)
		// Under the bug the inner backtick prematurely closes the OUTER template, so 'inner' becomes
		// live code text (unmasked) and the real closing `}` gets swallowed as string content instead.
		expect(mask).not.toContain('inner')
		expect(mask).toContain('}')
		expect(blanked).toContain('inner')
	})

	it("a backtick nested inside a string inside ${} (odd quote parity) does not corrupt the interpolation's own code or its close", () => {
		const source = "const x = `Use ${flag ? '`' : 'x'} here`"
		const { mask } = sourceViews(source)
		expect(mask.length).toBe(source.length)
		// Under the bug, '${' is never recognised — the whole `${flag ? '`' : 'x'}` region stays
		// template TEXT until that stray backtick (meant to be inert string content) prematurely
		// closes the outer template. Neither the real identifier nor the real closing brace survive.
		expect(mask).toContain('flag')
		expect(mask).toContain('}')
	})

	it('the real i18n-coherence.test.ts:211 shape — ternary branches that are themselves nested templates', () => {
		// Modelled verbatim on packages/api/typescript/tests/architecture/i18n-coherence.test.ts:211
		// (an allowlist-liveness target): a template whose third interpolation is a ternary, and BOTH
		// branches are themselves template literals with their own `${…}` interpolation.
		const source =
			"const line = `  ${v.file}:${v.line}  →  ${v.kind === 'prefix' ? `i18nPrefix=\"${v.key}\" (no such object node)` : `t('${v.key}')`}`"
		const { mask } = sourceViews(source)
		expect(mask.length).toBe(source.length)
		// Real code inside the interpolations (the ternary condition, both nested templates' `v.key`)
		// must survive as structure — under the bug it is swallowed by the first stray nested backtick.
		expect(mask).toContain('kind')
		expect(mask).toContain('key')
		// The nested templates' own literal text stays prose and must stay masked either way.
		expect(mask).not.toContain('no such object node')
	})

	it("an object literal inside ${} — neither the string's `}` nor the object's `}` closes the interpolation early", () => {
		const source = "const x = `a ${ JSON.stringify({ b: '}' }) } c`"
		const { mask } = sourceViews(source)
		expect(mask.length).toBe(source.length)
		// Real code (the call, the object literal) must be visible as structure in the mask...
		expect(mask).toContain('JSON')
		// ...and brace-counting must reach the REAL close, not the string's `}` or the object's `}`:
		// exactly 2 open braces (`${`'s, the object's) and 2 close braces (the object's, the real
		// interpolation close) — the string's `}` never counts, it is masked string interior.
		expect((mask.match(/\{/g) ?? []).length).toBe(2)
		expect((mask.match(/\}/g) ?? []).length).toBe(2)
	})
})

/**
 * L5-r7-1 (`.specs/2026-08-12-varredura-rodada7.md`): `sourceViews` had no `dialect` option — every
 * caller reading Go source got JS template-literal semantics for backtick, the same class of bug
 * `stripCLikeComments` fixed for COMMENTS at L5-r3-1 (MW-14), but here for STRINGS. Two distinct
 * failure modes follow from treating a Go raw string as a JS template literal:
 *
 *   1. `${` is JS interpolation syntax; Go raw strings have none. Literal `${` text inside a Go raw
 *      string (unlikely but not the point) would wrongly hand control back to 'code' state.
 *   2. JS template literals escape via `\` — a Go raw string does not, so a raw string ending in a
 *      literal `\` immediately before the closing backtick (`` `C:\` ``) never finds its close under
 *      JS rules: the state machine stays "inside a string" for the REST OF THE FILE, and whatever
 *      comes next (a real comment, real code) gets masked/preserved as if it were still string
 *      content instead of being parsed as what it actually is.
 *
 * Fixed the same way `stripCLikeComments` was: a `dialect` option on the SAME state machine (no
 * second copy of the loop). Default 'js' is byte-for-byte unchanged — every fixture above this point
 * runs unmodified. 'go' changes ONLY how a backtick-delimited region is walked: no escape, no `${`,
 * closes on the very next backtick unconditionally, may span multiple lines — exactly
 * `stripCLikeComments`'s `{ dialect: 'go' }` semantics, now shared by `mask`/`blanked` too.
 */
describe('sourceViews — go dialect: backtick is a Go RAW STRING, string-and-comment masking (L5-r7-1)', () => {
	it('a decoy env-read call quoted INSIDE a Go raw string is masked, and a trailing `\\` before the close does not swallow the real comment after it', () => {
		const source = ['var usage = `Set os.Getenv("DECOY") here \\`', '// os.Getenv("PHANTOM_AFTER")'].join('\n')

		const go = sourceViews(source, { dialect: 'go' })
		// The decoy call text lives INSIDE the raw string — mask blanks it like any string interior,
		// so a position-validating extractor (go-config-source.ts) never sees it as live code.
		expect(go.mask).not.toContain('DECOY')
		expect(go.mask).not.toContain('os.Getenv')
		// blanked KEEPS string content (by contract) — the raw string's own text, escape-free, survives.
		expect(go.blanked).toContain('var usage = `Set os.Getenv("DECOY") here \\`')
		// The real close is the backtick right after the trailing `\` — go dialect finds it, returns to
		// 'code', and the REAL comment on line 2 is recognized and blanked (not swallowed as string text).
		expect(go.blanked).not.toContain('PHANTOM_AFTER')
		expect(go.mask).not.toContain('PHANTOM_AFTER')

		// Same source, DEFAULT (js) dialect: the trailing `\` "escapes" the closing backtick under JS
		// template-literal rules, the raw string never closes, and line 2's real comment is read as
		// still being INSIDE the unclosed string — so PHANTOM_AFTER survives in `blanked` (preserved as
		// string content) instead of being blanked as a comment. This is the RED this fixture proves
		// against the CURRENT (pre-dialect) implementation: calling `sourceViews(source, {dialect:'go'})`
		// on an unmodified `sourceViews` silently ignores the second argument (JS does not error on an
		// extra parameter) and takes this exact desynced path instead.
		const js = sourceViews(source)
		expect(js.blanked).toContain('PHANTOM_AFTER')
	})

	it('a raw string spanning multiple lines keeps its literal `\\` — including one right before the close — and the real close still ends it', () => {
		const source = ['const winPath = `C:\\Users\\', 'name\\` // getEnvOrDefault("PHANTOM_MULTI", "x")'].join('\n')
		const { blanked, mask } = sourceViews(source, { dialect: 'go' })

		expect(blanked).toContain('C:\\Users\\')
		expect(blanked).toContain('name\\`')
		// The trailing comment after the real close is recognized as a comment — blanked in BOTH views.
		expect(blanked).not.toContain('PHANTOM_MULTI')
		expect(mask).not.toContain('PHANTOM_MULTI')
		// Offsets preserved: same length, same line count as the JS-side sourceViews contract promises.
		expect(blanked.length).toBe(source.length)
		expect(mask.length).toBe(source.length)
		expect(blanked.split('\n').length).toBe(source.split('\n').length)
		expect(mask.split('\n').length).toBe(source.split('\n').length)
	})

	it('a double-quoted string with an escaped quote is unaffected — only backtick loses its escape in go dialect', () => {
		const source = ['s := "quoted \\" with escape"', '// trailing comment after the real close'].join('\n')
		const { blanked, mask } = sourceViews(source, { dialect: 'go' })

		expect(blanked).toContain('s := "quoted \\" with escape"')
		expect(mask).not.toContain('quoted')
		expect(blanked).not.toContain('trailing comment')
		expect(mask).not.toContain('trailing comment')
	})
})
