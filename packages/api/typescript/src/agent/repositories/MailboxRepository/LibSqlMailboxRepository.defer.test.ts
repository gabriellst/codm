import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { MailboxFailureClass } from '@agent/enums/MailboxFailureClass'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { TestBed } from '@test/support'
import { agentMailbox } from '@codm/contracts/db'
import { LibSqlDatabaseDriver } from '@codm/core-typescript'
import { MailboxDeferCause, MailboxItemKind, MailboxTargetKind, PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository } from './MailboxRepository'
import { CLAIM_CLASS_OF_KIND } from '../../utils/ClaimClassOfKind'

/** Above every platform's pid ceiling — `kill(pid, 0)` answers ESRCH (see `MailboxRepository.test.ts`). */
const PID_NOBODY_HOLDS = 2_147_483_632

/**
 * A CAUSA DO ADIAMENTO É DECLARADA (fase 5, S1).
 *
 * "Lease no futuro e sem dono" é escrito por três causas — o limite do provedor, a pausa da issue e (S2) a nova
 * tentativa — e só a coluna `defer_cause` diz de quem é a espera. Duas propriedades seguram o modelo:
 *  1. `defer` grava a causa que recebeu, e `deferred` a devolve;
 *  2. TODA escrita que limpa ou troca o lease zera a causa — então "nulo ⇔ não adiado" vale também depois que o
 *     lease vence e o item é reivindicado.
 *
 * Falsificador: tire o `deferCause: null` de qualquer uma das escritas e o caso dela fica com a causa velha num item
 * que já não está adiado — e um leitor ("esperando cota", estado de vida) passaria a ler um adiamento que não existe.
 */
describe('MailboxRepository — the deferral cause is declared, and cleared with the lease', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

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
	const db = () => testBed.resolve(LibSqlDatabaseDriver).db
	let n = 0
	const target = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
	const enqueue = async (targetId = target(), hold?: { holder: string; until: Date }) => {
		const kind = MailboxItemKind.OPERATOR_MESSAGE
		const dedupKey = `defer-cause-${crypto.randomUUID()}`
		await repo().enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.THREAD,
			targetId,
			kind,
			claimClass: CLAIM_CLASS_OF_KIND[kind],
			posture: PermissionPosture.AUTO,
			payload: { note: dedupKey },
			dedupKey,
			hold,
		})
		return { targetId, dedupKey }
	}
	/** Enqueue, claim and defer one item with `cause` — the row the cases below start from. */
	const deferred = async (cause: MailboxDeferCause, until = new Date(Date.now() + 600_000)) => {
		const { dedupKey } = await enqueue()
		const claimed = await repo().claimNext('w-defer', 60_000)
		if (!claimed) throw new Error('nothing claimed')
		await repo().defer([claimed.id], until, cause)
		return { id: claimed.id, dedupKey }
	}
	const causeOf = async (id: string) => (await db().select().from(agentMailbox).where(eq(agentMailbox.id, id)))[0]?.deferCause

	it('defer records the cause it was given, and deferred hands it back', async () => {
		const limit = await deferred(MailboxDeferCause.PROVIDER_LIMIT)
		const hold = await deferred(MailboxDeferCause.HOLD)
		const retry = await deferred(MailboxDeferCause.RETRY)

		expect(await causeOf(limit.id)).toBe(MailboxDeferCause.PROVIDER_LIMIT)
		const found = new Map((await repo().deferred()).map(item => [item.id, item.cause]))
		expect(found).toEqual(
			new Map([
				[limit.id, MailboxDeferCause.PROVIDER_LIMIT],
				[hold.id, MailboxDeferCause.HOLD],
				[retry.id, MailboxDeferCause.RETRY],
			]),
		)
	})

	it('an item never deferred has no cause — a fresh row, a claim, a triage hold', async () => {
		const { targetId } = await enqueue()
		const [fresh] = await db().select().from(agentMailbox).where(eq(agentMailbox.targetId, targetId))
		expect(fresh?.deferCause).toBeNull()
		const claimed = await repo().claimNext('w', 60_000)
		expect(await causeOf(claimed?.id ?? '')).toBeNull()
		const held = await enqueue(target(), { holder: 'triage', until: new Date(Date.now() + 60_000) })
		const [holdRow] = await db().select().from(agentMailbox).where(eq(agentMailbox.dedupKey, held.dedupKey))
		expect(holdRow?.deferCause).toBeNull()
	})

	it('a claim of a lapsed deferral clears the cause', async () => {
		const { id } = await deferred(MailboxDeferCause.PROVIDER_LIMIT, new Date(Date.now() - 1))
		const again = await repo().claimNext('w', 60_000)
		expect(again?.id).toBe(id)
		expect(await causeOf(id)).toBeNull()
	})

	it('releaseDeferred clears the cause with the lease', async () => {
		const { id } = await deferred(MailboxDeferCause.HOLD)
		expect(await repo().releaseDeferred([id])).toBe(1)
		expect(await causeOf(id)).toBeNull()
		expect(await repo().deferred()).toEqual([])
	})

	it('giveBack, complete and fail clear the cause', async () => {
		for (const settle of [
			(id: string) => repo().giveBack([id]),
			(id: string) => repo().complete([id]),
			(id: string) => repo().fail(id, [], { class: MailboxFailureClass.CRASH, detail: 'boom' }, [0, 0]),
		]) {
			// A deferral whose lease is overwritten by a write that releases it — set the cause on a CLAIMED row by hand, the
			// one state those three writes see, so the assertion is about THEIR write and nothing else.
			const { targetId } = await enqueue()
			const claimed = await repo().claimNext('w', 60_000)
			if (claimed?.targetId !== targetId) throw new Error('unexpected claim')
			await db().update(agentMailbox).set({ deferCause: MailboxDeferCause.RETRY }).where(eq(agentMailbox.id, claimed.id))
			await settle(claimed.id)
			expect(await causeOf(claimed.id)).toBeNull()
			// Out of the way of the next case's claim (`giveBack` and `fail` leave it claimable).
			await repo().complete([claimed.id])
		}
	})

	it('settleHold and the boot sweep clear the cause', async () => {
		const held = await enqueue(target(), { holder: 'triage', until: new Date(Date.now() + 60_000) })
		await db().update(agentMailbox).set({ deferCause: MailboxDeferCause.HOLD }).where(eq(agentMailbox.dedupKey, held.dedupKey))
		expect(await repo().settleHold(held.dedupKey, 'triage', { consume: true })).toBe(true)
		const [settled] = await db().select().from(agentMailbox).where(eq(agentMailbox.dedupKey, held.dedupKey))
		expect(settled?.deferCause).toBeNull()

		const orphan = await enqueue()
		const claimed = await repo().claimNext('w-dead', 600_000)
		if (claimed?.targetId !== orphan.targetId) throw new Error('unexpected claim')
		await db()
			.update(agentMailbox)
			.set({ claimedBoot: 'a-dead-boot', claimedPid: PID_NOBODY_HOLDS, deferCause: MailboxDeferCause.PROVIDER_LIMIT })
			.where(eq(agentMailbox.id, claimed.id))
		expect(await repo().releaseOrphanedClaims()).toBe(1)
		expect(await causeOf(claimed.id)).toBeNull()
	})

	it('a poisoned item has no cause either', async () => {
		const { targetId } = await enqueue()
		for (let attempt = 1; attempt <= 3; attempt++) {
			const claimed = await repo().claimNext('w', 60_000)
			if (claimed?.targetId !== targetId) throw new Error('unexpected claim')
			await db().update(agentMailbox).set({ deferCause: MailboxDeferCause.RETRY }).where(eq(agentMailbox.id, claimed.id))
			await repo().fail(claimed.id, [], { class: MailboxFailureClass.CRASH, detail: 'boom' }, [0, 0])
		}
		const [row] = await db().select().from(agentMailbox).where(eq(agentMailbox.targetId, targetId))
		expect(row?.deadAt).not.toBeNull()
		expect(row?.deferCause).toBeNull()
	})

	/**
	 * `fail` DECIDES and says what it decided (fase 5, S2): a wait > 0 parks the item with cause RETRY, a wait of 0 frees
	 * it now with no lease and no cause, and past the calendar it dies — the attempt the claim charged stays charged in
	 * all three (a refund, like `giveBack`'s, would let a login failure retry forever).
	 *
	 * Falsifier: write `lease = now` for the wait of 0 and the item is not claimable in the same millisecond; refund the
	 * attempt and the third claim reads 1 instead of 3.
	 */
	it('fail parks on the calendar (RETRY), frees at once for a wait of 0, and kills past it — attempts kept', async () => {
		const { targetId } = await enqueue()
		const row = async () => (await db().select().from(agentMailbox).where(eq(agentMailbox.targetId, targetId)))[0]
		const failure = { class: MailboxFailureClass.PROVIDER_ERROR, detail: 'overloaded' }
		const waits = [60_000, 0]

		const first = await repo().claimNext('w', 60_000)
		const before = Date.now()
		const parked = await repo().fail(first?.id ?? '', [], failure, waits)
		expect(parked).toMatchObject({ dead: false, attempts: 1 })
		const one = await row()
		expect(one?.deferCause).toBe(MailboxDeferCause.RETRY)
		expect(one?.attempts).toBe(1)
		expect(one?.claimedBy).toBeNull()
		expect((one?.leaseUntil?.getTime() ?? 0) - before).toBeGreaterThanOrEqual(60_000)
		expect(await repo().claimNext('w', 60_000)).toBeUndefined()

		await db()
			.update(agentMailbox)
			.set({ leaseUntil: new Date(Date.now() - 1) })
			.where(eq(agentMailbox.targetId, targetId))
		const second = await repo().claimNext('w', 60_000)
		expect(second?.attempts).toBe(2)
		expect(await repo().fail(second?.id ?? '', [], failure, waits)).toMatchObject({ dead: false, attempts: 2 })
		const two = await row()
		expect([two?.leaseUntil, two?.deferCause, two?.attempts]).toEqual([null, null, 2])

		const third = await repo().claimNext('w', 60_000)
		expect(third?.attempts).toBe(3)
		const dead = await repo().fail(third?.id ?? '', [], failure, waits)
		expect(dead).toMatchObject({ dead: true, attempts: 3 })
		expect(dead.dead && dead.since).toBeInstanceOf(Date)
		const three = await row()
		expect(three?.deadAt).not.toBeNull()
		expect(three?.lastError).toBe('overloaded')
	})

	/**
	 * A NEW ITEM ENDS THE TARGET'S RETRY WAIT, handing the attempt back — once, and only for a real insert (fase 5, S2).
	 *
	 * Falsifier: release on a dedup conflict and a redelivered fact rewinds the calendar; drop the cause filter and a
	 * provider-limit pause is broken by any message; drop the refund and three messages in one wait spend three attempts.
	 */
	it('a new item ends a RETRY wait once, handing the attempt back — a redelivery or another cause releases nothing', async () => {
		const retried = await enqueue()
		const head = await repo().claimNext('w', 60_000)
		await repo().fail(head?.id ?? '', [], { class: MailboxFailureClass.PROVIDER_ERROR, detail: 'x' }, [60_000])
		const limited = await deferred(MailboxDeferCause.PROVIDER_LIMIT)
		const [limitedRow] = await db().select().from(agentMailbox).where(eq(agentMailbox.id, limited.id))
		const kind = MailboxItemKind.OPERATOR_MESSAGE
		const message = (targetId: string, dedupKey: string) =>
			repo().enqueue({
				ownerId: MOCK_CLOUD_OWNER_ID,
				targetKind: MailboxTargetKind.THREAD,
				targetId,
				kind,
				claimClass: CLAIM_CLASS_OF_KIND[kind],
				posture: PermissionPosture.AUTO,
				payload: { note: dedupKey },
				dedupKey,
			})

		// A redelivered fact (the head's own dedup key) inserts nothing and releases nothing.
		expect(await message(retried.targetId, retried.dedupKey)).toBe(false)
		expect(await causeOf(head?.id ?? '')).toBe(MailboxDeferCause.RETRY)

		// A real message: released, attempt handed back.
		expect(await message(retried.targetId, `recado-${crypto.randomUUID()}`)).toBe(true)
		const [released] = await db()
			.select()
			.from(agentMailbox)
			.where(eq(agentMailbox.id, head?.id ?? ''))
		expect([released?.deferCause, released?.leaseUntil, released?.attempts]).toEqual([null, null, 0])
		// A second message finds no wait left — no second refund.
		expect(await message(retried.targetId, `recado-${crypto.randomUUID()}`)).toBe(true)
		const [again] = await db()
			.select()
			.from(agentMailbox)
			.where(eq(agentMailbox.id, head?.id ?? ''))
		expect(again?.attempts).toBe(0)

		// A message for a target paused by the provider's limit leaves that pause alone.
		expect(await message(limitedRow?.targetId ?? '', `recado-${crypto.randomUUID()}`)).toBe(true)
		expect(await causeOf(limited.id)).toBe(MailboxDeferCause.PROVIDER_LIMIT)
	})
})
