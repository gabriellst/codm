// packages/api/src/agent/services/TerminalLLMRunner/ClaudeCliTerminalLLMRunner/tui/actionRegistry.test.ts
import { describe, it, expect } from 'bun:test'
import { TuiActionType } from '../../../../enums'
import { ACTION_REGISTRY, THINKING_SPINNER_RE } from './actionRegistry'

interface Fixture {
	type: TuiActionType
	line: string
	expectedValue: string
}

// One fixture per registry entry. Each line is the canonical claude TUI
// rendering observed in the live session at 18:42 on 2026-05-20 (per spec
// AC R2), already ANSI-stripped + trimmed (the parser is responsible for
// stripping + trimming before matching).
const FIXTURES: Fixture[] = [
	{ type: TuiActionType.BASH,       line: '⏺ Bash(rg --files src)',                expectedValue: 'rg --files src' },
	{ type: TuiActionType.EDIT,       line: '⏺ Edit(packages/api/src/foo.ts)',       expectedValue: 'packages/api/src/foo.ts' },
	{ type: TuiActionType.UPDATE,     line: '⏺ Update(packages/api/src/bar.ts)',     expectedValue: 'packages/api/src/bar.ts' },
	{ type: TuiActionType.WRITE,      line: '⏺ Write(packages/api/src/baz.ts)',      expectedValue: 'packages/api/src/baz.ts' },
	{ type: TuiActionType.READ,       line: '⏺ Read(packages/api/src/qux.ts)',       expectedValue: 'packages/api/src/qux.ts' },
	{ type: TuiActionType.GREP,       line: '⏺ Grep(foo.*bar)',                      expectedValue: 'foo.*bar' },
	{ type: TuiActionType.GLOB,       line: '⏺ Glob(**/*.ts)',                       expectedValue: '**/*.ts' },
	{ type: TuiActionType.TASK,       line: '⏺ Task(refactor the runner)',           expectedValue: 'refactor the runner' },
	{ type: TuiActionType.TODO_WRITE, line: '⏺ TodoWrite(',                          expectedValue: '⏺ TodoWrite(' },
]

describe('actionRegistry', () => {
	it('includes one entry per non-UNKNOWN TuiActionType', () => {
		const types = ACTION_REGISTRY.map(d => d.type)
		expect(types).toContain(TuiActionType.BASH)
		expect(types).toContain(TuiActionType.EDIT)
		expect(types).toContain(TuiActionType.UPDATE)
		expect(types).toContain(TuiActionType.WRITE)
		expect(types).toContain(TuiActionType.READ)
		expect(types).toContain(TuiActionType.GREP)
		expect(types).toContain(TuiActionType.GLOB)
		expect(types).toContain(TuiActionType.TASK)
		expect(types).toContain(TuiActionType.TODO_WRITE)
		// UNKNOWN is the parser's fallback, not a registry entry.
		expect(types).not.toContain(TuiActionType.UNKNOWN)
	})

	for (const fx of FIXTURES) {
		it(`registry entry for ${fx.type} matches its canonical TUI line`, () => {
			const def = ACTION_REGISTRY.find(d => d.type === fx.type)
			expect(def).toBeDefined()
			const m = def!.pattern.exec(fx.line)
			expect(m).not.toBeNull()
			expect(m![def!.captureGroup]).toBe(fx.expectedValue)
		})
	}

	it('TURN_END is not in the action registry (it is a signal, not an action)', () => {
		// TURN_END is handled by the parser's signal-channel state machine
		// via TuiMarker.TURN_END_MARKER, not by the action registry.
		const allPatterns = ACTION_REGISTRY.map(d => d.pattern.source).join('|')
		expect(allPatterns).not.toContain('✻')
	})

	describe('THINKING_SPINNER_RE', () => {
		it('matches each spinner glyph as a sole line', () => {
			for (const glyph of ['·', '✻', '✽', '✢', '✳', '✶']) {
				expect(THINKING_SPINNER_RE.test(glyph)).toBe(true)
			}
		})

		it('matches a run of spinner glyphs', () => {
			expect(THINKING_SPINNER_RE.test('···')).toBe(true)
			expect(THINKING_SPINNER_RE.test('✻✽')).toBe(true)
		})

		it('does NOT match a TURN_END marker (which starts with ✻ but has more)', () => {
			expect(THINKING_SPINNER_RE.test('✻ Sautéed for 3s')).toBe(false)
		})

		it('does NOT match assistant prose or action lines', () => {
			expect(THINKING_SPINNER_RE.test('hello world')).toBe(false)
			expect(THINKING_SPINNER_RE.test('⏺ Bash(ls)')).toBe(false)
		})
	})
})
