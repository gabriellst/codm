import { describe, expect, it } from 'bun:test'
import { MockLoggingService, InMemoryAgentIdentityService } from '@codm/core-typescript'
import { PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { AgentMessageRole, AgentName } from '../../../enums'
import type { AgentProcess, AgentProcessSpec } from './AgentProcess'
import { ClaudeAgentRunner } from './ClaudeAgentRunner'

/**
 * AC-8 (participant-permission-posture) — `claude`'s argv per posture: AUTO → `--permission-mode auto`,
 * BYPASS → `--permission-mode bypassPermissions`. FALSIFIER: map BYPASS to `auto` (or drop the posture
 * on the way to `buildArgs`) and the BYPASS cases below go red; map AUTO to `bypassPermissions` and the
 * "AUTO never bypasses" case goes red.
 */
const argv = (posture: PermissionPosture) => ClaudeAgentRunner.buildArgs({ cwd: '/w', caps: {}, posture })

const modeOf = (args: readonly string[]): string[] =>
	args.flatMap((arg, i) => (arg === '--permission-mode' ? [args[i + 1] ?? '<missing>'] : []))

describe('ClaudeAgentRunner.buildArgs — the permission mode is the posture', () => {
	it('AUTO → exactly one `--permission-mode auto`', () => {
		expect(modeOf(argv(PermissionPosture.AUTO))).toEqual(['auto'])
	})

	it('BYPASS → exactly one `--permission-mode bypassPermissions`', () => {
		expect(modeOf(argv(PermissionPosture.BYPASS))).toEqual(['bypassPermissions'])
	})

	it('AUTO never carries the bypass — the least-privilege half of the table', () => {
		expect(argv(PermissionPosture.AUTO)).not.toContain('bypassPermissions')
	})

	it('every posture the contract declares maps to exactly one permission mode', () => {
		for (const posture of Object.values(PermissionPosture)) expect(modeOf(argv(posture))).toHaveLength(1)
	})

	it('the posture is the ONLY thing that moves between the two argvs', () => {
		const auto = argv(PermissionPosture.AUTO)
		const bypass = argv(PermissionPosture.BYPASS)
		expect(auto.filter(a => a !== 'auto')).toEqual(bypass.filter(a => a !== 'bypassPermissions'))
	})
})

describe('ClaudeAgentRunner.run — request.posture reaches the spawned argv', () => {
	it('a BYPASS request spawns with bypassPermissions', async () => {
		let spawned: AgentProcessSpec | undefined
		const spawner = (spec: AgentProcessSpec): AgentProcess => {
			spawned = spec
			return {
				stdout: (async function* () {})(),
				stderr: (async function* () {})(),
				write() {},
				endStdin() {},
				kill() {},
				exited: Promise.resolve(0),
			}
		}
		const runner = ClaudeAgentRunner.withOptions(new MockLoggingService(), new InMemoryAgentIdentityService(), {
			spawner,
			inactivityMs: 1_000,
			postMortemMs: 10,
		})

		for await (const _ of runner.run({
			agentName: AgentName.ISSUE_WORK,
			cwd: '/tmp/w',
			binaryPath: '/opt/bin/claude',
			messages: [{ role: AgentMessageRole.USER, content: 'faz' }],
			posture: PermissionPosture.BYPASS,
		})) {
			// drain
		}

		expect(modeOf(spawned?.cmd ?? [])).toEqual(['bypassPermissions'])
	})
})
