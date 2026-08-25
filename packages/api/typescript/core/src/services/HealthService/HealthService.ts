import { tryCatchAsync } from '../../utils/TryCatch'
import type { HealthCheck, HealthComponentReport, HealthReport } from './HealthCheck'

/**
 * Agrega os `HealthCheck` registrados num único veredito + um componente por check.
 *
 * Não é `@injectable()`: o composition root o binda por `useFactory` porque a lista de checks vem de
 * `resolveAll` (multi-inject), que não é expressável por injeção-por-tipo. Ver `shared/registry.ts`.
 *
 * ── RECEBE UMA FUNÇÃO, NÃO UMA LISTA ─────────────────────────────────────────────────────────────
 * A lista de checks é montada por `resolveAll` sobre um container que AINDA ESTÁ SENDO PREENCHIDO:
 * o `HealthController` nasce quando o router do contexto RAIZ registra controllers, e os outros
 * contextos só registram os seus checks depois, ao montarem. Uma lista capturada ali é o retrato de
 * um container pela metade.
 *
 * Medido em 2026-08-15: com a raiz deixando de carregar o merge de todos os registries (que era o
 * que, por acidente, fazia tudo já estar registrado a tempo), o `mailboxDispatcher` sumiu do
 * relatório — o dispatcher rodava, o operador não tinha como saber. Trocar um alarme falso por um
 * ponto cego não é conserto.
 *
 * Resolver na hora do `report()` faz o endpoint descrever os checks que EXISTEM, e não os que
 * existiam quando alguém construiu o controller.
 */
export class HealthService {
	constructor(private readonly resolveChecks: () => readonly HealthCheck[]) {}

	async report(): Promise<HealthReport> {
		const entries = await Promise.all(
			this.resolveChecks().map(async check => {
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
