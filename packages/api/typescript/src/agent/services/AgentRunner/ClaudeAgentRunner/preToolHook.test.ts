import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { InMemoryAgentIdentityService, MockLoggingService } from '@codm/core-typescript'
import { PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { AgentMessageRole, AgentName } from '../../../enums'
import type { AgentMcpInvocation } from '../../../types/AgentMcpInvocation'
import type { ProviderCapabilities } from '../../../types/ProviderCapabilities'
import type { AgentProcess, AgentProcessSpec } from './AgentProcess'
import { ClaudeAgentRunner, renderPreToolHookPlugin } from './ClaudeAgentRunner'
import { CodexAgentRunner } from '../CodexAgentRunner'

const line = (value: unknown): string => `${JSON.stringify(value)}\n`

/** What the spawn saw: its argv, and the plugin directory's files AS THEY WERE at spawn time. */
interface Spawned {
	cmd: readonly string[]
	pluginDir?: string
	files: Record<string, string>
	mode?: number
}

/** A child that prints one init + one terminal frame and exits — no real CLI is ever spawned. */
function recordingSpawner(seen: Spawned[]) {
	return (spec: AgentProcessSpec): AgentProcess => {
		const at = spec.cmd.indexOf('--plugin-dir')
		const pluginDir = at >= 0 ? spec.cmd[at + 1] : undefined
		const files: Record<string, string> = {}
		let mode: number | undefined
		if (pluginDir) {
			for (const relative of ['.claude-plugin/plugin.json', 'hooks/hooks.json']) {
				files[relative] = readFileSync(join(pluginDir, relative), 'utf8')
			}
			mode = statSync(join(pluginDir, 'hooks/hooks.json')).mode & 0o777
		}
		seen.push({ cmd: spec.cmd, pluginDir, files, mode })
		let reap: (code: number) => void = () => {}
		const exited = new Promise<number>(resolve => {
			reap = resolve
		})
		const lines = [
			line({ type: 'system', subtype: 'init', session_id: 'sess-h', model: 'claude' }),
			line({ type: 'result', subtype: 'success', is_error: false, result: 'ok', session_id: 'sess-h' }),
		]
		return {
			stdout: (async function* () {
				for (const l of lines) yield l
				reap(0)
			})(),
			stderr: (async function* () {})(),
			write() {},
			endStdin() {},
			kill() {
				reap(0)
			},
			exited,
		}
	}
}

const HOOK = { endpoint: 'http://127.0.0.1:3030/agent/pre-tool-hook', timeoutSeconds: 90 }
const mcp = (withHook: boolean): AgentMcpInvocation => ({
	transport: 'http',
	endpoint: 'http://127.0.0.1:3030/mcp/issue-handling',
	token: 'run-token-abc',
	allowedTools: [],
	...(withHook && { preToolHook: HOOK }),
})

async function runWith(invocation: AgentMcpInvocation, caps: ProviderCapabilities) {
	const seen: Spawned[] = []
	const logging = new MockLoggingService()
	const runner = ClaudeAgentRunner.withOptions(logging, new InMemoryAgentIdentityService(), {
		spawner: recordingSpawner(seen),
		inactivityMs: 5_000,
		postMortemMs: 50,
	})
	for await (const _ of runner.run({
		agentName: AgentName.ISSUE_WORK,
		cwd: '/tmp/w',
		binaryPath: '/opt/bin/claude',
		messages: [{ role: AgentMessageRole.USER, content: 'publica a versão' }],
		posture: PermissionPosture.AUTO,
		mcp: invocation,
		caps,
	})) {
		// drain
	}
	return { seen, logging }
}

/**
 * THE REGRET WINDOW'S HOOK, attached per run (fase 2, item 3): a session-only plugin directory handed to
 * `--plugin-dir`, holding one `PreToolUse` http hook that carries the run token — written before the
 * spawn, gone after it. Never `--settings` (an account launcher around the binary may own that flag).
 */
describe('ClaudeAgentRunner — per-run pre-tool hook', () => {
	it('declares the capability; codex declares its absence', () => {
		const logging = new MockLoggingService()
		const identities = new InMemoryAgentIdentityService()
		expect(new ClaudeAgentRunner(logging, identities).preToolHook).toBe(true)
		expect(new CodexAgentRunner(logging, identities).preToolHook).toBe(false)
	})

	it('probes --plugin-dir off --help', () => {
		expect(ClaudeAgentRunner.binary.capabilityTokens?.['--plugin-dir']).toBe('pluginDir')
	})

	it('writes the plugin, hands it to --plugin-dir, never --settings, and removes it when the run ends', async () => {
		const { seen } = await runWith(mcp(true), { pluginDir: true })
		const [spawn] = seen
		expect(spawn?.pluginDir).toBeDefined()
		expect(spawn?.cmd).not.toContain('--settings')
		expect(JSON.parse(spawn?.files['.claude-plugin/plugin.json'] ?? '{}')).toEqual({ name: 'codm-regret-window' })

		const hooks = JSON.parse(spawn?.files['hooks/hooks.json'] ?? '{}')
		expect(hooks).toEqual({
			hooks: {
				PreToolUse: [
					{
						matcher: 'Bash|PowerShell',
						hooks: [{ type: 'http', url: HOOK.endpoint, headers: { Authorization: 'Bearer run-token-abc' }, timeout: 90 }],
					},
				],
			},
		})
		// The token is in that file: it is private while it exists, and it does not outlive the run.
		expect(spawn?.mode).toBe(0o600)
		expect(existsSync(spawn?.pluginDir ?? '/nonexistent')).toBe(false)
	})

	it('no hook in the invocation → no plugin and no flag', async () => {
		const { seen } = await runWith(mcp(false), { pluginDir: true })
		expect(seen[0]?.cmd).not.toContain('--plugin-dir')
	})

	it('a build that does not advertise --plugin-dir → no flag (it would abort the run), said out loud', async () => {
		const { seen, logging } = await runWith(mcp(true), {})
		expect(seen[0]?.cmd).not.toContain('--plugin-dir')
		expect(JSON.stringify(logging)).toContain('no regret window')
	})

	it('renderPreToolHookPlugin is pure: same inputs, same files', () => {
		expect(renderPreToolHookPlugin(HOOK, 't')).toEqual(renderPreToolHookPlugin(HOOK, 't'))
	})

	it('buildArgs places --plugin-dir only when handed a directory', () => {
		const base = { cwd: '/w', caps: {}, posture: PermissionPosture.AUTO }
		expect(ClaudeAgentRunner.buildArgs({ ...base, pluginDir: '/tmp/codm-hook-x' })).toContain('--plugin-dir')
		expect(ClaudeAgentRunner.buildArgs(base)).not.toContain('--plugin-dir')
	})
})
