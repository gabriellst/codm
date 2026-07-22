export type Transaction = unknown

export abstract class UnitOfWorkFactory {
	abstract create(): UnitOfWork
}

export abstract class UnitOfWork<T = Transaction> {
	abstract transaction<Return>(fn: (tx: T) => Promise<Return>): Promise<Return>
}
