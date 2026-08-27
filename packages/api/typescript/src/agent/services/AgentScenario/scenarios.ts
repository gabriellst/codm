import { ArtifactKind } from '@codm/contracts-typescript/wire/enums'
import type { AgentScenario, AgentScenarioId } from './AgentScenario'

/**
 * THE DECLARED ROTEIROS. Two audiences, one interpreter (`E2eStubAgentRunner`).
 *
 * `default` is what every correctness spec has always seen, unchanged down to the copy — the strings
 * below were static fields on the runner and on `E2eMcpDriver` before this file existed, and `04`,
 * `09`, `10` and `13` assert some of them literally. Moving them here changes where they are written,
 * never what they say.
 *
 * `demo-pt` and `demo-en` are the film's script (`.plans/2026-08-27-demo-roteirizada.md`) — synthetic
 * data, believable copy, and pauses long enough that a viewer can read the terminal while it fills.
 * They are built from ONE structure by `demoScenario` below, so the two languages are the same film:
 * same beats, same pauses, same cuts.
 */

/** The stable reply line spec `13` asserts on. Its wording is a contract with that spec. */
export const E2E_REPLY_LINE = 'e2e-agent: acknowledged — working on it'

/** Slugged into the issue key `04` asserts on (`e2e-agent-fix-the-login-bug`). */
const E2E_FORK_GOAL = 'e2e-agent: fix the login bug'

/** The artifact `04` reads back through `ListArtifacts` — a different query than the one that wrote it. */
const E2E_ARTIFACT_NAME = 'e2e-agent: run notes'
const E2E_ARTIFACT_REF = 'https://codm.local/e2e/run-notes'

/** Carried ON the completion declaration, never inferred from a clean exit (§4.3 rule 7). */
const E2E_COMPLETION_SUMMARY = 'e2e-agent: declared complete over MCP'

/**
 * The hermetic default: two lines, one side-effect-free tool pair, and the two declarations that keep
 * a tool-scoped run from stranding its issue at WORKING forever.
 *
 * No `afterMs` anywhere, and that absence is the point — a correctness suite polls for settled state,
 * so every millisecond of theatre here is a millisecond added to every spec that runs an agent.
 */
const DEFAULT_SCENARIO: AgentScenario = {
	id: 'default',
	// ONE act each, which the sequence repeats forever (see `AgentScenario`) — so every turn of every
	// spec sharing this daemon performs exactly what the hard-coded stand-in used to.
	orchestrator: [
		{
			echoesRunHeader: true,
			beats: [
				{ kind: 'SAY', text: E2E_REPLY_LINE },
				// A SECOND thinking phase ahead of the real fork declaration (thinking-indicator spec, T5/AC-3).
				// Side-effect-free on purpose: `RunOrchestratorTurn` tracks phases by `frame.tool` alone, so this
				// proves the placeholder advances by PHASE rather than by a fixed count, without putting a second
				// real MCP round trip in the path the other specs assert on.
				{ kind: 'TOOL', tool: 'e2e_stub_survey_context', input: {}, summary: 'context surveyed' },
			],
			declarations: [{ kind: 'FORK_ISSUE', goal: E2E_FORK_GOAL }],
		},
	],
	work: [
		{
			echoesRunHeader: true,
			beats: [{ kind: 'SAY', text: E2E_REPLY_LINE }],
			declarations: [
				{
					kind: 'RECORD_ARTIFACT',
					artifact: { kind: ArtifactKind.LINK, name: E2E_ARTIFACT_NAME, ref: { at: 'URL', url: E2E_ARTIFACT_REF }, meta: '{}' },
				},
				{ kind: 'COMPLETE_ISSUE', summary: E2E_COMPLETION_SUMMARY },
			],
		},
	],
}

/** The pull request the film ends on. Synthetic: `acme/web` is nobody's repository. */
export const DEMO_PR_URL = 'https://github.com/acme/web/pull/214'

/**
 * EVERY WORD THE FILM SAYS, in one language.
 *
 * Split out from the structure deliberately. The two films must cut at the same instants — the same
 * pause before the same beat — so that a change of language is a change of WORDS and nothing else.
 * Keeping the beats in `demoScenario` and the words here is what makes that true by construction
 * rather than by two literals maintained in parallel.
 */
interface DemoCopy {
	/**
	 * The issue's title, and — slugged — the key its row shows on screen.
	 *
	 * MUST BE FREE OF COMBINING MARKS, and that is a constraint on the film rather than a defect in the
	 * slugger. `shared/utils/slug.ts` states its rule out loud — NFKD, so `conversação` becomes
	 * `conversac-a-o` — and `MentionGate` refuses to couple to it precisely so the two can differ. A
	 * goal written "…na tela de cobrança" is perfectly legal and mints `…-cobranc-a`, which is correct
	 * and looks like a typo in a close-up. So the roteiro says the accented words in the CONVERSATION,
	 * where nothing slugs them, and keeps the title itself plain.
	 */
	readonly forkGoal: string
	/** The answer to the contact, on the turn that also forks the work. */
	readonly opening: string
	/** The `ISSUE_RESULT` turn — what the agent says once the issue is done. */
	readonly closing: string
	/** The narration of the working turn, in order. */
	readonly locating: string
	readonly found: string
	readonly green: string
	/** One-line results of the synthetic tool calls, in the order they run. */
	readonly results: {
		readonly files: string
		readonly lines: string
		readonly created: string
		readonly edited: string
		readonly typecheck: string
		readonly tests: string
		readonly pullRequest: string
	}
	/** Paths the run pretends to touch. Invented — `acme/web` is nobody's repository. */
	readonly paths: {
		readonly glob: string
		readonly globTyped: string
		readonly route: string
		readonly component: string
		readonly testTarget: string
	}
	/** The two artifacts the run declares. */
	readonly screenFile: string
	readonly screenMeta: string
	readonly pullRequestName: string
	readonly pullRequestMeta: string
	readonly completion: string
}

/**
 * THE FILM, in whichever language its copy is written.
 *
 * The conversation is short because the screen is the subject: one ask, one answer, then the work.
 * The working act is longer and paced, because it is the shot — the terminal panel filling at reading
 * speed is the whole "you can watch the agent work" claim the film makes.
 */
function demoScenario(id: AgentScenarioId, copy: DemoCopy): AgentScenario {
	return {
		id,
		orchestrator: [
			// ACT 1 — the answer to the contact, and the fork that starts the work.
			{
				// Nothing on screen admits the harness exists.
				echoesRunHeader: false,
				beats: [
					{ kind: 'SAY', text: copy.opening, afterMs: 1_400 },
					{ kind: 'TOOL', tool: 'Glob', input: { pattern: copy.paths.glob }, summary: copy.results.files, afterMs: 900 },
				],
				declarations: [{ kind: 'FORK_ISSUE', goal: copy.forkGoal }],
				declarationPaceMs: 700,
			},
			// ACT 2 — the `ISSUE_RESULT` turn, which the finished issue enqueues. It declares NOTHING (the
			// dispatcher gives this turn no originating entry, so a fork would be dropped anyway) and exists
			// to close the conversation the film opened.
			{
				echoesRunHeader: false,
				beats: [{ kind: 'SAY', text: copy.closing, afterMs: 1_200 }],
				declarations: [],
			},
		],
		work: [
			{
				echoesRunHeader: false,
				beats: [
					// THE LEAD-IN. A forked issue starts its working turn on its own, so this pause is the room the
					// operator has to notice the issue and open it before anything streams. Without it the terminal
					// would be replaying from the buffer by the time the panel mounts — correct, but not a shot.
					//
					// Was 9s, measured when the demo cursor crawled at ~258 px/s and two moves alone cost ~4s. The
					// canon cursor (`utils/cursor.ts`, 1.6 px/ms) makes those moves ~0.6s, so the same room is now
					// ~5s — and leaving it at 9 would put four seconds of empty terminal panel on film.
					{ kind: 'SAY', text: copy.locating, afterMs: 5_000 },
					{ kind: 'TOOL', tool: 'Glob', input: { pattern: copy.paths.globTyped }, summary: copy.results.files, afterMs: 1_100 },
					{ kind: 'TOOL', tool: 'Read', input: { file_path: copy.paths.route }, summary: copy.results.lines, afterMs: 1_600 },
					{ kind: 'SAY', text: copy.found, afterMs: 1_800 },
					{ kind: 'TOOL', tool: 'Write', input: { file_path: copy.paths.component }, summary: copy.results.created, afterMs: 2_000 },
					{ kind: 'TOOL', tool: 'Edit', input: { file_path: copy.paths.route }, summary: copy.results.edited, afterMs: 1_500 },
					{ kind: 'TOOL', tool: 'Bash', input: { command: 'bun tsc' }, summary: copy.results.typecheck, afterMs: 2_200 },
					{
						kind: 'TOOL',
						tool: 'Bash',
						input: { command: `bun test ${copy.paths.testTarget}` },
						summary: copy.results.tests,
						afterMs: 2_400,
					},
					{ kind: 'SAY', text: copy.green, afterMs: 1_600 },
					{
						kind: 'TOOL',
						tool: 'Bash',
						input: { command: 'gh pr create --fill' },
						summary: copy.results.pullRequest,
						afterMs: 2_000,
					},
				],
				declarations: [
					{
						kind: 'RECORD_ARTIFACT',
						artifact: {
							kind: ArtifactKind.IMAGE,
							name: copy.screenFile,
							ref: { at: 'WORKSPACE', relativePath: copy.screenFile },
							meta: copy.screenMeta,
						},
					},
					{
						kind: 'RECORD_ARTIFACT',
						artifact: {
							kind: ArtifactKind.LINK,
							name: copy.pullRequestName,
							ref: { at: 'URL', url: DEMO_PR_URL },
							meta: copy.pullRequestMeta,
						},
					},
					{ kind: 'COMPLETE_ISSUE', summary: copy.completion },
				],
				declarationPaceMs: 1_400,
			},
		],
	}
}

/** Slugs to `montar-o-resumo-do-plano-assinado`. */
const DEMO_PT: DemoCopy = {
	forkGoal: 'Montar o resumo do plano assinado',
	opening: 'Boa — vou montar o resumo do plano na tela de cobrança e te mando a prévia quando estiver de pé.',
	closing: 'Pronto. O resumo do plano está na tela de cobrança, os testes passaram e o PR está aberto — te mandei a prévia e o link.',
	locating: 'Vou localizar a tela de cobrança e ver onde o resumo do plano entra.',
	found: 'Achei: o card do plano existe, mas não renderiza o resumo. Vou criar o componente e ligar na rota.',
	green: 'Tudo verde. Vou capturar a tela e abrir o PR.',
	results: {
		files: '3 arquivos',
		lines: '142 linhas',
		created: 'componente criado',
		edited: '1 edição',
		typecheck: 'sem erros',
		tests: '8 testes, 8 passaram',
		pullRequest: 'PR #214 aberto',
	},
	paths: {
		glob: 'src/**/cobranca*',
		globTyped: 'src/**/cobranca*.tsx',
		route: 'src/rotas/cobranca/index.tsx',
		component: 'src/rotas/cobranca/-components/ResumoDoPlano/index.tsx',
		testTarget: 'src/rotas/cobranca',
	},
	screenFile: 'resumo-do-plano.png',
	screenMeta: 'Tela de cobrança com o resumo do plano',
	pullRequestName: 'PR #214 · Resumo do plano na cobrança',
	pullRequestMeta: 'Aberto · aguardando revisão',
	completion: 'Resumo do plano na tela de cobrança, com testes verdes e PR aberto.',
}

/** Slugs to `add-the-plan-summary-to-billing`. */
const DEMO_EN: DemoCopy = {
	forkGoal: 'Add the plan summary to billing',
	opening: "On it — I'll build the plan summary into the billing screen and send you a preview once it's up.",
	closing: 'Done. The plan summary is on the billing screen, the tests pass and the PR is open — preview and link are above.',
	locating: 'Let me find the billing screen and see where the plan summary belongs.',
	found: "Found it: the plan card is there but never renders the summary. I'll create the component and wire it into the route.",
	green: 'All green. Capturing the screen and opening the PR.',
	results: {
		files: '3 files',
		lines: '142 lines',
		created: 'component created',
		edited: '1 edit',
		typecheck: 'no errors',
		tests: '8 tests, 8 passed',
		pullRequest: 'PR #214 opened',
	},
	paths: {
		glob: 'src/**/billing*',
		globTyped: 'src/**/billing*.tsx',
		route: 'src/routes/billing/index.tsx',
		component: 'src/routes/billing/-components/PlanSummary/index.tsx',
		testTarget: 'src/routes/billing',
	},
	screenFile: 'plan-summary.png',
	screenMeta: 'Billing screen with the plan summary',
	pullRequestName: 'PR #214 · Plan summary on billing',
	pullRequestMeta: 'Open · awaiting review',
	completion: 'Plan summary on the billing screen, tests green and PR open.',
}

/** Every roteiro, by id. The ONE place a scenario is looked up — never a branch on the id. */
export const AGENT_SCENARIOS: Readonly<Record<AgentScenarioId, AgentScenario>> = {
	default: DEFAULT_SCENARIO,
	'demo-pt': demoScenario('demo-pt', DEMO_PT),
	'demo-en': demoScenario('demo-en', DEMO_EN),
}

/** What a daemon performs until something selects otherwise. */
export const DEFAULT_AGENT_SCENARIO_ID: AgentScenarioId = 'default'
