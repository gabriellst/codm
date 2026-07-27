import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import type { ProviderDef } from './ProviderDef'
import { claudeProviderDef } from './defs/claude'
import { codexProviderDef } from './defs/codex'
import { opencodeProviderDef } from './defs/opencode'

/**
 * Every external CLI the engine can drive, as a DATA LITERAL keyed by the wire enum
 * (GOAL-agent-abstraction §4.7).
 *
 * `Record<ProviderKind, ProviderDef>` and NOT an array with a boot-time dedupe check — the
 * difference is where you find out you forgot one. With the Record, adding a member to
 * `provider-kind.tsp` and regenerating turns every place that must learn about it into a `tsc`
 * error, at author time. With an array you find out in production, if at all. AC-1.3 covers the
 * inverse direction (a def whose key does not exist in the enum).
 *
 * This registry is the ONLY place provider identity is allowed to be compared. `switch (provider)`
 * or `if (provider === …)` anywhere else — and above all inside the runner — means a difference that
 * should have become a `ProviderDef` FIELD was written as control flow instead (§8 rule 4).
 */
export const PROVIDER_DEFS: Record<ProviderKind, ProviderDef> = {
	// Keys are the ENUM MEMBERS, not `def.id` — a computed key widens to `ProviderKind` and the
	// literal-key exhaustiveness check silently evaporates, which is the entire value of the Record.
	[ProviderKind.CLAUDE_CODE]: claudeProviderDef,
	[ProviderKind.CODEX]: codexProviderDef,
	[ProviderKind.OPENCODE]: opencodeProviderDef,
}

/** The def for one provider. Total by type — no `undefined` branch to forget. */
export function providerDef(provider: ProviderKind): ProviderDef {
	return PROVIDER_DEFS[provider]
}
