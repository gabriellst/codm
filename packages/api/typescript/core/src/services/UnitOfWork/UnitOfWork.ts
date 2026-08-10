export type Transaction = unknown

export abstract class UnitOfWork<T = Transaction> {
	abstract transaction<Return>(fn: (tx: T) => Promise<Return>): Promise<Return>
}
