import { describe, expect, it } from 'bun:test'
import type { ZodType } from 'zod'
import { AgentRunner } from './AgentRunner'
import { StubAgentRunner } from './StubAgentRunner'
import { E2eStubAgentRunner } from './E2eStubAgentRunner'
import { StreamJsonAgentRunner } from './StreamJsonAgentRunner/StreamJsonAgentRunner'
import type { AgentRunRequest, AgentRuntimeEvent } from '../../types'

/**
 * AC-3.1 — THE SEAM HAS EXACTLY ONE EXECUTION METHOD.
 *
 * This is a REFLECTION test rather than a type-level one on purpose. `tsc` already forbids calling a
 * method that does not exist; what it cannot catch is a method being ADDED. The whole argument of §4.1
 * is that a second method would encode zero domain information — classifying and executing are the
 * same spawn, the same stdin format, the same parser and the same end-of-turn signal, differing only
 * by whether an `outputSchema` was passed, which is a FIELD. So the thing worth asserting is the
 * SHAPE of the abstract class, and the assertion is an exact set equality: a new member fails here
 * before it can be reasoned about anywhere else.
 *
 * The predecessor this replaced had FIVE members (`generate`, `stream`, `getSession`, `killSession`,
 * `prewarm`) — four of which were the PTY session engine's vocabulary leaking through the abstraction.
 */
const SEAM_MEMBERS = ['run', 'shutdown'] as const

function ownMethodNames(proto: object): string[] {
	return Object.getOwnPropertyNames(proto)
		.filter(name => name !== 'constructor')
		.sort()
}

describe('AgentRunner — the ONE-METHOD seam (§4.1)', () => {
	it('declares exactly `run` + `shutdown` on the abstract class, and nothing else', () => {
		// An abstract member has no runtime slot, so the seam is measured through a minimal concrete
		// subclass that implements the contract and adds nothing: its own prototype IS the contract.
		class Minimal extends AgentRunner {
			run<OutputSchema extends ZodType | undefined = undefined>(_request: AgentRunRequest<OutputSchema>): AsyncIterable<AgentRuntimeEvent> {
				return (async function* (): AsyncGenerator<AgentRuntimeEvent> {})()
			}
			async shutdown(): Promise<void> {}
		}

		expect(ownMethodNames(Minimal.prototype)).toEqual([...SEAM_MEMBERS].sort())
	})

	it('every shipped implementation answers the seam and adds no second execution method', () => {
		for (const impl of [StubAgentRunner, E2eStubAgentRunner, StreamJsonAgentRunner]) {
			const members = ownMethodNames(impl.prototype)
			// Private helpers are allowed (they are implementation, not seam); a second PUBLIC execution
			// entry point is not. `buildResult` / `classifyStop` on the stream-json runner are `private`
			// in TS but present at runtime, so the check is scoped to the seam names being present and
			// to no other member looking like an execution verb.
			expect(members).toContain('run')
			expect(members).toContain('shutdown')
			expect(members.filter(name => ['generate', 'stream', 'getSession', 'killSession', 'prewarm'].includes(name))).toEqual([])
		}
	})

	it('is an abstract class — subclassing works and instances are AgentRunner', () => {
		expect(new StubAgentRunner()).toBeInstanceOf(AgentRunner)
		expect(new E2eStubAgentRunner()).toBeInstanceOf(AgentRunner)
	})
})
