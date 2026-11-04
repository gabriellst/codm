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

/**
 * Decision 13 — under BYPASS the request IS the approval. The turn's posture is the only trace this agent
 * has of WHO asked (`de` is always `operator`), and BYPASS on an issue turn means the chain started from
 * someone holding "pode liberar". FALSIFIER: render `requesterApproval` unconditionally (or never) and
 * one of the two cases goes red.
 */
describe('IssueWorkPromptBuilder — the request is the approval (Decision 13)', () => {
	const builder = new IssueWorkPromptBuilder()

	it('under BYPASS, tells the worker not to stop for an ok that was already given', () => {
		// With the TURN: the posture is per turn, so it cannot live in the standing prompt (see below).
		const user = builder.user({ ...input, posture: PermissionPosture.BYPASS })

		expect(user).toContain('WHO ASKED FOR THIS')
		expect(user).toContain('that IS the approval')
		expect(user).toContain('Do not raise a stop to ask the operator for an ok that was already given')
		expect(user).toContain('like deleting data')
	})

	it('under AUTO, keeps the default: the section is not rendered', () => {
		expect(`${builder.system(input)}\n${builder.user(input)}`).not.toContain('WHO ASKED FOR THIS')
	})
})

/**
 * THE STANDING HALF IS THE SAME TEXT ON EVERY TURN OF THE ISSUE. It travels as the CLI's system prompt,
 * ahead of the cached conversation, so one changed byte between two turns re-writes the cache of the
 * whole context. FALSIFIER: move `requesterApproval` back into `system()` and this goes red.
 */
describe('IssueWorkPromptBuilder — the standing prompt does not move between turns', () => {
	const builder = new IssueWorkPromptBuilder()

	it('is byte-identical across a brief, a steer, another posture and another instant', () => {
		const first = builder.system(input)
		for (const turn of [
			{ ...input, turnKind: MailboxItemKind.STEER as const, prompt: 'e a Loja 02 também' },
			{ ...input, posture: PermissionPosture.BYPASS },
			{ ...input, now: new Date('2026-10-10T08:00:00.000Z'), speaker: 'loop:diário' },
		]) {
			expect(builder.system(turn)).toBe(first)
		}
	})
})
