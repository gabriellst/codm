import { beforeAll, describe, expect, it } from 'bun:test'
import { container } from 'tsyringe-neo'
import { asInjectionToken, type HttpControllerRequest } from '@codm/core-typescript'
import { CloudSession, MockCloudSession } from '@shared/services/CloudSession'
import { ProviderKind, ProviderStatus } from '@codm/contracts-typescript/wire/enums'
import { MockProviderDetector } from '../services/ProviderDetector/MockProviderDetector'
import { ProviderDetector, KNOWN_PROVIDERS, type ProviderDetection } from '../services/ProviderDetector'
import { FixedAgentRunnerFactory } from '../services/AgentRunnerFactory'
import { StubAgentRunner } from '../services/AgentRunner'
import { DetectProvidersController } from './DetectProviders'

/**
 * O `CloudSessionMiddleware` roda na cadeia de TODO controller a partir do ADR 0001, e ele resolve
 * `CloudSession` do container RAIZ (`Controller.executeMiddlewares` faz `container.resolve`). Um
 * teste de unidade que constrói o controller à mão não tem esse binding — e o token é uma CLASSE
 * ABSTRATA, então o tsyringe não lança: ele CONSTRÓI a abstrata e devolve um objeto sem métodos (o
 * silêncio que `shared/registry.ts` já documenta ter custado um boot).
 *
 * Registrar o dobro aqui é o preço honesto de a identidade ter deixado de ser constante. Antes, o
 * `OperatorMiddleware` não tinha dependência nenhuma e carimbava um id fixo — era por isso que
 * qualquer teste passava sem saber que existia um middleware.
 */
beforeAll(() => {
	container.registerInstance(asInjectionToken(CloudSession), new MockCloudSession())
})

/**
 * `query` is a FIELD on the envelope, populated by the HTTP adapter — `executeController` never
 * re-parses it out of `url`. So the values here are the raw STRINGS the adapter delivers ('true',
 * not true), which also puts `z.stringToBoolean()` on the path under test rather than around it.
 */
function buildRequest(query?: Record<string, string>): HttpControllerRequest<unknown> {
	const search = query ? `?${new URLSearchParams(query).toString()}` : ''
	const raw = new Request(`http://localhost/terminal/providers${search}`)
	return { url: raw.url, ctx: {}, query, raw }
}

/**
 * The factory the controller reads `supported` from. `FixedAgentRunnerFactory` is the REAL wiring
 * class (its `supported` is the same `STANDS_IN_FOR` the `mock`/`integration` envs bind), not a
 * bespoke double — so widening the wiring layer's idea of what it can drive turns these tests red,
 * which is the whole point of deriving `comingSoon` from it instead of from a literal list.
 */
const runnerFactory = () => new FixedAgentRunnerFactory(new StubAgentRunner())

describe('DetectProvidersController — wire shape (HIGH finding regression)', () => {
	// core's `Controller.serializeBody` is a bare `JSON.stringify` — it never parses/strips the
	// handler's return value against `outputSchema`. So the ONLY thing standing between an internal
	// probe field (`ProviderDetection.caps`, GOAL-agent-abstraction §4.7) and the public response body
	// is `handle()` mapping explicitly to the declared shape. This test proves that mapping holds by
	// asserting the actual serialized body, not just the schema declaration.
	it('never leaks ProviderDetection.caps onto the response body', async () => {
		const detector = MockProviderDetector.with({
			[ProviderKind.CLAUDE_CODE]: {
				name: ProviderKind.CLAUDE_CODE,
				status: ProviderStatus.DETECTED,
				binaryPath: '/usr/local/bin/claude',
				version: '1.0.0',
				caps: { mcpConfig: true, partialMessages: true, sessionResume: true },
			},
		})
		const controller = new DetectProvidersController(detector, runnerFactory())

		const response = await controller.executeController(buildRequest())
		const body = (await response.json()) as { providers: Record<string, unknown>[] }

		const claude = body.providers.find(p => p.name === ProviderKind.CLAUDE_CODE)
		expect(claude).toBeDefined()
		// Exactly the declared OutputSchema keys present on this row — `caps` (and anything else not
		// on the schema) must never appear, since nothing downstream of `handle()` strips it.
		expect(Object.keys(claude!).sort()).toEqual(['binaryPath', 'comingSoon', 'name', 'status', 'version'])
	})

	it('omits binaryPath/version for a NOT_INSTALLED provider (undefined keys drop out of JSON, matching the .optional() schema)', async () => {
		const detector = MockProviderDetector.with({
			[ProviderKind.CODEX]: { name: ProviderKind.CODEX, status: ProviderStatus.NOT_INSTALLED },
		})
		const controller = new DetectProvidersController(detector, runnerFactory())

		const response = await controller.executeController(buildRequest())
		const body = (await response.json()) as { providers: Record<string, unknown>[] }

		const codex = body.providers.find(p => p.name === ProviderKind.CODEX)
		expect(codex).toBeDefined()
		// `comingSoon` is NOT optional — it is a boolean the UI branches on, so it is always present.
		expect(Object.keys(codex!).sort()).toEqual(['comingSoon', 'name', 'status'])
	})
})

/**
 * `comingSoon` — the second axis, and the one detection alone cannot answer.
 *
 * `status` says whether a BINARY is on this machine. It says nothing about whether this engine has a
 * class that knows how to drive that binary — `PROVIDER_BINARIES` declares real `bin` names for codex
 * and opencode precisely so they are REPORTED honestly, while `AgentRunnerFactory.supported` lists the
 * one CLI a runner exists for. Before this field the two axes were collapsed into `status`, and the
 * collapse was a lie with a consequence: a machine with the codex CLI on PATH reported DETECTED, the
 * attach wizard turned that into `available: true`, the operator picked CODEX, `AttachThread` accepted
 * it (it only checks installation) and the run died at `AgentRunnerFactory.for` with NOT_IMPLEMENTED —
 * one screen too late, on a thread already created.
 */
describe('DetectProvidersController — comingSoon', () => {
	it('flags a DETECTED provider with no runner as comingSoon (the two axes are independent)', async () => {
		// codex INSTALLED and probed — the exact machine on which the old shape lied.
		const detector = MockProviderDetector.with({
			[ProviderKind.CODEX]: {
				name: ProviderKind.CODEX,
				status: ProviderStatus.DETECTED,
				binaryPath: '/usr/local/bin/codex',
				version: '3.1.0',
			},
		})
		const controller = new DetectProvidersController(detector, runnerFactory())

		const response = await controller.executeController(buildRequest())
		const body = (await response.json()) as { providers: Record<string, unknown>[] }

		const codex = body.providers.find(p => p.name === ProviderKind.CODEX)
		// Still DETECTED — the binary IS there and saying otherwise would tell the operator to install
		// something they already have. What changed is that the response no longer implies we can drive it.
		expect(codex).toMatchObject({ status: ProviderStatus.DETECTED, comingSoon: true })
	})

	it('does NOT flag the provider the bound factory can drive', async () => {
		const controller = new DetectProvidersController(new MockProviderDetector(), runnerFactory())

		const response = await controller.executeController(buildRequest())
		const body = (await response.json()) as { providers: Record<string, unknown>[] }

		const claude = body.providers.find(p => p.name === ProviderKind.CLAUDE_CODE)
		expect(claude).toMatchObject({ status: ProviderStatus.DETECTED, comingSoon: false })
	})

	it('flags every provider the factory does not drive, installed or not', async () => {
		const controller = new DetectProvidersController(new MockProviderDetector(), runnerFactory())

		const response = await controller.executeController(buildRequest())
		const body = (await response.json()) as { providers: Record<string, unknown>[] }

		expect(body.providers.find(p => p.name === ProviderKind.CODEX)?.comingSoon).toBe(true)
		expect(body.providers.find(p => p.name === ProviderKind.OPENCODE)?.comingSoon).toBe(true)
	})
})

/**
 * A detector with the REAL caching semantics of `SystemProviderDetector`: the first `detect()` probes
 * the machine and every later one is served from an in-memory cache until `{ refresh: true }` forces
 * a re-probe. The cache is per PROCESS — nothing expires it, no TTL, no filesystem watch — so until
 * something asks for a refresh the catalog the daemon serves is the one it built at boot.
 *
 * `machine` is read at probe time, not at construction, so a test can install a CLI BETWEEN probes
 * and see exactly what the operator sees: nothing, until they ask again.
 */
class CachingSpyDetector extends ProviderDetector {
	probes = 0
	private cache: ProviderDetection[] | undefined

	constructor(private readonly machine: () => Partial<Record<ProviderKind, ProviderDetection>>) {
		super()
	}

	async detect(options?: { refresh?: boolean }): Promise<ProviderDetection[]> {
		if (this.cache && !options?.refresh) return this.cache
		this.probes += 1
		const installed = this.machine()
		this.cache = KNOWN_PROVIDERS.map(name => installed[name] ?? { name, status: ProviderStatus.NOT_INSTALLED })
		return this.cache
	}

	async resolve(name: ProviderKind): Promise<ProviderDetection | undefined> {
		return (await this.detect()).find(d => d.name === name)
	}
}

/**
 * `?refresh=true` — the capability C07 shipped with and no console consumer ever reached.
 *
 * The endpoint has always accepted the flag; what was never pinned is that it REACHES the detector.
 * Without that, a "Rescan" button would be a button that re-renders the same cached catalog forever:
 * the operator installs a CLI, clicks, and nothing changes — the worst kind of broken, because it
 * looks like it worked.
 */
describe('DetectProvidersController — ?refresh=true', () => {
	/** Nothing installed at boot; codex appears on the machine afterwards. */
	const machineWhereCodexArrivesLater = () => {
		let codexInstalled = false
		const detector = new CachingSpyDetector(() =>
			codexInstalled
				? {
						[ProviderKind.CODEX]: {
							name: ProviderKind.CODEX,
							status: ProviderStatus.DETECTED,
							binaryPath: '/usr/local/bin/codex',
							version: '3.1.0',
						},
					}
				: {},
		)
		return { detector, install: () => (codexInstalled = true) }
	}

	const statusOf = async (controller: DetectProvidersController, query?: Record<string, string>) => {
		const response = await controller.executeController(buildRequest(query))
		const body = (await response.json()) as { providers: { name: string; status: string }[] }
		return body.providers.find(p => p.name === ProviderKind.CODEX)?.status
	}

	it('FALSEADOR — sem refresh serve o catálogo velho; com refresh re-sonda a máquina', async () => {
		const { detector, install } = machineWhereCodexArrivesLater()
		const controller = new DetectProvidersController(detector, runnerFactory())

		expect(await statusOf(controller)).toBe(ProviderStatus.NOT_INSTALLED)
		expect(detector.probes).toBe(1)

		// O operador instala o CLI com o daemon rodando — o que o cache por processo não tem como notar.
		install()

		// Sem refresh: a resposta continua a de antes. É ESTE o estado que o botão existe para sair.
		expect(await statusOf(controller)).toBe(ProviderStatus.NOT_INSTALLED)
		expect(detector.probes).toBe(1)

		// Com refresh: re-sonda e a máquina nova aparece.
		expect(await statusOf(controller, { refresh: 'true' })).toBe(ProviderStatus.DETECTED)
		expect(detector.probes).toBe(2)
	})

	it('refresh=false é tratado como ausente — só a intenção explícita re-sonda', async () => {
		const { detector, install } = machineWhereCodexArrivesLater()
		const controller = new DetectProvidersController(detector, runnerFactory())

		await statusOf(controller)
		install()

		expect(await statusOf(controller, { refresh: 'false' })).toBe(ProviderStatus.NOT_INSTALLED)
		expect(detector.probes).toBe(1)
	})
})
