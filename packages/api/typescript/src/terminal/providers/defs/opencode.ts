import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import type { ProviderDef, ProviderBuildArgsOptions } from '../ProviderDef'

/**
 * `opencode` — same degraded shape as `codex`, same registered risk (AC-1.8), same resolution: the
 * capability set is declared CONSERVATIVELY here (`streamFormat: 'plain'`, no `mcpConfigFlag`, no
 * native resume) and is upgraded by editing this file when someone verifies a richer mode exists.
 *
 * That two providers land on the same conservative defaults is the point, not a smell: it shows the
 * degradation is a property of the DEF, so adding a fourth CLI tomorrow costs one file and zero
 * runner changes.
 */
export const opencodeProviderDef: ProviderDef = {
	id: ProviderKind.OPENCODE,
	bin: 'opencode',
	versionArgs: ['--version'],
	helpArgs: ['--help'],
	capabilityFlags: {
		'--mcp-config': 'mcpConfig',
		'--resume': 'sessionResume',
	},
	promptViaStdin: false,
	promptInputFormat: 'text',
	streamFormat: 'plain',

	/** `opencode run <prompt>` — prefix only; the runner appends the prompt (`promptViaStdin: false`). */
	buildArgs(_options: ProviderBuildArgsOptions): string[] {
		return ['run']
	},
}
