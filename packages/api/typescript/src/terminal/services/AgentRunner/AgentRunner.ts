import type { ZodType } from 'zod'
import type { AgentRunRequest, AgentRuntimeEvent } from '../../types'

/**
 * THE SEAM — one method (GOAL-agent-abstraction §4.1).
 *
 * ### Why exactly one, when the reference implementation this lineage comes from has two
 * That codebase keeps `generate` + `stream` because there they are two genuinely different runtimes
 * over one backend. Here they are not: after the stream-json decision, classifying and executing are
 * the same spawn, the same stdin format, the same stdout parser and the same end-of-turn signal. A
 * second method would encode ZERO domain information — the only real difference is whether an
 * `outputSchema` was passed, and that is a FIELD on the request. `TerminalLLMRunner.generate` is kept
 * alive as a thin adapter over this method precisely so the seam does not have to grow one.
 *
 * ### Why `AsyncIterable` rather than `Promise`
 * Streaming is the GENERAL case and structured output the degenerate one; the inverse is not true.
 * "Just give me the object" is served by a helper that drains this same iteration (§4.5), not by a
 * second transport.
 *
 * ### Why there is no `tools` parameter (D8)
 * The runner does NOT mediate a tool loop. The CLI talks to our MCP server over a SEPARATE transport,
 * so the runner keeps doing one thing — spawn and drain. MCP configuration arrives inside the request
 * as `mcp`, invocation DATA of the same kind as `binaryPath` and `cwd`, never an inventory of callable
 * functions. A provider that one day requires us to execute tools inline earns a new `ProviderDef` /
 * `eventParser`, never a second method here.
 */
export abstract class AgentRunner {
	abstract run<OutputSchema extends ZodType | undefined = undefined>(request: AgentRunRequest<OutputSchema>): AsyncIterable<AgentRuntimeEvent>

	/** Release every process this runner still owns. Idempotent. */
	abstract shutdown(): Promise<void>
}
