/**
 * What a probe discovered a provider binary can actually DO (GOAL-agent-abstraction §4.7, as amended
 * by Fase 4.5).
 *
 * This is the HALF of the dead per-CLI data literal that survived, and it survived because it is the only
 * half that was ever a fact about a MACHINE rather than a fact about a CLI. `bin`, `versionArgs`,
 * `buildArgs`, `streamFormat` describe what a given CLI IS — they belong to that CLI's own runner
 * class. `caps` describes what THIS INSTALL of that CLI turned out to support, discovered at runtime,
 * which is why it cannot live in a class at all.
 *
 * It is RETURNED by `ProviderDetector` and threaded BY PARAMETER into argv construction. Never read
 * from a module-level map: the open-design implementation this pattern came from keeps a mutable
 * module map that detection populates, which makes argv construction impure in practice — its output
 * depends on whether detection has run yet, and two runs in one process can disagree for reasons
 * invisible at the call site. Here the caller threads it through, so argv stays a pure function of its
 * arguments (AC-1.2, still asserted mechanically over `ClaudeAgentRunner.buildArgs`).
 */
export interface ProviderCapabilities {
	/** `--include-partial-messages` is supported → token-level deltas instead of whole-message chunks. */
	partialMessages?: boolean
	/** The CLI accepts an MCP server config → our tools can be declared at all. */
	mcpConfig?: boolean
	/** Native session resume (`--resume` / `--session-id`) → no rendered transcript in the prompt. */
	sessionResume?: boolean
}
