import { UnitOfWork, UnitOfWorkFactory } from './UnitOfWork'
import { DrizzleClient } from '../../db/client'
import { injectable } from 'tsyringe-neo'

export type DrizzleTransaction = Parameters<Parameters<DrizzleClient['transaction']>[0]>[0]

@injectable()
export class DrizzleUnitOfWork extends UnitOfWork<DrizzleTransaction> {
	constructor(private db: DrizzleClient) {
		super()
	}

	async transaction<Return>(fn: (tx: DrizzleTransaction) => Promise<Return>): Promise<Return> {
		return this.db.transaction(async tx => {
			return fn(tx)
		})
	}
}

@injectable()
export class DrizzleUnitOfWorkFactory extends UnitOfWorkFactory {
	constructor(private db: DrizzleClient) {
		super()
	}

	create(): UnitOfWork<DrizzleTransaction> {
		return new DrizzleUnitOfWork(this.db)
	}
}
