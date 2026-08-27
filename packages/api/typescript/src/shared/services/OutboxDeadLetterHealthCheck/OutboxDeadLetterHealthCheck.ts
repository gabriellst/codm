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
			const [row] = await this.db.select({ n: count() }).from(outbox).where(isNotNull(outbox.deadAt))
			return row?.n ?? 0
		})
		return {
			status: 'up',
			gate: false,
			detail: outcome.success ? String(outcome.data) : `unreadable: ${String(outcome.error)}`,
		}
	}
}
