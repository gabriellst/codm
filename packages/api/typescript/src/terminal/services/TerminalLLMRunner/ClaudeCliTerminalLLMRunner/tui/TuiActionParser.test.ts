// packages/api/src/agent/services/TerminalLLMRunner/ClaudeCliTerminalLLMRunner/tui/TuiActionParser.test.ts
import { describe, it, expect } from 'bun:test'
import { TuiActionType, TuiMarker } from '../../../../enums'
import { TuiActionParser, type TuiActionEvent } from './TuiActionParser'

interface CapturedEmissions {
	actions: TuiActionEvent[]
	markers: TuiMarker[]
	order: Array<{ kind: 'action'; type: TuiActionType } | { kind: 'marker'; marker: TuiMarker }>
	warnLines: string[]
}

function captureParser(extraOpts: { now?: Date } = {}): { parser: TuiActionParser; cap: CapturedEmissions } {
	const cap: CapturedEmissions = { actions: [], markers: [], order: [], warnLines: [] }
	const parser = new TuiActionParser({
		onAction: ev => {
			cap.actions.push(ev)
			cap.order.push({ kind: 'action', type: ev.type })
		},
		onMarker: m => {
			cap.markers.push(m)
			cap.order.push({ kind: 'marker', marker: m })
		},
		onPasteWarn: msg => { cap.warnLines.push(msg) },
		clock: () => extraOpts.now ?? new Date('2026-05-20T18:42:00Z'),
	})
	return { parser, cap }
}

describe('TuiActionParser — action channel', () => {
	it('classifies a Bash action line and captures the command', () => {
		const { parser, cap } = captureParser()
		// Note: a single ⏺ line also fires RESPONSE_START on the signal
		// channel — assert only the action here (signal ordering covered
		// in the emission-order suite below).
		parser.feed('⏺ Bash(rg --files src)\n')
		const bashActions = cap.actions.filter(a => a.type === TuiActionType.BASH)
		expect(bashActions).toHaveLength(1)
		expect(bashActions[0]!.value).toBe('rg --files src')
		expect(bashActions[0]!.detectedAt).toEqual(new Date('2026-05-20T18:42:00Z'))
	})

	it('classifies each known action type', () => {
		const { parser, cap } = captureParser()
		parser.feed([
			'⏺ Edit(a.ts)',
			'⏺ Update(b.ts)',
			'⏺ Write(c.ts)',
			'⏺ Read(d.ts)',
			'⏺ Grep(foo)',
			'⏺ Glob(**/*.ts)',
			'⏺ Task(refactor)',
			'⏺ TodoWrite(',
		].join('\n') + '\n')
		// First ⏺ fires RESPONSE_START; subsequent ⏺ stay in RESPONDING
		// and only emit actions. Filter for actions only.
		const types = cap.actions.map(a => a.type)
		expect(types).toContain(TuiActionType.EDIT)
		expect(types).toContain(TuiActionType.UPDATE)
		expect(types).toContain(TuiActionType.WRITE)
		expect(types).toContain(TuiActionType.READ)
		expect(types).toContain(TuiActionType.GREP)
		expect(types).toContain(TuiActionType.GLOB)
		expect(types).toContain(TuiActionType.TASK)
		expect(types).toContain(TuiActionType.TODO_WRITE)
	})

	it('reassembles a line split across two feed() calls', () => {
		const { parser, cap } = captureParser()
		parser.feed('⏺ Bash(rg --fi')
		expect(cap.actions).toHaveLength(0)
		parser.feed('les src)\n')
		const bash = cap.actions.find(a => a.type === TuiActionType.BASH)
		expect(bash?.value).toBe('rg --files src')
	})

	it('strips ANSI escape sequences before classification', () => {
		const { parser, cap } = captureParser()
		parser.feed('\x1b[33m⏺ Bash(ls)\x1b[0m\n')
		const bash = cap.actions.find(a => a.type === TuiActionType.BASH)
		expect(bash?.value).toBe('ls')
	})

	it('suppresses spinner-only lines (no events, no markers)', () => {
		const { parser, cap } = captureParser()
		parser.feed(['·', '✻', '✽', '✢', '✳', '✶'].join('\n') + '\n')
		expect(cap.actions).toHaveLength(0)
		expect(cap.markers).toHaveLength(0)
	})

	it('falls back to UNKNOWN for a ⏺-prefixed line that no registry entry matches', () => {
		const { parser, cap } = captureParser()
		parser.feed('⏺ MultiEdit(packages/api/src/foo.ts)\n')
		const unknown = cap.actions.find(a => a.type === TuiActionType.UNKNOWN)
		expect(unknown).toBeDefined()
		expect(unknown!.value).toBe('⏺ MultiEdit(packages/api/src/foo.ts)')
	})

	it('skips lines that are neither registry matches nor ⏺-prefixed', () => {
		const { parser, cap } = captureParser()
		parser.feed('1 MCP server needs auth · /mcp\n')
		parser.feed('Visual Studio Code disconnected\n')
		parser.feed('───────────────\n')
		expect(cap.actions).toHaveLength(0)
		expect(cap.markers).toHaveLength(0)
	})
})

describe('TuiActionParser — signal channel', () => {
	it('happy-path single turn emits [RESPONSE_START, TURN_END_MARKER, NEXT_PROMPT]', () => {
		const { parser, cap } = captureParser()
		parser.armForSubmit()
		// echo of user message (first ❯) — IGNORED in WAITING_FOR_RESPONSE
		parser.feed('❯ user message echo\n')
		expect(cap.markers).toHaveLength(0)
		// ⏺ — RESPONSE_START transition
		parser.feed('⏺ Thinking through the request...\n')
		// ✻ — TURN_END_MARKER (stay in RESPONDING)
		parser.feed('✻ Sautéed for 3s\n')
		// ❯ after RESPONDING — NEXT_PROMPT
		parser.feed('❯\n')
		expect(cap.markers).toEqual([
			TuiMarker.RESPONSE_START,
			TuiMarker.TURN_END_MARKER,
			TuiMarker.NEXT_PROMPT,
		])
	})

	it('emits [RESPONSE_START, NEXT_PROMPT] when ✻ is absent (third detector path)', () => {
		const { parser, cap } = captureParser()
		parser.armForSubmit()
		parser.feed('❯ echoed user msg\n')
		parser.feed('⏺ Done.\n')
		parser.feed('❯\n')
		expect(cap.markers).toEqual([
			TuiMarker.RESPONSE_START,
			TuiMarker.NEXT_PROMPT,
		])
	})

	it('the FIRST ❯ (user-message echo) before ⏺ does NOT fire NEXT_PROMPT', () => {
		const { parser, cap } = captureParser()
		parser.armForSubmit()
		parser.feed('❯\n')
		parser.feed('❯ user said something\n')
		expect(cap.markers).toHaveLength(0)
	})

	it('only the SECOND ❯ (after ⏺) fires NEXT_PROMPT', () => {
		const { parser, cap } = captureParser()
		parser.armForSubmit()
		parser.feed('❯ user msg\n')
		parser.feed('⏺ replying\n')
		parser.feed('❯\n')
		expect(cap.markers.filter(m => m === TuiMarker.NEXT_PROMPT)).toHaveLength(1)
	})

	it('matches multi-minute TURN_END_MARKER format', () => {
		const { parser, cap } = captureParser()
		parser.armForSubmit()
		parser.feed('⏺ ok\n')
		parser.feed('✻ Cooked for 1m 33s\n')
		expect(cap.markers).toContain(TuiMarker.TURN_END_MARKER)
	})

	it('[Pasted text #N] fires onPasteWarn (no marker emission)', () => {
		const { parser, cap } = captureParser()
		parser.armForSubmit()
		parser.feed('[Pasted text #1]\n')
		expect(cap.markers).toHaveLength(0)
		expect(cap.warnLines).toHaveLength(1)
		expect(cap.warnLines[0]).toContain('Pasted text')
	})

	it('armForSubmit re-arms across turns (RESPONSE_START fires again next turn)', () => {
		const { parser, cap } = captureParser()
		// Turn 1
		parser.armForSubmit()
		parser.feed('⏺ first reply\n')
		parser.feed('❯\n')
		// Turn 2
		parser.armForSubmit()
		parser.feed('⏺ second reply\n')
		parser.feed('❯\n')
		const responseStarts = cap.markers.filter(m => m === TuiMarker.RESPONSE_START)
		expect(responseStarts).toHaveLength(2)
	})

	it('without armForSubmit re-arm, a second turn would mis-fire NEXT_PROMPT on the echo', () => {
		// Regression guard for the bug described in the armForSubmit docstring.
		const { parser, cap } = captureParser()
		parser.armForSubmit()
		parser.feed('⏺ reply 1\n')
		parser.feed('❯\n')
		// We DELIBERATELY skip armForSubmit() here. The echo of turn 2's
		// user message should now mis-fire NEXT_PROMPT (state is still
		// WAITING_FOR_RESPONSE from the previous NEXT_PROMPT transition,
		// so the echo ❯ is ignored — that's actually safe). The bug is
		// the OTHER direction: if turn 2 starts with state stuck in
		// RESPONDING, the echo ❯ fires NEXT_PROMPT immediately. We
		// reproduce that here by NOT emitting the closing ❯ of turn 1:
		const { parser: p2, cap: c2 } = captureParser()
		p2.armForSubmit()
		p2.feed('⏺ reply\n')
		// turn 1 leaves RESPONDING state without a closing ❯
		// turn 2 begins WITHOUT armForSubmit re-arm — the echo ❯ now
		// fires NEXT_PROMPT incorrectly.
		p2.feed('❯ echoed turn 2 user msg\n')
		expect(c2.markers).toContain(TuiMarker.NEXT_PROMPT)
		// With armForSubmit() between turns, the bug would NOT happen
		// because armForSubmit resets state to WAITING_FOR_RESPONSE.
	})
})

describe('TuiActionParser — emission order', () => {
	it('for a ⏺ Bash(cmd) line, emits onMarker(RESPONSE_START) BEFORE onAction(BASH)', () => {
		const { parser, cap } = captureParser()
		parser.armForSubmit()
		parser.feed('⏺ Bash(ls -la)\n')
		// First emission: signal channel (RESPONSE_START).
		// Second emission: action channel (BASH).
		expect(cap.order[0]).toEqual({ kind: 'marker', marker: TuiMarker.RESPONSE_START })
		expect(cap.order[1]).toEqual({ kind: 'action', type: TuiActionType.BASH })
	})

	it('for a ⏺ Bash line that is NOT the first ⏺ of the turn, emits only the action', () => {
		const { parser, cap } = captureParser()
		parser.armForSubmit()
		parser.feed('⏺ first\n')
		// RESPONDING state — next ⏺ does NOT re-fire RESPONSE_START.
		const beforeMarkers = cap.markers.length
		parser.feed('⏺ Bash(ls)\n')
		expect(cap.markers.length).toBe(beforeMarkers) // no new marker
		expect(cap.actions[cap.actions.length - 1]!.type).toBe(TuiActionType.BASH)
	})
})
