import { injectable } from 'tsyringe-neo'
import { spawnSync } from 'node:child_process'
import { accessSync, constants, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { ProviderKind, ProviderStatus } from '@codedm/contracts-typescript/wire/enums'
import { KNOWN_PROVIDERS, PROVIDER_BINARIES, ProviderDetector, type ProviderDetection } from './ProviderDetector'

/**
 * Real `ProviderDetector` — probes `PATH` + known install directories for each provider binary and
 * reads its `--version`, caching the result in-memory. Registered in the `real` DI env only; tests
 * bind `MockProviderDetector` so detection never shells out.
 *
 * The two OS-touching operations (`probeWhich`, `probeVersion`) are `protected` so the caching +
 * status-mapping logic — the part with actual behavior — is unit-tested via a subclass that fakes
 * them, with no real binaries on the machine (`ProviderDetector.test.ts`).
 */
@injectable()
export class SystemProviderDetector extends ProviderDetector {
	/** Install locations checked in addition to `PATH` — where the provider CLIs commonly land. */
	protected readonly knownDirs: readonly string[] = [
		join(homedir(), '.claude', 'local'),
		join(homedir(), '.local', 'bin'),
		join(homedir(), '.bun', 'bin'),
		'/usr/local/bin',
		'/opt/homebrew/bin',
	]

	private cache: ProviderDetection[] | undefined

	async detect(options?: { refresh?: boolean }): Promise<ProviderDetection[]> {
		if (this.cache && !options?.refresh) return this.cache
		const detections: ProviderDetection[] = []
		for (const provider of KNOWN_PROVIDERS) {
			detections.push(await this.probeProvider(provider))
		}
		this.cache = detections
		return detections
	}

	async resolve(name: ProviderKind): Promise<ProviderDetection | undefined> {
		const detections = await this.detect()
		return detections.find(d => d.name === name)
	}

	private async probeProvider(provider: ProviderKind): Promise<ProviderDetection> {
		for (const binary of PROVIDER_BINARIES[provider]) {
			const binaryPath = this.probeWhich(binary)
			if (binaryPath) {
				const version = await this.probeVersion(binaryPath)
				return { name: provider, status: ProviderStatus.DETECTED, binaryPath, version }
			}
		}
		return { name: provider, status: ProviderStatus.NOT_INSTALLED }
	}

	/** Resolve a binary on `PATH`, then in the known install dirs. Returns the absolute path or null. */
	protected probeWhich(command: string): string | null {
		const onPath = whichOnPath(command)
		if (onPath) return onPath
		for (const dir of this.knownDirs) {
			const candidate = join(dir, command)
			if (existsSync(candidate)) return candidate
		}
		return null
	}

	/** Read `<binaryPath> --version`, returning the trimmed first line, or undefined on any failure. */
	protected async probeVersion(binaryPath: string): Promise<string | undefined> {
		try {
			const res = spawnSync(binaryPath, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' })
			if (res.status !== 0 || !res.stdout) return undefined
			return res.stdout.trim().split('\n')[0]?.trim() || undefined
		} catch {
			return undefined
		}
	}
}

/**
 * Portable `which`: scan `$PATH` for an executable named `command`, returning the absolute path or
 * null. Runtime-agnostic on purpose — the `real` daemon runs under **Node** (node-pty is a native
 * Node addon), where `Bun.which` does not exist. `node:child_process` + `node:fs` used here resolve
 * identically under both Bun (tests) and Node (daemon).
 */
function whichOnPath(command: string): string | null {
	const pathEnv = process.env.PATH
	if (!pathEnv) return null
	for (const dir of pathEnv.split(delimiter)) {
		if (!dir) continue
		const candidate = join(dir, command)
		try {
			accessSync(candidate, constants.X_OK)
			return candidate
		} catch {
			// not present here or not executable — keep scanning PATH
		}
	}
	return null
}
