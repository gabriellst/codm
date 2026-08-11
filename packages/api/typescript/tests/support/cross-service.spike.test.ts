import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { channels, outbox } from '@codm/contracts/db'
import { DrizzleDatabaseDriver } from '@codm/core-typescript'
import { OPERATOR_ID } from '@auth/operator'
import { HARNESS_DATA_DIR } from './harnessDataDir'
import { startIntegrationBackend, type IntegrationBackend } from './testing'
import { bootService } from './testBoot'

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

const OWNER_ID = OPERATOR_ID
const CONNECT_DEADLINE_MS = 15_000

let backend: IntegrationBackend
let gatewayUrl: string

function db() {
	// biome-ignore lint/suspicious/noExplicitAny: tsyringe-neo can't type an abstract class as a token.
	return (backend.container.resolve(DrizzleDatabaseDriver as any) as DrizzleDatabaseDriver).db
}

/** Create a channel through the gateway's real HTTP surface (the SAME call the console makes).
 *  Throws rather than asserts — an arrange step that fails is a broken setup, not a failed claim,
 *  and the response body is the only thing that says WHY (a 401 here once meant a stray apikey). */
async function createChannel(name: string): Promise<string> {
	const response = await fetch(`${gatewayUrl}/api/channel/channels/whatsapp`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'X-Owner-Id': OWNER_ID },
		body: JSON.stringify({ name }),
	})
	if (response.status !== 201) throw new Error(`create channel: expected 201, got ${response.status} — ${await response.text()}`)
	const created = (await response.json()) as { id: string }
	if (!created.id) throw new Error('create channel: gateway answered 201 with no id')
	return created.id
}

async function connectChannel(channelId: string): Promise<{ state: string; qrCode: string }> {
	const response = await fetch(`${gatewayUrl}/api/channel/channels/${channelId}/connect`, {
		method: 'POST',
		headers: { 'X-Owner-Id': OWNER_ID },
	})
	if (response.status !== 200) throw new Error(`connect channel: expected 200, got ${response.status} — ${await response.text()}`)
	return (await response.json()) as { state: string; qrCode: string }
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
	backend = await startIntegrationBackend({ services: ['apiGo'] })
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
		expect(afterCreate?.platform).toBe('WHATSAPP')

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
	it('truncate do lado TS limpa as tabelas do gateway E o gateway continua funcional depois', async () => {
		// Arrange: state the gateway owns, produced by the gateway.
		const before = await createChannel('spike-reset-before')
		await connectChannel(before)
		expect((await awaitChannelStatusFromTs(before)).status).toBe('CONNECTED')

		// Act (via i): the CHEAP path — the harness's existing `reset()`, which is `resetAllTables`
		// (core/src/db/drivers/utils.ts): every table in sqlite_master except the shared migration
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
	})

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
