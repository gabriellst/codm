import { describe, expect, it } from 'bun:test'
import { AgentModelId } from '@codm/contracts-typescript/wire/enums'
// Tool names are DERIVED, never typed as literals: the whole point of AC-6.17 is that the Fase-1
// tool-name spellings are unreachable under generated tools, and a literal here would be the second
// source of truth this phase deletes. The spelling has always been owned by `mcp/wire.ts`; the
// manifest only re-exported it.
import { wireToolName } from '../../../mcp/wire'
import type { AgentToolName } from '../../../enums'
import type { AgentMcpInvocation } from '../../../types/AgentMcpInvocation'
import { ClaudeAgentRunner, type ClaudeBuildArgsOptions } from './ClaudeAgentRunner'

/**
 * The contract-lock tests for the argv of `claude` (GOAL-agent-abstraction AC-1.1 / AC-1.2), carried
 * over Fase 4.5 ONTO THE RUNNER (AC-4.5.5). Not one assertion about the invocation was weakened: what
 * changed is the subject — `providerDef(CLAUDE_CODE).buildArgs` became `ClaudeAgentRunner.buildArgs`,
 * the same function, now on the class that spawns with it.
 *
 * What DID die with the def registry are the two blocks that asserted the *degraded* providers
 * (`streamFormat: 'plain'`, `['exec']`, `['run']`) and the exhaustiveness of the def registry. The
 * first described a capability set never verified for either binary — the risk AC-1.8 registered out
 * loud — and it is precisely the contradiction Fase 4.5 removed: a stream format is a parsing path,
 * not an argv, so it could never have been honoured without the provider-identity branch the data
 * literal existed to forbid. The exhaustiveness half survives where the value-set still lives: over
 * `PROVIDER_BINARIES`, in `ProviderDetector.test.ts`.
 */

const CWD = '/Users/dev/repos/codm'

const opts = (overrides: Partial<ClaudeBuildArgsOptions> = {}): ClaudeBuildArgsOptions => ({
	cwd: CWD,
	caps: {},
	...overrides,
})

const mcp = (
	allowedTools: readonly AgentToolName[] = [wireToolName('TransitionIssueStatus'), wireToolName('RaiseStop')],
): AgentMcpInvocation => ({
	transport: 'http',
	endpoint: 'http://127.0.0.1:3030/mcp',
	token: 'run-token-opaque',
	allowedTools,
})

describe('AC-1.1 — ClaudeAgentRunner.buildArgs produces EXACTLY the spec argv', () => {
	it('the baseline invocation is the spec line, verbatim and in order', () => {
		// .specs/codedm/2026-07-26-agent-driving-stream-json.md:14-18 — with every optional segment
		// absent, what is left is the mandatory spine of the invocation.
		expect(ClaudeAgentRunner.buildArgs(opts())).toEqual([
			'-p',
			'--input-format',
			'stream-json',
			'--output-format',
			'stream-json',
			'--verbose',
			'--permission-mode',
			'auto',
		])
	})

	it('--include-partial-messages appears ONLY when caps.partialMessages', () => {
		const withCap = ClaudeAgentRunner.buildArgs(opts({ caps: { partialMessages: true } }))
		const withoutCap = ClaudeAgentRunner.buildArgs(opts({ caps: {} }))
		expect(withCap).toContain('--include-partial-messages')
		expect(withoutCap).not.toContain('--include-partial-messages')
		// And it is capability-gated, not model-gated or version-gated: nothing else moved.
		expect(withCap.filter(a => a !== '--include-partial-messages')).toEqual(withoutCap)
	})

	it('--model is OMITTED for AgentModelId.DEFAULT and for an absent model, and aliased otherwise', () => {
		expect(ClaudeAgentRunner.buildArgs(opts({ model: AgentModelId.DEFAULT }))).not.toContain('--model')
		expect(ClaudeAgentRunner.buildArgs(opts())).not.toContain('--model')

		const sonnet = ClaudeAgentRunner.buildArgs(opts({ model: AgentModelId.SONNET }))
		expect(sonnet.slice(sonnet.indexOf('--model'), sonnet.indexOf('--model') + 2)).toEqual(['--model', 'sonnet'])
		expect(ClaudeAgentRunner.buildArgs(opts({ model: AgentModelId.OPUS }))).toContain('opus')
		expect(ClaudeAgentRunner.buildArgs(opts({ model: AgentModelId.HAIKU }))).toContain('haiku')
		// DEFAULT must never leak through as a literal string — that would be the bug the enum exists
		// to prevent (`--model DEFAULT` is not a model any CLI knows).
		expect(ClaudeAgentRunner.buildArgs(opts({ model: AgentModelId.DEFAULT }))).not.toContain('DEFAULT')
	})

	it('--resume and --session-id are MUTUALLY EXCLUSIVE, with resume winning when both are passed', () => {
		const resuming = ClaudeAgentRunner.buildArgs(opts({ resumeSessionId: 'sess-old' }))
		expect(resuming).toContain('--resume')
		expect(resuming).not.toContain('--session-id')

		const pinning = ClaudeAgentRunner.buildArgs(opts({ newSessionId: 'sess-new' }))
		expect(pinning).toContain('--session-id')
		expect(pinning).not.toContain('--resume')

		// Contradictory instructions from a buggy caller must NEVER reach the CLI as both flags —
		// the resulting behaviour would be version-dependent. Exclusivity is structural here.
		const both = ClaudeAgentRunner.buildArgs(opts({ resumeSessionId: 'sess-old', newSessionId: 'sess-new' }))
		expect(both).toContain('--resume')
		expect(both).not.toContain('--session-id')
		expect(both).not.toContain('sess-new')
	})

	it('--add-dir is emitted once per extra dir', () => {
		const args = ClaudeAgentRunner.buildArgs(opts({ extraDirs: ['/tmp/a', '/tmp/b'] }))
		expect(args.filter(a => a === '--add-dir')).toHaveLength(2)
		expect(args).toContain('/tmp/a')
		expect(args).toContain('/tmp/b')
	})

	it('--mcp-config + --allowedTools appear ONLY when the request carries an mcp invocation', () => {
		const withoutMcp = ClaudeAgentRunner.buildArgs(opts())
		expect(withoutMcp).not.toContain('--mcp-config')
		expect(withoutMcp).not.toContain('--allowedTools')

		const withMcp = ClaudeAgentRunner.buildArgs(opts({ mcp: mcp() }))
		expect(withMcp).toContain('--mcp-config')
		const config = JSON.parse(withMcp[withMcp.indexOf('--mcp-config') + 1] as string)
		expect(config.mcpServers.codm).toMatchObject({ type: 'http', url: 'http://127.0.0.1:3030/mcp' })
		// The run token rides the Authorization header — never a tool argument, never the prompt.
		expect(config.mcpServers.codm.headers.Authorization).toBe('Bearer run-token-opaque')
		expect(withMcp[withMcp.indexOf('--allowedTools') + 1]).toBe(`${wireToolName('TransitionIssueStatus')},${wireToolName('RaiseStop')}`)
	})

	it('the full-house invocation is exactly the spec argv, in the spec order', () => {
		const args = ClaudeAgentRunner.buildArgs(
			opts({
				caps: { partialMessages: true },
				model: AgentModelId.OPUS,
				extraDirs: ['/tmp/shared'],
				resumeSessionId: 'sess-42',
				mcp: mcp([wireToolName('TransitionIssueStatus')]),
			}),
		)
		expect(args).toEqual([
			'-p',
			'--input-format',
			'stream-json',
			'--output-format',
			'stream-json',
			'--verbose',
			'--include-partial-messages',
			'--model',
			'opus',
			'--add-dir',
			'/tmp/shared',
			'--resume',
			'sess-42',
			'--mcp-config',
			JSON.stringify({
				mcpServers: {
					codm: { type: 'http', url: 'http://127.0.0.1:3030/mcp', headers: { Authorization: 'Bearer run-token-opaque' } },
				},
			}),
			'--allowedTools',
			wireToolName('TransitionIssueStatus'),
			'--permission-mode',
			'auto',
		])
	})
})

describe('AC-1.2 — buildArgs is PURE: caps arrive by parameter, never from module state', () => {
	it('two calls with different caps give different argvs, with no mutation in between', () => {
		// Nothing is assigned, imported-and-mutated, or configured between these two lines. If the
		// implementation read an ambient capability map (the open-design shape this deliberately
		// diverges from), these two would be identical.
		const withPartials = ClaudeAgentRunner.buildArgs(opts({ caps: { partialMessages: true } }))
		const withoutPartials = ClaudeAgentRunner.buildArgs(opts({ caps: {} }))
		expect(withPartials).not.toEqual(withoutPartials)
		expect(withPartials).toContain('--include-partial-messages')
		expect(withoutPartials).not.toContain('--include-partial-messages')
	})

	it('is idempotent and never mutates its input options object', () => {
		const options = opts({ caps: { partialMessages: true }, model: AgentModelId.SONNET, extraDirs: ['/tmp/x'] })
		const snapshot = JSON.stringify(options)
		const first = ClaudeAgentRunner.buildArgs(options)
		const second = ClaudeAgentRunner.buildArgs(options)
		expect(second).toEqual(first)
		expect(JSON.stringify(options)).toBe(snapshot)
	})

	it('interleaved calls do not contaminate each other', () => {
		const a = ClaudeAgentRunner.buildArgs(opts({ resumeSessionId: 'A' }))
		const b = ClaudeAgentRunner.buildArgs(opts({ newSessionId: 'B' }))
		const aAgain = ClaudeAgentRunner.buildArgs(opts({ resumeSessionId: 'A' }))
		expect(aAgain).toEqual(a)
		expect(b).not.toEqual(a)
	})

	it('is callable without an instance — no process, no logger, no container', () => {
		// `static` on purpose (Fase 4.5): the resume flow spec asserts the argv a captured request WOULD
		// have spawned with, and a per-CLI fact should not require owning a child process to read. It
		// also keeps the prototype at exactly `run` + `shutdown`, which is what AC-4.5.4 measures.
		expect(Object.getOwnPropertyNames(ClaudeAgentRunner.prototype)).not.toContain('buildArgs')
		expect(typeof ClaudeAgentRunner.buildArgs).toBe('function')
	})
})
