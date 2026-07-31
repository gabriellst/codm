import { describe, expect, it } from 'bun:test'
import { ContactKind, MailboxItemKind, StopKind } from '@codm/contracts-typescript/wire/enums'
import { AgentRunOutcome } from '../../enums'
import { toolNameOf, ForkIssueController, ResolveStopController, SteerIssueTurnController } from '../../mcp/exposure'
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
	mentionTag: '@codm',
	window: { seeded: true, entries: [] },
	// The DEFAULT is "nothing pending" — the state most turns are in. Every case below that does not
	// say otherwise is therefore also asserting, silently, that the section does not leak in.
	openStops: [],
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

	/**
	 * The operator's custom prompt has to REACH the model and has to arrive where it can win.
	 *
	 * Both halves are asserted because both fail silently. A section that renders but sits above the
	 * house voice loses every conflict with it, and the operator sees a text box that changed nothing —
	 * which is indistinguishable, from the console, from the feature not being wired at all.
	 */
	it('(h) a custom prompt is rendered VERBATIM and LAST, after the house defaults', () => {
		const customPrompt = 'Fale sempre em inglês com este cliente. Nunca prometa prazo.'

		const system = builder.system(operatorTurn({ customPrompt }))

		expect(system).toContain(customPrompt)
		expect(system.indexOf('INSTRUCTIONS FROM THE OPERATOR')).toBeGreaterThan(system.indexOf('HOW YOU TALK'))
		expect(system.trimEnd().endsWith(customPrompt)).toBe(true)
	})

	/** No prompt, no heading. A heading with nothing under it tells the model an instruction exists. */
	it('(i) no section at all when the operator never wrote one', () => {
		expect(builder.system(operatorTurn())).not.toContain('INSTRUCTIONS FROM THE OPERATOR')
	})

	/**
	 * AC-4 (issue-resume spec) — THE OPEN STOPS, and the instruction that makes them actionable.
	 *
	 * Decision 1 hands the JUDGEMENT to the model: no deterministic rule tries to read "pode seguir" or
	 * "usa a opção 2" out of a chat message. What the system owes it in exchange is the three things it
	 * cannot infer — WHICH question is open, WHAT was asked, and WHICH issue is waiting on the answer —
	 * plus the two tool names that close the loop. A prompt that listed the questions without naming
	 * the tools would produce a model that recognises the answer and does nothing with it.
	 */
	const stops = [
		{
			stopId: '00000000-0000-4000-8000-000000000001',
			issueId: '00000000-0000-4000-8000-000000000002',
			kind: StopKind.HUMAN_REQUESTED,
			title: 'Refund window',
			detail: 'Full or partial for orders older than 90 days?',
		},
		{
			// A THREAD-LEVEL stop: raised before any issue existed (B4, decision 4). There is nothing to
			// steer, and the prompt has to say so or the model calls the steer tool with no id.
			stopId: '00000000-0000-4000-8000-000000000003',
			kind: StopKind.APPROVAL_NEEDED,
			title: 'Drop the legacy column',
			detail: 'The migration drops `orders.legacy_ref` — confirm before I run it.',
		},
	]

	it('(j) AC-4 — the open stops are rendered with their issue, kind and the question that was asked', () => {
		const system = builder.system(operatorTurn({ openStops: stops }))

		expect(system).toContain('UNANSWERED QUESTIONS')
		for (const stop of stops) {
			// The id is what `ResolveStop` is called with — a listed question the model cannot name is a
			// question it cannot close.
			expect(system).toContain(stop.stopId)
			expect(system).toContain(stop.kind)
			// `title` + `detail` ARE "o que foi perguntado" — the two columns the stop actually has.
			expect(system).toContain(stop.title)
			expect(system).toContain(stop.detail)
		}
		// The issue waiting on the answer, so the steer can be aimed. Only the first stop has one.
		expect(system).toContain('00000000-0000-4000-8000-000000000002')
	})

	/**
	 * The tool names are DERIVED, exactly like `ForkIssue` in (d) — replace either with a literal and
	 * this goes red. Both are already in the `orchestration` scope, so the sentence names something the
	 * model can actually call; naming a tool outside its `--allowedTools` would produce a turn that
	 * narrates a call it cannot make, which is the failure `issues()` documents.
	 */
	it('(k) AC-4 — resolving and steering are named by the controller class, never typed out', () => {
		const system = builder.system(operatorTurn({ openStops: stops }))

		expect(system).toContain(toolNameOf(ResolveStopController))
		expect(system).toContain(toolNameOf(SteerIssueTurnController))
	})

	/**
	 * THE OTHER HALF OF AC-4, and the one that keeps the first honest: no stops, no section. A heading
	 * over an empty list tells a model that something is pending and then refuses to say what — which is
	 * how it starts asking the operator to confirm things nobody asked about.
	 */
	it('(l) AC-4 — a thread with nothing open renders no section at all', () => {
		const system = builder.system(operatorTurn())

		expect(system).not.toContain('UNANSWERED QUESTIONS')
		expect(system).not.toContain(toolNameOf(ResolveStopController))
	})

	/**
	 * THE MESSAGE THEY REPLIED TO — the half of the reply-invocation rule that was never built.
	 *
	 * Quoting the agent already lowers the mention gate (`IngestChannelMessage` computes `repliesToAgent`
	 * and `Thread.addressedToAgent` stands the tag down for it), so a reply SUMMONS the agent. What it
	 * did not do was tell it what it had been summoned ABOUT: the model was handed "sim, pode fazer" with
	 * no idea which of its own questions that answered.
	 *
	 * The failure is invisible to every other test in this file, and to the model itself — it does not
	 * error, it answers the wrong question confidently. Which is why the assertion is that the QUOTED
	 * TEXT is present, not merely that some heading rendered.
	 */
	const REPLIED_TO = 'quer que eu rode a migration agora ou depois do deploy?'

	const replyTurn = () =>
		operatorTurn({
			item: {
				kind: MailboxItemKind.OPERATOR_MESSAGE,
				entryId: '00000000-0000-4000-8000-0000000000dd',
				speaker: 'operator',
				text: 'depois',
				quotedAgentText: REPLIED_TO,
			},
		})

	it('(m) a turn that replies to the agent carries the QUOTED line, as the agent’s own words', () => {
		const user = builder.user(replyTurn())

		expect(user).toContain('THE MESSAGE THEY REPLIED TO')
		// The whole point: the text itself, not a flag saying a quote existed. "depois" is unanswerable
		// without it.
		expect(user).toContain(REPLIED_TO)
		// Attributed to the agent — an unlabelled line reads as somebody else's and gets answered as one.
		expect(user).toContain(`you: ${REPLIED_TO}`)
		// The live message still lands LAST: the quote is context for it, never a replacement for it.
		expect(user.indexOf('THE MESSAGE THEY REPLIED TO')).toBeLessThan(user.indexOf('THIS TURN'))
	})

	/**
	 * THE HALF THAT KEEPS THE FIRST HONEST. A section that always rendered would put a heading over
	 * nothing on the overwhelming majority of turns — the same failure mode `(l)` guards for stops, and
	 * the one that teaches a model to invent a message it was never shown.
	 */
	it('(n) an ordinary message renders no such section', () => {
		const user = builder.user(operatorTurn())

		expect(user).not.toContain('THE MESSAGE THEY REPLIED TO')
	})

	/**
	 * An ISSUE_RESULT turn is not born from a message at all, so there is structurally nothing it could
	 * be replying to — `OperatorMessageItemSchema` is the only member that carries the field.
	 */
	it('(o) an ISSUE_RESULT turn never renders it', () => {
		expect(builder.user(issueResultTurn())).not.toContain('THE MESSAGE THEY REPLIED TO')
	})
})
