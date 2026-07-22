import { describe, expect, it } from 'bun:test'
import { ProviderKind, ProviderStatus } from '@codedm/contracts-typescript/wire/enums'
import { SystemProviderDetector } from './SystemProviderDetector'
import { MockProviderDetector } from './MockProviderDetector'

/**
 * Faked `SystemProviderDetector` — overrides the two OS-touching probes so the caching + status
 * mapping logic is exercised against an in-memory machine (no real `claude`/`codex`/`opencode`
 * binary required, and no `--version` shell-out). `whichCalls` records probe activity so the cache
 * behavior is observable.
 */
class FakeSystemProviderDetector extends SystemProviderDetector {
	whichCalls = 0
	constructor(private readonly installed: Partial<Record<string, { path: string; version?: string }>>) {
		super()
	}
	protected override probeWhich(command: string): string | null {
		this.whichCalls++
		return this.installed[command]?.path ?? null
	}
	protected override async probeVersion(binaryPath: string): Promise<string | undefined> {
		const match = Object.values(this.installed).find(entry => entry?.path === binaryPath)
		return match?.version
	}
}

describe('SystemProviderDetector — detection logic (faked probes)', () => {
	it('maps a found binary to DETECTED with its path + version, missing ones to NOT_INSTALLED', async () => {
		const detector = new FakeSystemProviderDetector({ claude: { path: '/opt/homebrew/bin/claude', version: '1.2.3' } })
		const detections = await detector.detect()

		const claude = detections.find(d => d.name === ProviderKind.CLAUDE_CODE)
		expect(claude).toEqual({ name: ProviderKind.CLAUDE_CODE, status: ProviderStatus.DETECTED, binaryPath: '/opt/homebrew/bin/claude', version: '1.2.3' })

		const codex = detections.find(d => d.name === ProviderKind.CODEX)
		expect(codex).toEqual({ name: ProviderKind.CODEX, status: ProviderStatus.NOT_INSTALLED })
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
