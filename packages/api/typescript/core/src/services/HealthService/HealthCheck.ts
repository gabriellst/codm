import type { DependencyContainer } from 'tsyringe-neo'

/**
 * READINESS DE BOOT, componente a componente — o cidadão de framework que faltava ao lado de
 * `Controller`, `Middleware` e `OutboxDispatcher`.
 *
 * A pergunta que um `HealthCheck` responde NÃO é "esse serviço funciona", é "esse processo terminou
 * de subir". Quem consome é o supervisor da shell (que decide revelar a janela) e, no futuro, um
 * painel de diagnóstico — os dois querem o MESMO shape por componente.
 */
export type HealthStatus = 'up' | 'down'

export interface HealthComponentReport {
	status: HealthStatus
	/** Reprovar aqui reprova a prontidão do processo. `false` = diagnóstico puro. */
	gate: boolean
	/** Texto curto para humano: contagem de migrações pendentes, status do canal, mensagem de erro. */
	detail?: string
}

export interface HealthReport {
	ready: boolean
	components: Record<string, HealthComponentReport>
}

export abstract class HealthCheck {
	/** Chave do componente no payload (`db`, `migrations`, `outboxDispatcher`, …). */
	abstract readonly name: string
	/**
	 * GATE (`true`) reprova a prontidão; DIAGNÓSTICO (`false`) nunca reprova, aconteça o que
	 * acontecer com o `status`. A distinção é declarada aqui e não no agregador porque quem sabe se
	 * um componente é precondição de boot é o dono do componente.
	 */
	abstract readonly gate: boolean
	abstract check(): Promise<HealthComponentReport>
}

/**
 * Porta estrutural de "meu timer de poll está rodando".
 *
 * Estrutural (interface) e não membro das classes abstratas de propósito: `OutboxDispatcher`,
 * `ExternalMediator` e `MailboxDispatcher` têm mocks e spies que não têm timer nenhum, e obrigá-los a
 * declarar um `running` fabricado seria inventar estado para satisfazer um tipo. Só a implementação
 * REAL — a que tem timer — implementa isto.
 */
export interface PollingService {
	readonly running: boolean
}

/**
 * O TOKEN DE MULTI-INJECT — uma STRING, deliberadamente.
 *
 * Medido (HealthService.test.ts): `resolveAll` sobre um token que é CLASSE ABSTRATA não lança — ele
 * CONSTRÓI a abstrata e devolve uma instância sem métodos, o mesmo silêncio que `shared/registry.ts`
 * já documenta ter custado um boot. Com token string, o container lança nomeando o token.
 */
export const HEALTH_CHECKS = 'HealthCheck'

/**
 * Todos os checks registrados NESTE container, ou `[]` quando não há nenhum.
 *
 * A guarda existe porque os ambientes `mock`/`integration` declaram ausência (nenhum check bindado):
 * sem ela, construir o `HealthService` num teste lançaria. `true` = busca recursiva no pai.
 */
export function healthChecksFrom(container: DependencyContainer): HealthCheck[] {
	if (!container.isRegistered(HEALTH_CHECKS, true)) return []
	return container.resolveAll<HealthCheck>(HEALTH_CHECKS)
}
