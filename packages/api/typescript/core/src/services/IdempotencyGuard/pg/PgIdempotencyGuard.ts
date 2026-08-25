import { injectable } from 'tsyringe-neo'
import { and, eq } from 'drizzle-orm'
import { idempotencyKeys } from '@codm/contracts/db/pg'
import { PgDatabaseDriver } from '../../../db/pg/PgDatabaseDriver'
import type { PgTransaction } from '../../../db/pg/PgDatabaseDriver'
import type { PgDrizzleClient } from '../../../db/pg/client'
import type { Transaction } from '../../UnitOfWork/UnitOfWork'
import { IdempotencyGuard } from '../IdempotencyGuard'

/**
 * O executor de query: a transação ambiente quando enfiada, senão o cliente base. `Transaction` é
 * `unknown` na camada de UnitOfWork de propósito; este é o único ponto que estreita.
 *
 * O retorno é UNIÃO, e não `PgDrizzleClient`, porque os dois ramos são coisas diferentes: o
 * `PgTransaction` do drizzle estende `PgDatabase` com `rollback()`, então o cliente base NÃO é um
 * deles. A forma anterior devolvia `PgDrizzleClient` e chegava lá por `as` — compilava e rodava
 * (ambos servem `.insert`/`.delete`), mas dizia "client de LEITURA" para um handle de escrita, que é
 * a mesma classe de mentira que o `saveWithOptimisticLock` do repo irmão ainda carrega.
 *
 * O gêmeo libsql pode devolver um tipo só porque lá `LibSqlTransaction` é ALIAS da mesma forma do
 * cliente — não um subtipo com membro a mais. A assimetria é do drizzle, não do desenho.
 */
function txClient(tx: Transaction | undefined, db: PgDrizzleClient): PgTransaction | PgDrizzleClient {
	return (tx as PgTransaction | undefined) ?? db
}

/**
 * A trava de reivindicação da família `pg`, sobre `shared_idempotency_keys` do tronco cloud.
 *
 * Gêmeo do `LibSqlIdempotencyGuard` (família libsql), e a semelhança é o ponto: as duas famílias
 * implementam a MESMA porta e passam a MESMA suíte de conformidade. O que difere é o driver
 * injetado e o tronco de onde a tabela vem — nada de comportamento.
 *
 * NOTA DE FORMA DE MÓDULO. O gêmeo deste arquivo no repo irmão fala `shared.idempotency_keys` em SQL
 * cru: lá o schema usa `pgSchema('shared')` (namespace do Postgres), e aqui o tronco cloud é PLANO
 * (`pgTable('shared_idempotency_keys')`, prefixo no nome). Copiar aquele arquivo compilaria — SQL cru
 * é string — e morreria em runtime com *relation "shared.idempotency_keys" does not exist*. Por isso
 * este porte parte do gêmeo LIBSQL DESTE repo, que já fala as tabelas certas, e não do pg de lá.
 *
 * A reivindicação insere só `{ scope, key }`: as demais colunas (`response_body`/`response_status`,
 * `expires_at`) pertencem a um cache de idempotência HTTP futuro e ficam NULL numa trava de
 * exatamente-uma-vez pura.
 */
@injectable()
export class PgIdempotencyGuard extends IdempotencyGuard {
	constructor(private driver: PgDatabaseDriver) {
		super()
	}

	async claim(scope: string, key: string, tx?: Transaction): Promise<boolean> {
		const dbClient = txClient(tx, this.driver.db)
		const rows = await dbClient.insert(idempotencyKeys).values({ scope, key }).onConflictDoNothing().returning({ key: idempotencyKeys.key })
		return rows.length === 1
	}

	/**
	 * Chamadores pós-commit (um efeito externo falhou depois de a tx1 comitar) omitem `tx` → roda
	 * contra o pool. Chamadores dentro de transação (um handler soltando uma trava que reivindicou na
	 * MESMA tx, para não persistir além do commit) passam `tx`.
	 */
	async release(scope: string, key: string, tx?: Transaction): Promise<void> {
		const dbClient = txClient(tx, this.driver.db)
		await dbClient.delete(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)))
	}
}
