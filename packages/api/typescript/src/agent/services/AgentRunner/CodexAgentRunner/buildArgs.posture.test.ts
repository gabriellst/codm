import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { CodexAgentRunner } from './CodexAgentRunner'

/**
 * AC-8 (participant-permission-posture) — `codex`'s argv per posture: AUTO → no permission flag at all
 * (today's behaviour), BYPASS → `--dangerously-bypass-approvals-and-sandbox`, on BOTH shapes (`exec` and
 * `exec resume` publish it: `help-exec.txt:61`, `help-exec-resume.txt:44`). FALSIFIER: drop the table
 * lookup and the BYPASS cases go red; put the flag under AUTO and the AUTO case goes red.
 */
const BYPASS_FLAG = '--dangerously-bypass-approvals-and-sandbox'
const SESSION = '01a04541-3924-75f1-9f7e-221f3f57cee8'

function repoRoot(): string {
	let dir = import.meta.dir
	while (!existsSync(join(dir, '.specs'))) {
		const parent = dirname(dir)
		if (parent === dir) throw new Error('repo root (the directory holding .specs/) not found above this file')
		dir = parent
	}
	return dir
}
const help = (file: string) => readFileSync(join(repoRoot(), '.specs', 'codedm', 'codex-smoke', 'raw', file), 'utf8')

describe('CodexAgentRunner.buildArgs — the bypass flag is the posture', () => {
	it('AUTO passes no permission flag (unchanged behaviour)', () => {
		expect(CodexAgentRunner.buildArgs({ cwd: '/w', posture: PermissionPosture.AUTO })).not.toContain(BYPASS_FLAG)
		expect(CodexAgentRunner.buildArgs({ cwd: '/w', resumeSessionId: SESSION, posture: PermissionPosture.AUTO })).not.toContain(BYPASS_FLAG)
	})

	it('BYPASS passes the flag on the plain `exec` shape', () => {
		expect(CodexAgentRunner.buildArgs({ cwd: '/w', posture: PermissionPosture.BYPASS })).toContain(BYPASS_FLAG)
	})

	it('BYPASS passes the flag on the `exec resume` shape too — and the session id stays the trailing positional', () => {
		const args = CodexAgentRunner.buildArgs({ cwd: '/w', resumeSessionId: SESSION, posture: PermissionPosture.BYPASS })
		expect(args).toContain(BYPASS_FLAG)
		expect(args.at(-1)).toBe(SESSION)
	})

	it('both help captures publish the flag — the binary really has it', () => {
		expect(help('help-exec.txt')).toContain(BYPASS_FLAG)
		expect(help('help-exec-resume.txt')).toContain(BYPASS_FLAG)
	})
})
