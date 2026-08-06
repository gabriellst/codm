import { describe, expect, it } from 'bun:test'
import type { ZodType } from 'zod'
import type { BaseError } from '@codm/core-typescript'
import { AgentModelId, MailboxItemKind, McpScope } from '@codm/contracts-typescript/wire/enums'
import { AgentRunner } from '../../services/AgentRunner'
import { AgentName, AgentRunOutcome, MessageVia } from '../../enums'
import type { AgentRunRequest, AgentRuntimeEvent, ProviderCapabilities } from '../../types'
import { IssueWorkPromptBuilder } from './prompt'
import { IssueWorkAgent } from './IssueWorkAgent'
// The real token service, not a double: it is a Map with a clock, so a stub would only be a second
// implementation of the thing under test. Every agent takes one now because the base MINTS in `run()`.
import { InMemoryAgentIdentityService } from '@codm/core-typescript'
import type { AgentRunIdentity } from '../../types/AgentRunIdentity'
import { operationIdsInScope, toolsInScope } from '../../mcp/exposure'

/**
 * The BASE's contract, exercised through the agent that has no `outputSchema` (§4.5/AC-5.8).
 *
 * What is actually under test is the template method: `run()` is concrete on `Agent`, the only point
 * of variation is `buildRequest`, and the base is what stamps identity onto the request. A subclass
 * that overrode `run()` would re-open a second place to mint a run token in Fase 6 — the reason
 * AC-5.8 greps for the override and the `agent` skill lists it as a bad practice.
 */
class CapturingRunner extends AgentRunner {
	readonly requests: AgentRunRequest<ZodType | undefined>[] = []

	run<OutputSchema extends ZodType | undefined = undefined>(request: AgentRunRequest<OutputSchema>): AsyncIterable<AgentRuntimeEvent> {
		this.requests.push(request)
		return (async function* () {
			yield { type: 'frame', frame: { kind: 'assistant_text', messageId: 'm1', text: 'working', parentToolUseId: null } }
			yield {
				type: 'finished',
				result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'done', sessionId: 'sess-1', failed: false },
			} satisfies AgentRuntimeEvent
		})()
	}

	async shutdown(): Promise<void> {}
}

/** A fixed instant, so the rendered `agora:` line and every `hora` are assertable rather than raced. */
const NOW = new Date('2026-08-06T06:09:00.000Z')

const input = (overrides: Partial<Parameters<IssueWorkAgent['run']>[1]> = {}): Parameters<IssueWorkAgent['run']>[1] => ({
	ownerId: '00000000-0000-4000-8000-0000000000aa',
	issueId: '00000000-0000-4000-8000-0000000000cc',
	threadId: '00000000-0000-4000-8000-0000000000bb',
	cwd: '/Users/dev/project',
	prompt: 'fix the coupon focus bug',
	// The DEFAULT is the brief that opened the issue — the case every test below that does not say
	// otherwise is also asserting, silently.
	turnKind: MailboxItemKind.WORK,
	speaker: 'operator',
	now: NOW,
	timezone: 'America/Sao_Paulo',
	key: 'coupon-focus',
	title: 'Coupon focus bug',
	...overrides,
})

const build = () => {
	const runner = new CapturingRunner()
	return { runner, agent: new IssueWorkAgent(new InMemoryAgentIdentityService<AgentRunIdentity>(), new IssueWorkPromptBuilder()) }
}

describe('IssueWorkAgent (and the Agent template method under it)', () => {
	it('the BASE stamps identity — `buildRequest` never sets `agentName`', async () => {
		const { runner, agent } = build()

		for await (const _ of agent.run(runner, input())) {
			// drain
		}

		expect(runner.requests[0]?.agentName).toBe(AgentName.ISSUE_WORK)
	})

	it('translates the envelope into one user turn in the thread workspace', async () => {
		const { runner, agent } = build()

		for await (const _ of agent.run(runner, input())) {
			// drain
		}

		const request = runner.requests[0]
		expect(request?.cwd).toBe('/Users/dev/project')
		expect(request?.messages).toHaveLength(1)
		// ONE user message, and it is RENDERED now rather than passed through: the message has an author,
		// an instant and a kind, and `buildRequest` assembles rather than renders. The operator's words are
		// still verbatim inside the block — that is the half that must never change.
		expect(request?.messages[0]?.content).toContain('fix the coupon focus bug')
		expect(request?.messages[0]?.content).toContain('<msg ')
		// The standing prompt carries the workspace and the issue under work.
		expect(request?.systemPrompt).toContain('/Users/dev/project')
		expect(request?.systemPrompt).toContain('coupon-focus')
	})

	/**
	 * THE FIELD THIS PROMPT DID NOT HAVE — brief vs amendment.
	 *
	 * A steer used to reach the agent as the same raw string a brief did, so a turn resumed mid-work
	 * could not tell "here is what to build" from "and also do X". Reading the second as the first means
	 * starting over on work already half done, which is invisible to every other assertion here: nothing
	 * errors, the turn simply redoes an hour.
	 *
	 * Asserted on BOTH values, because either alone passes by accident — a renderer that hardcoded one
	 * `tipo` would satisfy a single-sided check.
	 */
	it('says whether the message is the original request or an amendment to work in flight', async () => {
		const { runner, agent } = build()

		for await (const _ of agent.run(runner, input())) {
			// drain
		}
		for await (const _ of agent.run(runner, input({ turnKind: MailboxItemKind.STEER, prompt: 'e roda o lint também' }))) {
			// drain
		}

		expect(runner.requests[0]?.messages[0]?.content).toContain('tipo="pedido"')
		expect(runner.requests[1]?.messages[0]?.content).toContain('tipo="steer"')
		// The legend is standing context, so it lives in the system half and explains both values.
		expect(runner.requests[0]?.systemPrompt).toContain('do not start over')
	})

	/**
	 * THE CLOCK, and WHO is asking. Both were absent, and their absence was silent.
	 *
	 * A scheduled nudge used to arrive indistinguishable from the operator leaning over the issue, so a
	 * turn answered a timer as if somebody were waiting on it. And with no instant anywhere in the
	 * prompt, an agent could not tell a steer that arrived a minute after the brief from one that
	 * arrived a day later — which is exactly the judgement "is this still relevant?" needs.
	 */
	it('carries the clock and names a scheduled steer as the loop it came from', async () => {
		const { runner, agent } = build()

		for await (const _ of agent.run(
			runner,
			input({ turnKind: MailboxItemKind.STEER, speaker: 'loop:09:00 mon,wed,fri', via: MessageVia.LOOP }),
		)) {
			// drain
		}

		const content = runner.requests[0]?.messages[0]?.content as string
		expect(content).toContain('agora: ')
		expect(content).toContain('America/Sao_Paulo')
		expect(content).toContain('de="loop:09:00 mon,wed,fri"')
		expect(content).toContain('via="loop"')
	})

	it('DECLARES the issue-handling scope, derived from the manifest and never typed by hand (AC-6.5)', async () => {
		const { runner, agent } = build()

		for await (const _ of agent.run(runner, input())) {
			// drain
		}

		// Compared against the DERIVED expansion, never against a literal list. A literal here would be
		// exactly the second source of truth this phase exists to kill — and the falsifier is cheap:
		// declare `static mcpScopes = [McpScope.ISSUE_HANDLING]` on a seventh controller and this
		// assertion follows with no edit.
		expect(agent.tools).toEqual(toolsInScope(McpScope.ISSUE_HANDLING))
		expect(agent.tools).toHaveLength(operationIdsInScope(McpScope.ISSUE_HANDLING).length)
		expect(runner.requests[0]?.mcp?.allowedTools).toEqual(toolsInScope(McpScope.ISSUE_HANDLING))
	})

	it('carries NO operation of the `system` scope — owner/* and workspace/* stay out of reach (AC-6.5(c))', async () => {
		const { runner, agent } = build()

		for await (const _ of agent.run(runner, input())) {
			// drain
		}

		// The agent is driven by the text of an inbound message written by someone who is not the
		// operator. `system` carries account administration; a single overlapping entry would put it one
		// prompt injection away from a stranger.
		const declared = new Set(runner.requests[0]?.mcp?.allowedTools ?? [])
		for (const systemTool of toolsInScope(McpScope.system)) expect(declared.has(systemTool)).toBe(false)
	})

	it('the BASE issues the run credential and points the CLI at this scope endpoint — the subclass sets no `mcp`', async () => {
		const runner = new CapturingRunner()
		const tokens = new InMemoryAgentIdentityService<AgentRunIdentity>()
		const agent = new IssueWorkAgent(tokens, new IssueWorkPromptBuilder())

		for await (const _ of agent.run(runner, input())) {
			// drain
		}

		const mcp = runner.requests[0]?.mcp
		expect(mcp?.transport).toBe('http')
		expect(mcp?.endpoint).toContain('/mcp/issue-handling')
		// The token is OPAQUE on the request and resolves to the ENVELOPE's identity — the seam carries
		// no `ownerId`/`issueId`/`threadId` of its own, which is the invariant AC-1.11 and AC-6.12 pin.
		expect(tokens.resolve(mcp?.token ?? '')).toMatchObject({
			ownerId: '00000000-0000-4000-8000-0000000000aa',
			issueId: '00000000-0000-4000-8000-0000000000cc',
			threadId: '00000000-0000-4000-8000-0000000000bb',
			agentName: AgentName.ISSUE_WORK,
		})
	})

	/**
	 * AC-6.7, last clause — "an agent that REQUIRES tools against a provider with no mcp-config flag
	 * fails with `AGENT_TOOLS_UNSUPPORTED`".
	 *
	 * This is the failure mode the whole phase is built to make LOUD. Dropping the scope silently would
	 * produce a run that looks EXACTLY like a healthy one that simply chose to declare nothing — same
	 * frames, same clean exit, an issue closed by inference — and AC-6.4/AC-6.7 exist precisely to keep
	 * those two apart. The probe result is the input: `caps.mcpConfig === false` is a measured fact
	 * about THIS install of the CLI, never a static property of the provider.
	 *
	 * Absent `caps` stays permissive on purpose (the probe did not run, so nothing was ruled out), and
	 * that is why the second half of this test exists: a guard that refused whenever `caps` was merely
	 * falsy would satisfy the first assertion and break every ordinary run.
	 */
	it('AC-6.7 — a CLI whose probe says it cannot take an MCP config fails NAMED, never degrades to the inferred path', async () => {
		const { runner, agent } = build()
		const drain = async (caps: ProviderCapabilities) => {
			for await (const _ of agent.run(runner, input({ caps }))) {
				// drain
			}
		}

		await expect(drain({ mcpConfig: false })).rejects.toThrow(expect.objectContaining({ name: 'AGENT_TOOLS_UNSUPPORTED' }) as BaseError)
		// The permissive half: an UNPROBED capability is not a denial.
		await expect(drain({})).resolves.toBeUndefined()
	})

	it('an agent with a tool scope but NO issueId fails NAMED rather than minting an unconfined token', async () => {
		const { runner, agent } = build()
		// `issueId` is optional on the envelope because the CLASSIFIER runs before an issue exists. An
		// agent that declares tools must never inherit that latitude: a token with nothing to be confined
		// to would give the identity check nothing to reject against.
		const drain = async () => {
			for await (const _ of agent.run(runner, input({ issueId: undefined }))) {
				// drain
			}
		}
		await expect(drain()).rejects.toThrow(/issueId/)
	})

	it('has NO structured output — the consumer drains the stream (`outputSchema` absent)', async () => {
		const { runner, agent } = build()

		for await (const _ of agent.run(runner, input())) {
			// drain
		}

		expect(agent.outputSchema).toBeUndefined()
		expect(runner.requests[0]?.outputSchema).toBeUndefined()
	})

	it('threads the invocation facts the USE CASE resolved — model, session plan, binary and caps', async () => {
		const { runner, agent } = build()

		for await (const _ of agent.run(
			runner,
			input({
				model: AgentModelId.OPUS,
				session: { resumeId: 'sess-prev' },
				binaryPath: '/usr/local/bin/claude',
				caps: { sessionResume: true, partialMessages: false },
			}),
		)) {
			// drain
		}

		const request = runner.requests[0]
		expect(request?.model).toBe(AgentModelId.OPUS)
		expect(request?.session).toEqual({ resumeId: 'sess-prev' })
		expect(request?.binaryPath).toBe('/usr/local/bin/claude')
		expect(request?.caps).toEqual({ sessionResume: true, partialMessages: false })
	})

	it('yields the runner stream through untouched — the base adds identity, not frames', async () => {
		const { runner, agent } = build()

		const events: AgentRuntimeEvent[] = []
		for await (const event of agent.run(runner, input())) events.push(event)

		expect(events.map(e => e.type)).toEqual(['frame', 'finished'])
	})

	it('defaults the model to DEFAULT rather than omitting it — the CLI picks, and we say so', async () => {
		const { runner, agent } = build()

		for await (const _ of agent.run(runner, input())) {
			// drain
		}

		expect(runner.requests[0]?.model).toBe(AgentModelId.DEFAULT)
	})
})

describe('instrução permanente do operador', () => {
	const baseInput = {
		ownerId: '00000000-0000-4000-8000-000000000001',
		issueId: '019e4d24-6524-7041-9e1c-8108180cddaf',
		threadId: '019e4d24-6524-7041-9e1c-8108180cddae',
		cwd: '/tmp/workspace',
		prompt: 'implemente os loops',
		key: 'loops',
		title: 'Loops',
	}

	it('renderiza o texto do operador quando a thread tem customPrompt', () => {
		const builder = new IssueWorkPromptBuilder()
		const system = builder.system({ ...baseInput, customPrompt: 'Sempre suba um PR ao final.' })

		expect(system).toContain('Sempre suba um PR ao final.')
	})

	it('não renderiza cabeçalho algum quando a thread não tem customPrompt', () => {
		const builder = new IssueWorkPromptBuilder()
		const system = builder.system(baseInput)

		// Um cabeçalho vazio diria ao modelo que existe uma instrução e não a forneceria —
		// que é como um modelo começa a inventar uma.
		expect(system).not.toContain('INSTRUCTIONS FROM THE OPERATOR')
	})

	it('não repete as ressalvas do orquestrador, que não são da issue', () => {
		const builder = new IssueWorkPromptBuilder()
		const system = builder.system({ ...baseInput, customPrompt: 'Sempre suba um PR ao final.' })

		// A issue PODE preparar o próprio ambiente e não fala no chat; herdar as duas ressalvas do
		// orquestrador a proibiria de trabalhar e a instruiria sobre um formato que ela nunca emite.
		expect(system).not.toContain('[quote:')
		expect(system).not.toContain('install dependencies')
	})
})
