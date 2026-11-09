import { injectable } from 'tsyringe-neo'
import { count, isNotNull } from 'drizzle-orm'
import { type LibSqlTransaction, HealthCheck, type HealthComponentReport, tryCatchAsync } from '@codm/core-typescript'
import { outbox } from '@codm/contracts/db'

/**
 * DIAGNÓSTICO — nunca gate. `shared_outbox.dead_at` (Task T1) já dá à arqueologia um lugar para
 * consultar; este check dá à pergunta "há falhas silenciosas?" um lugar DECLARADO, verificado a
 * cada `/health`, em vez de depender de alguém lembrar de rodar a query manualmente.
 *
 * `gate = false` e `status` FIXO em `'up'` seguem o mesmo precedente de `ChannelStatusHealthCheck`:
 * um evento morto é informação de operação, não motivo para reprovar o boot nem derrubar o
 * endpoint. Uma leitura que falha vira `detail`, não queda.
 *
 * ### O custo da pergunta (2026-11-09)
 * A supervisão do shell chama `/health` a cada 5s, e o driver libsql do daemon é SÍNCRONO: enquanto
 * esta contagem roda, o event loop inteiro espera. Sem índice ela era um full scan da outbox (~278k
 * linhas de tombstones) — 1s de mediana, 23s de pico, ~31% de uma noite com o daemon surdo, e 5–13s
 * colados um no outro com a máquina em swap. O índice parcial `outbox_dead_at_idx` (migração 0031)
 * reduz a contagem às cartas mortas; `deadLetterCountQuery` existe para que o teste fixe o PLANO
 * desta query exata, não só a existência do índice.
 */
@injectable()
export class OutboxDeadLetterHealthCheck extends HealthCheck {
	readonly name = 'outboxDeadLetters'
	readonly gate = false

	constructor(private readonly db: LibSqlTransaction) {
		super()
	}

	async check(): Promise<HealthComponentReport> {
		const outcome = await tryCatchAsync(async () => {
			const [row] = await deadLetterCountQuery(this.db)
			return row?.n ?? 0
		})
		return {
			status: 'up',
			gate: false,
			detail: outcome.success ? String(outcome.data) : `unreadable: ${String(outcome.error)}`,
		}
	}
}

/** The one dead-letter count this check runs — exported so its query plan can be pinned in a test. */
export function deadLetterCountQuery(db: LibSqlTransaction) {
	return db.select({ n: count() }).from(outbox).where(isNotNull(outbox.deadAt))
}
