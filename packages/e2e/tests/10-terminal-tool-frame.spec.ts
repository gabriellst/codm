import { test, expect } from '../utils/test'
import { createIssue, getSessionIssues } from '@codm/client-typescript/typescript'
import { givenFreshUser, givenAttachedThread, runIssueTurn } from '../utils/given'
import { authenticateCloudSession } from '../utils/given/cloud'

/**
 * Canonical flow (g) — AC-7.3: the re-keyed SSE action frame, END TO END, in a real browser.
 *
 * Fase 7 re-keyed `TerminalActionFrameSchema` off the nine-member TUI action enum and onto the CLI's
 * REAL tool name (`tool: z.string()`, an open set) plus a one-line input summary. That is a wire
 * change, so proving it needs the whole chain to RUN, not to compile: decoder frame → accumulator →
 * `AgentStreamRegistry.send` → the SSE controller → the browser's EventSource → the console panel's
 * DOM. Everything under that chain is real (real daemon, real SQLite, real MCP endpoint, real
 * generated tools, real React app); only the provider CLI is the hermetic stub, per §8 rule 8.
 *
 * ### The tool names asserted here CANNOT be produced by anything but the re-key
 * `mcp__codm__TransitionIssueStatus` and `mcp__codm__RecordArtifact` are names the MCP layer
 * derives from `operationId`s at generation time. No TUI regex could ever have emitted them (that
 * enum's widest member was `UNKNOWN`) and no fixture in the app spells them — so a panel showing them
 * has necessarily received the real `tool` field off a real `tool_use` frame over the real transport.
 * Before this phase the same frames reached the panel only as a pre-flattened `⏺ Tool(args)` STRING
 * on the output frame, with no `tool` field to read.
 *
 * ### Ordering, and why none of it is a sleep
 * The daemon drops SSE frames when no observer is attached, so the panel has to be attached before the
 * run streams. Every step below waits on an observable condition — the issue materializing, the panel
 * reporting the stream CONNECTED — and the turn is triggered explicitly, last. Nothing races.
 */
test('the console panel receives the REAL tool name on the re-keyed SSE action frame', async ({ page, goto }) => {
	// A real browser boot on a cold dev server plus a full agent turn; the 30s file default is thin.
	test.setTimeout(90_000)

	const { session } = await givenFreshUser({})
	const thread = await givenAttachedThread(session)

	// The spec opens its OWN issue through the real endpoint, which is what makes the id known ahead of
	// any run. Its row materializes asynchronously off `integration.issue.opened`, so wait for the read
	// model rather than assuming — the panel's detail query needs it.
	const opened = await createIssue(thread.threadId, { title: 'Stream the tool frame', provider: 'CLAUDE_CODE' }, { client: session.client })
	await expect
		.poll(
			async () => {
				const issues = await getSessionIssues(thread.threadId, { client: session.client })
				return issues.groups.flatMap(group => group.items).map(item => item.issueId)
			},
			{ timeout: 20_000, message: 'the created issue never materialized into the read model' },
		)
		.toContain(opened.issueId)

	// Attach the panel. `terminal-stream-connected` renders on the SSE `onopen`, and the daemon claims
	// this browser as the issue's observer synchronously, before those response headers exist — so
	// seeing the badge means the slot is held and no frame can be dropped from here on.
	// CloudSessionGate passou a envolver as rotas (app) DEPOIS que este spec foi escrito; sem o
	// token semeado toda navegação cai em /login. Ver utils/given/cloud.ts.
	await authenticateCloudSession(page)

	await goto('/threads/$threadId/issues/$issueId', { threadId: thread.threadId, issueId: opened.issueId })
	await expect(page.getByTestId('terminal-stream-connected')).toBeVisible({ timeout: 60_000 })

	// Only now does anything run. The turn is the real use case — real agent, real tool scope, real MCP
	// round trip — and it declares an artifact and then the completion over the generated tools.
	const turn = await runIssueTurn(session, {
		issueId: opened.issueId,
		threadId: thread.threadId,
		key: opened.key,
		title: 'Stream the tool frame',
		workspacePath: thread.workspacePath,
		prompt: 'stream the tool frame please',
	})
	expect(turn.outcome).toBe('COMPLETED')

	// THE ASSERTION — a structured action row carrying the generated MCP tool name, rendered from the
	// `tool` field that did not exist on this frame before this phase.
	const tools = page.getByTestId('terminal-action-tool')
	await expect(tools.filter({ hasText: 'mcp__codm__TransitionIssueStatus' })).toBeVisible({ timeout: 30_000 })

	// …and the artifact tool that preceded it, so the panel is shown rendering the OPEN set rather than
	// one recognized name.
	await expect(tools.filter({ hasText: 'mcp__codm__RecordArtifact' })).toBeVisible()

	// The input summary rides the same frame — "which tool" AND "on what", the §4.9 net gain.
	await expect(page.getByTestId('terminal-action').filter({ hasText: 'mcp__codm__TransitionIssueStatus' })).toContainText(
		`issueId: ${opened.issueId}`,
	)
})
