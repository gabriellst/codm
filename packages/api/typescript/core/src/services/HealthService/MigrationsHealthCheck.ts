import { DrizzleDatabaseDriver } from '../../db/drivers/DrizzleDatabaseDriver'
import { tryCatchAsync } from '../../utils/TryCatch'
import { HealthCheck, type HealthComponentReport } from './HealthCheck'

/**
 * GATE — nenhuma migração pendente no ledger compartilhado `_sqlite_migrations`.
 *
 * É o check que a docblock de `note_ready` (shell Rust) descreve ter faltado: "the shell painted the
 * console the moment the webview existed, while the daemon was still applying migrations".
 */
export class MigrationsHealthCheck extends HealthCheck {
	readonly name = 'migrations'
	readonly gate = true

	constructor(private readonly driver: DrizzleDatabaseDriver) {
		super()
	}

	async check(): Promise<HealthComponentReport> {
		const outcome = await tryCatchAsync(async () => this.driver.readMigrations())
		if (!outcome.success) return { status: 'down', gate: true, detail: String(outcome.error) }
		const { applied, pending } = outcome.data
		if (pending.length > 0) {
			return { status: 'down', gate: true, detail: `${pending.length} pending: ${pending.join(', ')}` }
		}
		return { status: 'up', gate: true, detail: `${applied.length} applied` }
	}
}
