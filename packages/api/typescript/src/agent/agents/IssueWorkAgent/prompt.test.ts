import { describe, expect, it } from 'bun:test'
import { MailboxItemKind, PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { IssueWorkPromptBuilder } from './prompt'

/**
 * AC-11 (participant-permission-posture, Decision 11) — a blocked action is answered by STOPPING and
 * asking for approval in the conversation, never by coaching a human through manual steps on the
 * machine (the improvised shift+tab / `/permissions` / `export` of 2026-10-08).
 */
const input = {
	ownerId: '00000000-0000-4000-8000-0000000000aa',
	issueId: '00000000-0000-4000-8000-0000000000cc',
	threadId: '00000000-0000-4000-8000-0000000000bb',
	cwd: '/Users/dev/project',
	binaryPath: '/usr/local/bin/claude',
	prompt: 'troca a moeda da Loja 01',
	turnKind: MailboxItemKind.WORK as const,
	speaker: 'operator',
	now: new Date('2026-10-09T12:00:00.000Z'),
	timezone: 'America/Sao_Paulo',
	key: 'moeda',
	title: 'Troca a moeda',
	posture: PermissionPosture.AUTO,
}

describe('IssueWorkPromptBuilder — a blocked action', () => {
	const system = new IssueWorkPromptBuilder().system(input)

	it('tells the agent to stop and ask for approval in this conversation, without raising a second stop', () => {
		expect(system).toContain('WHEN AN ACTION IS BLOCKED')
		expect(system).toContain('stop and ask for approval in this conversation')
		// The runner already raises PERMISSION_DENIED for a filter block (Decision 9); a RaiseStop here
		// would put a second approval card in front of the operator for the same refusal.
		expect(system).toContain('do not raise a stop for it')
	})

	it('never suggests shift+tab, /permissions or an `export`', () => {
		expect(system).not.toMatch(/shift\s*\+\s*tab/i)
		expect(system).not.toContain('/permissions')
		expect(system).not.toMatch(/\bexport\s+[A-Z_]+=/)
	})
})
