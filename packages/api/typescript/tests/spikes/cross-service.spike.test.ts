import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { channels, outbox } from '@codm/contracts/db'
import { ChannelKind } from '@codm/contracts-typescript/wire/enums'
import { LibSqlDatabaseDriver, resolve } from '@codm/core-typescript'
import { createWhatsAppChannel, connectChannel as connectGatewayChannel } from '@codm/client-typescript/go'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { HARNESS_DATA_DIR } from '../support/harnessDataDir'
import { startIntegrationBackend, givenConnectedGatewayChannel, type IntegrationBackend } from '../support/testing'
import { bootService } from '../support/testBoot'

/**
 * AC-6 (.specs/2026-08-10-eixo-ambiente-go-design.md) + THE RESET SPIKE (plan T7, step T7.1).
 *
 * The claim under test is ONE file, TWO processes: `startIntegrationBackend({ services: ['apiGo'] })`
 * boots this process's TS backend on the `e2e` column (file-backed driver at `CODM_DATA_DIR`, SQL
 * outbox lanes) AND spawns the Go gateway from the recipe its manifest entry DECLARES, pointed at
 * the same scratch dir. Nothing here names a binary, a port, an env var or a language — the
 * workspace id `'apiGo'` is the whole vocabulary, and `template.config.ts` answers the rest.
 *
 * The gateway runs its `e2e` column: a scripted mock ChannelFactory playing `defaultE2eScenario()`
 * (two QR frames, auto-pair immediately, two contacts), whose facts travel the SAME production
 * pipeline a phone would drive — mapper.MapEvent → outbox → OutboxDispatcher → handler → repository.
 * So the row this suite reads from the TS side is not a fixture: it was written by another process's
 * domain logic, in this run.
 */

const OWNER_ID = MOCK_CLOUD_OWNER_ID
const CONNECT_DEADLINE_MS = 15_000

let backend: IntegrationBackend
let gatewayUrl: string

function db() {
	return resolve(backend.container, LibSqlDatabaseDriver).db
}

/** Create a channel through the gateway's real HTTP surface (the SAME call the console makes) —
 *  the generated SDK now, not a hand-rolled `fetch` (T12: the SDK client is the wire contract,
 *  CLAUDE.md Non-Negotiable #2). Throws rather than asserts — an arrange step that fails is a
 *  broken setup, not a failed claim, and the SDK's own error is what says WHY. */
async function createChannel(name: string): Promise<string> {
	const created = await createWhatsAppChannel({ name }, { baseURL: `${gatewayUrl}/api`, headers: { 'X-Owner-Id': OWNER_ID } })
	return created.id
}

async function connectChannel(channelId: string): Promise<{ state: string; qrCode?: string }> {
	return await connectGatewayChannel(channelId, { baseURL: `${gatewayUrl}/api`, headers: { 'X-Owner-Id': OWNER_ID } })
}

/** Poll the TS side's OWN database handle — never the gateway's HTTP — until the gateway's pipeline
 *  has projected the row. This read is the AC-6 assertion: cross-process visibility, same run. */
async function awaitChannelStatusFromTs(channelId: string): Promise<{ status: string; waitedMs: number }> {
	const started = performance.now()
	for (;;) {
		const [row] = await db().select().from(channels).where(eq(channels.id, channelId))
		if (row?.status === 'CONNECTED') return { status: row.status, waitedMs: performance.now() - started }
		if (performance.now() - started > CONNECT_DEADLINE_MS) {
			return { status: row?.status ?? 'ABSENT', waitedMs: performance.now() - started }
		}
		await Bun.sleep(25)
	}
}

beforeAll(async () => {
	const started = performance.now()
	// `ownerId` DECLARADO, não herdado: até a F3/T3 o harness defaultava para a mesma constante
	// que a linha 30 usa, e o acordo entre semente e asserção valia por coincidência de default.
	backend = await startIntegrationBackend({ services: ['apiGo'], ownerId: OWNER_ID })
	console.log(`[spike] services-mode boot: ${(performance.now() - started).toFixed(0)}ms (dataDir=${HARNESS_DATA_DIR})`)
	const url = backend.services.apiGo
	if (!url) throw new Error('spike: harness reported no apiGo service url')
	gatewayUrl = url
})

afterAll(async () => {
	await backend?.stop()
})

describe('AC-6 — o gateway declarado no manifesto sobe no MESMO arquivo SQLite do backend TS', () => {
	it('uma linha ESCRITA pelo gateway é visível pela query do lado TS na mesma run', async () => {
		const channelId = await createChannel('spike-ac6')

		// Before the gateway's own pipeline runs, the TS side already sees the row the gateway's
		// create use case wrote — the file is shared, not copied.
		const [afterCreate] = await db().select().from(channels).where(eq(channels.id, channelId))
		expect(afterCreate, 'a linha criada pelo gateway não apareceu na query do lado TS').toBeDefined()
		expect(afterCreate?.ownerId).toBe(OWNER_ID)
		expect(afterCreate?.platform).toBe(ChannelKind.WHATSAPP)

		// And then the SCRIPTED fact: connect returns the roteiro's first QR frame, and the pairing
		// travels mapper → outbox → handler → repository INSIDE the gateway process, landing as a
		// status change this process reads through its own driver.
		const connected = await connectChannel(channelId)
		expect(connected.qrCode).toBe('codm-e2e-qr-1')
		expect(connected.state).toBe('CONNECTING')

		const projected = await awaitChannelStatusFromTs(channelId)
		console.log(`[spike] gateway→TS visibility of CONNECTED: ${projected.waitedMs.toFixed(0)}ms`)
		expect(projected.status).toBe('CONNECTED')

		// A SECOND table, and a different kind of row: the gateway's own outbox lane. This is the
		// transport the two services talk over (there is no socket), so seeing the event row from
		// here proves the shared file carries EVENTS across the boundary, not just projections.
		const gatewayOutbox = await db().select().from(outbox).where(eq(outbox.source, 'gateway'))
		expect(gatewayOutbox.map(row => row.name)).toContain('channel.gateway_connected')
	})
})

describe('THE RESET SPIKE — reset() cross-processo (o veredito vira contrato para T8/T9)', () => {
	// Timeout explícito: dois seeds pareados × AutoPairAfter 2s do cenário e2e — T10 (default de
	// 5000ms do bun:test não sobra margem para dois ciclos create→connect→CONNECTED sequenciais).
	it('truncate do lado TS limpa as tabelas do gateway E o gateway continua funcional depois', async () => {
		// Arrange: state the gateway owns, produced by the gateway. No intermediate response to
		// assert on here (unlike the AC-6 test above), so the create→connect→poll-until-CONNECTED
		// sequence goes through the flow-given (T12) instead of the raw create/connect pair — the
		// DB-side `awaitChannelStatusFromTs` below still runs, because THAT read (never the gateway's
		// HTTP/SDK) is the actual claim this suite makes about cross-process visibility.
		const { channelId: before } = await givenConnectedGatewayChannel(backend, { name: 'spike-reset-before' })
		expect((await awaitChannelStatusFromTs(before)).status).toBe('CONNECTED')

		// Act (via i): the CHEAP path — the harness's existing `reset()`, which is `resetAllTables`
		// (core/src/db/libsql/drivers/utils.ts): every table in sqlite_master except the shared migration
		// ledger. That enumeration is what makes it cover gateway-owned tables for free — it never
		// had a list of TS tables to fall behind on.
		const resetStarted = performance.now()
		await backend.reset()
		const resetMs = performance.now() - resetStarted

		const remaining = await db().select().from(channels)
		expect(remaining, 'reset() deixou linhas gateway-owned para trás').toHaveLength(0)

		// Assert the half that could NOT be reasoned about: the gateway process survived a truncate
		// under its feet (its in-memory channel registry still holds the wiped channel) and its next
		// turn is clean — a NEW channel goes through the whole pipeline again.
		const afterReset = await createChannel('spike-reset-after')
		const connected = await connectChannel(afterReset)
		expect(connected.qrCode).toBe('codm-e2e-qr-1')
		const projected = await awaitChannelStatusFromTs(afterReset)
		console.log(`[spike] reset(): ${resetMs.toFixed(1)}ms — gateway pipeline após reset: ${projected.waitedMs.toFixed(0)}ms`)
		expect(projected.status).toBe('CONNECTED')

		// And the wiped channel is GONE, not resurrected by gateway memory.
		const [ghost] = await db().select().from(channels).where(eq(channels.id, before))
		expect(ghost).toBeUndefined()
	}, 20_000)

	it('MEDIÇÃO da via (ii): re-spawnar o serviço por reset custa isto (build já em cache)', async () => {
		// A SECOND scratch dir, not the harness's: the Go store takes an EXCLUSIVE per-data-dir lock
		// (`<dataDir>/codm.db.lock`, core/db/sqlite — "only one process may own the codm SQLite store
		// at a time"), so two gateways cannot overlap on one dir at all. That is also the shape of the
		// (ii) cycle itself — kill, then spawn — and it is why cycle 1 below (cold: creates the file
		// and applies migrations) reads higher than cycles 2 and 3, which are the real re-spawn cost.
		const dir = mkdtempSync(join(tmpdir(), 'codm-spike-respawn-'))
		const samples: { readyMs: number; stopMs: number }[] = []
		try {
			for (let cycle = 0; cycle < 3; cycle++) {
				const service = await bootService('apiGo', { dataDir: dir })
				expect(service.buildMs, 'o build deveria estar em cache por processo').toBe(0)
				const stopStarted = performance.now()
				await service.stop()
				samples.push({ readyMs: service.readyMs, stopMs: performance.now() - stopStarted })
			}
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
		console.log(
			`[spike] re-spawn cycles (spawn→health + stop): ${samples.map(s => `${s.readyMs.toFixed(0)}ms+${s.stopMs.toFixed(0)}ms`).join(', ')}`,
		)
		// No policy assertion here — this test exists to produce the NUMBER the verdict is chosen
		// with. It only pins that a re-spawn is possible at all from the same declared recipe.
		expect(samples).toHaveLength(3)
	})
})
