import { describe, expect, it } from 'bun:test'
import { AgentModelId, ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { AgentToolName } from '../enums'
import type { AgentMcpInvocation } from '../types/AgentMcpInvocation'
import { PROVIDER_DEFS, providerDef } from './registry'
import type { ProviderBuildArgsOptions } from './ProviderDef'

/**
 * The contract-lock tests for the provider layer (GOAL-agent-abstraction Fase 1: AC-1.1 / AC-1.2 /
 * AC-1.3). They assert the three properties that make "every CLI is a data literal" TRUE rather than
 * aspirational: the argv is exactly the spec's, `buildArgs` is pure, and the registry is exhaustive.
 */

const CWD = '/Users/dev/repos/codedm'

const opts = (overrides: Partial<ProviderBuildArgsOptions> = {}): ProviderBuildArgsOptions => ({
	cwd: CWD,
	caps: {},
	...overrides,
})

const mcp = (allowedTools: readonly AgentToolName[] = [AgentToolName.COMPLETE_ISSUE, AgentToolName.RAISE_STOP]): AgentMcpInvocation => ({
	transport: 'http',
	endpoint: 'http://127.0.0.1:3030/mcp',
	token: 'run-token-opaque',
	allowedTools,
})

describe('AC-1.1 — claude buildArgs produces EXACTLY the spec argv', () => {
	it('the baseline invocation is the spec line, verbatim and in order', () => {
		// .specs/codedm/2026-07-26-agent-driving-stream-json.md:14-18 — with every optional segment
		// absent, what is left is the mandatory spine of the invocation.
		expect(providerDef(ProviderKind.CLAUDE_CODE).buildArgs(opts())).toEqual([
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
		const withCap = providerDef(ProviderKind.CLAUDE_CODE).buildArgs(opts({ caps: { partialMessages: true } }))
		const withoutCap = providerDef(ProviderKind.CLAUDE_CODE).buildArgs(opts({ caps: {} }))
		expect(withCap).toContain('--include-partial-messages')
		expect(withoutCap).not.toContain('--include-partial-messages')
		// And it is capability-gated, not model-gated or version-gated: nothing else moved.
		expect(withCap.filter(a => a !== '--include-partial-messages')).toEqual(withoutCap)
	})

	it('--model is OMITTED for AgentModelId.DEFAULT and for an absent model, and aliased otherwise', () => {
		const def = providerDef(ProviderKind.CLAUDE_CODE)
		expect(def.buildArgs(opts({ model: AgentModelId.DEFAULT }))).not.toContain('--model')
		expect(def.buildArgs(opts())).not.toContain('--model')

		const sonnet = def.buildArgs(opts({ model: AgentModelId.SONNET }))
		expect(sonnet.slice(sonnet.indexOf('--model'), sonnet.indexOf('--model') + 2)).toEqual(['--model', 'sonnet'])
		expect(def.buildArgs(opts({ model: AgentModelId.OPUS }))).toContain('opus')
		expect(def.buildArgs(opts({ model: AgentModelId.HAIKU }))).toContain('haiku')
		// DEFAULT must never leak through as a literal string — that would be the bug the enum exists
		// to prevent (`--model DEFAULT` is not a model any CLI knows).
		expect(def.buildArgs(opts({ model: AgentModelId.DEFAULT }))).not.toContain('DEFAULT')
	})

	it('--resume and --session-id are MUTUALLY EXCLUSIVE, with resume winning when both are passed', () => {
		const def = providerDef(ProviderKind.CLAUDE_CODE)

		const resuming = def.buildArgs(opts({ resumeSessionId: 'sess-old' }))
		expect(resuming).toContain('--resume')
		expect(resuming).not.toContain('--session-id')

		const pinning = def.buildArgs(opts({ newSessionId: 'sess-new' }))
		expect(pinning).toContain('--session-id')
		expect(pinning).not.toContain('--resume')

		// Contradictory instructions from a buggy caller must NEVER reach the CLI as both flags —
		// the resulting behaviour would be version-dependent. Exclusivity is structural here.
		const both = def.buildArgs(opts({ resumeSessionId: 'sess-old', newSessionId: 'sess-new' }))
		expect(both).toContain('--resume')
		expect(both).not.toContain('--session-id')
		expect(both).not.toContain('sess-new')
	})

	it('--add-dir is emitted once per extra dir', () => {
		const args = providerDef(ProviderKind.CLAUDE_CODE).buildArgs(opts({ extraDirs: ['/tmp/a', '/tmp/b'] }))
		expect(args.filter(a => a === '--add-dir')).toHaveLength(2)
		expect(args).toContain('/tmp/a')
		expect(args).toContain('/tmp/b')
	})

	it('--mcp-config + --allowedTools appear ONLY when request.mcp is present AND the def declares the flags', () => {
		const claude = providerDef(ProviderKind.CLAUDE_CODE)

		const withoutMcp = claude.buildArgs(opts())
		expect(withoutMcp).not.toContain('--mcp-config')
		expect(withoutMcp).not.toContain('--allowedTools')

		const withMcp = claude.buildArgs(opts({ mcp: mcp() }))
		expect(withMcp).toContain('--mcp-config')
		const config = JSON.parse(withMcp[withMcp.indexOf('--mcp-config') + 1] as string)
		expect(config.mcpServers.codedm).toMatchObject({ type: 'http', url: 'http://127.0.0.1:3030/mcp' })
		// The run token rides the Authorization header — never a tool argument, never the prompt.
		expect(config.mcpServers.codedm.headers.Authorization).toBe('Bearer run-token-opaque')
		expect(withMcp[withMcp.indexOf('--allowedTools') + 1]).toBe('codedm__complete_issue,codedm__raise_stop')

		// The OTHER half of the AND: a provider that does not declare the flags emits nothing, even
		// when handed a fully-formed invocation. This is the degradation path, and it is DATA —
		// there is no `if (provider === …)` anywhere to make it happen.
		for (const kind of [ProviderKind.CODEX, ProviderKind.OPENCODE]) {
			expect(PROVIDER_DEFS[kind].mcpConfigFlag).toBeUndefined()
			expect(PROVIDER_DEFS[kind].buildArgs(opts({ mcp: mcp() }))).not.toContain('--mcp-config')
		}
	})

	it('the full-house invocation is exactly the spec argv, in the spec order', () => {
		const args = providerDef(ProviderKind.CLAUDE_CODE).buildArgs(
			opts({
				caps: { partialMessages: true },
				model: AgentModelId.OPUS,
				extraDirs: ['/tmp/shared'],
				resumeSessionId: 'sess-42',
				mcp: mcp([AgentToolName.COMPLETE_ISSUE]),
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
					codedm: { type: 'http', url: 'http://127.0.0.1:3030/mcp', headers: { Authorization: 'Bearer run-token-opaque' } },
				},
			}),
			'--allowedTools',
			'codedm__complete_issue',
			'--permission-mode',
			'auto',
		])
	})

	it('the degraded providers are subcommand prefixes, not a second code path', () => {
		// AC-1.8: codex/opencode declare `streamFormat: 'plain'` + `promptViaStdin: false` and their
		// argv is a prefix the runner completes with the prompt. Same seam, less information.
		expect(providerDef(ProviderKind.CODEX).buildArgs(opts())).toEqual(['exec'])
		expect(providerDef(ProviderKind.OPENCODE).buildArgs(opts())).toEqual(['run'])
		for (const kind of [ProviderKind.CODEX, ProviderKind.OPENCODE]) {
			expect(PROVIDER_DEFS[kind].streamFormat).toBe('plain')
			expect(PROVIDER_DEFS[kind].promptInputFormat).toBe('text')
			expect(PROVIDER_DEFS[kind].promptViaStdin).toBe(false)
			expect(PROVIDER_DEFS[kind].resumesSessionViaCli).toBeUndefined()
		}
	})
})

describe('AC-1.2 — buildArgs is PURE: caps arrive by parameter, never from module state', () => {
	it('two calls with different caps give different argvs, with no mutation in between', () => {
		const def = providerDef(ProviderKind.CLAUDE_CODE)
		// Nothing is assigned, imported-and-mutated, or configured between these two lines. If the
		// implementation read an ambient capability map (the open-design shape this deliberately
		// diverges from), these two would be identical.
		const withPartials = def.buildArgs(opts({ caps: { partialMessages: true } }))
		const withoutPartials = def.buildArgs(opts({ caps: {} }))
		expect(withPartials).not.toEqual(withoutPartials)
		expect(withPartials).toContain('--include-partial-messages')
		expect(withoutPartials).not.toContain('--include-partial-messages')
	})

	it('is idempotent and never mutates its input options object', () => {
		const def = providerDef(ProviderKind.CLAUDE_CODE)
		const options = opts({ caps: { partialMessages: true }, model: AgentModelId.SONNET, extraDirs: ['/tmp/x'] })
		const snapshot = JSON.stringify(options)
		const first = def.buildArgs(options)
		const second = def.buildArgs(options)
		expect(second).toEqual(first)
		expect(JSON.stringify(options)).toBe(snapshot)
	})

	it('interleaved calls do not contaminate each other', () => {
		const def = providerDef(ProviderKind.CLAUDE_CODE)
		const a = def.buildArgs(opts({ resumeSessionId: 'A' }))
		const b = def.buildArgs(opts({ newSessionId: 'B' }))
		const aAgain = def.buildArgs(opts({ resumeSessionId: 'A' }))
		expect(aAgain).toEqual(a)
		expect(b).not.toEqual(a)
	})
})

describe('AC-1.3 — PROVIDER_DEFS is exhaustive over the ProviderKind value-set', () => {
	it('has exactly one def per wire enum member, keyed by that member', () => {
		const kinds = Object.values(ProviderKind)
		expect(Object.keys(PROVIDER_DEFS).sort()).toEqual([...kinds].sort())
		// The registry cannot drift the other way either: every def's `id` is its own key.
		for (const [key, def] of Object.entries(PROVIDER_DEFS)) expect(def.id).toBe(key as ProviderKind)
	})

	it('covers the three kinds frozen in provider-kind.tsp today', () => {
		// Pinned so that ADDING a kind to the contract fails here loudly rather than silently
		// shipping a provider with no def — which is the whole reason this is a Record and not a list.
		expect(Object.values(ProviderKind)).toEqual([ProviderKind.CLAUDE_CODE, ProviderKind.CODEX, ProviderKind.OPENCODE])
		expect(Object.keys(PROVIDER_DEFS)).toHaveLength(3)
	})
})
