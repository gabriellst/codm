import { injectable } from 'tsyringe-neo'
import { spawnSync } from 'node:child_process'
import { accessSync, constants, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { ProviderKind, ProviderStatus } from '@codedm/contracts-typescript/wire/enums'
import { PROVIDER_DEFS, type ProviderCapabilities } from '../../providers'
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
				const caps = await this.probeCapabilities(provider, binaryPath)
				return { name: provider, status: ProviderStatus.DETECTED, binaryPath, version, caps }
			}
		}
		return { name: provider, status: ProviderStatus.NOT_INSTALLED }
	}

	/**
	 * Discover what THIS binary can do, by running the def's `helpArgs` and grepping the output for
	 * each key of its `capabilityFlags` map (GOAL-agent-abstraction §4.7, Fase 1).
	 *
	 * Grep-the-help rather than parse-the-version, deliberately: a version string tells you what the
	 * CLI calls itself, not what flags it accepts, and a wrong guess makes the CLI abort on an unknown
	 * argument. Help text is the CLI's own statement of its surface.
	 *
	 * The flag→capability MAP lives in the def, not here — this method contains zero provider
	 * knowledge, which is what stops it from becoming the next `switch (provider)`.
	 *
	 * Any failure (binary gone, non-zero exit, help on stderr only, throw) yields `{}` — every
	 * capability is opt-in, so the unprobed binary is driven with the conservative argv.
	 */
	protected async probeCapabilities(provider: ProviderKind, binaryPath: string): Promise<ProviderCapabilities> {
		const def = PROVIDER_DEFS[provider]
		if (!def.helpArgs || !def.capabilityFlags) return {}
		try {
			const res = spawnSync(binaryPath, [...def.helpArgs], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
			// Some CLIs print help to stderr and exit non-zero; both streams count, the exit code does not.
			const help = `${res.stdout ?? ''}\n${res.stderr ?? ''}`
			if (!help.trim()) return {}
			const caps: ProviderCapabilities = {}
			for (const [flag, capability] of Object.entries(def.capabilityFlags)) {
				if (help.includes(flag)) caps[capability] = true
			}
			return caps
		} catch {
			return {}
		}
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
 * null. Runtime-agnostic on purpose, and it stays that way even though the ORIGINAL reason expired:
 * the old comment here claimed the daemon runs under Node "because node-pty is a native Node addon".
 * That has been false since the Fork-D2 spike removed node-pty, and it is corrected rather than
 * deleted because a stale WHY is worse than none. The real reason to avoid `Bun.which` is unchanged:
 * `node:child_process` + `node:fs` resolve identically under Bun and Node, so this file makes no
 * claim about which runtime is hosting it.
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
