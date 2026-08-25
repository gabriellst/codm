import { sql } from 'drizzle-orm'
import { LibSqlDatabaseDriver } from '../../db/libsql/LibSqlDatabaseDriver'
import { tryCatchAsync } from '../../utils/TryCatch'
import { HealthCheck, type HealthComponentReport } from './HealthCheck'

/** GATE — `SELECT 1` na conexão de LEITURA do driver (`driver.db`), a mesma que todo BFF usa. */
export class DatabaseHealthCheck extends HealthCheck {
	readonly name = 'db'
	readonly gate = true

	constructor(private readonly driver: LibSqlDatabaseDriver) {
		super()
	}

	async check(): Promise<HealthComponentReport> {
		const outcome = await tryCatchAsync(async () => {
			await this.driver.db.run(sql`SELECT 1`)
		})
		return outcome.success ? { status: 'up', gate: true } : { status: 'down', gate: true, detail: String(outcome.error) }
	}
}
