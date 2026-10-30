import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { TestBed } from '@test/support'
import { agentMailbox } from '@codm/contracts/db'
import { LibSqlDatabaseDriver } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind, PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository } from './MailboxRepository'

/**
 * Above every platform's pid ceiling, so `kill(pid, 0)` answers ESRCH rather than naming a process
 * that happens to exist. Measured on this host: `ESRCH`, same as pid 99999.
 *
 * Deliberately NOT "spawn something and reuse its pid after it dies" — that is a test whose
 * correctness depends on the OS not recycling a number, which is exactly the ambiguity `claimed_boot`
 * exists to remove.
 */
const PID_NOBODY_HOLDS = 2_147_483_632

/**
 * The scheduler's semantics, which are the whole reason this table exists rather than "just trigger
 * a turn". Every assertion here corresponds to a failure an adversarial review of the design found in
 * the version WITHOUT a queue: duplicate turns from redelivery, two producers racing to fire, an item
 * stranded because the guard lived in memory, a poisoned item starving its target forever.
 */
describe('MailboxRepository — one turn per target, durable', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const THREAD_A = '00000000-0000-4000-8000-00000000aaaa'
	const THREAD_B = '00000000-0000-4000-8000-00000000bbbb'

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const repo = () => testBed.resolve(MailboxRepository)
	const item = (targetId: string, dedupKey: string, kind = MailboxItemKind.OPERATOR_MESSAGE) => ({
		ownerId: MOCK_CLOUD_OWNER_ID,
		targetKind: MailboxTargetKind.THREAD,
		targetId,
		kind,
		posture: PermissionPosture.AUTO,
		payload: { note: dedupKey },
		dedupKey,
	})

	it('dedups by key — a redelivered fact queues nothing the second time', async () => {
		const r = repo()
		expect(await r.enqueue(item(THREAD_A, 'entry-1'))).toBe(true)
		// The redelivery. Without this, one at-least-once event becomes two turns and two messages in
		// someone's real conversation.
		expect(await r.enqueue(item(THREAD_A, 'entry-1'))).toBe(false)
		expect(await r.claimNext('w1', 60_000)).toBeDefined()
		expect(await r.claimNext('w1', 60_000)).toBeUndefined()
	})

	it('leases ONE item per target while letting other targets run in parallel', async () => {
		const r = repo()
		await r.enqueue(item(THREAD_A, 'a1'))
		await r.enqueue(item(THREAD_A, 'a2'))
		await r.enqueue(item(THREAD_B, 'b1'))

		const first = await r.claimNext('w1', 60_000)
		const second = await r.claimNext('w2', 60_000)
		// Two claims, two DIFFERENT targets — a2 waits behind a1, b1 does not wait at all.
		expect([first?.targetId, second?.targetId].sort()).toEqual([THREAD_A, THREAD_B].sort())
		expect(await r.claimNext('w3', 60_000)).toBeUndefined()
	})

	it('serves one target in insertion order, and only after the previous turn completes', async () => {
		const r = repo()
		await r.enqueue(item(THREAD_A, 'first'))
		await r.enqueue(item(THREAD_A, 'second'))

		const one = await r.claimNext('w1', 60_000)
		expect((one!.payload as { note: string }).note).toBe('first')
		expect(await r.claimNext('w1', 60_000)).toBeUndefined()

		await r.complete(one!.id)
		const two = await r.claimNext('w1', 60_000)
		expect((two!.payload as { note: string }).note).toBe('second')
	})

	it('an EXPIRED lease is reclaimable — a worker that died mid-turn does not strand its item', async () => {
		// The crash budget, and the reason the guard is a row and not a Set in memory: a restart forgets
		// an in-memory claim, and a subagent result that arrived just before a crash would never be
		// told to anyone.
		const r = repo()
		await r.enqueue(item(THREAD_A, 'orphan'))
		const claimed = await r.claimNext('dead-worker', -1)
		expect(claimed).toBeDefined()

		const reclaimed = await r.claimNext('live-worker', 60_000)
		expect(reclaimed?.id).toBe(claimed!.id)
		// Attempts count RUNS, so a retry is visible rather than silent.
		expect(reclaimed?.attempts).toBe(2)
	})

	it('poisons an item that keeps failing, instead of starving its target forever', async () => {
		const r = repo()
		await r.enqueue(item(THREAD_A, 'doomed'))
		await r.enqueue(item(THREAD_A, 'behind-it'))

		const doomed = await r.claimNext('w1', 60_000)
		await r.fail(doomed!.id, 'provider exploded', 1)

		// Dead, so the queue moves on to what was stuck behind it.
		const next = await r.claimNext('w1', 60_000)
		expect((next!.payload as { note: string }).note).toBe('behind-it')
	})

	it('a failure UNDER the cap is retried rather than poisoned', async () => {
		const r = repo()
		await r.enqueue(item(THREAD_A, 'flaky'))
		const first = await r.claimNext('w1', 60_000)
		await r.fail(first!.id, 'transient', 5)

		const retry = await r.claimNext('w1', 60_000)
		expect(retry?.id).toBe(first!.id)
		expect(retry?.attempts).toBe(2)
	})

	/**
	 * O LEASE DE UM BOOT ANTERIOR NASCE RECLAMÁVEL — não imortal, e não "reclamável em dez minutos".
	 *
	 * O crash budget sempre esteve certo no papel: o lease expira e o item volta. O que ele custava era
	 * a espera INTEIRA, toda vez, porque `claimed_by` é um uuid criado na memória do processo morto e o
	 * processo novo não tem como distingui-lo de um segundo daemon que ainda está trabalhando. Com o
	 * boot gravado na linha a pergunta tem dono: o SO responde por `kill(pid, 0)`.
	 *
	 * O falsificador é exato: apague o `isClaimOrphaned` de `releaseOrphanedClaims` (ou pare de gravar
	 * `claimed_boot`/`claimed_pid` no claim) e este teste fica vermelho — o item continua leased até o
	 * relógio do lease virar, que é o comportamento que ele existe para substituir.
	 */
	it('libera o lease de um boot que não existe mais — e só dele', async () => {
		const r = repo()
		const db = testBed.resolve(LibSqlDatabaseDriver).db
		await r.enqueue(item(THREAD_A, 'do-boot-morto'))
		await r.enqueue(item(THREAD_B, 'do-boot-vivo'))

		// Os dois estão leased por dez minutos: nenhum expira sozinho dentro deste teste.
		const dead = await r.claimNext('worker-do-boot-anterior', 600_000)
		const alive = await r.claimNext('worker-deste-boot', 600_000)
		expect(dead).toBeDefined()
		expect(alive).toBeDefined()

		// AS DUAS linhas passam a ser de OUTRO boot. A única diferença é que um dos pids ainda existe —
		// que é precisamente a pergunta que só o SO responde, e a razão de a varredura não poder ser um
		// `WHERE claimed_boot <> ?` e nada mais.
		await db
			.update(agentMailbox)
			.set({ claimedBoot: 'boot-de-ontem', claimedPid: PID_NOBODY_HOLDS })
			.where(eq(agentMailbox.id, dead?.id ?? ''))
		await db
			.update(agentMailbox)
			.set({ claimedBoot: 'boot-do-outro-daemon', claimedPid: process.pid })
			.where(eq(agentMailbox.id, alive?.id ?? ''))

		expect(await r.releaseOrphanedClaims()).toBe(1)

		// O órfão está de volta na fila AGORA, sem esperar os dez minutos…
		const recovered = await r.claimNext('worker-depois-do-boot', 60_000)
		expect(recovered?.id).toBe(dead?.id)
		// …e conta como tentativa, senão um item que mata o worker teria retries infinitos de graça.
		expect(recovered?.attempts).toBe(2)

		// …enquanto o lease do boot cujo processo AINDA EXISTE segue intocado. É o que impede a varredura
		// de roubar o turno de um segundo daemon rodando contra o mesmo arquivo.
		const row = await db
			.select()
			.from(agentMailbox)
			.where(eq(agentMailbox.id, alive?.id ?? ''))
		expect(row[0]?.claimedBoot).toBe('boot-do-outro-daemon')
		expect(row[0]?.leaseUntil).not.toBeNull()
	})

	it('uma linha sem boot gravado (anterior à migração) NÃO é reclamada — só o provável, nunca o suposto', async () => {
		const r = repo()
		const db = testBed.resolve(LibSqlDatabaseDriver).db
		await r.enqueue(item(THREAD_A, 'linha-antiga'))
		const claimed = await r.claimNext('worker-de-uma-versao-antiga', 600_000)

		// Como as linhas escritas antes das colunas existirem: leased, sem boot nenhum.
		await db
			.update(agentMailbox)
			.set({ claimedBoot: null, claimedPid: null })
			.where(eq(agentMailbox.id, claimed?.id ?? ''))

		expect(await r.releaseOrphanedClaims()).toBe(0)
		// Segue leased — cai no comportamento antigo (esperar o lease), que é o pior caso aceitável.
		expect(await r.claimNext('worker-outro', 60_000)).toBeUndefined()
	})

	// THE LANES (2026-10-30): the dispatcher passes the kinds that still have a free slot, in priority
	// order. The falsifier is exact: drop the CASE rank from the ORDER BY and the older ISSUE item wins.
	it('claims from the FIRST lane that has work, even when an older item waits in a later lane', async () => {
		const r = repo()
		const ISSUE_X = '00000000-0000-4000-8000-0000000000e1'
		await r.enqueue({ ...item(ISSUE_X, 'issue-older'), targetKind: MailboxTargetKind.ISSUE, kind: MailboxItemKind.STEER })
		await r.enqueue(item(THREAD_A, 'thread-newer'))

		const first = await r.claimNext('w1', 60_000, [MailboxTargetKind.THREAD, MailboxTargetKind.ISSUE])
		expect(first?.targetKind).toBe(MailboxTargetKind.THREAD)
		// A kind left out of `lanes` is never claimed — that is how a full lane stays full.
		expect(await r.claimNext('w1', 60_000, [MailboxTargetKind.THREAD])).toBeUndefined()
		expect((await r.claimNext('w1', 60_000, [MailboxTargetKind.ISSUE]))?.targetId).toBe(ISSUE_X)
	})

	// A turn the provider refused (usage limit) never ran: `defer` gives the attempt back and hides the
	// item until the reset. The falsifier: make `defer` keep the charge and the attempt count stays at 1.
	it('defer refunds the attempt and keeps the item unclaimable until the instant given', async () => {
		const r = repo()
		const db = testBed.resolve(LibSqlDatabaseDriver).db
		await r.enqueue(item(THREAD_A, 'deferred'))
		const claimed = await r.claimNext('w1', 60_000)
		expect(claimed?.attempts).toBe(1)

		await r.defer(claimed!.id, new Date(Date.now() + 60_000))
		expect(await r.claimNext('w1', 60_000)).toBeUndefined()
		const [row] = await db.select().from(agentMailbox).where(eq(agentMailbox.id, claimed!.id))
		expect(row?.attempts).toBe(0)
		expect(row?.claimedBy).toBeNull()

		await r.defer(claimed!.id, new Date(Date.now() - 1))
		expect((await r.claimNext('w1', 60_000))?.attempts).toBe(1)
	})

	it('pendingTargets names each target of a kind that still has runnable work, once', async () => {
		const r = repo()
		await r.enqueue(item(THREAD_A, 'a-1'))
		await r.enqueue(item(THREAD_A, 'a-2'))
		await r.enqueue(item(THREAD_B, 'b-1'))
		const done = await r.claimNext('w1', 60_000)
		await r.complete(done!.id)

		expect((await r.pendingTargets(MailboxTargetKind.THREAD)).sort()).toEqual([THREAD_A, THREAD_B].sort())
		expect(await r.pendingTargets(MailboxTargetKind.ISSUE)).toEqual([])
	})

	it('hasPending sees runnable work and stops seeing it once consumed', async () => {
		const r = repo()
		expect(await r.hasPending(MailboxTargetKind.THREAD, THREAD_A)).toBe(false)
		await r.enqueue(item(THREAD_A, 'p1'))
		expect(await r.hasPending(MailboxTargetKind.THREAD, THREAD_A)).toBe(true)
		const claimed = await r.claimNext('w1', 60_000)
		await r.complete(claimed!.id)
		expect(await r.hasPending(MailboxTargetKind.THREAD, THREAD_A)).toBe(false)
	})

	/**
	 * Every write without a caller transaction runs inside the driver's `BEGIN IMMEDIATE` — never on
	 * the read connection.
	 *
	 * The dispatcher passes no `tx`, and these writes used to fall back to `this.driver.db`: implicit
	 * transactions on the READ handle, outside the write gate, which under contention answer
	 * `SQLITE_BUSY_SNAPSHOT` (517) — a code `busy_timeout` never retries. Measured 2026-10-30: the
	 * daemon died on every boot within seconds.
	 *
	 * The falsifier is exact: put any of these writes back on `tx ?? this.driver.db` and the count of
	 * gated transactions drops below six.
	 */
	it('writes with no caller transaction go through the driver write gate', async () => {
		const r = repo()
		const driver = testBed.resolve(LibSqlDatabaseDriver)
		await r.enqueue(item(THREAD_A, 'gated-1'))
		const gate = spyOn(driver, 'transaction')
		try {
			await r.enqueue(item(THREAD_B, 'gated-2'))
			const claimed = await r.claimNext('w1', 60_000)
			expect(claimed).toBeDefined()
			await r.renewLease(claimed!.id, 'w1', 60_000)
			await r.fail(claimed!.id, 'boom', 3)
			const again = await r.claimNext('w1', 60_000)
			await r.complete(again!.id)
			expect(gate).toHaveBeenCalledTimes(6)
			await r.releaseOrphanedClaims()
			expect(gate).toHaveBeenCalledTimes(7)
		} finally {
			gate.mockRestore()
		}
	})
})
