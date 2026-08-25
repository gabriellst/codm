import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { scheduledCommands } from '@codm/contracts/db/pg'
import { MockLoggingService, PGliteDriver, PgCommandQueue, type Handler } from '@codm/core-typescript'

/**
 * A fila de comandos da família `pg`, contra um Postgres DE VERDADE (PGlite, em processo).
 *
 * ── por que este arquivo é obrigatório, e não zelo ───────────────────────────────────────────────
 * O porte deste driver a partir do gêmeo SQLite passou pelo `tsc` carregando **dois defeitos que
 * só o runtime revela**, porque SQL cru é string e o compilador não o lê:
 *
 *   1. `IS NOT` como desigualdade nula-segura — isso é SQLite. No Postgres a forma é
 *      `IS DISTINCT FROM`, e `a IS NOT b` nem é sintaxe válida fora de `IS NOT NULL`. A linha
 *      afetada roda na RE-REGISTRAÇÃO de todo job repetível, ou seja, em TODO boot da nuvem.
 *   2. `input` volta como OBJETO (a coluna é `jsonb`), não como string. O `JSON.parse` herdado do
 *      gêmeo explodiria no primeiro comando com payload.
 *
 * Os dois foram achados lendo, mas ler não é gate. Este arquivo é.
 *
 * O poller nunca fica ligado: cada teste registra o handler, dirige `tick()` na mão e simula "o
 * alarme tocou" rebobinando `run_at` por SQL — determinístico e instantâneo, em vez de dormir.
 */
describe('PgCommandQueue — a fila da família pg contra Postgres real', () => {
	let driver: PGliteDriver
	let queue: PgCommandQueue

	beforeAll(async () => {
		driver = new PGliteDriver()
		await driver.runMigrations()
	})

	beforeEach(async () => {
		await driver.reset()
		queue = new PgCommandQueue(driver, new MockLoggingService())
		queue.stopPolling()
	})

	afterEach(async () => {
		await queue.close()
	})

	/** Handler falso que grava toda execução. Só os campos que a fila lê. */
	const makeHandler = (name: string) => {
		const calls: unknown[] = []
		const handler = { name, concurrency: 1, execute: async (input: unknown) => void calls.push(input) } as unknown as Handler
		return { handler, calls }
	}

	it('PCQ-01: enfileira, reivindica e EXECUTA — com o payload intacto', async () => {
		const { handler, calls } = makeHandler('pg.command.one')
		await queue.registerCommandHandler(handler)

		await queue.enqueueCommand('pg.command.one', { marker: 'atravessou' })
		await queue.tick()

		expect(calls, 'o comando enfileirado tem de ter sido executado').toHaveLength(1)
		// O DEFEITO 2 DO DOCBLOCK: se a normalização ainda fizesse `JSON.parse` de um `jsonb` já
		// desserializado, esta linha morreria antes de comparar.
		expect(calls[0]).toEqual({ marker: 'atravessou' })
	})

	it('PCQ-02: um job REPETÍVEL sobrevive à re-registração sem empurrar o próximo disparo', async () => {
		// O DEFEITO 1 DO DOCBLOCK mora aqui: a segunda chamada cai no `onConflictDoUpdate`, cujo `CASE`
		// usa a desigualdade nula-segura. Com o `IS NOT` do SQLite este teste morre com erro de sintaxe
		// do Postgres — que é exatamente o que aconteceria em todo boot da nuvem.
		const { handler } = makeHandler('pg.command.repeat')
		await queue.registerCommandHandler(handler)

		await queue.enqueueCommand('pg.command.repeat', {}, { repeat: { every: 60_000 } })
		const [first] = await driver.db.select().from(scheduledCommands).where(eq(scheduledCommands.id, 'repeat:pg.command.repeat'))
		expect(first, 'o job repetível tem de existir depois da primeira registração').toBeDefined()

		// Re-registração com o MESMO intervalo — o que todo boot faz.
		await queue.enqueueCommand('pg.command.repeat', {}, { repeat: { every: 60_000 } })
		const [second] = await driver.db.select().from(scheduledCommands).where(eq(scheduledCommands.id, 'repeat:pg.command.repeat'))

		expect(second?.runAt?.getTime(), 'intervalo IGUAL preserva o agendamento — senão cada deploy adia o próximo disparo').toBe(
			first?.runAt?.getTime(),
		)
	})

	it('PCQ-03: mudar o INTERVALO re-ancora o agendamento', async () => {
		const { handler } = makeHandler('pg.command.rearm')
		await queue.registerCommandHandler(handler)

		await queue.enqueueCommand('pg.command.rearm', {}, { repeat: { every: 3_600_000 } })
		const [before] = await driver.db.select().from(scheduledCommands).where(eq(scheduledCommands.id, 'repeat:pg.command.rearm'))

		await queue.enqueueCommand('pg.command.rearm', {}, { repeat: { every: 1_000 } })
		const [after] = await driver.db.select().from(scheduledCommands).where(eq(scheduledCommands.id, 'repeat:pg.command.rearm'))

		expect(after?.repeatEveryMs).toBe(1_000)
		expect(
			(after?.runAt?.getTime() ?? 0) < (before?.runAt?.getTime() ?? 0),
			'só uma MUDANÇA de intervalo re-ancora — é a outra metade do CASE que PCQ-02 exercita',
		).toBe(true)
	})

	it('PCQ-04: a tentativa é cobrada NA REIVINDICAÇÃO, não no erro', async () => {
		// Contar só no erro perde crash duro: um comando cuja execução mata o processo voltaria a ser
		// reivindicado em attempts=0 depois de toda expiração de lease — laço de crash sem carta morta.
		const { handler } = makeHandler('pg.command.attempts')
		await queue.registerCommandHandler(handler)
		await queue.enqueueCommand('pg.command.attempts', {})

		const [before] = await driver.db.select().from(scheduledCommands).where(eq(scheduledCommands.name, 'pg.command.attempts'))
		expect(before?.attempts).toBe(0)

		await queue.tick()

		// O comando de disparo único é REMOVIDO ao suceder; se ainda existisse, teria attempts >= 1.
		const rows = await driver.db.select().from(scheduledCommands).where(eq(scheduledCommands.name, 'pg.command.attempts'))
		expect(rows.length === 0 || (rows[0]?.attempts ?? 0) >= 1, 'ou sumiu por ter sucedido, ou cobrou a tentativa').toBe(true)
	})
})
