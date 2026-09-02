import type { ProviderCapabilities } from './ProviderCapabilities'

/**
 * How ONE provider CLI is FOUND on a machine and asked what it supports — the detection half of a CLI,
 * and nothing else (GOAL-agent-abstraction §4.5).
 *
 * ### Why this is not the dead per-CLI data literal under a new name
 * That type died because it tried to express the DRIVING of a CLI as data: argv construction, stream
 * format, prompt format, MCP flags. It failed on its own terms — a stream format is a different
 * PARSING PATH, not an argv, so one runner could not honour it without the very `if (provider === …)`
 * the data-literal pattern existed to forbid. Driving therefore moved into a class per CLI.
 *
 * Detection did not, and could not: `ProviderDetector.detect()` answers "which of the CLIs we know
 * about are installed here", which is a question about a LIST, asked before any run exists and for
 * providers we cannot drive at all. What stays as data is exactly the four inputs of that probe — the
 * binary names to look for, the argv that prints a version, the argv that prints help, and the
 * flag→capability map to grep that help with. No behaviour, no argv construction, no parsing.
 *
 * A CLI WITH a runner owns its spec as a static on that runner (`ClaudeAgentRunner.binary`), so the
 * one place that knows how to drive claude is also the one place that knows how to find it. A CLI
 * without a runner (codex, opencode today) is DETECT-ONLY: we can report it in the provider catalog,
 * and we say so where its spec is declared.
 */
export interface ProviderBinarySpec {
	/**
	 * Primary binary name the DETECTOR searches for (`ProviderSearch`; `SystemProviderDetector.probeWhich`).
	 * Never spawned bare: the runner only ever receives the resolved absolute path (`AgentRunRequest.binaryPath`).
	 */
	bin: string
	/** Alternative binary names to try, in order, during detection. */
	fallbackBins?: readonly string[]
	/** Argv that prints the version — the detector's liveness probe. */
	versionArgs: readonly string[]
	/** Argv that prints help — the capability probe's input. */
	helpArgs?: readonly string[]
	/**
	 * Help-text TOKEN → capability-key map. The probe greps `helpArgs` output for each key and sets the
	 * mapped `ProviderCapabilities` field. A capability is therefore DISCOVERED, never assumed from a
	 * version string, which is what keeps a CLI upgrade from silently changing behaviour.
	 *
	 * A TOKEN, NOT A FLAG — and the difference is not pedantry, it is the bug this field was renamed
	 * out of. The probe has always been `help.includes(key)`, but the field was called
	 * `capabilityFlags`, and a name that says "flag" invites the next spec to declare `--x` for a CLI
	 * that spells the same capability another way. codex is exactly that CLI: measured against its own
	 * committed `--help` (`.specs/codedm/codex-smoke/raw/help-root.txt`) it publishes NEITHER
	 * `--mcp-config` NOR `--resume` — its MCP is a config key (`-c mcp_servers.*`, measured to spawn a
	 * server) and its resume is a SUBCOMMAND (`codex exec resume`). The spec declared both flags
	 * anyway, so the probe reported both capabilities ABSENT on a binary that has both, and the runner
	 * would have been driven with the conservative argv: no tools, and a transcript re-rendered into
	 * every prompt. Whatever string the CLI's own help uses is the right key.
	 */
	capabilityTokens?: Readonly<Record<string, keyof ProviderCapabilities>>
}
