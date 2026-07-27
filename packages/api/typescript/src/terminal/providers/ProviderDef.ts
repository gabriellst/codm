import type { AgentModelId, ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import type { AgentMcpInvocation } from '../types/AgentMcpInvocation'

/**
 * What a probe discovered a provider binary can actually DO (GOAL-agent-abstraction §4.7).
 *
 * Passed to `buildArgs` BY PARAMETER — never read from a module-level map. The open-design
 * implementation this pattern is adapted from keeps a mutable module map that the detection phase
 * populates, which makes `buildArgs` impure in practice: its output depends on whether detection has
 * run yet, and two runs in one process can disagree for reasons invisible at the call site. Here the
 * `ProviderDetector` RETURNS caps and the caller threads them through, so `buildArgs` is a pure
 * function of its arguments. AC-1.2 is the mechanical proof.
 */
export interface ProviderCapabilities {
	/** `--include-partial-messages` is supported → token-level deltas instead of whole-message chunks. */
	partialMessages?: boolean
	/** The CLI accepts an MCP server config → our tools can be declared at all. */
	mcpConfig?: boolean
	/** Native session resume (`--resume` / `--session-id`) → no rendered transcript in the prompt. */
	sessionResume?: boolean
}

/** Everything `buildArgs` needs to produce a full argv. One record, no ambient state. */
export interface ProviderBuildArgsOptions {
	/** `AgentModelId.DEFAULT` means OMIT the model flag entirely — not "pass the string DEFAULT". */
	model?: AgentModelId
	cwd: string
	/** Extra roots the agent may touch beyond `cwd` (`--add-dir`). */
	extraDirs?: readonly string[]
	/** Mutually exclusive with `newSessionId` — resuming an existing provider session. */
	resumeSessionId?: string
	/** Mutually exclusive with `resumeSessionId` — pinning the id of a session being created. */
	newSessionId?: string
	/** Present ⟺ the agent declared a non-empty tool scope (§4.2). DATA, never a branch condition on provider. */
	mcp?: AgentMcpInvocation
	/** Probed capabilities of THIS binary. By parameter, on purpose — see `ProviderCapabilities`. */
	caps: ProviderCapabilities
}

/**
 * ONE external CLI, expressed entirely as DATA (GOAL-agent-abstraction §4.7).
 *
 * The rule this type enforces, and the reason it exists at all: **`if (provider === 'x')` anywhere
 * outside these defs means the MODEL is wrong** (§8 rule 4). Every difference between claude, codex
 * and opencode is a FIELD here — including the ones that look like capability gaps:
 *
 *  - no stream-json → `promptInputFormat: 'text'` + `streamFormat: 'plain'`; the runner writes the
 *    prompt, closes stdin and emits one `assistant_text` frame per line. Same runner, same seam.
 *  - no native resume → `resumesSessionViaCli` absent; the PROMPT carries a rendered transcript.
 *  - no MCP → `mcpConfigFlag` absent; the runner passes nothing, and an agent that REQUIRES tools
 *    fails fast and named (`AGENT_TOOLS_UNSUPPORTED`, born in Fase 6) rather than degrading silently.
 *
 * A provider that eventually needs a genuinely different frame grammar gets a new `eventParser`,
 * never a second method on the seam.
 */
export interface ProviderDef {
	id: ProviderKind
	/** Primary binary name, used when the detector resolved no absolute path. */
	bin: string
	/** Alternative binary names to try, in order, during detection. */
	fallbackBins?: readonly string[]
	/** Argv that prints the version — the detector's liveness probe. */
	versionArgs: readonly string[]
	/** Argv that prints help — the capability probe's input. */
	helpArgs?: readonly string[]
	/**
	 * Flag-in-help → capability-key map. The probe greps `helpArgs` output for each key and sets the
	 * mapped `ProviderCapabilities` field. A capability is therefore DISCOVERED, never assumed from a
	 * version string, which is what keeps a CLI upgrade from silently changing behaviour.
	 */
	capabilityFlags?: Readonly<Record<string, keyof ProviderCapabilities>>
	/** Pure: same options in, same argv out. No module state, no `caps` lookup, no clock. */
	buildArgs(options: ProviderBuildArgsOptions): string[]
	/** The prompt goes on stdin (dodges `E2BIG`/`ENAMETOOLONG`, and keeps the turn open for more input). */
	promptViaStdin: boolean
	promptInputFormat: 'text' | 'stream-json'
	streamFormat: 'claude-stream-json' | 'json-event-stream' | 'plain'
	/** Names the frame grammar when it is not the default for `streamFormat`. */
	eventParser?: string
	/** The CLI itself can resume a prior session — no rendered transcript needed in the prompt. */
	resumesSessionViaCli?: boolean
	/** The session id appears in the stream (claude's `system_init`) rather than only being passed in. */
	capturesSessionIdFromStream?: boolean
	/** Cheap "are we authenticated" probe, when the CLI offers one. */
	authProbe?: { args: readonly string[]; timeoutMs?: number }

	// ── Tool capability as DATA (D8). A provider without MCP simply declares none of these. ──
	/** e.g. `--mcp-config`. ABSENT means: this CLI cannot be handed our tools. */
	mcpConfigFlag?: string
	/** How the value after `mcpConfigFlag` is passed: inline JSON, or a path to a JSON file. */
	mcpConfigFormat?: 'json-inline' | 'json-file'
	/** e.g. `--allowedTools`. Scopes the run to the agent's declared tools. */
	allowedToolsFlag?: string
	/** e.g. `--disallowedTools`. The complement; declared for symmetry, unused by the default policy. */
	disallowedToolsFlag?: string
}
