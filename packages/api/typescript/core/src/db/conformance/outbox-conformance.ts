import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import type { DatabaseDriver } from '../drivers/DatabaseDriver'
import type { OutboxDispatcher } from '../../services/OutboxDispatcher/OutboxDispatcher'
import type { IdempotencyHarness } from './harness'

/**
 * O contrato do DESPACHANTE DE OUTBOX, parametrizado por família.
 *
 * Existe por uma razão concreta e recente: a família `pg` NÃO pode reivindicar como a libsql. No
 * libsql o `SELECT` de linhas devidas roda sem trava porque toda escrita daquele processo passa por
 * um portão FIFO de um titular só — não há dois reivindicadores para disputar a janela entre o
 * `SELECT` e o `UPDATE`. Em Postgres há: réplicas do mesmo serviço, cada uma com o seu poller. Por
 * isso o gêmeo pg usa `FOR UPDATE SKIP LOCKED`.
 *
 * Duas implementações com mecanismos DIFERENTES prometendo a MESMA propriedade é exatamente a
 * situação em que "parece igual" não vale nada. Este arquivo escreve a propriedade uma vez e cobra
 * das duas.
 */

/** Uma linha semeada direto na tabela, sem passar por repositório — o teste controla o estado. */
export interface SeedOutboxRow {
	id: string
	name: string
	source: string
	ownerId?: string | null
	payload?: Record<string, unknown>
	attempts?: number
	leaseUntil?: Date | null
	processedAt?: Date | null
}

/** O que o teste precisa ler de volta. Deliberadamente pobre: só o que as propriedades exigem. */
export interface OutboxRowSnapshot {
	id: string
	source: string
	attempts: number
	processedAt: Date | null
	lastError: string | null
	claimedBy: string | null
}

export interface OutboxHarness<Driver extends DatabaseDriver = DatabaseDriver> extends IdempotencyHarness<Driver> {
	/** A lane que ESTA família reivindica como sua. */
	readonly ownSource: string
	/** O teto de tentativas a partir do qual a varredura de veneno manda a linha para a carta morta. */
	readonly maxAttempts: number

	makeDispatcher(driver: Driver): OutboxDispatcher
	seedOutboxRow(driver: Driver, row: SeedOutboxRow): Promise<void>
	readOutboxRow(driver: Driver, id: string): Promise<OutboxRowSnapshot | undefined>
}

export type OutboxCheck = <Driver extends DatabaseDriver>(driver: Driver, harness: OutboxHarness<Driver>) => Promise<string[]>

const FOREIGN_LANE = 'gateway'

export const OUTBOX_CHECKS: Readonly<Record<string, OutboxCheck>> = {
	/**
	 * A REIVINDICAÇÃO É ESCOPADA À PRÓPRIA LANE.
	 *
	 * `shared_outbox` é dividido por três produtores, e a coluna `source` é o que faz "uma linha tem
	 * no máximo um reivindicador possível" ser propriedade do DADO, e não de quem por acaso registrou
	 * um handler. Sem o predicado, este despachante rouba linhas das outras duas lanes E AS DESCARTA:
	 * o handler não existe deste lado, então a entrega "sucede" vazia e a linha é finalizada. O dono
	 * legítimo nunca a vê.
	 */
	'OUT-01: a reivindicação é ESCOPADA À LANE — linha de outro produtor fica INTACTA': async (driver, harness) => {
		const problems: string[] = []
		await harness.seedOutboxRow(driver, { id: 'foreign-1', name: 'gateway.thing.happened', source: FOREIGN_LANE })

		await harness.makeDispatcher(driver).flush()

		const after = await harness.readOutboxRow(driver, 'foreign-1')
		if (after === undefined) {
			problems.push('a linha de OUTRA lane sumiu — o despachante a reivindicou e a finalizou, e o dono legítimo nunca a verá')
			return problems
		}
		if (after.processedAt !== null)
			problems.push('a linha de OUTRA lane foi FINALIZADA por este despachante — a lane não está sendo respeitada')
		if (after.attempts !== 0)
			problems.push(`a linha de OUTRA lane teve tentativa cobrada (attempts=${after.attempts}) — ela foi reivindicada`)
		if (after.claimedBy !== null) problems.push('a linha de OUTRA lane ficou com `claimed_by` deste despachante')
		return problems
	},

	/**
	 * E O COMPANHEIRO QUE IMPEDE O ANTERIOR DE SER VAZIO.
	 *
	 * Sem este caso, um despachante que NÃO FAZ NADA passaria OUT-01 com louvor. "Deixa as outras
	 * lanes em paz" só significa alguma coisa junto de "e consome a própria".
	 */
	'OUT-02: e consome a PRÓPRIA lane — sem isto, OUT-01 seria satisfeito por não fazer nada': async (driver, harness) => {
		const problems: string[] = []
		// O PAYLOAD PRECISA SER UM ENVELOPE `BaseEvent` DE VERDADE, e isto é invariante de kernel, não
		// detalhe do teste: o despachante recusa `INVALID_OUTBOX_PAYLOAD` para qualquer linha sem
		// `{ id, name, time }`, porque linhas de outbox só deveriam ser escritas por `BaseEvent.toJSON()`
		// e um payload torto é sinal de corrupção ou de insert manual. Semear `{}` fazia este caso falhar
		// acusando o DESPACHANTE, quando o errado era a semente — foi assim que a primeira versão
		// mentiu, e o comentário fica para o próximo que semear uma linha à mão.
		await harness.seedOutboxRow(driver, {
			id: 'mine-1',
			name: 'api.thing.happened',
			source: harness.ownSource,
			payload: { id: 'mine-1', name: 'api.thing.happened', time: new Date().toISOString(), payload: {} },
		})

		await harness.makeDispatcher(driver).flush()

		const after = await harness.readOutboxRow(driver, 'mine-1')
		if (after === undefined) return problems // finalizar apagando é aceitável em famílias que deletam
		if (after.processedAt === null) problems.push('a linha da PRÓPRIA lane não foi processada — o despachante não está consumindo nada')
		if (after.attempts < 1)
			problems.push('a tentativa não foi cobrada NA REIVINDICAÇÃO — um crash duro reivindicaria de novo em attempts=0, para sempre')
		return problems
	},

	/**
	 * VENENO VAI PARA A CARTA MORTA, E NÃO PARA O LIXO.
	 *
	 * Uma linha que queimou o orçamento morrendo o processo não é reivindicável (teto atingido) nem
	 * terminal (nunca finalizada) — ficaria ali, invisível, para sempre. A varredura a finaliza com
	 * `last_error`. **Finaliza, não DELETA**: um evento apagado é um fato que ninguém consegue
	 * auditar depois, e o dono do incidente precisa saber o que morreu.
	 */
	'OUT-03: linha ENVENENADA é finalizada com erro registrado — e NÃO é deletada': async (driver, harness) => {
		const problems: string[] = []
		await harness.seedOutboxRow(driver, {
			id: 'poison-1',
			name: 'api.thing.happened',
			source: harness.ownSource,
			attempts: harness.maxAttempts,
			leaseUntil: new Date(Date.now() - 60_000),
		})

		await harness.makeDispatcher(driver).flush()

		const after = await harness.readOutboxRow(driver, 'poison-1')
		if (after === undefined) {
			problems.push('a linha envenenada foi DELETADA — o incidente ficou sem evidência, e ninguém consegue auditar o que morreu')
			return problems
		}
		if (after.processedAt === null)
			problems.push('a linha envenenada não foi finalizada — fica invisível para sempre, nem reivindicável nem terminal')
		if (after.lastError === null || !after.lastError.includes('poison')) {
			problems.push(`a linha envenenada não registrou POR QUE morreu (last_error=${String(after.lastError)})`)
		}
		return problems
	},
}

/** Registra a árvore inteira de conformidade de outbox contra a harness de UMA família. */
export function describeOutboxConformance<Driver extends DatabaseDriver>(harness: OutboxHarness<Driver>): void {
	describe(`conformidade de outbox — ${harness.family}`, () => {
		let driver: Driver

		beforeAll(async () => {
			driver = await harness.makeDriver()
		})

		beforeEach(async () => {
			await driver.reset()
		})

		for (const [name, check] of Object.entries(OUTBOX_CHECKS)) {
			it(name, async () => {
				expect(await check(driver, harness), `família '${harness.family}' não cumpre o contrato de outbox`).toEqual([])
			})
		}
	})
}
