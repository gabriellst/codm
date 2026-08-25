#!/usr/bin/env bun
/**
 * gate-vacuity.ts — the ratchet against gates whose exit code CANNOT fail.
 *
 * The class: a cited proof whose exit proves nothing. Doctrine alone has failed against it eight
 * measured times across one product bootstrap (mira `research/bootstrap-log.md` #4, #5, #17, #52,
 * #54), biting the orchestrator, its subagents, and finally the orchestrator's own written
 * instruction — the entry that promoted "write the rule again" to "build the ratchet".
 *
 * Three forms, each re-measured on this machine before being encoded (never taken from the report):
 *
 *   GV-01  A pipeline's exit status is read afterwards. The shell hands back the LAST stage's
 *          status, so the interesting command's failure is discarded.
 *            measured: `false | tail -1; echo $?` → 0
 *          Off when the file enables `pipefail` (then the leftmost failure does propagate), and
 *          off inside command substitution, where the VALUE is consumed and the status is not the
 *          point — which is what every legitimate pipe in this repo's hooks is doing.
 *
 *   GV-02  The bash-only status array is read under a shell that does not define it. Under zsh it
 *          expands to the empty string, so the guard silently compares against nothing.
 *            measured, zsh: `false | true` then reading index 0 → `[]`  (the zsh spelling → `1`)
 *            measured, bash: same read → `1`
 *          Off for bash-shebanged files and GitHub workflow steps (bash is the runner default).
 *
 *   GV-03  `bun --cwd <dir> run <script>` — bun does not accept the flag in that position, prints
 *          its usage text, and exits 0 WITHOUT running the script.
 *            measured: `bun --cwd packages/client run check:rust` → exit 0, 11439 bytes of usage,
 *                      cargo never invoked
 *          The boundary is narrower than the field report claimed, and the narrowing is measured:
 *            `bun --cwd=packages/client run check:rust`  → RUNS (cargo executes)
 *            `bun run --cwd packages/client check:rust`  → RUNS
 *            `cd packages/client && bun run check:rust`  → RUNS   ← the safe form
 *          Only the space-separated `--cwd <dir>` followed by `run` degrades, so that is the only
 *          spelling gated. Flagging the `=` spelling would be a rule this repo cannot demonstrate.
 *
 * CORPUS — every committed file whose content is EXECUTED, as opposed to read by a human:
 *   shell        *.sh, and the extensionless git hooks under .githooks/
 *   dockerfile   docker/Dockerfile*            (RUN lines are a shell)
 *   workflow     .github/workflows/*.yml       (run: blocks are a shell)
 *   ts           scripts/**, .claude/hooks/**, .githooks/** — .ts/.mjs, the tooling harness
 *   yaml         scripts/**\/*.yaml            (skill-eval task specs embed shell)
 *   package      every package.json — the `scripts` map values only
 *
 * PROSE IS OUT, deliberately. `.md` under .plans/ and .claude/skills/ carries the degraded form in
 * historical logs, and re-flagging prose is its own measured friction (#39, #49: a scanner matching
 * the comment that explains the rule, twice, costing two edit cycles). Measured before deciding:
 * no `.md` under .claude/ carries the EXECUTING form today — the live docs use `bun --cwd <pkg>
 * <script>`, which runs — so prose costs this gate nothing at HEAD. If that changes, the widening
 * is a corpus entry, not a new rule.
 *
 * COMMENTS ARE STRIPPED before matching, same reason. The tree proves this is load-bearing rather
 * than theoretical: docker/Dockerfile.app carries the degraded form twice inside a `#` block
 * sketching a build the product is meant to write. Those are prose and must stay silent; the three
 * live ones in docker/Dockerfile.api were real and are fixed in the same commit as this file.
 *
 * QUOTED SHELL STRINGS ARE MASKED too (SP-18), for the shell/dockerfile/workflow corpora only —
 * measured (r2): a `usage()` function's `echo "Avoid: false | tail -1"` help text was matching
 * GV-01's pipe pattern on its literal `|`, and GV-03's `echo "...bun --cwd pkg run x..."`
 * documentation line was matching the degrading-spelling pattern the same way. Comment-stripping
 * doesn't help here — this is live code (a real `echo`), just one whose STRING ARGUMENT happens to
 * spell the pattern. See `maskShellQuotes` for the shell-quoting rules applied (single = absolute
 * literal, double = escapes) and why EXIT_READ_RE/GV-02 are deliberately NOT run through it. The
 * `ts` corpus is untouched — its tested compromiso (a pipe/`bun --cwd` string handed to `execSync`
 * DOES count) is a different corpus making a different call.
 *
 * `*.test.ts` is out of corpus — test files hold broken-by-design fixtures, the same carve-out
 * `go-enum-literals.ts` makes for `_test.go`. SELF_EXCLUDED (below) names the one remaining file
 * that must be skipped and says why; `gate-vacuity.test.ts` pins that list so it cannot quietly grow.
 *
 * No baseline file. A baseline is for debt too large to clear in one commit; this corpus was
 * cleaned to zero in the commit that introduced the rail, so any finding here is new.
 *
 * Usage: bun scripts/detectors/gate-vacuity.ts [--json]
 * ROOT_OVERRIDE retargets the tree (eval worktrees), matching the other detectors.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { repoFiles } from '../lib/repo-files'
import { stripCLikeComments, stripHashComments } from '../lib/strip-comments'

export interface Finding {
	detector: 'gate-vacuity'
	ruleId: 'GV-01' | 'GV-02' | 'GV-03'
	file: string
	line: number
	severity: 'error'
	message: string
	excerpt: string
}

const PROJECT_ROOT = process.env.ROOT_OVERRIDE ? resolve(process.env.ROOT_OVERRIDE) : resolve(import.meta.dir, '../..')

/**
 * This file states the very byte sequences it hunts for, in its regex sources. Scanning itself
 * would report three findings that are the rail working correctly, which is the #49 trap one level
 * up. Excluded by name rather than by cleverly splitting the literals, so the skip is visible.
 */
export const SELF_EXCLUDED: readonly string[] = ['scripts/detectors/gate-vacuity.ts']

// ─── Corpus classification ──────────────────────────────────────────

export type Corpus = 'shell' | 'dockerfile' | 'workflow' | 'ts' | 'yaml' | 'package'

const TOOLING_ROOTS = ['scripts/', '.claude/hooks/', '.githooks/']

/** Which corpus a repo-relative path belongs to, or null when it is not executed content. */
export function classify(rel: string): Corpus | null {
	if (SELF_EXCLUDED.includes(rel)) return null
	if (rel.endsWith('.test.ts')) return null
	if (rel.endsWith('.sh')) return 'shell'
	// The four git hooks are extensionless executables; anything else at that path is tooling.
	if (rel.startsWith('.githooks/') && !basename(rel).includes('.')) return 'shell'
	if (basename(rel).startsWith('Dockerfile')) return 'dockerfile'
	if (rel.startsWith('.github/workflows/') && /\.ya?ml$/.test(rel)) return 'workflow'
	if (basename(rel) === 'package.json') return 'package'
	if (TOOLING_ROOTS.some(root => rel.startsWith(root))) {
		if (/\.(ts|mjs)$/.test(rel)) return 'ts'
		if (/\.ya?ml$/.test(rel)) return 'yaml'
	}
	if (rel === 'lint-staged.config.mjs') return 'ts'
	return null
}

// ─── Comment stripping (friction #39/#49: never match your own prose) ─
//
// The state machines moved to `scripts/lib/strip-comments.ts` when two more scanners needed them
// (`classify-edit-core` and `registry-scan`). Re-exported here so this module's public surface — and
// `gate-vacuity.test.ts` — is unchanged by the move.
export { stripCLikeComments, stripHashComments } from '../lib/strip-comments'

// ─── Executable-line extraction ─────────────────────────────────────

export interface ExecLine {
	line: number
	text: string
}

/** The lines of `source` that a shell (or a runner) will execute, comments removed. */
export function execLines(_rel: string, corpus: Corpus, source: string): ExecLine[] {
	if (corpus === 'package') {
		let scripts: Record<string, string> = {}
		try {
			scripts = (JSON.parse(source) as { scripts?: Record<string, string> }).scripts ?? {}
		} catch {
			return []
		}
		const raw = source.split('\n')
		return Object.entries(scripts).map(([key, value]) => {
			const idx = raw.findIndex(l => l.includes(`"${key}":`))
			return { line: idx >= 0 ? idx + 1 : 1, text: value }
		})
	}
	const stripped = corpus === 'ts' ? stripCLikeComments(source) : stripHashComments(source)
	return stripped
		.split('\n')
		.map((text, i) => ({ line: i + 1, text }))
		.filter(l => l.text.trim().length > 0)
}

// ─── Rules ──────────────────────────────────────────────────────────

/** A pipe into a stage that discards the upstream status. `||` is not a pipe. */
const PIPE_RE = /(?<!\|)\|(?!\|)\s*(tee|tail|head|grep|jq|sed|awk|less|cat|sort|uniq|wc|xargs|column|fold)\b/
/** Reading the status: `$?`, or either spelling of the pipe-status array. */
const EXIT_READ_RE = /\$\?|\bPIPESTATUS\b|\$\{?pipestatus\b/
const PIPESTATUS_RE = /\bPIPESTATUS\b/
/**
 * `bun … --cwd <dir> run <script>`. The space after `--cwd` is the whole defect: the `=` spelling
 * runs (measured), so `\s+` here is load-bearing, not incidental.
 */
const BUN_CWD_RUN_RE = /\bbun\b[^;&|\n]*?\s--cwd\s+\S+\s+run\b/
const PIPEFAIL_RE = /\bpipefail\b/

/** True when the index sits inside `$( … )` or backticks — the value is consumed, not the status. */
export function inCommandSubstitution(text: string, index: number): boolean {
	let depth = 0
	let ticks = 0
	for (let i = 0; i < index; i++) {
		if (text[i] === '$' && text[i + 1] === '(') {
			depth++
			i++
		} else if (text[i] === ')' && depth > 0) depth--
		else if (text[i] === '`') ticks++
	}
	return depth > 0 || ticks % 2 === 1
}

/** Bash defines the pipe-status array; sh and zsh do not. */
function isBash(corpus: Corpus, source: string): boolean {
	if (corpus === 'workflow') return true // GitHub Actions runs `run:` under bash by default.
	return /^#!.*\bbash\b/.test(source.split('\n')[0] ?? '')
}

// ─── Quote-awareness (SP-18) — shell/dockerfile/workflow ONLY ────────
//
// r2's proof: a `usage()` function's help text quotes a pipe example (`echo "Avoid: false | tail
// -1"`). PIPE_RE matched the literal `|` inside the string, and a `$?` read a couple of lines
// later — checking something unrelated — sat inside the lookahead window, producing a GV-01
// finding on a line that never piped anything. GV-03 has the same shape: a help string that
// mentions the degrading `bun --cwd` spelling as a "don't do this" example.
//
// The fix is a MINIMAL notion of "inside a shell string", not a shell parser: shell quoting rules
// say single quotes are absolute literals (nothing is special inside, not even `\`) and double
// quotes allow `\`-escaping (so `\"` does not close the string early). `maskShellQuotes` walks a
// corpus's exec lines in order, blanking quoted interiors to spaces — same length, same offsets,
// so line numbers and (for anything read from the ORIGINAL `ExecLine`) excerpts stay exact — and
// carries the open-quote state from one line to the next ("acumule por linha": a double-quoted
// usage string that wraps onto a second line before closing must still mask that second line).
// Heredocs (`<<EOF … EOF`) are NOT tracked — out of scope, recorded here rather than silently
// dropped; a heredoc body is scanned as ordinary code, unchanged from before this fix.
//
// Masked text feeds ONLY PIPE_RE and BUN_CWD_RUN_RE — the two rules r2 proved misfire on quoted
// prose. EXIT_READ_RE and PIPESTATUS_RE keep reading the ORIGINAL text: `echo "$?"` and `echo
// "${PIPESTATUS[0]}"` are the idiomatic (quoted, word-split-safe) way to print a real exit status
// in shell, so those reads are LIVE even inside double quotes — masking them would blind GV-01/
// GV-02 to the exact pattern they exist to catch. This is why the `ts` corpus is untouched: its
// tested compromiso (`gate-vacuity.test.ts` — a string handed to `execSync` DOES count) is a
// different call entirely, made by a different corpus, and this pass never touches it.

export type QuoteMaskState = 'none' | 'single' | 'double'

const QUOTE_MASKED_CORPORA: ReadonlySet<Corpus> = new Set<Corpus>(['shell', 'dockerfile', 'workflow'])

/**
 * Blank the shell-quoted spans of one line, carrying `state` in from the previous line. Single
 * quotes close only on the next `'`, no escape recognized at all. Double quotes close on the next
 * unescaped `"` — a `\` inside double quotes consumes the following char (so `\"` cannot close the
 * string), matching shell's escape rule without needing to special-case which chars `\` escapes.
 */
export function maskShellQuotedLine(text: string, initialState: QuoteMaskState): { text: string; state: QuoteMaskState } {
	let out = ''
	let state = initialState
	for (let i = 0; i < text.length; i++) {
		const ch = text[i]
		if (state === 'single') {
			if (ch === "'") {
				out += ch
				state = 'none'
			} else out += ' '
			continue
		}
		if (state === 'double') {
			if (ch === '\\' && i + 1 < text.length) {
				out += '  '
				i++
				continue
			}
			if (ch === '"') {
				out += ch
				state = 'none'
			} else out += ' '
			continue
		}
		if (ch === "'" || ch === '"') {
			out += ch
			state = ch === "'" ? 'single' : 'double'
			continue
		}
		out += ch
	}
	return { text: out, state }
}

/** `maskShellQuotedLine` applied across a corpus's exec lines, in order, state carried line to line. */
export function maskShellQuotes(lines: readonly ExecLine[]): ExecLine[] {
	let state: QuoteMaskState = 'none'
	return lines.map(l => {
		const masked = maskShellQuotedLine(l.text, state)
		state = masked.state
		return { line: l.line, text: masked.text }
	})
}

/** How far ahead of a pipeline a status read still refers to it. */
const EXIT_READ_LOOKAHEAD = 3

export function scanFile(rel: string, corpus: Corpus, source: string): Finding[] {
	const findings: Finding[] = []
	const lines = execLines(rel, corpus, source)
	// Quote-masked view, ONLY for the two rules r2 proved fire on quoted usage/help prose (GV-01's
	// pipe, GV-03's `bun --cwd`). Everything else — EXIT_READ_RE, GV-02, excerpts — reads `lines`
	// (the original), since `echo "$?"` / `echo "${PIPESTATUS[0]}"` are real, live reads even
	// inside double quotes. Same length as `lines`, same indices — see `maskShellQuotes`.
	const matchLines = QUOTE_MASKED_CORPORA.has(corpus) ? maskShellQuotes(lines) : lines
	const pipefail = corpus !== 'package' && PIPEFAIL_RE.test(stripHashComments(source))
	const bash = isBash(corpus, source)
	const at = (l: ExecLine) => l.text.trim().slice(0, 160)

	for (let i = 0; i < lines.length; i++) {
		const { line, text: originalText } = lines[i]
		const matchText = matchLines[i]?.text ?? originalText

		const pipe = pipefail ? null : PIPE_RE.exec(matchText)
		if (pipe && !inCommandSubstitution(matchText, pipe.index)) {
			const after = originalText.slice(pipe.index)
			const window = lines.slice(i + 1, i + 1 + EXIT_READ_LOOKAHEAD)
			const readsHere = EXIT_READ_RE.test(after)
			const reader = readsHere ? lines[i] : window.find(l => EXIT_READ_RE.test(l.text))
			if (reader) {
				findings.push({
					detector: 'gate-vacuity',
					ruleId: 'GV-01',
					file: rel,
					line: reader.line,
					severity: 'error',
					message: `exit status read at line ${reader.line} belongs to \`${pipe[1]}\`, not to the command piped into it at line ${line} — the upstream failure is discarded. Redirect to a file and read the status on the very next line, or enable pipefail.`,
					excerpt: at(reader),
				})
			}
		}

		if (!bash && PIPESTATUS_RE.test(originalText)) {
			findings.push({
				detector: 'gate-vacuity',
				ruleId: 'GV-02',
				file: rel,
				line,
				severity: 'error',
				message:
					'the bash pipe-status array is read under a shell that does not define it (zsh/sh) — it expands to the empty string and the guard compares against nothing. Use the shell-appropriate spelling, or redirect to a file and read the status on the next line.',
				excerpt: at(lines[i]),
			})
		}

		const cwd = BUN_CWD_RUN_RE.exec(matchText)
		if (cwd) {
			findings.push({
				detector: 'gate-vacuity',
				ruleId: 'GV-03',
				file: rel,
				line,
				severity: 'error',
				message:
					'bun rejects `--cwd <dir>` in this position: it prints its usage and exits 0 WITHOUT running the script (measured). Use `cd <dir> && bun run <script>`, or an nx target.',
				excerpt: at(lines[i]),
			})
		}
	}
	return findings
}

// ─── Walk ───────────────────────────────────────────────────────────

export function walk(root: string = PROJECT_ROOT): Finding[] {
	const findings: Finding[] = []
	for (const rel of repoFiles(root)) {
		const corpus = classify(rel)
		if (!corpus) continue
		const abs = resolve(root, rel)
		if (!existsSync(abs) || !statSync(abs).isFile()) continue
		findings.push(...scanFile(rel, corpus, readFileSync(abs, 'utf8')))
	}
	return findings
}

if (import.meta.main) {
	const findings = walk()
	if (process.argv.includes('--json')) {
		console.log(JSON.stringify(findings, null, 2))
	} else {
		for (const f of findings) {
			console.log(`${f.file}:${f.line} [${f.severity}] ${f.ruleId} — ${f.message}`)
			console.log(`    ${f.excerpt}`)
		}
		console.log(`${findings.length} finding(s)`)
	}
	process.exit(findings.length > 0 ? 1 : 0)
}
