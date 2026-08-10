import { injectable } from 'tsyringe-neo'
import { join } from 'node:path'
import { readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { Config, resolveDataDir } from '@codm/core-typescript'
import { getEntitlement } from '@codm/client-typescript/typescript'
import { CloudSession } from './CloudSession'

// Exported so `CloudSession.test.ts` can type its fake's cache without redeclaring this shape.
export interface CachedState {
	token?: string
	lastValidatedAt?: string
	revoked: boolean
}

const EMPTY_STATE: CachedState = { revoked: false }
const CACHE_FILENAME = 'cloud-session.json'
/** The "intervalo de 1h" half of "boot + intervalo de 1h" (spec T7.1). */
const REVALIDATION_INTERVAL_MS = 60 * 60 * 1000

/**
 * The real `CloudSession` — a device token cached at `<CODM_DATA_DIR>/cloud-session.json` (0600),
 * revalidated against `GET /v1/cloud/entitlement` over `CODM_CLOUD_URL` at boot and every hour
 * (spec T7.1). Bound `real` only (`auth/registry.ts`); `mock`/`integration` bind `MockCloudSession`
 * so no test opens a socket (S2S rule) or touches a real data dir.
 *
 * Zero-arg constructor and `@injectable()` so the registry can bind it by CLASS REFERENCE
 * (`real: FileCloudSession`) rather than a `useFactory` — that is what makes it a true tsyringe
 * SINGLETON (`registerSingleton`, see `core/types/Registry.ts`), which matters here specifically:
 * `SetCloudTokenController` and `DrizzleMailboxDispatcher` must read and write the exact SAME
 * in-memory instance, or a fresh login would never reach the dispatcher's gate without a restart
 * (AC-3). A `useFactory` binding is TRANSIENT (rebuilt on every resolve — see the same file), which
 * would have silently reintroduced that bug.
 *
 * State is loaded from disk LAZILY (`getState()`), not in the constructor — the OS/network-touching
 * bits (`cachePath`/`fetchEntitlement`/`isCloudConfigured`/`scheduleInterval`/`clearScheduledTimer`)
 * are `protected` and overridden by a test subclass (same seam `SystemProviderDetector` uses for its
 * probes), and a subclass's own constructor-assigned fields are not yet set while `super()` is still
 * running — an eager load here would read them as `undefined`.
 */
@injectable()
export class FileCloudSession extends CloudSession {
	private state: CachedState | undefined
	private bootstrapped = false
	private revalidateInFlight: Promise<void> | undefined
	private timerHandle: unknown

	setToken(token: string): void {
		const current = this.getState()
		this.state = { token, revoked: false, lastValidatedAt: current.lastValidatedAt }
		this.writeCache(this.state)
		// A fresh login already does everything `ensureBootstrapped` exists for — there is nothing
		// stale left to boot-revalidate, since the token it would have read is the one just replaced.
		this.bootstrapped = true
		// Best-effort — "agenda revalidação" (T7.1). Never awaited: the token is trusted the instant
		// it is set, and the NEXT scheduled revalidation catches a bad one.
		void this.runRevalidation()
		// Re-arm the periodic timer on every fresh login (T7.1) — see `scheduleRevalidation`.
		this.scheduleRevalidation()
	}

	isEntitled(): boolean {
		this.ensureBootstrapped()
		// Dev-compat (spec T7.1 rollout note): an install with no CODM_CLOUD_URL in the RAW env never
		// gates on login. `Config.env.CODM_CLOUD_URL` cannot express "unset" — it cross-field-defaults
		// to API_URL (core/utils/Config.ts) and is therefore ALWAYS a truthy string, so
		// `isCloudConfigured()` reads the derived `Config.env.CLOUD_CONFIGURED` instead (computed from
		// the RAW field before the cross-field default overwrites it — see Config.ts's `.transform()`).
		if (!this.isCloudConfigured()) return true
		const state = this.getState()
		return Boolean(state.token) && !state.revoked
	}

	async revalidate(): Promise<void> {
		this.ensureBootstrapped()
		return this.runRevalidation()
	}

	/**
	 * The "boot" half of "boot + intervalo de 1h" (T7.1) — runs EXACTLY once, on whichever public
	 * method is called FIRST after construction (a lazily-initialized singleton has no other notion of
	 * "boot"). Kicks a best-effort revalidation when there is a cached token to check, and arms the
	 * periodic timer either way.
	 */
	private ensureBootstrapped(): void {
		if (this.bootstrapped) return
		this.bootstrapped = true
		const state = this.getState()
		if (this.isCloudConfigured() && state.token) void this.runRevalidation()
		this.scheduleRevalidation()
	}

	/**
	 * The de-duplicated core of `revalidate()`. A SINGLE in-flight promise is shared by every trigger
	 * — the boot kickoff, `setToken`'s kickoff, the periodic timer, and any explicit `revalidate()`
	 * call — so two overlapping triggers (e.g. the boot kickoff firing moments before an explicit
	 * `revalidate()` call) never race two DIFFERENT HTTP outcomes against the same token; the later
	 * caller joins the first's in-flight result instead of starting a second request. Same
	 * re-entrancy shape as `DrizzleMailboxDispatcher.drain()`'s `this.draining` guard.
	 */
	private runRevalidation(): Promise<void> {
		if (this.revalidateInFlight) return this.revalidateInFlight
		const promise = this.doRevalidate().finally(() => {
			this.revalidateInFlight = undefined
		})
		this.revalidateInFlight = promise
		return promise
	}

	private async doRevalidate(): Promise<void> {
		if (!this.isCloudConfigured()) return
		const state = this.getState()
		if (!state.token) return
		try {
			await this.fetchEntitlement(state.token)
			this.state = { ...state, lastValidatedAt: new Date().toISOString() }
			this.writeCache(this.state)
		} catch (error) {
			// Only an explicit "this credential is no good" revokes. Everything else — a network
			// failure, a timeout, a 5xx — is exactly the offline case AC-5 protects: keep the last known
			// state, untouched, indefinitely.
			if (!isUnauthorized(error)) return
			this.state = { ...EMPTY_STATE, revoked: true }
			this.deleteCache()
		}
	}

	/**
	 * Arm (or re-arm) the periodic revalidation timer — the "intervalo de 1h" half of T7.1. Idempotent:
	 * clears any PRIOR timer first, so re-arming on every fresh login (or a second bootstrap, which
	 * cannot happen but would be harmless anyway) never accumulates ticks. A no-op under dev-compat (no
	 * CODM_CLOUD_URL) — nothing to revalidate against.
	 */
	private scheduleRevalidation(): void {
		if (this.timerHandle !== undefined) {
			this.clearScheduledTimer(this.timerHandle)
			this.timerHandle = undefined
		}
		if (!this.isCloudConfigured()) return
		this.timerHandle = this.scheduleInterval(() => void this.runRevalidation(), REVALIDATION_INTERVAL_MS)
	}

	private getState(): CachedState {
		if (!this.state) this.state = this.readCache()
		return this.state
	}

	/** Overridden in tests to avoid depending on which env `Config` happened to parse at import time. */
	protected isCloudConfigured(): boolean {
		return Config.env.CLOUD_CONFIGURED
	}

	/** The one network call this class makes. `protected` so a test fakes it without opening a socket. */
	protected async fetchEntitlement(token: string): Promise<void> {
		await getEntitlement({ baseURL: Config.env.CODM_CLOUD_URL, headers: { Authorization: `Bearer ${token}` } })
	}

	/** `protected` so a test points the cache at a `mkdtempSync` scratch dir instead of the real one. */
	protected cachePath(): string {
		return join(resolveDataDir(Config.env.CODM_DATA_DIR), CACHE_FILENAME)
	}

	protected readCache(): CachedState {
		try {
			const raw = readFileSync(this.cachePath(), 'utf-8')
			const parsed = JSON.parse(raw) as Partial<CachedState>
			return { token: parsed.token, lastValidatedAt: parsed.lastValidatedAt, revoked: parsed.revoked ?? false }
		} catch {
			// Missing file (never logged in) or a corrupt one — either way, the safe default is "no
			// cached session", not a thrown error that would take the daemon down over a JSON typo.
			return { ...EMPTY_STATE }
		}
	}

	protected writeCache(state: CachedState): void {
		const path = this.cachePath()
		// `mode` on writeFileSync only applies when the file is CREATED — chmod explicitly afterward so
		// an existing file from a less careful prior write is tightened too, not just a fresh one.
		writeFileSync(path, JSON.stringify(state), { mode: 0o600 })
		chmodSync(path, 0o600)
	}

	protected deleteCache(): void {
		rmSync(this.cachePath(), { force: true })
	}

	/**
	 * The timer primitive itself, behind a seam — same reasoning as the OS-touching probes on
	 * `SystemProviderDetector`: a test captures the callback and fires it manually instead of waiting a
	 * real hour. `.unref()`'d so a lone revalidation timer never keeps the daemon process alive past a
	 * clean shutdown (the exact regression `DrizzleMailboxDispatcher.stop()` is careful to avoid on its
	 * own poll timer).
	 */
	protected scheduleInterval(callback: () => void, ms: number): unknown {
		const handle = setInterval(callback, ms)
		handle.unref?.()
		return handle
	}

	protected clearScheduledTimer(handle: unknown): void {
		clearInterval(handle as Parameters<typeof clearInterval>[0])
	}
}

/** True only for the exact codes that mean "this credential is no good" — never a network/5xx guess. */
function isUnauthorized(error: unknown): boolean {
	const status = (error as { status?: unknown } | null)?.status
	return status === 401 || status === 403
}
