import { DatabaseDriver } from '../drivers/DatabaseDriver'
import type { PgDrizzleClient } from './client'

/**
 * O handle de ESCRITA da família `pg`: o `tx` que o `transaction()` nativo do drizzle entrega ao
 * callback. DERIVADO da assinatura do cliente, e não redigitado — se o drizzle mudar a forma, o
 * `tsc` acusa aqui em vez de deixar as duas versões divergirem.
 *
 * Mora no NÍVEL-MEIO, ao lado do handle de leitura que ele acompanha, exatamente como o
 * `LibSqlTransaction` mora em `libsql/LibSqlDatabaseDriver.ts`. Viveu em
 * `services/UnitOfWork/pg/PgUnitOfWork.ts` até 2026-08-15, e isso obrigava quem estivesse ABAIXO de
 * `services/` a subir para pegar um tipo de banco: `db/pg/saveWithOptimisticLock.ts`,
 * `repositories/pg/PgDomainEventRepository.ts` e `services/CommandQueue/PgCommandQueue.ts` todos
 * importavam de lá. A família libsql nunca teve esse desvio — os oito consumidores dela sempre
 * pegaram o tipo do nível-meio.
 */
export type PgTransaction = Parameters<Parameters<PgDrizzleClient['transaction']>[0]>[0]

/**
 * `PgDatabaseDriver` — o MEIO da família `pg` (ADR 0006), irmão de `libsql/LibSqlDatabaseDriver.ts`.
 *
 * A especialização que PINA o cliente de query em `PgDrizzleClient`. Quem toca `.db` injeta este
 * nível; quem só precisa de ciclo de vida injeta o topo `DatabaseDriver` e nunca vê cliente algum.
 *
 * O TIPO da transação mora aqui (acima) por simetria com a gêmea; o MÉTODO `transaction()`,
 * deliberadamente, não. O gêmeo libsql declara o método porque pedir transação ao cliente dele vaza
 * descritor e reverte pragmas (medido). Aqui não há esse defeito, então não há costura a declarar —
 * a família pg usa o `transaction()` nativo do drizzle. Acrescentar um método abstrato "por
 * simetria" seria cerimônia: uma abstração existe para tapar um buraco medido. Um alias de tipo não
 * é abstração — é o nome do que o drizzle já devolve.
 */
export abstract class PgDatabaseDriver extends DatabaseDriver {
	abstract readonly db: PgDrizzleClient
}
