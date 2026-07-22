import { injectable } from 'tsyringe-neo'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
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
		const onPath = Bun.which(command)
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
			const proc = Bun.spawn([binaryPath, '--version'], { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' })
			const stdout = await new Response(proc.stdout).text()
			const code = await proc.exited
			if (code !== 0) return undefined
			return stdout.trim().split('\n')[0]?.trim() || undefined
		} catch {
			return undefined
		}
	}
}
