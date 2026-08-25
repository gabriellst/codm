import { injectable } from 'tsyringe-neo'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { LoggingService, PROVIDER_SEARCH, resolveBinary, type ProviderSearchSpec } from '@codm/core-typescript'
import { ProviderKind, ProviderStatus } from '@codm/contracts-typescript/wire/enums'
import type { ProviderCapabilities } from '../../types/ProviderCapabilities'
import { KNOWN_PROVIDERS, PROVIDER_BINARIES, ProviderDetector, type ProviderDetection } from './ProviderDetector'

/**
 * Bounds every liveness/capability probe (`--version`, `--help`) against a stalled or hostile CLI
 * binary. Both probes sit on `resolve()`'s call path, which a session start `await`s directly — an
 * unbounded `spawnSync` here blocks the whole daemon on one bad binary. Local `--version` / `--help`
 * invocations return in single-digit milliseconds for every CLI this engine drives; 3s is generous
 * headroom without letting one hung binary become a hung daemon.
 */
const PROBE_TIMEOUT_MS = 3_000

/**
 * Real `ProviderDetector` — probes `PATH` + known install directories for each provider binary and
 * reads its `--version`, caching the result in-memory. Registered in the `real` DI env only; tests
 * bind `MockProviderDetector` so detection never shells out.
 *
 * The OS-touching operations (`probeWhich`, `probeVersion`, `probeCapabilities`) are `protected` so
 * the caching + status-mapping logic — the part with actual behavior — is unit-tested via a subclass
 * that fakes them, with no real binaries on the machine (`ProviderDetector.test.ts`). The SEARCH
 * itself (where a platform keeps CLIs, what an executable is called there) is a declared per-platform
 * table in `ProviderSearch.ts`, tested against a temp-dir fixture from any host.
 */
@injectable()
export class SystemProviderDetector extends ProviderDetector {
	constructor(private readonly logging: LoggingService) {
		super()
	}

	/**
	 * The host platform's row of `PROVIDER_SEARCH` — ONE lookup on `process.platform`, resolved once.
	 * The table is exhaustive over `NodeJS.Platform`, so this can never be undefined.
	 */
	protected readonly search: ProviderSearchSpec = PROVIDER_SEARCH[process.platform]

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
		const spec = PROVIDER_BINARIES[provider]
		// `spec.bin` + `spec.fallbackBins` ARE the binary names to try, in order. There is exactly ONE
		// declaration of them per CLI — for claude that declaration is the static on its own runner, so
		// "how to find it" cannot drift from "how to drive it".
		const binaries = [spec.bin, ...(spec.fallbackBins ?? [])]
		for (const binary of binaries) {
			const binaryPath = this.probeWhich(binary)
			if (binaryPath) {
				const version = await this.probeVersion(binaryPath, spec.versionArgs)
				const caps = await this.probeCapabilities(provider, binaryPath)
				return { name: provider, status: ProviderStatus.DETECTED, binaryPath, version, caps }
			}
		}
		return { name: provider, status: ProviderStatus.NOT_INSTALLED }
	}

	/**
	 * Discover what THIS binary can do, by running the spec's `helpArgs` and grepping the output for
	 * each key of its `capabilityFlags` map (GOAL-agent-abstraction §4.7, Fase 1).
	 *
	 * Grep-the-help rather than parse-the-version, deliberately: a version string tells you what the
	 * CLI calls itself, not what flags it accepts, and a wrong guess makes the CLI abort on an unknown
	 * argument. Help text is the CLI's own statement of its surface.
	 *
	 * The flag→capability MAP lives in the spec, not here — this method contains zero provider
	 * knowledge, which is what stops it from becoming the next `switch (provider)`.
	 *
	 * Any failure (binary gone, non-zero exit, help on stderr only, throw, TIMEOUT) yields `{}` —
	 * every capability is opt-in, so the unprobed binary is driven with the conservative argv. A
	 * timeout or spawn error is never silent, though: it is a structured warning on the injected
	 * `LoggingService` (see `logProbeFailure`), because a probe that silently degrades AND silently
	 * fails is undebuggable the day a CLI update makes `--help` hang.
	 */
	protected async probeCapabilities(provider: ProviderKind, binaryPath: string): Promise<ProviderCapabilities> {
		const spec = PROVIDER_BINARIES[provider]
		if (!spec.helpArgs || !spec.capabilityFlags) return {}
		try {
			const res = spawnSync(binaryPath, [...spec.helpArgs], {
				stdio: ['ignore', 'pipe', 'pipe'],
				encoding: 'utf8',
				timeout: PROBE_TIMEOUT_MS,
			})
			// `spawnSync` does not throw on timeout — it kills the child and sets `res.error`
			// (`ETIMEDOUT`) instead. Catching only the `throw` path (ENOENT-before-spawn, etc.) would
			// miss exactly the hang this bound exists to guard against.
			if (res.error) {
				this.logProbeFailure('capability', binaryPath, res.error)
				return {}
			}
			// Some CLIs print help to stderr and exit non-zero; both streams count, the exit code does not.
			const help = `${res.stdout ?? ''}\n${res.stderr ?? ''}`
			if (!help.trim()) return {}
			const caps: ProviderCapabilities = {}
			for (const [flag, capability] of Object.entries(spec.capabilityFlags)) {
				if (help.includes(flag)) caps[capability] = true
			}
			return caps
		} catch (error) {
			this.logProbeFailure('capability', binaryPath, error)
			return {}
		}
	}

	/**
	 * Resolve a binary name to its ABSOLUTE path on this machine — `PATH` first, then the platform's
	 * known install dirs, each with the platform's executable suffixes (`ProviderSearch`). Null when
	 * nothing executable answers to the name. The home and the environment are read HERE, at probe
	 * time, so a `PATH` the shell injected after boot is honoured by `{ refresh: true }`.
	 */
	protected probeWhich(command: string): string | null {
		return resolveBinary(command, this.search, { home: homedir(), env: process.env })
	}

	/**
	 * Read `<binaryPath> <versionArgs>`, returning the trimmed first line, or undefined on any
	 * failure (non-zero exit, no stdout, throw, or TIMEOUT — see `probeCapabilities` for why the
	 * `res.error` check matters and `logProbeFailure` for why it is never silent).
	 *
	 * `versionArgs` comes from the spec (`ProviderBinarySpec.versionArgs`), not a hardcoded
	 * `['--version']` — this used to be a second hardcoded copy of a fact the spec already declares.
	 */
	protected async probeVersion(binaryPath: string, versionArgs: readonly string[]): Promise<string | undefined> {
		try {
			const res = spawnSync(binaryPath, [...versionArgs], {
				stdio: ['ignore', 'pipe', 'ignore'],
				encoding: 'utf8',
				timeout: PROBE_TIMEOUT_MS,
			})
			if (res.error) {
				this.logProbeFailure('version', binaryPath, res.error)
				return undefined
			}
			if (res.status !== 0 || !res.stdout) return undefined
			return res.stdout.trim().split('\n')[0]?.trim() || undefined
		} catch (error) {
			this.logProbeFailure('version', binaryPath, error)
			return undefined
		}
	}

	/**
	 * The one place a probe failure becomes visible — through the INJECTED `LoggingService`, like
	 * every other production log in this package.
	 *
	 * It was a raw `console.warn` when the capability probe landed, on the reasoning that "there is
	 * no lighter-weight structured logger at this layer". That reasoning was wrong twice over, and
	 * `tests/architecture/console-discipline.test.ts` caught it: this class is `@injectable()` and
	 * is resolved from the container in the `real` env, so it can take `LoggingService` in the
	 * constructor like every other injectable service here — it is not bootstrap/DI-less code, which
	 * is the only thing that guard exempts. And a raw `console.*` here never reaches Loki and carries
	 * no trace correlation, which is precisely the failure that matters for a probe: a degraded
	 * provider is diagnosed from logs, after the fact, on a machine nobody is watching.
	 *
	 * `RunnerLogger` is still the wrong tool for a different reason (it is scoped to a running
	 * terminal session, which does not exist during detection) — that half of the old note was right
	 * and is kept.
	 */
	private logProbeFailure(kind: 'version' | 'capability', binaryPath: string, error: unknown): void {
		const reason = error instanceof Error ? error.message : String(error)
		this.logging.warn({
			content: {
				probe: kind,
				binaryPath,
				message: 'provider probe failed — degrading to conservative default',
				error: reason,
			},
		})
	}
}
