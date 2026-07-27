import { injectable } from 'tsyringe-neo'
import { ProviderKind, ProviderStatus } from '@codedm/contracts-typescript/wire/enums'
import { KNOWN_PROVIDERS, ProviderDetector, type ProviderDetection } from './ProviderDetector'

/**
 * Test/dev `ProviderDetector` bound in the `mock` and `integration` DI envs. Returns a deterministic
 * catalog — claude-code DETECTED (so the terminal engine has a provider to drive), the rest
 * NOT_INSTALLED — without ever touching the filesystem or spawning a `--version` probe.
 *
 * Suites that need a different shape construct one directly with an override map.
 */
@injectable()
export class MockProviderDetector extends ProviderDetector {
	private static readonly DEFAULTS: Record<ProviderKind, ProviderDetection> = {
		[ProviderKind.CLAUDE_CODE]: {
			name: ProviderKind.CLAUDE_CODE,
			status: ProviderStatus.DETECTED,
			binaryPath: '/usr/local/bin/claude',
			version: '1.0.0 (mock)',
			// Real claude-code declares `--resume` in its help text (`claudeProviderDef.capabilityFlags`),
			// so the deterministic mock reports the same capability — otherwise `RunIssueTurn.resolveSession`'s
			// capability gate (GOAL-agent-abstraction §4.10) would force every mocked turn fresh, breaking
			// the multi-turn resume suites that this detector backs.
			caps: { sessionResume: true },
		},
		[ProviderKind.CODEX]: { name: ProviderKind.CODEX, status: ProviderStatus.NOT_INSTALLED },
		[ProviderKind.OPENCODE]: { name: ProviderKind.OPENCODE, status: ProviderStatus.NOT_INSTALLED },
	}

	/**
	 * Per-provider overrides. A PUBLIC FIELD (not a constructor param) so tsyringe can construct this
	 * with no arguments in the DI path — an interface-typed constructor param would fail reflection
	 * ("TypeInfo not known for Object"). Tests set it via the `with()` factory.
	 */
	overrides: Partial<Record<ProviderKind, ProviderDetection>> = {}

	/** Build a detector with the given per-provider overrides (test convenience). */
	static with(overrides: Partial<Record<ProviderKind, ProviderDetection>>): MockProviderDetector {
		const detector = new MockProviderDetector()
		detector.overrides = overrides
		return detector
	}

	async detect(): Promise<ProviderDetection[]> {
		return KNOWN_PROVIDERS.map(name => this.overrides[name] ?? MockProviderDetector.DEFAULTS[name])
	}

	async resolve(name: ProviderKind): Promise<ProviderDetection | undefined> {
		return this.overrides[name] ?? MockProviderDetector.DEFAULTS[name]
	}
}
