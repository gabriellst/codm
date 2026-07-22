import { ProviderKind, ProviderStatus } from '@template/contracts-typescript/wire/enums'

/**
 * The detection record for one provider CLI — the shape T08 (Settings) and T15 (Attach wizard) read
 * to render provider availability. `DETECTED` carries the resolved `binaryPath` + `version`;
 * `NOT_INSTALLED` carries neither.
 */
export interface ProviderDetection {
	name: ProviderKind
	status: ProviderStatus
	binaryPath?: string
	version?: string
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
