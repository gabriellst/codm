import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import type { ProviderDef, ProviderBuildArgsOptions } from '../ProviderDef'

/**
 * `codex` — the DEGRADED shape, and the reason the degraded shape has to be expressible AS DATA.
 *
 * RISK, REGISTERED (AC-1.8): it has NOT been verified that this CLI has a JSONL streaming mode or
 * an MCP config flag equivalent to claude's. The contract lock resolves that uncertainty in the only
 * way that keeps the seam honest — this def declares the CONSERVATIVE capability set:
 *
 *   - `streamFormat: 'plain'` — the runner writes the prompt, closes stdin, and emits one
 *     `assistant_text` frame per output line. Same `run()`, same frame union, less information.
 *   - no `mcpConfigFlag` — our tools cannot be declared here. An agent with an EMPTY tool scope runs
 *     fine and its facts are marked `FactSource.INFERRED`; an agent that REQUIRES tools fails fast
 *     and named (`AGENT_TOOLS_UNSUPPORTED`, Fase 6). It never silently runs without them.
 *   - no `resumesSessionViaCli` — multi-turn context is carried by a transcript rendered into the
 *     prompt, which is exactly the fallback §4.7 names.
 *
 * When someone verifies a richer mode exists, the fix is to EDIT THIS FILE (and possibly add an
 * `eventParser`). It is never a branch in the runner: `if (provider === 'CODEX')` anywhere outside
 * `providers/defs/` means the model is wrong (§8 rule 4).
 */
export const codexProviderDef: ProviderDef = {
	id: ProviderKind.CODEX,
	bin: 'codex',
	versionArgs: ['--version'],
	helpArgs: ['--help'],
	// Probed anyway: if a future build grows the flags, the capability lights up with no code change.
	capabilityFlags: {
		'--mcp-config': 'mcpConfig',
		'--resume': 'sessionResume',
	},
	promptViaStdin: false,
	promptInputFormat: 'text',
	streamFormat: 'plain',

	/**
	 * `codex exec <prompt>` — this returns the SUBCOMMAND PREFIX only. With `promptViaStdin: false`
	 * the runner appends the prompt as the final argument; keeping it out of here is what lets
	 * `buildArgs` stay a pure function of invocation SHAPE, identical in signature across providers.
	 */
	buildArgs(_options: ProviderBuildArgsOptions): string[] {
		return ['exec']
	},
}
