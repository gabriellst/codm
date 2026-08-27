import { describe, expect, it } from 'bun:test'
import { ArtifactKind } from '@codm/contracts-typescript/wire/enums'
import type { AgentScenarioAct } from './AgentScenario'
import { AgentScenarioSelection } from './AgentScenarioSelection'
import { AGENT_SCENARIOS, E2E_REPLY_LINE } from './scenarios'

/**
 * The Nth act of a sequence, asserted to exist.
 *
 * `AgentScenario` guarantees only that a sequence is non-empty, which is the honest guarantee: a
 * roteiro with one act is legal and `default` is exactly that. So a test that wants act 2 has to say
 * so out loud rather than index and hope — and gets a named failure when a roteiro loses a scene.
 */
function actAt(acts: readonly AgentScenarioAct[], index: number): AgentScenarioAct {
	const act = acts[index]
	if (!act) throw new Error(`the roteiro declares no act at index ${index} (it has ${acts.length})`)
	return act
}

/** Everything an act says out loud, in order. */
function said(act: AgentScenarioAct): string[] {
	return act.beats.filter(beat => beat.kind === 'SAY').map(beat => beat.text)
}

/**
 * The roteiro contract, in the two ways it can break.
 *
 * 1. SEQUENCING — an act sequence is the whole reason this type exists (an orchestrator gets a
 *    conversational turn AND an `ISSUE_RESULT` turn, and they must not say the same thing). Getting
 *    the order or the past-the-end behaviour wrong is invisible to `tsc` and invisible to every spec
 *    that only polls for settled state.
 * 2. COPY DRIFT — `default` is a CONTRACT with the e2e suite: `04` asserts the forked issue's slug
 *    key, `13` asserts the reply line verbatim. Those specs need a booted daemon, a browser and a
 *    scratch database to fail; the assertions below need none of that, so drift is caught here first.
 */
describe('AgentScenarioSelection — the script plays in order', () => {
	it('starts on `default`, whose single act repeats for every turn', () => {
		const selection = new AgentScenarioSelection()

		expect(selection.currentId).toBe('default')
		// Five turns, one act — a shared daemon runs many specs, and none of them may advance another's
		// script. This is the property that makes the sequence model safe to introduce at all.
		for (let turn = 0; turn < 5; turn++) {
			expect(selection.nextOrchestratorAct()).toBe(actAt(AGENT_SCENARIOS.default.orchestrator, 0))
			expect(selection.nextWorkAct()).toBe(actAt(AGENT_SCENARIOS.default.work, 0))
		}
	})

	it('hands out `demo-pt`s acts in order and then holds on the last one', () => {
		const selection = new AgentScenarioSelection()
		selection.select('demo-pt')

		expect(selection.currentId).toBe('demo-pt')
		expect(selection.nextOrchestratorAct()).toBe(actAt(AGENT_SCENARIOS['demo-pt'].orchestrator, 0))
		expect(selection.nextOrchestratorAct()).toBe(actAt(AGENT_SCENARIOS['demo-pt'].orchestrator, 1))
		// A mailbox retry, a second inbound, a steer — a run is not obliged to stop when the script does.
		expect(selection.nextOrchestratorAct()).toBe(actAt(AGENT_SCENARIOS['demo-pt'].orchestrator, 1))
	})

	it('rewinds on select, so a scenario never starts mid-performance', () => {
		const selection = new AgentScenarioSelection()
		selection.select('demo-pt')
		selection.nextOrchestratorAct()

		selection.select('demo-pt')

		expect(selection.nextOrchestratorAct()).toBe(actAt(AGENT_SCENARIOS['demo-pt'].orchestrator, 0))
	})

	it('the two orchestrator acts of a demo roteiro do not say the same thing', () => {
		// The defect the sequence exists to prevent, asserted directly: one act per agent made the
		// `ISSUE_RESULT` turn repeat the opening line into the operator's own conversation.
		const opening = actAt(AGENT_SCENARIOS['demo-pt'].orchestrator, 0)
		const closing = actAt(AGENT_SCENARIOS['demo-pt'].orchestrator, 1)

		expect(said(opening)).not.toEqual(said(closing))
		expect(said(closing).length).toBeGreaterThan(0)
	})

	it('only the opening act forks — the ISSUE_RESULT turn declares nothing', () => {
		// Not merely cosmetic: `MailboxDispatcher` gives an ISSUE_RESULT turn no originating entry, so a
		// fork declared there would be dropped by `E2eMcpDriver` anyway. Declaring none says so out loud.
		expect(actAt(AGENT_SCENARIOS['demo-pt'].orchestrator, 0).declarations.map(declaration => declaration.kind)).toEqual(['FORK_ISSUE'])
		expect(actAt(AGENT_SCENARIOS['demo-pt'].orchestrator, 1).declarations).toEqual([])
	})
})

describe('the two demo roteiros are the SAME film in two languages', () => {
	/** The shape of an act with every word removed — beats by kind and tool, and the pauses. */
	const rhythmOf = (act: AgentScenarioAct) => ({
		echoesRunHeader: act.echoesRunHeader,
		declarationPaceMs: act.declarationPaceMs,
		beats: act.beats.map(beat => ({ kind: beat.kind, tool: beat.kind === 'TOOL' ? beat.tool : null, afterMs: beat.afterMs })),
		declarations: act.declarations.map(declaration => declaration.kind),
	})

	it('cut for cut, pause for pause', () => {
		// The invariant `demoScenario` exists to guarantee: a change of language is a change of WORDS and
		// nothing else, so the two videos can be cut against the same timeline. Two literals maintained
		// in parallel would drift here silently — one extra beat, one pause nudged — and the only place it
		// would show is a viewer noticing the English take runs a second longer.
		for (const agent of ['orchestrator', 'work'] as const) {
			const pt = AGENT_SCENARIOS['demo-pt'][agent].map(rhythmOf)
			const en = AGENT_SCENARIOS['demo-en'][agent].map(rhythmOf)
			expect(en).toEqual(pt)
		}
	})

	it('and they share not one line of copy', () => {
		// The other half: identical rhythm must not mean identical text. Catches a roteiro added by
		// copy-paste where a line was never translated.
		const linesOf = (id: 'demo-pt' | 'demo-en') => [...AGENT_SCENARIOS[id].orchestrator, ...AGENT_SCENARIOS[id].work].flatMap(said)
		const shared = linesOf('demo-pt').filter(line => linesOf('demo-en').includes(line))

		expect(shared).toEqual([])
	})
})

describe('the `default` roteiro is a contract with the e2e suite', () => {
	it('still says the line `13-thinking-indicator` asserts verbatim', () => {
		expect(actAt(AGENT_SCENARIOS.default.orchestrator, 0).beats).toContainEqual({ kind: 'SAY', text: E2E_REPLY_LINE })
		expect(E2E_REPLY_LINE).toBe('e2e-agent: acknowledged — working on it')
	})

	it('still forks the goal `04-inbound-issue` expects to see slugged into the issue key', () => {
		const fork = actAt(AGENT_SCENARIOS.default.orchestrator, 0).declarations.find(declaration => declaration.kind === 'FORK_ISSUE')

		// `04` asserts the KEY `e2e-agent-fix-the-login-bug`, which is this goal slugged server-side.
		expect(fork).toEqual({ kind: 'FORK_ISSUE', goal: 'e2e-agent: fix the login bug' })
	})

	it('still records the artifact `04` reads back through ListArtifacts, and still declares completion', () => {
		expect(actAt(AGENT_SCENARIOS.default.work, 0).declarations).toEqual([
			{
				kind: 'RECORD_ARTIFACT',
				artifact: {
					kind: ArtifactKind.LINK,
					name: 'e2e-agent: run notes',
					ref: { at: 'URL', url: 'https://codm.local/e2e/run-notes' },
					meta: '{}',
				},
			},
			{ kind: 'COMPLETE_ISSUE', summary: 'e2e-agent: declared complete over MCP' },
		])
	})

	it('takes no time at all — theatre belongs to roteiros that are watched', () => {
		// Every spec that runs an agent pays for a pause declared here, and pays for it on every turn.
		const paused = [...AGENT_SCENARIOS.default.orchestrator, ...AGENT_SCENARIOS.default.work].flatMap(act => [
			...act.beats.map(beat => beat.afterMs),
			act.declarationPaceMs,
		])

		expect(paused.filter(Boolean)).toEqual([])
	})
})
