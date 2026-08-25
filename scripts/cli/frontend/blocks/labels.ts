// `--labels` (requires `--sdk=<Enum>`) — emits the full typed enum-label wiring.
//
// The canonical pattern (.claude/skills/enum/SKILL.md, ENUM-P08/P11; component bp-23):
// human-readable enum labels live ONLY in the i18n `enums.<EnumName>.<VALUE>` catalog,
// resolved via the typed-template `t()` — never a `Record<Enum, string>` label map,
// never inline strings. This block emits the t() helper; the assembler seeds the
// catalog keys from the generated SDK enum's values (lock-step pt/en via writeI18n),
// so the typed t() keys compile from the first `tsc` run.
//
// Measured rationale: eval iterations showed headless builders reliably hand-roll
// label maps unless the wiring already exists — this is the "if you wrote it, the
// CLI should write it" escalation for that family.

import type { BlockFn } from './types'
import { renderBlock } from './fragments'
import { toCamelCase } from '../util/naming'

export const labelsBlock: BlockFn = ctx => {
	if (!ctx.sdk) return {}
	const enumName = ctx.sdk.replace(/Enum$/, '')
	return renderBlock('labels', 'react', { enumName, enumCamel: toCamelCase(enumName) })
}
