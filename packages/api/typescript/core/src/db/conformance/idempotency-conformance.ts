import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import type { DatabaseDriver } from '../drivers/DatabaseDriver'
import type { IdempotencyGuard } from '../../services/IdempotencyGuard/IdempotencyGuard'
import type { IdempotencyHarness } from './harness'

/**
 * O contrato da trava de idempotência, PARAMETRIZADO por família.
 *
 * Escrito uma vez, rodado contra toda família admitida. Um caso que passa aqui passa nas duas
 * famílias ou a família não entra — que é a definição operacional de "conformada", e a razão de este
 * arquivo existir em vez de dois testes parecidos em pastas diferentes, que divergiriam no primeiro
 * conserto feito de um lado só.
 *
 * ── por que um caso DEVOLVE PROBLEMAS em vez de asserir ──────────────────────────────────────────
 * Duas razões, e a segunda é a que importa.
 *
 * A primeira é mecânica: uma asserção fora de um `it()` não roda, e o `biome` reprova por isso
 * (`noMisplacedAssertion`). A regra está certa — a primeira versão deste arquivo tinha `expect()`
 * dentro dos casos e foi ela que pegou.
 *
 * A segunda é o desenho. Uma suíte que só roda contra implementações corretas é indistinguível de
 * uma suíte VAZIA: as duas ficam verdes. A única prova de que esta morde é rodá-la contra algo
 * sabidamente quebrado — e um caso que devolve a LISTA DO QUE ESTÁ ERRADO deixa o falseador afirmar
 * não só *que* reprovou, mas *o quê*. É a mesma forma de `diffLogical` em
 * `tests/architecture/trunk-parity.test.ts`.
 */

// Vocabulário de produto está fora de escopo: dois escopos distintos quaisquer é tudo que o
// primitivo conhece. O KERNEL é dono do mecanismo; um PRODUTO é dono do vocabulário
// (`IdempotencyScope`), que alarga para `string` nesta fronteira.
const WEBHOOK = 'WEBHOOK_RECEIVED'
const COMMAND = 'COMMAND_EFFECT'

/** Um caso de conformidade: roda contra o par (driver, guard) e devolve o que estiver errado. */
export type IdempotencyCheck = (driver: DatabaseDriver, guard: IdempotencyGuard) => Promise<string[]>

export const IDEMPOTENCY_CHECKS: Readonly<Record<string, IdempotencyCheck>> = {
	'IDC-01: reivindica um (escopo, chave) UMA vez — a primeira ganha, a segunda perde': async (_driver, guard) => {
		const problems: string[] = []
		if ((await guard.claim(WEBHOOK, 'evt-1')) !== true) problems.push('a primeira reivindicação sobre um par novo tem de GANHAR, e perdeu')
		if ((await guard.claim(WEBHOOK, 'evt-1')) !== false)
			problems.push('a segunda reivindicação sobre o MESMO par tem de PERDER, e ganhou — não há exatamente-uma-vez')
		return problems
	},

	'IDC-02: isola por ESCOPO — a mesma chave sob outro escopo é reivindicação nova': async (_driver, guard) => {
		const problems: string[] = []
		if ((await guard.claim(WEBHOOK, 'evt-1')) !== true) problems.push('a reivindicação sob WEBHOOK tem de ganhar, e perdeu')
		if ((await guard.claim(COMMAND, 'evt-1')) !== true)
			problems.push('a MESMA chave sob escopo DIFERENTE é livre, e foi recusada — o guard está cego a escopo')
		return problems
	},

	'IDC-03: soltar a trava a torna reivindicável de novo': async (_driver, guard) => {
		const problems: string[] = []
		if ((await guard.claim(WEBHOOK, 'evt-2')) !== true) problems.push('a reivindicação inicial tem de ganhar, e perdeu')
		await guard.release(WEBHOOK, 'evt-2')
		if ((await guard.claim(WEBHOOK, 'evt-2')) !== true) {
			problems.push('depois de soltar, o par tem de estar livre — sem isto um efeito externo que falhou queima a chave para sempre')
		}
		return problems
	},

	/**
	 * A TRAVA MORRE COM O ROLLBACK — o caso que torna o parâmetro `tx` de `claim(scope, key, tx)`
	 * significativo em vez de decorativo.
	 *
	 * É o que faz o padrão reivindica→comita→efeito ser seguro: um handler que trava no meio de uma
	 * transação e depois vê o RESTO dela falhar tem de encontrar o par livre na redelivery, não
	 * queimado por uma escrita que ninguém guardou.
	 */
	'IDC-04: uma trava dentro de transação REVERTIDA não sobrevive a ela': async (driver, guard) => {
		const problems: string[] = []
		const key = 'cmd-rollback:1'
		let claimedInsideTx: boolean | undefined

		await driver.unitOfWorkFactory
			.create()
			.transaction(async tx => {
				claimedInsideTx = await guard.claim(COMMAND, key, tx)
				throw new Error('o resto da unidade de trabalho falhou — reverta tudo')
			})
			.catch(() => undefined) // o rollback É o comportamento sob teste; o reject é esperado

		if (claimedInsideTx !== true) problems.push('a reivindicação em si tem de dar certo DENTRO da transação, e não deu')
		if ((await guard.claim(COMMAND, key)) !== true) {
			problems.push('uma trava cuja transação REVERTEU não pode persistir — este guard ignorou o `tx` e escreveu fora dele')
		}
		return problems
	},
}

/** Registra a árvore inteira de conformidade de idempotência contra a harness de UMA família. */
export function describeIdempotencyConformance<Driver extends DatabaseDriver>(harness: IdempotencyHarness<Driver>): void {
	describe(`conformidade de idempotência — ${harness.family}`, () => {
		let driver: Driver

		beforeAll(async () => {
			driver = await harness.makeDriver()
		})

		beforeEach(async () => {
			await driver.reset()
		})

		for (const [name, check] of Object.entries(IDEMPOTENCY_CHECKS)) {
			it(name, async () => {
				expect(await check(driver, harness.makeGuard(driver)), `família '${harness.family}' não cumpre o contrato`).toEqual([])
			})
		}
	})
}
