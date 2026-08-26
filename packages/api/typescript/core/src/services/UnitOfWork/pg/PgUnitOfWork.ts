import { injectable } from 'tsyringe-neo'
import { UnitOfWork, UnitOfWorkFactory } from '../UnitOfWork'
import { PgDrizzleClient } from '../../../db/pg/client'
import type { PgTransaction } from '../../../db/pg/PgDatabaseDriver'

/**
 * Unidade de trabalho da família `pg`.
 *
 * TOMA O CLIENTE, não o driver — e a assimetria com a gêmea libsql é o ponto, não um descuido. A
 * libsql precisa do DRIVER porque não pode pedir transação ao cliente: medido no
 * `@libsql/client@0.17.4`, esse caminho entrega a conexão nativa ao objeto de transação e nunca a
 * retoma (500 transações → 1002 descritores) e ainda perde as pragmas aplicadas na abertura. Por
 * isso lá o driver dirige `BEGIN IMMEDIATE` à mão e a unidade de trabalho fala com ele.
 *
 * No Postgres esse defeito não existe: `transaction()` é o caminho suportado. Passar o driver aqui
 * seria carregar uma indireção que só a outra família precisa — e é justamente o tipo de simetria
 * decorativa que faz uma abstração parecer necessária quando não é.
 */
@injectable()
export class PgUnitOfWork extends UnitOfWork<PgTransaction> {
	constructor(private db: PgDrizzleClient) {
		super()
	}

	async transaction<Return>(fn: (tx: PgTransaction) => Promise<Return>): Promise<Return> {
		return this.db.transaction(tx => fn(tx))
	}
}

@injectable()
export class PgUnitOfWorkFactory extends UnitOfWorkFactory {
	constructor(private db: PgDrizzleClient) {
		super()
	}

	create(): UnitOfWork<PgTransaction> {
		return new PgUnitOfWork(this.db)
	}
}
