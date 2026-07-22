import { Transaction } from '../services/UnitOfWork/UnitOfWork'

export abstract class Repository<T> {
	abstract save(entity: T, transaction?: Transaction): Promise<T>
	abstract delete(id: string, transaction?: Transaction): Promise<void>
}
