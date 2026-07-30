import { describe, expect, it } from 'bun:test'
import { ContactKind, MailboxItemKind } from '@codedm/contracts-typescript/wire/enums'
import { AgentRunOutcome } from '../../enums'
import { toolNameOf, ForkIssueController } from '../../mcp/exposure'
import { OrchestratorPromptBuilder } from './prompt'

/**
 * AC-T1.2 — the voice of the product, pinned.
 *
 * No other prompt builder in this repo has a colocated test, and that was defensible while a prompt
 * was an internal instruction to a classifier. This one is different: it is the entire personality of
 * the thing the operator talks to, and its branches (D6 quoting, D3 room handling, the composition
 * instruction) fail SILENTLY — a missing paragraph does not throw, it just produces a turn that reads
 * slightly wrong to a human, in a real conversation, once.
 *
 * What is asserted here is deliberately STRUCTURAL, never the prose: the wording is the founder's to
 * change without breaking a build. What must not change by accident is which paragraph appears in
 * which situation, and that the tool name is derived rather than typed.
 */
const base = {
	ownerId: '00000000-0000-4000-8000-0000000000aa',
	threadId: '00000000-0000-4000-8000-0000000000bb',
	cwd: '/Users/dev/project',
	contactKind: ContactKind.GROUP,
	mentionTag: '@codedm',
	window: { seeded: true, entries: [] },
}

const operatorTurn = (overrides: Record<string, unknown> = {}) =>
	({
		...base,
		item: {
			kind: MailboxItemKind.OPERATOR_MESSAGE,
			entryId: '00000000-0000-4000-8000-0000000000dd',
			speaker: 'operator',
			text: 'o código está da maneira tal?',
		},
		...overrides,
	}) as Parameters<OrchestratorPromptBuilder['system']>[0]

const issueResultTurn = () =>
	({
		...base,
		item: {
			kind: MailboxItemKind.ISSUE_RESULT,
			issueKey: 'dark-mode-toggle',
			outcome: { kind: AgentRunOutcome.COMPLETED, replyText: 'Added the toggle. 4 files, tsc green.' },
		},
	}) as Parameters<OrchestratorPromptBuilder['system']>[0]

describe('OrchestratorPromptBuilder', () => {
	const builder = new OrchestratorPromptBuilder()

	it('(a) an OPERATOR_MESSAGE turn in a GROUP renders QUOTING, carrying the consumed item id', () => {
		const system = builder.system(operatorTurn())

		expect(system).toContain('QUOTING')
		// The id the model is allowed to cite is the one it was just handed — never an arbitrary entry.
		expect(system).toContain('[quote: 00000000-0000-4000-8000-0000000000dd]')
	})

	/**
	 * D6's mandatory half is NOT the model's decision: the issue return always cites `originEntryId`,
	 * and `RunOrchestratorTurn` sets `replyToEntryId` itself. Rendering a quoting POLICY here would put
	 * a permission and a mandate about the same mechanism in one prompt, and the model would sometimes
	 * emit a sentinel that the use case then has to fight.
	 */
	it('(b) an ISSUE_RESULT turn renders NO quoting policy', () => {
		const system = builder.system(issueResultTurn())

		expect(system).not.toContain('QUOTING')
		expect(system).not.toContain('[quote:')
	})

	it('(c) a 1:1 conversation does not render the group paragraph', () => {
		const group = builder.system(operatorTurn())
		const direct = builder.system(operatorTurn({ contactKind: ContactKind.USER }))

		expect(group).toContain('other people talk here too')
		expect(direct).not.toContain('other people talk here too')
		// Telling a model to ignore "everyone else" where there is no-one else invites it to invent an
		// audience, which is why this is a branch rather than one paragraph that always renders.
		expect(direct).toContain('one-to-one')
	})

	/**
	 * THE FALSIFIER FOR (d): replace `toolNameOf(ForkIssueController)` in `prompt.ts` with a string
	 * literal and this goes red. The rule it protects is the house one — a tool name is DERIVED from
	 * the controller class so a rename follows the symbol and the class cannot drift from the sentence
	 * naming it.
	 *
	 * It names the controller NOMINALLY rather than taking `[0]` off a scope list: the predecessor list
	 * was hand-ordered, the scan orders alphabetically, and a positional read would have changed
	 * meaning SILENTLY.
	 */
	it('(d) the tool name is derived from the controller class, not from a literal', () => {
		const createIssue = toolNameOf(ForkIssueController)

		expect(createIssue).toBeDefined()
		expect(builder.system(operatorTurn())).toContain(createIssue)
	})

	/**
	 * AC-B4.1 — the orchestrator MAY write, and is told to prefer forking.
	 *
	 * The first version forbade writing outright and the founder rejected it in use: the agent answered
	 * a trivial edit request with a flat "No.". Asserted as an absence AND a presence, because either
	 * half alone is satisfiable by accident — a prompt that merely dropped the prohibition would let it
	 * happily block the conversation doing long work, which is the cost the prohibition existed for.
	 */
	it('AC-B4.1 — no blanket write prohibition, and forking is the stated default', () => {
		const system = builder.system(operatorTurn())

		expect(system).not.toContain('You change NOTHING there')
		expect(system).toContain('FORK AN ISSUE')
		// The reason has to travel with the rule, or it reads as arbitrary and gets rationalised away.
		expect(system).toContain('SERIALIZED')
		// Blast-radius exceptions survive: these are not "busy", they are shared ground.
		expect(system).toContain('rewriting git history')
	})

	it('(e) the composition instruction appears only on a result turn, and never pastes the notes', () => {
		const user = builder.user(issueResultTurn())

		expect(user).toContain("worker's notes")
		expect(user).toContain('Do not paste the notes')
		// The worker's text is present as INPUT — the instruction is what stops it being echoed.
		expect(user).toContain('Added the toggle. 4 files, tsc green.')
		expect(builder.user(operatorTurn())).not.toContain("worker's notes")
	})

	it('(f) an addressed line is marked, an overheard one is not (D3)', () => {
		const user = builder.user(
			operatorTurn({
				window: {
					seeded: true,
					entries: [
						{ speaker: 'operator', text: 'subi o build', addressed: true },
						{ speaker: 'Marina', text: 'alguém mexeu no toggle?', addressed: false },
					],
				},
			}),
		)

		expect(user).toContain('operator → you: subi o build')
		expect(user).toContain('Marina: alguém mexeu no toggle?')
		expect(user).not.toContain('Marina → you')
	})

	it('(g) a RESUMED session is labelled as the tail, not as the whole conversation', () => {
		const entries = [{ speaker: 'Marina', text: 'oi', addressed: false }]

		expect(builder.user(operatorTurn({ window: { seeded: true, entries } }))).toContain('CONVERSATION SO FAR')
		expect(builder.user(operatorTurn({ window: { seeded: false, entries } }))).toContain('SINCE YOU LAST SPOKE')
	})
})
