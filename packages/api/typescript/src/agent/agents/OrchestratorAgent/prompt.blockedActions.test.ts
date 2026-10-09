import { describe, expect, it } from 'bun:test'
import { ContactKind, Language, MailboxItemKind, PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { OrchestratorPromptBuilder } from './prompt'

/** AC-11 — the orchestrator half of the same instruction (Decision 11). */
const turn: Parameters<OrchestratorPromptBuilder['system']>[0] = {
	ownerId: '00000000-0000-4000-8000-0000000000aa',
	threadId: '00000000-0000-4000-8000-0000000000bb',
	cwd: '/Users/dev/project',
	binaryPath: '/usr/local/bin/claude',
	contactKind: ContactKind.GROUP,
	mentionTag: '@codm',
	window: { seeded: true, entries: [] },
	openStops: [],
	timezone: 'America/Sao_Paulo',
	availableModels: [],
	language: Language.PT_BR,
	now: new Date('2026-10-09T12:00:00.000Z'),
	posture: PermissionPosture.AUTO,
	item: {
		kind: MailboxItemKind.OPERATOR_MESSAGE,
		entryId: '00000000-0000-4000-8000-0000000000dd',
		speaker: 'operator',
		text: 'troca a moeda da Loja 01',
	},
}

describe('OrchestratorPromptBuilder — a blocked action', () => {
	const system = new OrchestratorPromptBuilder().system(turn)

	it('tells the agent to stop and ask for approval in this conversation', () => {
		expect(system).toContain('WHEN AN ACTION IS BLOCKED')
		expect(system).toContain('stop and ask for approval in this conversation')
	})

	it('never suggests shift+tab, /permissions or an `export`', () => {
		expect(system).not.toMatch(/shift\s*\+\s*tab/i)
		expect(system).not.toContain('/permissions')
		expect(system).not.toMatch(/\bexport\s+[A-Z_]+=/)
	})
})
