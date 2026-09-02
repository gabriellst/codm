import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { MCP_RUN_TOKEN_ENV, MCP_SERVER_KEY, wireToolName } from '../../../mcp/wire'
import type { AgentToolName } from '../../../enums'
import type { AgentMcpInvocation } from '../../../types/AgentMcpInvocation'
import { CodexAgentRunner } from './CodexAgentRunner'

/**
 * `buildArgs`, against the CLI's OWN help text.
 *
 * The interesting failure this file guards is not "argv is wrong" — it is "argv is plausible". codex
 * and claude spell the same intentions differently, and a flag copied across reads fine, compiles
 * fine, and aborts the run. So the assertions here are cross-checked against the committed
 * `--help` captures: a flag this builder emits must be one the subcommand actually publishes.
 *
 * `buildArgs` is PURE and STATIC — no process, no clock, no filesystem — which is what lets every
 * case below run without a binary anywhere near it.
 */

/**
 * The captures directory, found by WALKING UP to the repo root rather than by counting `..`.
 *
 * A literal `'..','..','..'` chain encodes this file's depth into an assertion about codex, and it
 * breaks silently the day the file moves — `readFileSync` then throws ENOENT from a path nobody
 * reads. Walking up to a marker asks the question that is actually meant: "where is the repo root".
 */
function repoRoot(): string {
	let dir = import.meta.dir
	while (!existsSync(join(dir, '.specs'))) {
		const parent = dirname(dir)
		if (parent === dir) throw new Error('repo root (the directory holding .specs/) not found above this file')
		dir = parent
	}
	return dir
}

const RAW = join(repoRoot(), '.specs', 'codedm', 'codex-smoke', 'raw')
const help = (file: string): string => readFileSync(join(RAW, file), 'utf8')

/** Every `-x` / `--xyz` the given help capture publishes. */
function publishedFlags(file: string): Set<string> {
	return new Set(help(file).match(/(?<![\w-])--?[a-zA-Z][\w-]*/g) ?? [])
}

/** The flags an argv actually passes, ignoring their values and the positionals. */
function flagsIn(args: readonly string[]): string[] {
	return args.filter(a => a.startsWith('-'))
}

/**
 * A stdio `AgentMcpInvocation`, TYPED — the same helper shape `ClaudeAgentRunner/buildArgs.test.ts`
 * uses, for the same reason: a cast here would switch off the type-check on the very object whose
 * serialization is under test, and the day the seam grows or renames a field these cases would keep
 * compiling against a dead shape while asserting an argv nothing produces.
 */
const mcp = (overrides: Partial<AgentMcpInvocation> = {}): AgentMcpInvocation => ({
	transport: 'stdio',
	token: 't',
	allowedTools: [] as readonly AgentToolName[],
	command: { command: 'node', args: [] },
	...overrides,
})

describe('CodexAgentRunner.buildArgs — the plain `exec` shape', () => {
	const base = { cwd: '/work/thread-1' }

	it('is `exec --json --skip-git-repo-check`, with the workspace pinned by -C', () => {
		const args = CodexAgentRunner.buildArgs(base)

		expect(args.slice(0, 2)).toEqual(['exec', '--json'])
		expect(args).toContain('--skip-git-repo-check')
		// `-C` as well as the spawn's cwd: it is what the SESSION records, and a resumed turn reads the
		// working directory from there rather than from wherever the daemon happens to be.
		expect(args.slice(args.indexOf('-C'), args.indexOf('-C') + 2)).toEqual(['-C', '/work/thread-1'])
	})

	it('adds one --add-dir per extra directory', () => {
		const args = CodexAgentRunner.buildArgs({ ...base, extraDirs: ['/a', '/b'] })

		expect(args.filter(a => a === '--add-dir')).toHaveLength(2)
		expect(args).toContain('/a')
		expect(args).toContain('/b')
	})

	it('NEVER passes --model — the account decides, and the account list churns', () => {
		// Measured: the model list changed wholesale between two logins on one machine within an hour.
		// A slug we cannot verify aborts the run with "not supported for your account", so the flag is
		// deliberately absent rather than defaulted. `PROVIDER_MODELS[CODEX]` is empty for the same reason.
		expect(CodexAgentRunner.buildArgs(base)).not.toContain('--model')
		expect(CodexAgentRunner.buildArgs(base)).not.toContain('-m')
	})

	it('passes --output-schema as a FILE path when the run is structured', () => {
		const args = CodexAgentRunner.buildArgs({ ...base, outputSchemaPath: '/tmp/s/schema.json' })

		expect(args.slice(args.indexOf('--output-schema'), args.indexOf('--output-schema') + 2)).toEqual([
			'--output-schema',
			'/tmp/s/schema.json',
		])
	})

	it('declares an MCP server through inline -c overrides, with the run token in env — never a tool argument', () => {
		const args = CodexAgentRunner.buildArgs({
			...base,
			mcp: mcp({
				token: 'tok-abc123',
				allowedTools: [wireToolName('TransitionIssueStatus')],
				command: { command: 'node', args: ['/srv.js'] },
			}),
		})

		// One `-c` per leaf, which is the shape measured to actually spawn a server (`raw/mcp-proof.json`).
		expect(args.filter(a => a === '-c')).toHaveLength(3)
		expect(args.some(a => a.startsWith('mcp_servers.') && a.includes('.command='))).toBe(true)
		expect(args.some(a => a.includes('CODM_RUN_TOKEN') && a.includes('tok-abc123'))).toBe(true)
		// The token must reach the child ONLY through env — not as an argument the model could read back.
		expect(args.some(a => a.includes('tok-abc123') && !a.includes('env='))).toBe(false)
		// …and it must reach it PARSEABLY. `-c` values are TOML, so env is an inline TABLE (`KEY="v"`),
		// not a JSON object (`"KEY":"v"`). Asserting only that the token appears somewhere in the string
		// passes on BOTH, which is how a `JSON.stringify` here read as correct — while the measured
		// behaviour is a hard config abort ("invalid type: string …, expected a map", case 2 of
		// `raw/config-parse-probe.txt`). Byte-for-byte the shape case 1 resolves.
		expect(args).toContain(`mcp_servers.${MCP_SERVER_KEY}.env={${MCP_RUN_TOKEN_ENV}="tok-abc123"}`)
	})

	it('the http transport names an ENV VAR, and so keeps the token out of argv entirely', () => {
		const invocation = mcp({ transport: 'http', endpoint: 'http://127.0.0.1:3030/mcp', token: 'tok-abc123', command: undefined })
		const args = CodexAgentRunner.buildArgs({ ...base, mcp: invocation })

		// `bearer_token=<value>` is REJECTED by the CLI — "bearer_token is not supported for
		// streamable_http" (case 4 of `raw/config-parse-probe.txt`). What it accepts is the NAME of a
		// variable it reads at request time (case 3), which is a difference in kind, not in spelling.
		expect(args).toContain(`mcp_servers.${MCP_SERVER_KEY}.bearer_token_env_var="${MCP_RUN_TOKEN_ENV}"`)
		expect(args.some(a => a.includes('bearer_token='))).toBe(false)

		// The property that difference buys: on this path the token is in NO argument, so it is not in
		// `ps` output. It reaches the CLI through its own environment instead.
		expect(args.some(a => a.includes('tok-abc123'))).toBe(false)
		expect(CodexAgentRunner.mcpEnv(invocation)).toEqual({ [MCP_RUN_TOKEN_ENV]: 'tok-abc123' })
	})

	it('the stdio transport asks for NO process env — its child env is declared in the config instead', () => {
		// Widening the CLI's own environment there would expose the token to every process codex
		// spawns, for nothing: `-c …env={…}` already hands it to the one server that needs it.
		expect(CodexAgentRunner.mcpEnv(mcp())).toBeUndefined()
		expect(CodexAgentRunner.mcpEnv(undefined)).toBeUndefined()
	})

	it('every flag it emits is one `codex exec` actually publishes', () => {
		const published = publishedFlags('help-exec.txt')
		const args = CodexAgentRunner.buildArgs({
			...base,
			extraDirs: ['/a'],
			outputSchemaPath: '/tmp/schema.json',
			mcp: mcp(),
		})

		expect(published.size, 'the help capture parsed no flags — the assertion below would be vacuous').toBeGreaterThan(10)
		for (const flag of flagsIn(args)) expect(published.has(flag), `exec does not publish ${flag}`).toBe(true)
	})
})

describe('CodexAgentRunner.buildArgs — the `exec resume` shape is NARROWER, not incremental', () => {
	const base = { cwd: '/work/thread-1', resumeSessionId: '01a04541-3924-75f1-9f7e-221f3f57cee8' }

	it('is a SUBCOMMAND with the session id as a positional, not a --resume flag', () => {
		const args = CodexAgentRunner.buildArgs(base)

		expect(args.slice(0, 2)).toEqual(['exec', 'resume'])
		expect(args).not.toContain('--resume')
		// The id is the trailing positional before the prompt `run()` appends.
		expect(args.at(-1)).toBe('01a04541-3924-75f1-9f7e-221f3f57cee8')
	})

	it('FALSIFIER — drops -C and --add-dir, because `exec resume` does not have them', () => {
		const args = CodexAgentRunner.buildArgs({ ...base, extraDirs: ['/a', '/b'] })

		// Not a tidiness choice: passing a flag the subcommand does not define aborts the run, and the
		// working directory of a resumed turn comes from the recorded session.
		expect(args).not.toContain('-C')
		expect(args).not.toContain('--add-dir')
	})

	it('keeps the flags resume DOES publish — schema, MCP and the JSON transport', () => {
		const args = CodexAgentRunner.buildArgs({
			...base,
			outputSchemaPath: '/tmp/schema.json',
			mcp: mcp(),
		})

		expect(args).toContain('--json')
		expect(args).toContain('--output-schema')
		expect(args).toContain('-c')
	})

	it('every flag it emits is one `codex exec resume` actually publishes', () => {
		const published = publishedFlags('help-exec-resume.txt')
		const args = CodexAgentRunner.buildArgs({
			...base,
			extraDirs: ['/a'],
			outputSchemaPath: '/tmp/schema.json',
			mcp: mcp(),
		})

		expect(published.size, 'the help capture parsed no flags — the assertion below would be vacuous').toBeGreaterThan(10)
		for (const flag of flagsIn(args)) expect(published.has(flag), `exec resume does not publish ${flag}`).toBe(true)
	})

	it('the two shapes really do differ — the guard above would pass on identical argv', () => {
		const plain = CodexAgentRunner.buildArgs({ cwd: '/w', extraDirs: ['/a'] })
		const resumed = CodexAgentRunner.buildArgs({ cwd: '/w', extraDirs: ['/a'], resumeSessionId: 'id' })

		expect(plain).not.toEqual(resumed)
	})
})

describe('CodexAgentRunner.binary — the detection spec', () => {
	it('greps for the SUBCOMMANDS codex publishes, not for claude-shaped flags', () => {
		const tokens = CodexAgentRunner.binary.capabilityTokens ?? {}

		expect(tokens).toEqual({ mcp: 'mcpConfig', resume: 'sessionResume' })
		// The falsifier for the bug this replaced: the old literal declared these, and codex prints neither.
		const root = help('help-root.txt')
		expect(root).not.toContain('--mcp-config')
		expect(root).not.toContain('--resume')
		// While the declared tokens ARE there, which is what makes the probe report the truth.
		for (const token of Object.keys(tokens)) expect(root).toContain(token)
	})

	it('is purely a detection spec — it declares no driving shape', () => {
		expect(CodexAgentRunner.binary.bin).toBe('codex')
		expect(Object.keys(CodexAgentRunner.binary).sort()).toEqual(['bin', 'capabilityTokens', 'helpArgs', 'versionArgs'])
	})
})
