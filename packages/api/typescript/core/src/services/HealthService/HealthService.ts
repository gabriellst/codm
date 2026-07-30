import { tryCatchAsync } from '../../utils/TryCatch'
import type { HealthCheck, HealthComponentReport, HealthReport } from './HealthCheck'

/**
 * Agrega os `HealthCheck` registrados num único veredito + um componente por check.
 *
 * Não é `@injectable()`: o composition root o binda por `useFactory` porque a lista de checks vem de
 * `resolveAll` (multi-inject), que não é expressável por injeção-por-tipo. Ver `shared/registry.ts`.
 */
export class HealthService {
	constructor(private readonly checks: readonly HealthCheck[]) {}

	async report(): Promise<HealthReport> {
		const entries = await Promise.all(
			this.checks.map(async check => {
				// Um check que LANÇA é um componente down, nunca um 500 no endpoint de health: o
				// operador precisa saber QUAL componente quebrou, e um stack trace no lugar do payload
				// é a pior resposta possível para "por que o app não abre".
				const outcome = await tryCatchAsync(async () => check.check())
				const component: HealthComponentReport = outcome.success
					? outcome.data
					: { status: 'down', gate: check.gate, detail: String(outcome.error) }
				return [check.name, component] as const
			}),
		)
		const components = Object.fromEntries(entries)
		const ready = entries.every(([, component]) => !component.gate || component.status === 'up')
		return { ready, components }
	}
}
