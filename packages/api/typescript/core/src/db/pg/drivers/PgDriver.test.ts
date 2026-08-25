import { describe, expect, it } from 'bun:test'
import { BaseError } from '../../../types/BaseError'
import type { MigrationStatus } from '../../drivers/DatabaseDriver'
import { PgDriver } from './PgDriver'
import { splitByLedger } from './utils'

/**
 * A TESTEMUNHA do corolário do ADR 0005 — *"'manual' descreve quem APLICA, nunca quem VERIFICA"*.
 *
 * A família `pg` não aplica migração no boot: isso é passo de deploy. O que o boot faz é CONFERIR e
 * RECUSAR. Um conferidor que só é exercitado contra bancos em dia é um conferidor que ninguém provou
 * que recusa — e recusar é a única coisa que ele existe para fazer. Este arquivo prova as duas
 * metades: a decisão pura (`splitByLedger`) e a recusa (`runMigrations`).
 *
 * O molde que isto substitui, no repo irmão, lançava `NOT_IMPLEMENTED` nos dois métodos — promete
 * aplicar, não aplica, e só falha se alguém chamar.
 */
describe('PgDriver — confere e recusa (ADR 0005)', () => {
	const journal = [
		{ tag: '0000_strong_moonstone', when: 1000 },
		{ tag: '0001_next', when: 2000 },
	]

	describe('splitByLedger — a decisão', () => {
		it('MIG-01: banco em dia → nada pendente', () => {
			expect(splitByLedger(journal, new Set([1000, 2000]))).toEqual({ applied: ['0000_strong_moonstone', '0001_next'], pending: [] })
		})

		it('MIG-02: banco ATRASADO → a que falta aparece em `pending`, NOMEADA', () => {
			const status = splitByLedger(journal, new Set([1000]))
			expect(status.applied).toEqual(['0000_strong_moonstone'])
			expect(status.pending, 'sem o nome, o operador não sabe o que rodar').toEqual(['0001_next'])
		})

		it('MIG-03: ledger AUSENTE não é "zero aplicadas benignas" — é tudo pendente', () => {
			// O caso mais comum de "esqueci o passo de deploy" é subir contra um Postgres vazio. Se este
			// caso caísse em `applied: []` + `pending: []`, o driver subiria feliz sobre um banco SEM
			// TABELA NENHUMA, que é o pior desfecho possível para um gate que existe para evitar isso.
			expect(splitByLedger(journal, new Set())).toEqual({ applied: [], pending: ['0000_strong_moonstone', '0001_next'] })
		})

		it('MIG-04: journal vazio → vazio dos dois lados, sem inventar pendência', () => {
			expect(splitByLedger([], new Set([1000]))).toEqual({ applied: [], pending: [] })
		})
	})

	describe('runMigrations — a recusa', () => {
		/**
		 * Uma subclasse que troca APENAS a leitura do banco. É a costura honesta: o que está sob teste é
		 * a decisão de recusar dado um status, e essa decisão não depende de haver um Postgres de pé.
		 * Levantar um banco real aqui mediria o `pg`, não esta regra.
		 */
		class DriverWithStatus extends PgDriver {
			constructor(private readonly status: MigrationStatus) {
				super({ connectionString: 'postgres://witness/unused' })
			}
			override async readMigrations(): Promise<MigrationStatus> {
				return this.status
			}
		}

		it('MIG-05: schema ATRASADO → RECUSA, com código nomeado e a migração no texto', async () => {
			const driver = new DriverWithStatus({ applied: ['0000_strong_moonstone'], pending: ['0001_next'] })

			let raised: unknown
			try {
				await driver.runMigrations()
			} catch (error) {
				raised = error
			} finally {
				await driver.close().catch(() => {})
			}

			expect(raised, 'subir sobre schema atrasado troca um erro de deploy por corrupção silenciosa').toBeInstanceOf(BaseError)
			// `BaseError` guarda o código em `name` — é uma `Error`.
			expect((raised as BaseError).name).toBe('MIGRATIONS_PENDING')
			expect((raised as BaseError).message, 'o operador precisa saber O QUE falta, não só que falta').toContain('0001_next')
			expect((raised as BaseError).message, 'e precisa saber o que FAZER').toContain('migrate:deploy:cloud')
		})

		it('MIG-06: schema em dia → passa, e NÃO aplica nada', async () => {
			const driver = new DriverWithStatus({ applied: ['0000_strong_moonstone'], pending: [] })
			try {
				// Se este método aplicasse migração, precisaria de um banco de pé e este teste explodiria
				// na conexão. Ele passar é a prova de que `runMigrations` na família pg é só leitura.
				await expect(driver.runMigrations()).resolves.toBeUndefined()
			} finally {
				await driver.close().catch(() => {})
			}
		})
	})

	it('MIG-07: sem `CLOUD_DATABASE_URL` o driver não nasce — nada de banco default', () => {
		// Um fallback do tipo `postgres://localhost/<project>` apontaria para QUALQUER banco que exista na
		// máquina de quem subiu. É a forma mais barata de escrever no banco errado.
		expect(() => new PgDriver({ connectionString: '' })).toThrow(BaseError)
	})
})
