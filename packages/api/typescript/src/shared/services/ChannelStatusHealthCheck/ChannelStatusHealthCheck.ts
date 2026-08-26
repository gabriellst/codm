import { injectable } from 'tsyringe-neo'
import { desc } from 'drizzle-orm'
import { type LibSqlTransaction, HealthCheck, type HealthComponentReport, tryCatchAsync } from '@codm/core-typescript'
import { channels } from '@codm/contracts/db'

/**
 * DIAGNÓSTICO — nunca gate. O WhatsApp conecta PELO app (QR na mão do operador), então "canal
 * desconectado" é o estado normal de um boot limpo, não uma falha de boot. `gate = false` e
 * `status` FIXO em `'up'` são a expressão mais forte disso: nem uma leitura que falha derruba o
 * endpoint, ela só vira `detail`.
 *
 * Lê a tabela de read-model `gateway_channels` (escrita só pelos projetores do gateway Go) pela
 * conexão de leitura, como `LibSqlChannelConnectivity` já faz — sem ownerId, porque `/health` é
 * público e o dado é status de processo, não conteúdo de tenant.
 */
@injectable()
export class ChannelStatusHealthCheck extends HealthCheck {
	readonly name = 'channel'
	readonly gate = false

	constructor(private readonly db: LibSqlTransaction) {
		super()
	}

	async check(): Promise<HealthComponentReport> {
		const outcome = await tryCatchAsync(async () => {
			const rows = await this.db.select({ status: channels.status }).from(channels).orderBy(desc(channels.updatedAt)).limit(1)
			return rows[0]?.status ?? 'NONE'
		})
		return {
			status: 'up',
			gate: false,
			detail: outcome.success ? String(outcome.data) : `unreadable: ${String(outcome.error)}`,
		}
	}
}
