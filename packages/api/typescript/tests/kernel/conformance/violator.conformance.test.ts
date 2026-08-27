import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { eq, inArray, isNull } from 'drizzle-orm'
import { outbox } from '@codm/contracts/db/pg'
import { OutboxSource } from '@codm/contracts-typescript/wire/enums'
import {
	IDEMPOTENCY_CHECKS,
	IdempotencyGuard,
	OUTBOX_CHECKS,
	OutboxDispatcher,
	PGliteDriver,
	PgIdempotencyGuard,
} from '@codm/core-typescript'
import type { OutboxHarness, Transaction } from '@codm/core-typescript'

/**
 * Um despachante que reivindica SEM o filtro de lane. No resto ele se comporta: marca
 * `processed_at`, limpa a reivindicação. É o que o torna um falseador JUSTO — a ÚNICA coisa que
 * falta é o predicado que este arquivo existe para provar que a suíte cobra.
 */
class LaneBlindOutboxDispatcher extends OutboxDispatcher {
	constructor(private readonly driver: PGliteDriver) {
		super()
	}
	start(): void {}
	async stop(): Promise<void> {}
	async flush(): Promise<void> {
		const due = await this.driver.db.select({ id: outbox.id }).from(outbox).where(isNull(outbox.processedAt))
		const ids = due.map(row => row.id)
		if (ids.length === 0) return
		// A VIOLAÇÃO: nenhum `AND source = ...`. Rouba as linhas das outras lanes e as finaliza — o
		// dono legítimo nunca as vê.
		await this.driver.db.update(outbox).set({ processedAt: new Date(), claimedBy: null }).where(inArray(outbox.id, ids))
	}
}

/**
 * O FALSEADOR DA PRÓPRIA SUÍTE.
 *
 * `pg.conformance.test.ts` e `libsql.conformance.test.ts` só provam que a suíte fica VERDE contra
 * implementações corretas — e, sozinho, isso é indistinguível de uma suíte VAZIA, que ficaria verde
 * contra qualquer coisa. Este arquivo constrói guards que quebram UM ponto do contrato cada e exige
 * que o caso correspondente REPROVE, nominalmente.
 *
 * **Se este arquivo ficar verde por si só um dia — isto é, se um violador parar de ser reprovado —
 * o falseador é que ficou vazio, e precisa de uma violação nova para continuar provando que a suíte
 * morde.**
 *
 * Cada violador quebra UMA coisa e se comporta corretamente no resto. É o que o torna um falseador
 * justo: o que falha é a propriedade sob teste, não um guard tão quebrado que reprovaria tudo por
 * razões alheias.
 */

/** Nunca deduplica: toda reivindicação ganha. Quebra IDC-01. */
class NeverDedupingGuard extends IdempotencyGuard {
	async claim(): Promise<boolean> {
		return true
	}
	async release(): Promise<void> {}
}

/** Ignora o ESCOPO: deduplica só pela chave. Quebra IDC-02. */
class ScopeBlindGuard extends IdempotencyGuard {
	private readonly seen = new Set<string>()
	async claim(_scope: string, key: string): Promise<boolean> {
		if (this.seen.has(key)) return false
		this.seen.add(key)
		return true
	}
	async release(_scope: string, key: string): Promise<void> {
		this.seen.delete(key)
	}
}

/**
 * Reivindica FORA da transação que lhe passaram — ignora o `tx`. Quebra IDC-04.
 *
 * É a violação mais realista das três, e a mais silenciosa: um guard assim passa IDC-01, IDC-02 e
 * IDC-03 sem esforço, e só falha quando alguém pergunta se a trava morre com o rollback. Sem esse
 * caso, o parâmetro `tx` do contrato seria decorativo e ninguém notaria.
 */
class TxIgnoringGuard extends IdempotencyGuard {
	private readonly seen = new Set<string>()
	async claim(scope: string, key: string, _tx?: Transaction): Promise<boolean> {
		const id = `${scope}::${key}`
		if (this.seen.has(id)) return false
		this.seen.add(id)
		return true
	}
	async release(scope: string, key: string): Promise<void> {
		this.seen.delete(`${scope}::${key}`)
	}
}

const CASES = Object.keys(IDEMPOTENCY_CHECKS)
const caseNamed = (prefix: string): string => {
	const found = CASES.find(name => name.startsWith(prefix))
	// Um falseador que não acha o caso que devia falsear passaria em silêncio, e seria a própria
	// vacuidade que ele existe para impedir. Renomear um caso quebra AQUI, alto.
	if (found === undefined) throw new Error(`falseador órfão: nenhum caso da suíte começa com '${prefix}' (existem: ${CASES.join(' · ')})`)
	return found
}

describe('violator — a prova de que a suíte de conformidade MORDE', () => {
	let driver: PGliteDriver

	beforeAll(async () => {
		driver = new PGliteDriver()
		await driver.runMigrations()
	})

	beforeEach(async () => {
		await driver.reset()
	})

	/** Roda o caso contra o violador e devolve o que a suíte acusou. Vazio = a suíte NÃO mordeu. */
	const problemsFrom = async (prefix: string, guard: IdempotencyGuard): Promise<string[]> => {
		const check = IDEMPOTENCY_CHECKS[caseNamed(prefix)]
		return check === undefined ? [] : check(driver, guard)
	}

	it('VIO-01: um guard que NUNCA deduplica é reprovado por IDC-01', async () => {
		const problems = await problemsFrom('IDC-01', new NeverDedupingGuard())
		expect(problems, 'se a suíte aceitasse isto, ela não estaria medindo exatamente-uma-vez').not.toEqual([])
		expect(problems.join(' '), 'e a acusação tem de NOMEAR o que quebrou').toContain('exatamente-uma-vez')
	})

	it('VIO-02: um guard CEGO A ESCOPO é reprovado por IDC-02', async () => {
		const problems = await problemsFrom('IDC-02', new ScopeBlindGuard())
		expect(problems, 'sem isto, dois escopos disputariam a mesma chave e ninguém veria').not.toEqual([])
		expect(problems.join(' ')).toContain('cego a escopo')
	})

	it('VIO-03: um guard que IGNORA a transação é reprovado por IDC-04', async () => {
		const problems = await problemsFrom('IDC-04', new TxIgnoringGuard())
		expect(problems, 'é a violação mais silenciosa: passa todos os outros casos e queima a chave para sempre').not.toEqual([])
		expect(problems.join(' ')).toContain('ignorou o `tx`')
	})

	it('VIO-04: e os violadores passam nos casos que NÃO quebram — são falseadores justos', async () => {
		// Sem isto, um violador quebrado demais provaria "a suíte reprova lixo", não "a suíte reprova
		// ESTA violação". O contrato do falseador é quebrar uma coisa só.
		expect(await problemsFrom('IDC-01', new ScopeBlindGuard()), 'o cego a escopo deduplica corretamente dentro de um escopo').toEqual([])
		expect(await problemsFrom('IDC-01', new TxIgnoringGuard()), 'o que ignora tx deduplica corretamente fora de transação').toEqual([])
	})
})

describe('violator — a suíte de OUTBOX também morde', () => {
	let driver: PGliteDriver

	beforeAll(async () => {
		driver = new PGliteDriver()
		await driver.runMigrations()
	})

	beforeEach(async () => {
		await driver.reset()
	})

	/** A harness do violador: tudo igual à da família pg, menos o despachante. */
	const blindHarness = (): OutboxHarness<PGliteDriver> => ({
		family: 'violator',
		ownSource: OutboxSource.api,
		maxAttempts: 5,
		makeDriver: async () => driver,
		makeGuard: d => new PgIdempotencyGuard(d),
		makeDispatcher: d => new LaneBlindOutboxDispatcher(d),
		seedOutboxRow: async (d, row) => {
			await d.db.insert(outbox).values({
				id: row.id,
				name: row.name,
				source: row.source,
				ownerId: row.ownerId ?? null,
				payload: row.payload ?? {},
				attempts: row.attempts ?? 0,
				leaseUntil: row.leaseUntil ?? null,
				processedAt: row.processedAt ?? null,
				deadAt: row.deadAt ?? null,
			})
		},
		readOutboxRow: async (d, id) => {
			const [found] = await d.db.select().from(outbox).where(eq(outbox.id, id)).limit(1)
			return found === undefined
				? undefined
				: {
						id: found.id,
						source: found.source,
						attempts: found.attempts,
						processedAt: found.processedAt,
						deadAt: found.deadAt,
						lastError: found.lastError,
						claimedBy: found.claimedBy,
					}
		},
	})

	it('VIO-05: um despachante CEGO A LANE é reprovado por OUT-01', async () => {
		const check = OUTBOX_CHECKS['OUT-01: a reivindicação é ESCOPADA À LANE — linha de outro produtor fica INTACTA']
		const problems = (await check?.(driver, blindHarness())) ?? []
		expect(problems, 'sem isto, um despachante roubaria as linhas das outras duas lanes e as descartaria em silêncio').not.toEqual([])
		expect(problems.join(' '), 'e a acusação tem de nomear o que quebrou').toContain('lane')
	})
})
