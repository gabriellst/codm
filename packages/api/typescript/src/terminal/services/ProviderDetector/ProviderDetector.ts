import { ProviderKind, ProviderStatus } from '@codedm/contracts-typescript/wire/enums'
import type { ProviderCapabilities } from '../../providers'

/**
 * The detection record for one provider CLI — the shape T08 (Settings) and T15 (Attach wizard) read
 * to render provider availability. `DETECTED` carries the resolved `binaryPath` + `version`;
 * `NOT_INSTALLED` carries neither.
 *
 * `caps` (GOAL-agent-abstraction §4.7, Fase 1) is the probe result: `helpArgs` output grepped for
 * each key of the def's `capabilityFlags`. It is RETURNED, never stashed in a module-level map, and
 * the caller threads it into `ProviderDef.buildArgs({ …, caps })`. That is the whole difference from
 * the open-design implementation this pattern is adapted from — there `buildArgs` reads an ambient
 * map that detection mutates, so its output silently depends on whether detection has run. Here
 * `buildArgs` is a pure function of its arguments, and AC-1.2 proves it mechanically.
 *
 * Empty (`{}`) on a `NOT_INSTALLED` provider, and empty is the SAFE default: every capability is
 * opt-in, so an unprobed binary is driven with the conservative argv rather than one it might reject.
 */
export interface ProviderDetection {
	name: ProviderKind
	status: ProviderStatus
	binaryPath?: string
	version?: string
	caps?: ProviderCapabilities
}

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

/** Every provider CLI the engine knows how to detect + drive, in display order. */
export const KNOWN_PROVIDERS: readonly ProviderKind[] = [ProviderKind.CLAUDE_CODE, ProviderKind.CODEX, ProviderKind.OPENCODE]

/** The binary name(s) each provider ships, tried in order during a probe. */
export const PROVIDER_BINARIES: Record<ProviderKind, readonly string[]> = {
	[ProviderKind.CLAUDE_CODE]: ['claude'],
	[ProviderKind.CODEX]: ['codex'],
	[ProviderKind.OPENCODE]: ['opencode'],
}
