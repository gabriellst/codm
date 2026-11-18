import { describe, expect, it } from 'bun:test'
import type { ZodType } from 'zod'
import { InMemoryAgentIdentityService } from '@codm/core-typescript'
import { AgentModelId, IssueStatus, PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { AgentRunner } from '../../services/AgentRunner'
import { AgentName, AgentRunOutcome, TriageDecision } from '../../enums'
import type { AgentRunIdentity } from '../../types/AgentRunIdentity'
import type { AgentRunRequest } from '../../types/AgentRunRequest'
import type { AgentRuntimeEvent } from '../../types/AgentRuntimeEvent'
import { TriagePromptBuilder } from './prompt'
import { TriageAgent } from './TriageAgent'
import { TriageOutputSchema } from './types'

/** Stubbed seam — never a subprocess, never a real model. Answers with whatever `result` it is given. */
class CapturingRunner extends AgentRunner {
	readonly requests: AgentRunRequest<ZodType | undefined>[] = []
	constructor(private readonly result: Extract<AgentRuntimeEvent, { type: 'finished' }>['result']) {
		super()
	}

	run<OutputSchema extends ZodType | undefined = undefined>(request: AgentRunRequest<OutputSchema>): AsyncIterable<AgentRuntimeEvent> {
		this.requests.push(request)
		const result = this.result
		return (async function* () {
			yield { type: 'finished', result } satisfies AgentRuntimeEvent
		})()
	}

	async shutdown(): Promise<void> {}
}

const NOW = new Date('2026-11-17T12:00:00.000Z')

const input = (): Parameters<TriageAgent['triage']>[1] => ({
	ownerId: '00000000-0000-4000-8000-0000000000aa',
	threadId: '00000000-0000-4000-8000-0000000000bb',
	cwd: '/Users/dev/project',
	posture: PermissionPosture.AUTO,
	binaryPath: '/usr/local/bin/claude',
	model: AgentModelId.HAIKU,
	now: NOW,
	message: { speaker: 'Ana', text: 'troca o botão para azul', quoted: { speaker: 'you', text: 'Pronto, publiquei a página.' } },
	openIssues: [
		{ key: 'APP-7', title: 'Página de preços', status: IssueStatus.WORKING, lastActivityAt: new Date(NOW.getTime() - 3 * 60_000) },
	],
	recent: [{ speaker: 'Bruno', text: 'ficou bom', at: new Date(NOW.getTime() - 60_000) }],
})

const verdict = { confidence: 0.9, verdict: { decision: TriageDecision.STEER as const, issueKey: 'APP-7' } }
type RunResult = Extract<AgentRuntimeEvent, { type: 'finished' }>['result']
const build = (
	result: RunResult = { outcome: AgentRunOutcome.COMPLETED, replyText: '', sessionId: null, output: verdict, failed: false },
) => {
	const runner = new CapturingRunner(result)
	return { runner, agent: new TriageAgent(new InMemoryAgentIdentityService<AgentRunIdentity>(), new TriagePromptBuilder()) }
}

describe('TriageAgent', () => {
	it('one stateless, tool-less run on the model it is handed, with the verdict schema', async () => {
		const { runner, agent } = build()

		expect(await agent.triage(runner, input())).toEqual(verdict)

		const request = runner.requests[0]
		expect(request?.agentName).toBe(AgentName.TRIAGE)
		expect(request?.model).toBe(AgentModelId.HAIKU)
		expect(request?.outputSchema).toBe(TriageOutputSchema)
		// Stateless: no session to resume or open. Tool-less: no MCP invocation, no run token minted.
		expect(request?.session).toBeUndefined()
		expect(request?.mcp).toBeUndefined()
		expect(request?.posture).toBe(PermissionPosture.AUTO)
		// No built-in tools: it reads raw group messages, and Bash in reach would let a message act.
		expect(request?.builtinTools).toEqual([])
	})

	it('the prompt carries the open issues, the tail and the message — and nothing but names and texts', async () => {
		const { runner, agent } = build()
		await agent.triage(runner, input())

		const prompt = runner.requests[0]?.messages.map(message => message.content).join('\n') ?? ''
		expect(prompt).toContain('APP-7 [WORKING, last activity 3 min ago] Página de preços')
		expect(prompt).toContain('Bruno: ficou bom')
		expect(prompt).toContain('Ana: troca o botão para azul')
		expect(prompt).toContain('(replying to you: «Pronto, publiquei a página.»)')
		// No envelope id leaks into what the model reads.
		expect(prompt).not.toContain(input().ownerId)
		expect(prompt).not.toContain(input().threadId)
	})

	it('a failed run surfaces as CLASSIFICATION_FAILED, not as a parse error', async () => {
		const { runner, agent } = build({ outcome: AgentRunOutcome.STOPPED, replyText: '', sessionId: null, output: undefined, failed: true })
		await expect(agent.triage(runner, input())).rejects.toMatchObject({ name: 'CLASSIFICATION_FAILED' })
	})

	it('the verdict is a discriminated union under a root OBJECT — each decision carries only its own field', () => {
		expect(TriageOutputSchema.safeParse({ confidence: 1, verdict: { decision: TriageDecision.NO_ACTION } }).success).toBe(true)
		expect(TriageOutputSchema.safeParse({ confidence: 1, verdict: { decision: TriageDecision.STEER } }).success).toBe(false)
		expect(TriageOutputSchema.safeParse({ confidence: 1.5, verdict: { decision: TriageDecision.ORCHESTRATOR } }).success).toBe(false)
	})
})
