import { HealthCheck, type HealthComponentReport, type PollingService } from './HealthCheck'

/**
 * GATE — o timer de poll do serviço está armado.
 *
 * Um por dispatcher, com o nome do componente vindo do call site (o core não conhece os nomes do
 * produto). O sinal é lido do próprio serviço (`PollingService.running`) — ver o docblock de cada
 * `running` para POR QUE aquele campo e não outro.
 */
export class PollingHealthCheck extends HealthCheck {
	readonly gate = true

	constructor(
		readonly name: string,
		private readonly service: PollingService,
	) {
		super()
	}

	async check(): Promise<HealthComponentReport> {
		return this.service.running ? { status: 'up', gate: true } : { status: 'down', gate: true, detail: 'poll timer not running' }
	}
}
