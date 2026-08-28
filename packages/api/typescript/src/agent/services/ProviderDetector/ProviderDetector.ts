import { ProviderKind, ProviderStatus } from '@codm/contracts-typescript/wire/enums'
import type { ProviderBinarySpec } from '../../types/ProviderBinarySpec'
import type { ProviderCapabilities } from '../../types/ProviderCapabilities'
import { ClaudeAgentRunner } from '../AgentRunner/ClaudeAgentRunner'
import { CodexAgentRunner } from '../AgentRunner/CodexAgentRunner'

/**
 * The detection record for one provider CLI — the shape T08 (Settings) and T15 (Attach wizard) read
 * to render provider availability. `DETECTED` carries the resolved `binaryPath` + `version`;
 * `NOT_INSTALLED` carries neither.
 *
 * `caps` (GOAL-agent-abstraction §4.7, Fase 1) is the probe result: `helpArgs` output grepped for
 * each key of the spec's `capabilityFlags`. It is RETURNED, never stashed in a module-level map, and
 * the caller threads it into `ClaudeAgentRunner.buildArgs({ …, caps })`. That is the whole difference
 * from the open-design implementation this pattern is adapted from — there argv construction reads an
 * ambient map that detection mutates, so its output silently depends on whether detection has run.
 * Here `buildArgs` is a pure function of its arguments, and AC-1.2 proves it mechanically.
 *
 * Empty (`{}`) on a `NOT_INSTALLED` provider, and empty is the SAFE default: every capability is
 * opt-in, so an unprobed binary is driven with the conservative argv rather than one it might reject.
 *
 * A UNION on `status`, not one interface with optionals: a `DETECTED` row without a `binaryPath` was
 * representable before and the runner papered over it with a bare binary name. On Windows a bare
 * name is whichever of `claude.exe` / `claude.cmd` the loader meets first on PATH — so the path the
 * search resolved is REQUIRED where the status says it exists, and unrepresentable where it does not.
 */
export interface DetectedProvider {
	name: ProviderKind
	status: ProviderStatus.DETECTED
	/** ABSOLUTE path resolved by the detector's search (`ProviderSearch`; `SystemProviderDetector.probeWhich`) — exactly what the runner spawns. */
	binaryPath: string
	version?: string
	caps?: ProviderCapabilities
}

export interface NotInstalledProvider {
	name: ProviderKind
	status: ProviderStatus.NOT_INSTALLED
	// Declared as `undefined` rather than omitted so `d.binaryPath` stays a legal read on the union —
	// `DetectProviders` maps the whole catalog with one expression, and the wire shape is unchanged.
	binaryPath?: undefined
	version?: undefined
	caps?: undefined
}

export type ProviderDetection = DetectedProvider | NotInstalledProvider

/**
 * Detection & resolution of agent provider CLIs (claude-code / codex / opencode). A SERVICE, not an
 * aggregate — detection has no identity, lifecycle, or invariants; it is a cached probe over the
 * machine (the source-map's "Go detection Service + thin config", realized in TS per founder
 * decision 3: the terminal/PTY domain lives on the TS side).
 *
 * - `detect()`  — probe every known provider, returning a full row per provider (missing ones as
 *   `NOT_INSTALLED`). Result is cached; `{ refresh: true }` forces a re-probe (backs C07
 *   RescanProviders).
 * - `resolve()` — the fast path the runtime uses to get a single provider's `binaryPath` before
 *   spawning a session.
 */
export abstract class ProviderDetector {
	abstract detect(options?: { refresh?: boolean }): Promise<ProviderDetection[]>
	abstract resolve(name: ProviderKind): Promise<ProviderDetection | undefined>
}

/** Every provider CLI the engine knows how to detect, in display order. */
export const KNOWN_PROVIDERS: readonly ProviderKind[] = [ProviderKind.CLAUDE_CODE, ProviderKind.CODEX, ProviderKind.OPENCODE]

/**
 * How each known CLI is FOUND and probed. Detection input only — no argv, no parsing, no driving
 * (Fase 4.5; see `ProviderBinarySpec` for why this is not the dead def registry under a new name).
 *
 * `Record<ProviderKind, …>` and not an array: adding a member to `provider-kind.tsp` and regenerating
 * turns this into a `tsc` error at author time rather than a boot-time surprise.
 *
 * Driven providers do not repeat themselves here: their spec IS the static on their runner, so "how
 * to find it" and "how to drive it" cannot drift. OPENCODE remains detect-only until its own measured
 * runner replaces the literal below.
 */
export const PROVIDER_BINARIES: Record<ProviderKind, ProviderBinarySpec> = {
	[ProviderKind.CLAUDE_CODE]: ClaudeAgentRunner.binary,
	[ProviderKind.CODEX]: CodexAgentRunner.binary,
	[ProviderKind.OPENCODE]: {
		bin: 'opencode',
		versionArgs: ['--version'],
		helpArgs: ['--help'],
		capabilityFlags: { '--mcp-config': 'mcpConfig', '--resume': 'sessionResume' },
	},
}
