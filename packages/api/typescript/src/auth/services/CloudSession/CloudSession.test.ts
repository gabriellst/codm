import { describe, expect, it } from 'bun:test'
import { FileCloudSession, type CachedState } from './FileCloudSession'

/** Drains pending microtasks. The fake's `fetchEntitlement` has no real I/O latency, so one macrotask
 * tick is enough to let a fire-and-forget `revalidate()` (the boot kickoff, `setToken`'s kickoff) fully
 * settle before the next assertion — no real network, no real sleep. */
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0))

/**
 * Fakes every OS/network-touching seam — `isCloudConfigured`, `fetchEntitlement`, the cache
 * read/write/delete trio, and the timer primitive (`scheduleInterval`/`clearScheduledTimer`) — the
 * same technique `SystemProviderDetector`'s tests use for its probes (`FakeSystemProviderDetector` in
 * `ProviderDetector.test.ts`). No real disk write, no real HTTP call, no real timer, no mutation of
 * `process.env`: the POLICY in `FileCloudSession` (isEntitled/setToken/revalidate/the boot + hourly
 * schedule) is what is under test here, exactly as written for production.
 */
class FakeCloudSession extends FileCloudSession {
	private cache: CachedState = { revoked: false }
	fetchCalls: string[] = []
	/** Thrown by the NEXT `fetchEntitlement` call; `undefined` means it resolves (cloud says "ok"). */
	nextError: (Error & { status?: number }) | undefined
	scheduleCalls = 0
	clearCalls = 0
	/** The callback the class armed via `scheduleInterval` — fire it manually to simulate the 1h tick. */
	scheduledCallback: (() => void) | undefined

	constructor(private readonly cloudConfigured: boolean) {
		super()
	}

	/**
	 * Seed the cache directly, bypassing the class's own `getState()`/bootstrap path — a test that
	 * wants to drive `revalidate()` with a SPECIFIC `nextError` must set that error up before the
	 * FIRST call that touches `getState()` (which fires the boot kickoff using WHATEVER `nextError` is
	 * set at that moment); `seed()` lets a test seed a token without triggering that kickoff early.
	 */
	seed(state: Partial<CachedState>): void {
		this.cache = { revoked: false, ...state }
	}

	debugCache(): CachedState {
		return { ...this.cache }
	}

	protected override isCloudConfigured(): boolean {
		return this.cloudConfigured
	}

	protected override async fetchEntitlement(token: string): Promise<void> {
		this.fetchCalls.push(token)
		if (this.nextError) throw this.nextError
	}

	protected override readCache(): CachedState {
		return { ...this.cache }
	}

	protected override writeCache(state: CachedState): void {
		this.cache = { ...state }
	}

	protected override deleteCache(): void {
		this.cache = { revoked: false }
	}

	protected override scheduleInterval(callback: () => void, _ms: number): unknown {
		this.scheduleCalls++
		this.scheduledCallback = callback
		return `fake-timer-${this.scheduleCalls}`
	}

	protected override clearScheduledTimer(_handle: unknown): void {
		this.clearCalls++
	}
}

/** A 401/403-shaped error, the same way the generated HTTP client (`packages/client/.../http.ts`) throws one. */
function unauthorized(status: 401 | 403): Error & { status: number } {
	return Object.assign(new Error('unauthorized'), { status })
}

describe('FileCloudSession — the login-gate policy (Task T7, spec decisions 5-6, AC-4/AC-5)', () => {
	it('sem CODM_CLOUD_URL configurada, isEntitled() é sempre true — dev-compat (rollout note, T7.1)', () => {
		const session = new FakeCloudSession(false)
		expect(session.isEntitled()).toBe(true)
		// The falsifier for the OTHER half of compat: the fake never even fakes a token here, so the
		// only thing that can be making this true is the compat branch.
	})

	it('com CODM_CLOUD_URL configurada e sem token nenhum, isEntitled() é false', () => {
		const session = new FakeCloudSession(true)
		expect(session.isEntitled()).toBe(false)
	})

	it('com um token válido em cache, isEntitled() é true', () => {
		const session = new FakeCloudSession(true)
		session.setToken('a-device-token')
		expect(session.isEntitled()).toBe(true)
	})

	it('revalidação que devolve 401 marca revoked e limpa o cache', async () => {
		const session = new FakeCloudSession(true)
		session.seed({ token: 'a-device-token' })
		// Checked via the cache directly, NOT `isEntitled()` — calling `isEntitled()` here would fire
		// the boot kickoff with `nextError` still unset (see `seed()`'s docblock), racing the
		// controlled call below.
		expect(session.debugCache()).toEqual({ token: 'a-device-token', revoked: false })

		session.nextError = unauthorized(401)
		await session.revalidate()

		expect(session.isEntitled()).toBe(false)
		// "limpa o cache" means EMPTY, not a persisted revoked flag — the token's ABSENCE is already
		// enough for `isEntitled()` to answer false on a fresh read (e.g. after a restart), the same way
		// `deleteCache()` deleting the real file leaves nothing to read back except the empty default.
		expect(session.debugCache()).toEqual({ revoked: false })
	})

	it('revalidação que devolve 403 também revoga — a política cobre os dois códigos de "credencial ruim"', async () => {
		const session = new FakeCloudSession(true)
		session.seed({ token: 'a-device-token' })

		session.nextError = unauthorized(403)
		await session.revalidate()

		expect(session.isEntitled()).toBe(false)
	})

	/**
	 * AC-5, and the exact falsifier the plan calls out: treat a network error as a 401 and this goes
	 * RED, because `isEntitled()` would flip to false instead of staying true.
	 */
	it('revalidação com erro de REDE mantém o estado — offline nunca pune (AC-5)', async () => {
		const session = new FakeCloudSession(true)
		session.seed({ token: 'a-device-token' })
		expect(session.debugCache()).toEqual({ token: 'a-device-token', revoked: false })

		session.nextError = new Error('ECONNREFUSED') // no `.status` — a network failure, not a 401/403
		await session.revalidate()

		expect(session.isEntitled()).toBe(true)
		// The cache itself is untouched too, not just the derived boolean.
		expect(session.debugCache()).toEqual({ token: 'a-device-token', revoked: false })
	})

	it('compat (sem CODM_CLOUD_URL) faz revalidate() ser um no-op — nunca chama a rede', async () => {
		const session = new FakeCloudSession(false)
		session.seed({ token: 'a-device-token' })

		await session.revalidate()

		expect(session.fetchCalls).toHaveLength(0)
	})

	it('sem token nenhum, revalidate() é um no-op — nada para revalidar', async () => {
		const session = new FakeCloudSession(true)

		await session.revalidate()

		expect(session.fetchCalls).toHaveLength(0)
	})
})

/**
 * "boot + intervalo de 1h" (spec T7.1) — the scheduling half the orchestrator's adjudication called
 * out as under-built: `setToken` alone is not enough, because an install that stays logged in across a
 * daemon restart needs its cached token re-checked WITHOUT ever calling `setToken` again, and a token
 * revoked mid-session needs to be caught before the next restart too.
 */
describe('FileCloudSession — boot + hourly revalidation scheduling (Task T7.1)', () => {
	it('a primeira carga do estado (boot) dispara uma revalidação quando há token em cache e a nuvem está configurada', async () => {
		const session = new FakeCloudSession(true)
		session.seed({ token: 'a-device-token' })

		// The FIRST call to ANY public method is "boot" for a lazily-initialized singleton.
		session.isEntitled()
		await flush()

		expect(session.fetchCalls).toEqual(['a-device-token'])
	})

	it('a primeira carga NÃO dispara revalidação quando não há token em cache', async () => {
		const session = new FakeCloudSession(true)

		session.isEntitled()
		await flush()

		expect(session.fetchCalls).toHaveLength(0)
	})

	it('setToken() dispara uma revalidação imediata (best-effort) — "agenda revalidação" (T7.1)', async () => {
		const session = new FakeCloudSession(true)

		session.setToken('a-device-token')
		await flush()

		expect(session.fetchCalls).toEqual(['a-device-token'])
	})

	it('arma o timer periódico no primeiro load e de novo a cada setToken — nunca vaza, nunca duplica', () => {
		const session = new FakeCloudSession(true)

		session.isEntitled() // boot — arms once
		expect(session.scheduleCalls).toBe(1)
		expect(session.clearCalls).toBe(0)

		session.setToken('a-device-token') // fresh login — re-arms
		expect(session.scheduleCalls).toBe(2)
		// Re-arming clears the PREVIOUS timer first — this is what stops two logins in the same process
		// lifetime from leaving two live intervals both calling revalidate().
		expect(session.clearCalls).toBe(1)
	})

	it('compat (sem CODM_CLOUD_URL) nunca arma o timer — nada para revalidar periodicamente', () => {
		const session = new FakeCloudSession(false)

		session.isEntitled()

		expect(session.scheduleCalls).toBe(0)
	})

	/**
	 * The falsifier: a timer that is armed but whose callback nobody drives is decorative — this
	 * proves the ARMED callback is the real `revalidate()` path, by firing it manually (no real timer,
	 * no sleeping an hour) and observing a SECOND fetch.
	 */
	it('o callback armado, quando disparado manualmente, revalida de novo — a metade "intervalo de 1h" é real, não decorativa', async () => {
		const session = new FakeCloudSession(true)
		session.seed({ token: 'a-device-token' })

		session.isEntitled() // arms the interval; the boot kickoff also fires once
		await flush()
		expect(session.fetchCalls).toHaveLength(1)
		expect(session.scheduledCallback).toBeDefined()

		session.scheduledCallback?.() // simulate the 1h tick
		await flush()

		expect(session.fetchCalls).toHaveLength(2)
	})

	/**
	 * The de-duplication guard (`runRevalidation`'s shared in-flight promise) is what stops the boot
	 * kickoff and an overlapping explicit `revalidate()` call from racing two DIFFERENT HTTP outcomes
	 * against the same token. Falsifier: drop the guard (let each caller start its own `doRevalidate()`)
	 * and this goes flaky — sometimes green, sometimes red, depending on which write lands last.
	 */
	it('uma revalidação já em voo é reaproveitada — chamadas sobrepostas nunca disparam duas requisições', async () => {
		const session = new FakeCloudSession(true)
		session.seed({ token: 'a-device-token' })

		const first = session.revalidate()
		const second = session.revalidate() // fires while `first` is still in flight
		await Promise.all([first, second])

		expect(session.fetchCalls).toEqual(['a-device-token'])
	})
})
