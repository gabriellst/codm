import { describe, expect, it } from 'bun:test'
import {
	SELF_EXCLUDED,
	classify,
	execLines,
	inCommandSubstitution,
	maskShellQuotedLine,
	scanFile,
	stripCLikeComments,
	stripHashComments,
	walk,
} from './gate-vacuity'

/**
 * The machinery floor for the gate-vacuity rail: a red fixture per form, the prose cases that must
 * stay silent (friction #39/#49), and the standing proof that the real corpus is clean.
 *
 * Every fixture below mirrors a form MEASURED on this machine (the numbers are in gate-vacuity.ts's
 * docblock), not a form imagined from the report — a rail whose fixtures encode a guess is the
 * same vacuous gate one level up.
 */

// ─── GV-01 · a pipeline's exit is read afterwards ────────────────────

describe('GV-01 — pipe swallows the exit status', () => {
	it('flags a status read on the line after a pipeline', () => {
		const source = ['#!/bin/sh', 'cargo build --release 2>&1 | tail -40', 'echo "CARGO_EXIT=$?"'].join('\n')
		const findings = scanFile('scripts/x.sh', 'shell', source)

		expect(findings).toHaveLength(1)
		expect(findings[0].ruleId).toBe('GV-01')
		expect(findings[0].line).toBe(3)
		expect(findings[0].message).toContain('tail')
	})

	it('flags a status read on the same line as the pipeline', () => {
		const findings = scanFile('scripts/x.sh', 'shell', '#!/bin/sh\nbun run test | tee out.log; echo $?\n')
		expect(findings.map(f => f.ruleId)).toEqual(['GV-01'])
	})

	it('stays silent when pipefail is enabled — the leftmost failure does propagate', () => {
		const source = ['#!/bin/sh', 'set -euo pipefail', 'bun run test | tail -20', 'echo "EXIT=$?"'].join('\n')
		expect(scanFile('scripts/x.sh', 'shell', source)).toEqual([])
	})

	it('stays silent inside command substitution — the value is consumed, not the status', () => {
		const source = ['#!/bin/sh', 'V=$(echo "$INPUT" | jq -r .id)', 'echo "$?"'].join('\n')
		expect(scanFile('scripts/x.sh', 'shell', source)).toEqual([])
	})

	it('stays silent for a pipeline whose status nobody reads', () => {
		expect(scanFile('scripts/x.sh', 'shell', '#!/bin/sh\nbun run test | tail -20\necho done\n')).toEqual([])
	})

	it('does not mistake `||` for a pipe', () => {
		expect(scanFile('scripts/x.sh', 'shell', '#!/bin/sh\nbun run test || true\necho $?\n')).toEqual([])
	})
})

// ─── GV-02 · the bash status array under a shell that lacks it ───────

describe('GV-02 — bash-only status array under zsh/sh', () => {
	it('flags the read in a zsh script', () => {
		const findings = scanFile('scripts/x.sh', 'shell', '#!/bin/zsh\ncargo build\necho "E=${PIPESTATUS[0]}"\n')
		expect(findings.map(f => f.ruleId)).toContain('GV-02')
		expect(findings.find(f => f.ruleId === 'GV-02')?.line).toBe(3)
	})

	it('stays silent in a bash-shebanged script, where the array exists', () => {
		expect(scanFile('scripts/x.sh', 'shell', '#!/bin/bash\ncargo build\necho "E=${PIPESTATUS[0]}"\n')).toEqual([])
	})

	it('stays silent in a GitHub workflow — the runner default shell is bash', () => {
		const source = ['jobs:', '  a:', '    steps:', '      - run: cargo build; echo "E=${PIPESTATUS[0]}"'].join('\n')
		expect(scanFile('.github/workflows/ci.yml', 'workflow', source)).toEqual([])
	})
})

// ─── GV-03 · `bun --cwd <dir> run <script>` ──────────────────────────

describe('GV-03 — bun --cwd degrades to usage and exits 0', () => {
	it('flags the degrading spelling in a Dockerfile RUN', () => {
		const findings = scanFile('docker/Dockerfile.api', 'dockerfile', 'RUN bun --cwd packages/api/typescript run build\n')
		expect(findings).toHaveLength(1)
		expect(findings[0].ruleId).toBe('GV-03')
		expect(findings[0].line).toBe(1)
	})

	it('flags it behind an env-var prefix', () => {
		const findings = scanFile(
			'docker/Dockerfile.api',
			'dockerfile',
			'RUN DATABASE_URL="$X" bun --cwd packages/contracts run drizzle:migrate\n',
		)
		expect(findings.map(f => f.ruleId)).toEqual(['GV-03'])
	})

	it('flags it in a package.json script value, reporting the key line', () => {
		const source = ['{', '\t"scripts": {', '\t\t"gate": "bun --cwd packages/client run test:rust"', '\t}', '}'].join('\n')
		const findings = scanFile('package.json', 'package', source)
		expect(findings.map(f => f.ruleId)).toEqual(['GV-03'])
		expect(findings[0].line).toBe(3)
	})

	it('stays silent on the `=` spelling — measured to RUN', () => {
		expect(scanFile('docker/D', 'dockerfile', 'RUN bun --cwd=packages/client run check:rust\n')).toEqual([])
	})

	it('stays silent on `bun run --cwd <dir> <script>` — measured to RUN', () => {
		expect(scanFile('docker/D', 'dockerfile', 'RUN bun run --cwd packages/client check:rust\n')).toEqual([])
	})

	it('stays silent on the flagless spelling — measured to RUN', () => {
		expect(scanFile('package.json', 'package', '{"scripts":{"a":"bun --cwd packages/e2e cleanup:dbs"}}')).toEqual([])
	})

	it('stays silent on the safe form the doctrine prescribes', () => {
		expect(scanFile('docker/D', 'dockerfile', 'RUN cd packages/client && bun run check:rust\n')).toEqual([])
	})
})

// ─── SP-18 · quote-awareness for shell/dockerfile/workflow (r2) ──────
//
// r2 proved the concrete failure mode: a `usage()` function's help text quotes a pipe example
// (`echo "Avoid: false | tail -1"`) — PIPE_RE matched the literal `|` inside the string, and a
// real `$?` read a couple of lines later (checking something unrelated) was close enough for the
// lookahead to pin a bogus GV-01 finding on it. Same shape for GV-03: a help string that mentions
// the degrading `bun --cwd` spelling as a "don't do this" example. Fixtures below are the r2
// shapes, not invented ones.

describe('quote-awareness — GV-01/GV-03 stay silent inside a shell string (r2)', () => {
	it('does not fire GV-01 on a pipe quoted inside a usage() help string', () => {
		const source = ['#!/bin/sh', 'usage() {', '  echo "Avoid: false | tail -1"', '  echo "STATUS=$?"', '}'].join('\n')
		// RED (pre-fix): PIPE_RE matches the `| tail` inside the quotes, and the very next line's
		// `$?` — unrelated, just the next echo in the same function — falls inside the 3-line
		// lookahead, producing a bogus GV-01 finding pinned at line 4.
		expect(scanFile('scripts/x.sh', 'shell', source)).toEqual([])
	})

	it('still fires GV-01 for a real pipe in the same file that quotes a fake one', () => {
		const source = [
			'#!/bin/sh',
			'usage() {',
			'  echo "Avoid: false | tail -1"',
			'}',
			'cargo build --release 2>&1 | tail -40',
			'echo "CARGO_EXIT=$?"',
		].join('\n')
		const findings = scanFile('scripts/x.sh', 'shell', source)
		expect(findings).toHaveLength(1)
		expect(findings[0].ruleId).toBe('GV-01')
		expect(findings[0].line).toBe(6)
	})

	it('does not fire GV-01 on a pipe quoted with single quotes — absolute literal, no escape needed', () => {
		const source = ['#!/bin/sh', "echo 'Avoid: false | tail -1'", 'echo "STATUS=$?"'].join('\n')
		expect(scanFile('scripts/x.sh', 'shell', source)).toEqual([])
	})

	it('carries open-quote state across lines — a pipe on a continuation line of the same string stays silent', () => {
		// The usage string opens on one line and closes two lines later; "acumule por linha" means
		// the masker must not forget it is still inside quotes when it reaches the next physical line.
		const source = ['#!/bin/sh', 'usage() {', '  echo "Examples:', '    good: cmd | tail -1', '  "', '  echo "STATUS=$?"', '}'].join('\n')
		expect(scanFile('scripts/x.sh', 'shell', source)).toEqual([])
	})

	it('does not fire GV-03 on the degrading spelling quoted inside a usage() help string', () => {
		const source = ['#!/bin/sh', 'usage() {', '  echo "Avoid: bun --cwd packages/client run test:rust"', '}'].join('\n')
		expect(scanFile('scripts/x.sh', 'shell', source)).toEqual([])
	})

	it('still fires GV-03 for the real spelling in a Dockerfile RUN that also documents the fix in a comment', () => {
		const source = [
			'# Avoid: bun --cwd packages/client run test:rust',
			'RUN echo "See --help for the fix: bun --cwd packages/client run test:rust"',
			'RUN bun --cwd packages/client run test:rust',
		].join('\n')
		const findings = scanFile('docker/Dockerfile.api', 'dockerfile', source)
		expect(findings).toHaveLength(1)
		expect(findings[0].ruleId).toBe('GV-03')
		expect(findings[0].line).toBe(3)
	})

	it('stays silent for a pipe quoted inside a GitHub workflow run: step', () => {
		const source = ['jobs:', '  a:', '    steps:', '      - run: echo "Avoid: false | tail -1"', '      - run: echo "STATUS=$?"'].join('\n')
		expect(scanFile('.github/workflows/ci.yml', 'workflow', source)).toEqual([])
	})

	it('the ts corpus is untouched — a pipe quoted in an execSync string still counts (unchanged compromiso)', () => {
		// Same fixture family as the shell case above, but on the ts corpus: quote-masking is
		// shell/dockerfile/workflow-only, so this MUST keep firing exactly as it did before SP-18.
		const source = ['execSync("cargo build --release 2>&1 | tail -40")', 'const code = "$?"'].join('\n')
		const findings = scanFile('scripts/x.ts', 'ts', source)
		expect(findings.map(f => f.ruleId)).toEqual(['GV-01'])
	})
})

// ─── Prose must stay silent (frictions #39 / #49) ────────────────────

describe('comments are not code', () => {
	it('ignores the degrading form inside a Dockerfile # comment', () => {
		expect(scanFile('docker/Dockerfile.app', 'dockerfile', '#     RUN  bun --cwd packages/app/react  run build\n')).toEqual([])
	})

	it('ignores all three forms inside TypeScript comments', () => {
		const source = [
			'// never `cmd | tee f` then $?, and PIPESTATUS is not portable',
			'/* nor `bun --cwd pkg run build` */',
			'const x = 1',
		].join('\n')
		expect(scanFile('scripts/x.ts', 'ts', source)).toEqual([])
	})

	it('still flags the form when it is real code in a TS string', () => {
		const findings = scanFile('scripts/x.ts', 'ts', 'execSync("bun --cwd packages/client run test:rust")\n')
		expect(findings.map(f => f.ruleId)).toEqual(['GV-03'])
	})

	it('leaves shell parameter expansion alone when stripping # comments', () => {
		expect(stripHashComments('echo "${VAR#prefix}" $# ok')).toBe('echo "${VAR#prefix}" $# ok')
	})

	it('strips a trailing # comment but keeps the command', () => {
		expect(stripHashComments('bun run build   # this builds').trim()).toBe('bun run build')
	})

	it('keeps `//` inside a string literal intact while blanking real comments', () => {
		const out = stripCLikeComments('const u = "http://x" // note\n')
		expect(out).toContain('"http://x"')
		expect(out).not.toContain('note')
	})

	it('preserves line count and column positions so findings point at the right place', () => {
		const source = 'a\n// comment\nb\n'
		const out = stripCLikeComments(source)
		expect(out.split('\n')).toHaveLength(source.split('\n').length)
		expect(out.length).toBe(source.length)
	})
})

// ─── Corpus classification ──────────────────────────────────────────

describe('corpus', () => {
	it('claims executed content', () => {
		expect(classify('scripts/skill-evals/transplant.sh')).toBe('shell')
		expect(classify('.githooks/pre-commit')).toBe('shell')
		expect(classify('docker/Dockerfile.api')).toBe('dockerfile')
		expect(classify('.github/workflows/correctness.yml')).toBe('workflow')
		expect(classify('scripts/detectors/run-all.ts')).toBe('ts')
		expect(classify('.claude/hooks/classify-edit.ts')).toBe('ts')
		expect(classify('package.json')).toBe('package')
		expect(classify('lint-staged.config.mjs')).toBe('ts')
	})

	it('disclaims prose, product source, and fixture-bearing tests', () => {
		expect(classify('.claude/skills/e2e/SKILL.md')).toBeNull()
		expect(classify('.plans/2026-05-21-port.progress.md')).toBeNull()
		expect(classify('packages/api/typescript/src/index.ts')).toBeNull()
		expect(classify('scripts/detectors/gate-vacuity.test.ts')).toBeNull()
	})

	it('excludes exactly one file by name, and says which', () => {
		// This list is the rail's only blind spot. Pinning it means a future edit cannot quietly
		// widen the exclusion into a place where real violations could hide.
		expect(SELF_EXCLUDED).toEqual(['scripts/detectors/gate-vacuity.ts'])
		expect(classify('scripts/detectors/gate-vacuity.ts')).toBeNull()
	})

	it('reads package.json scripts as commands, not as JSON text', () => {
		const lines = execLines('package.json', 'package', '{\n\t"scripts": {\n\t\t"build": "nx run-many -t build"\n\t}\n}')
		expect(lines).toEqual([{ line: 3, text: 'nx run-many -t build' }])
	})
})

describe('inCommandSubstitution', () => {
	it('sees $( ) and backticks, and does not see a plain pipeline', () => {
		const sub = 'V=$(a | jq .)'
		expect(inCommandSubstitution(sub, sub.indexOf('|'))).toBe(true)
		const tick = 'V=`a | jq .`'
		expect(inCommandSubstitution(tick, tick.indexOf('|'))).toBe(true)
		const plain = 'a | jq .'
		expect(inCommandSubstitution(plain, plain.indexOf('|'))).toBe(false)
	})
})

describe('maskShellQuotedLine — shell quoting rules (SP-18)', () => {
	it('blanks a double-quoted interior, keeping the delimiters and closing state to none', () => {
		const r = maskShellQuotedLine('echo "a | b"', 'none')
		expect(r.text).toBe('echo "     "')
		expect(r.state).toBe('none')
	})

	it('blanks a single-quoted interior the same way', () => {
		const r = maskShellQuotedLine("echo 'a | b'", 'none')
		expect(r.text).toBe("echo '     '")
		expect(r.state).toBe('none')
	})

	it('single quotes are absolute literals — a backslash inside does not escape the closing quote', () => {
		// `'ab\'` closes at the very next `'`, backslash included in the (masked) content — unlike
		// the double-quote branch right below, single quotes recognize no escape at all.
		const r = maskShellQuotedLine("'ab\\' cd", 'none')
		expect(r.state).toBe('none')
		expect(r.text).toBe("'   ' cd")
	})

	it('double quotes DO escape — a backslash-quote does not close the string', () => {
		const r = maskShellQuotedLine('"a\\"b" c', 'none')
		// The `\"` is consumed as an escape pair, so the string is still open through `b` and
		// closes on the SECOND `"`. `c` outside the quotes survives untouched.
		expect(r.state).toBe('none')
		expect(r.text).toBe('"    " c')
	})

	it('carries an unterminated double quote into the next line as state ("acumule por linha")', () => {
		const first = maskShellQuotedLine('echo "line one', 'none')
		expect(first.state).toBe('double')
		const second = maskShellQuotedLine('line two | tail"', first.state)
		expect(second.state).toBe('none')
		expect(second.text).toBe('               "')
	})

	it('an unterminated single quote absorbs a literal double quote inside it', () => {
		const r = maskShellQuotedLine('echo \'say "hi"\'', 'none')
		expect(r.state).toBe('none')
		expect(r.text).toBe("echo '        '")
	})
})

// ─── The standing proof ─────────────────────────────────────────────

describe('the real corpus', () => {
	it('is clean — every executed file in this repo, zero findings', () => {
		const findings = walk()
		const rendered = findings.map(f => `${f.file}:${f.line} ${f.ruleId}`).join('\n')
		expect(rendered).toBe('')
	})

	it('is not vacuous — the walk actually reaches a meaningful number of files', () => {
		// Guards the failure mode where a corpus-glob typo makes "clean" mean "scanned nothing".
		const { repoFiles } = require('../lib/repo-files')
		const scanned = repoFiles(process.cwd()).filter((f: string) => classify(f) !== null)
		expect(scanned.length).toBeGreaterThan(150)
	})
})
