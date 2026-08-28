import type Z from 'zod'
import { z } from '@codm/core-typescript'

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
 *
 * Declared as a SCHEMA with the type derived from it (Fase 5), not as a bare `interface`. The probe
 * result now travels through `IssueWorkAgent`'s input schema on its way from the use case that
 * resolved it to the `buildRequest` that renders it into argv, and a runtime contract needs a runtime
 * declaration. One declaration, both halves: a flag added here reaches argv AND the agent input
 * without a second mirror to keep in sync (§8 rule 4 — a re-declared value-set is a modelling error).
 */
export const ProviderCapabilitiesSchema = z.object({
	/** `--include-partial-messages` is supported → token-level deltas instead of whole-message chunks. */
	partialMessages: z.boolean().optional(),
	/**
	 * The CLI accepts an MCP server config → our tools can be declared at all.
	 *
	 * The capability, never a spelling: claude takes `--mcp-config`, codex takes an inline TOML
	 * override (`-c mcp_servers.<key>.command=…`, measured to spawn the server with both args and env
	 * in `.specs/codedm/codex-smoke/raw/mcp-proof.json`). Which argv expresses it belongs to that
	 * CLI's runner; this flag only answers whether it can be expressed at all.
	 */
	mcpConfig: z.boolean().optional(),
	/**
	 * Native session resume → no rendered transcript in the prompt.
	 *
	 * Also a capability rather than a spelling, and codex is why the parenthetical that used to read
	 * "(`--resume` / `--session-id`)" is gone: there resume is a SUBCOMMAND with a strictly narrower
	 * flag set than the plain run (`codex exec resume`, measured — no `-s`, no `-C`, no `--add-dir`),
	 * so it is a different argv SHAPE, not one more flag on the same one.
	 */
	sessionResume: z.boolean().optional(),
})

export type ProviderCapabilities = Z.output<typeof ProviderCapabilitiesSchema>
