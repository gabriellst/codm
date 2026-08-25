export type Transaction = unknown

/**
 * A fábrica de unidade de trabalho, VENDOR-NEUTRA — não nomeia ORM nem dialeto.
 *
 * Existe para que o topo da hierarquia de drivers (`db/drivers/DatabaseDriver.ts`) possa expor uma
 * `unitOfWorkFactory` sem nomear família. Antes desta classe, o topo declarava
 * `DrizzleUnitOfWorkFactory` — um CONCRETO da família libsql — e era por isso que nenhum driver de
 * outra família conseguia estendê-lo (ADR 0006).
 */
export abstract class UnitOfWorkFactory {
	abstract create(): UnitOfWork
}

export abstract class UnitOfWork<T = Transaction> {
	abstract transaction<Return>(fn: (tx: T) => Promise<Return>): Promise<Return>
}
