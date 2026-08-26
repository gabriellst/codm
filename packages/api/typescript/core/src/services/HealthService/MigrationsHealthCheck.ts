import { DatabaseDriver } from '../../db/drivers/DatabaseDriver'
import { tryCatchAsync } from '../../utils/TryCatch'
import { HealthCheck, type HealthComponentReport } from './HealthCheck'

/**
 * GATE — nenhuma migração pendente.
 *
 * É o check que a docblock de `note_ready` (shell Rust) descreve ter faltado: "the shell painted the
 * console the moment the webview existed, while the daemon was still applying migrations".
 *
 * DEPENDE DO TOPO NEUTRO (`DatabaseDriver`), não do nível-meio de uma família — e isso não é
 * generalidade por esporte: ele só chama `readMigrations()`, que é ciclo de vida. Tipar o parâmetro
 * como `LibSqlDatabaseDriver` (como era) tornava um check universal indisponível para qualquer outra
 * família, e a pergunta que ele faz — "o schema está em dia?" — é a MESMA nas duas. Vale ainda mais
 * na família `pg`, onde ninguém aplica migração no boot (ADR 0005): lá este check é a única coisa
 * entre um deployment atrasado e a corrupção silenciosa.
 */
export class MigrationsHealthCheck extends HealthCheck {
	readonly name = 'migrations'
	readonly gate = true

	constructor(private readonly driver: DatabaseDriver) {
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
