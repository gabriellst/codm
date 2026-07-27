import { describe, expect, it } from 'bun:test'
import { MockLoggingService } from '@codedm/core-typescript'
import { ProviderKind, ProviderStatus } from '@codedm/contracts-typescript/wire/enums'
import type { ProviderCapabilities } from '../../types'
import { PROVIDER_BINARIES } from './ProviderDetector'
import { SystemProviderDetector } from './SystemProviderDetector'
import { MockProviderDetector } from './MockProviderDetector'
import { ClaudeAgentRunner } from '../AgentRunner/ClaudeAgentRunner'

/**
 * Faked `SystemProviderDetector` — overrides the OS-touching probes so the caching + status mapping
 * logic is exercised against an in-memory machine (no real `claude`/`codex`/`opencode` binary
 * required, and no `--version` / `--help` shell-out). `whichCalls` records probe activity so the
 * cache behavior is observable.
 */
class FakeSystemProviderDetector extends SystemProviderDetector {
	whichCalls = 0
	constructor(
		private readonly installed: Partial<Record<string, { path: string; version?: string }>>,
		/** Faked `--help` output keyed by binary path — drives the capability probe without a real CLI. */
		private readonly helpText: Partial<Record<string, string>> = {},
	) {
		// The probe-failure path logs through the INJECTED LoggingService, never a raw `console.*`
		// (tests/architecture/console-discipline.test.ts). `MockLoggingService` is the sanctioned
		// no-network bottom for tests.
		super(new MockLoggingService())
	}
	protected override probeWhich(command: string): string | null {
		this.whichCalls++
		return this.installed[command]?.path ?? null
	}
	protected override async probeVersion(binaryPath: string): Promise<string | undefined> {
		const match = Object.values(this.installed).find(entry => entry?.path === binaryPath)
		return match?.version
	}
	/**
	 * Overrides only the SPAWN, not the grep: the flag→capability mapping under test is the REAL one,
	 * read from the real `PROVIDER_BINARIES` (which for claude IS `ClaudeAgentRunner.binary`). Faking
	 * the mapping too would make the assertion tautological.
	 */
	protected override async probeCapabilities(provider: ProviderKind, binaryPath: string): Promise<ProviderCapabilities> {
		const help = this.helpText[binaryPath]
		if (help === undefined) return {}
		const caps: ProviderCapabilities = {}
		for (const [flag, capability] of Object.entries(PROVIDER_BINARIES[provider].capabilityFlags ?? {})) {
			if (help.includes(flag)) caps[capability] = true
		}
		return caps
	}
}

describe('SystemProviderDetector — detection logic (faked probes)', () => {
	it('maps a found binary to DETECTED with its path + version, missing ones to NOT_INSTALLED', async () => {
		const detector = new FakeSystemProviderDetector({ claude: { path: '/opt/homebrew/bin/claude', version: '1.2.3' } })
		const detections = await detector.detect()

		const claude = detections.find(d => d.name === ProviderKind.CLAUDE_CODE)
		expect(claude).toEqual({
			name: ProviderKind.CLAUDE_CODE,
			status: ProviderStatus.DETECTED,
			binaryPath: '/opt/homebrew/bin/claude',
			version: '1.2.3',
			// No faked help text for this path → the probe found nothing, and NOTHING is the safe
			// default: every capability is opt-in, so an unprobed binary is driven conservatively.
			caps: {},
		})

		const codex = detections.find(d => d.name === ProviderKind.CODEX)
		expect(codex).toEqual({ name: ProviderKind.CODEX, status: ProviderStatus.NOT_INSTALLED })
	})

	it('probes CAPABILITIES from help text via the def’s capabilityFlags map, per binary', async () => {
		const detector = new FakeSystemProviderDetector(
			{ claude: { path: '/opt/homebrew/bin/claude', version: '2.0.0' } },
			{ '/opt/homebrew/bin/claude': '--include-partial-messages  stream token deltas\n--mcp-config <json>\n' },
		)
		const claude = await detector.resolve(ProviderKind.CLAUDE_CODE)
		// Two flags present in the help → two capabilities. `--resume` is NOT in the faked help, so
		// `sessionResume` stays absent: a capability is DISCOVERED, never assumed from the def.
		expect(claude?.caps).toEqual({ partialMessages: true, mcpConfig: true })
	})

	it('yields NO capabilities when help text is unavailable — degradation is conservative, not optimistic', async () => {
		const detector = new FakeSystemProviderDetector({ claude: { path: '/opt/homebrew/bin/claude' } }, {})
		const claude = await detector.resolve(ProviderKind.CLAUDE_CODE)
		expect(claude?.caps).toEqual({})
	})

	/**
	 * The exhaustiveness half of the dead AC-1.3, at its new address. The def registry it used to run
	 * over was a `Record<ProviderKind, …>` so that ADDING a member to `provider-kind.tsp` became a `tsc` error
	 * rather than a silent gap; `PROVIDER_BINARIES` inherits that job for the only fact still keyed by
	 * provider identity — how to FIND each CLI. The runtime assertion pins the value-set so the
	 * contract growing a fourth kind fails loudly here too.
	 */
	it('has exactly one binary spec per wire enum member, and covers the three kinds frozen today', () => {
		const kinds = Object.values(ProviderKind)
		expect(Object.keys(PROVIDER_BINARIES).sort()).toEqual([...kinds].sort())
		expect(kinds).toEqual([ProviderKind.CLAUDE_CODE, ProviderKind.CODEX, ProviderKind.OPENCODE])
		// claude's spec is not a copy: it IS the static the runner spawns with, so "how to find it" and
		// "how to drive it" cannot drift.
		expect(PROVIDER_BINARIES[ProviderKind.CLAUDE_CODE]).toBe(ClaudeAgentRunner.binary)
	})

	it('returns a row for every known provider', async () => {
		const detector = new FakeSystemProviderDetector({})
		const detections = await detector.detect()
		expect(detections.map(d => d.name)).toEqual([ProviderKind.CLAUDE_CODE, ProviderKind.CODEX, ProviderKind.OPENCODE])
		expect(detections.every(d => d.status === ProviderStatus.NOT_INSTALLED)).toBe(true)
	})

	it('caches the first probe and re-probes only on { refresh: true }', async () => {
		const detector = new FakeSystemProviderDetector({ codex: { path: '/usr/local/bin/codex' } })
		await detector.detect()
		const afterFirst = detector.whichCalls
		expect(afterFirst).toBeGreaterThan(0)

		await detector.detect()
		expect(detector.whichCalls).toBe(afterFirst) // served from cache — no new probes

		await detector.detect({ refresh: true })
		expect(detector.whichCalls).toBeGreaterThan(afterFirst) // forced re-probe
	})

	it('resolve() returns the single provider row (the runtime fast path)', async () => {
		const detector = new FakeSystemProviderDetector({ opencode: { path: '/usr/local/bin/opencode', version: '0.4.0' } })
		const opencode = await detector.resolve(ProviderKind.OPENCODE)
		expect(opencode).toMatchObject({ status: ProviderStatus.DETECTED, binaryPath: '/usr/local/bin/opencode' })
		const codex = await detector.resolve(ProviderKind.CODEX)
		expect(codex?.status).toBe(ProviderStatus.NOT_INSTALLED)
	})
})

describe('MockProviderDetector', () => {
	it('reports claude-code DETECTED by default so the engine has a provider to drive', async () => {
		const detector = new MockProviderDetector()
		const claude = await detector.resolve(ProviderKind.CLAUDE_CODE)
		expect(claude?.status).toBe(ProviderStatus.DETECTED)
		expect(claude?.binaryPath).toBeDefined()
	})

	it('honors per-provider overrides', async () => {
		const detector = MockProviderDetector.with({
			[ProviderKind.CODEX]: { name: ProviderKind.CODEX, status: ProviderStatus.DETECTED, binaryPath: '/x/codex', version: '9' },
		})
		const detections = await detector.detect()
		expect(detections.find(d => d.name === ProviderKind.CODEX)?.status).toBe(ProviderStatus.DETECTED)
	})
})
