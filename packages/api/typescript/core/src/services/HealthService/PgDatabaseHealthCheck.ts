import { sql } from 'drizzle-orm'
import { PgDatabaseDriver } from '../../db/pg/PgDatabaseDriver'
import { tryCatchAsync } from '../../utils/TryCatch'
import { HealthCheck, type HealthComponentReport } from './HealthCheck'

/**
 * O ping da família `pg` — gêmeo do `DatabaseHealthCheck`, que é da família libsql.
 *
 * Ele existe separado por um motivo mecânico e um estrutural.
 *
 * O mecânico: o gêmeo chama `this.driver.db.run(sql\`SELECT 1\`)`, e `.run` é API do cliente libsql.
 * O cliente pg expõe `.execute`. Um único check tipado no topo neutro não resolveria, porque o topo
 * deliberadamente NÃO expõe `.db` (ADR 0006) — e é justamente essa ausência que dispensa o genérico.
 *
 * O estrutural: um "ping" é a pergunta mais family-specific que existe. O que conta como "o banco
 * responde" depende do dialeto, e fingir o contrário produziria um check que passa sem ter falado
 * com banco nenhum — que é a forma mais barata de um health check mentir.
 */
export class PgDatabaseHealthCheck extends HealthCheck {
	readonly name = 'database'
	readonly gate = true

	constructor(private readonly driver: PgDatabaseDriver) {
		super()
	}

	async check(): Promise<HealthComponentReport> {
		const outcome = await tryCatchAsync(async () => this.driver.db.execute(sql`SELECT 1`))
		return outcome.success ? { status: 'up', gate: true } : { status: 'down', gate: true, detail: String(outcome.error) }
	}
}
