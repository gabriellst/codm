import { UnitOfWork, UnitOfWorkFactory } from '../UnitOfWork'
import { LibSqlDatabaseDriver, type LibSqlTransaction } from '../../../db/libsql/LibSqlDatabaseDriver'
import { injectable } from 'tsyringe-neo'

/**
 * `LibSqlTransaction` — o handle de ESCRITA — mora no nível-meio da família
 * (`db/libsql/LibSqlDatabaseDriver.ts`), não aqui.
 *
 * Ele era declarado neste arquivo enquanto o driver era um nível só. Com a hierarquia de três
 * níveis (ADR 0006) o dono passa a ser quem declara o método que o entrega: é a assinatura de
 * `LibSqlDatabaseDriver.transaction()` que define o que o callback recebe, e uma unidade de trabalho
 * é CONSUMIDORA dessa costura, não a fonte dela. Duas declarações do mesmo alias em módulos
 * diferentes é a segunda cópia que envelhece — e o `tsc` a pegou, como ambiguidade de barril.
 */

/**
 * Unit of work over the driver's write seam.
 *
 * WHY IT TAKES THE DRIVER AND NOT A CLIENT. The obvious implementation — asking the injected
 * drizzle client to open a transaction for us — is BANNED repo-wide. Measured on the shipped
 * `@libsql/client@0.17.4` (`.plans/artifacts/2026-07-26-tx-concurrency-gate.md`): that path hands
 * its native connection to the transaction object and never takes it back, so 500 transactions
 * leave 1002 open file descriptors against a baseline of 4 — linear, no plateau, the GC does not
 * collect it. Worse and quieter: because the client silently opens a REPLACEMENT connection, the
 * pragmas we applied at open are gone — `busy_timeout` measured back at 0 (from 5000) and
 * `foreign_keys` back at 1 (from 0), with no error anywhere. The same measurement on the manual
 * `BEGIN IMMEDIATE` path gives 4 descriptors after 500 transactions and the pragmas intact.
 *
 * Hence: the driver owns the write connection and the BEGIN/COMMIT/ROLLBACK strings, and this
 * class is a thin adapter onto it. The driver's injected `.db` is the READ handle — the unit of
 * work must never write through it.
 */
@injectable()
export class LibSqlUnitOfWork extends UnitOfWork<LibSqlTransaction> {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	async transaction<Return>(fn: (tx: LibSqlTransaction) => Promise<Return>): Promise<Return> {
		return this.driver.transaction(fn)
	}
}

@injectable()
export class LibSqlUnitOfWorkFactory extends UnitOfWorkFactory {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	create(): UnitOfWork<LibSqlTransaction> {
		return new LibSqlUnitOfWork(this.driver)
	}
}
