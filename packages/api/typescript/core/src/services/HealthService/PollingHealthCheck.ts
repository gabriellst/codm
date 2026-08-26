import { HealthCheck, type HealthComponentReport, type PollingService } from './HealthCheck'

/**
 * GATE — o timer de poll do serviço está armado.
 *
 * Um por dispatcher, com o nome do componente vindo do call site (o core não conhece os nomes do
 * produto). O sinal é lido do próprio serviço (`PollingService.running`) — ver o docblock de cada
 * `running` para POR QUE aquele campo e não outro.
 *
 * ── RESOLVE NA HORA DO CHECK, e não no construtor ────────────────────────────────────────────────
 * O parâmetro é uma FUNÇÃO que devolve o serviço, não o serviço. A diferença custou um app que não
 * abria, e o modo de falha merece ser lido inteiro porque nada nele parece errado:
 *
 *   1. `BoundedContext.create` aplica o registry de CADA contexto no container raiz, e o contexto
 *      raiz carrega o merge de todos — então o mesmo token é registrado mais de uma vez.
 *   2. Registrar de novo um token singleton DESCARTA a instância que o tsyringe tinha em cache. O
 *      próximo `resolve` constrói outra. Nenhum erro, nenhum aviso.
 *   3. Este check, montado durante a composição, guardava a instância de ANTES. O `server.ts`
 *      iniciava a de DEPOIS.
 *
 * Resultado: o dispatcher rodava — o log dizia "started" — e o check reportava `down` para sempre,
 * porque olhava um objeto que ninguém tinha iniciado. `/health` devolvia 503, o shell de desktop
 * espera esse endpoint ficar pronto, e o console nunca inicializava.
 *
 * Resolver na hora do check não é generalidade: um health check descreve a fiação VIVA. Um retrato
 * tirado no boot descreve um mundo que pode já não existir — e descreve-o com confiança.
 *
 * Se a resolução lançar, `HealthService.report()` já converte a exceção em `down` com o motivo
 * (ele guarda cada check), então a lentidão de descobrir só no primeiro request não custa silêncio.
 */
export class PollingHealthCheck extends HealthCheck {
	readonly gate = true

	constructor(
		readonly name: string,
		private readonly resolveService: () => PollingService,
	) {
		super()
	}

	async check(): Promise<HealthComponentReport> {
		return this.resolveService().running ? { status: 'up', gate: true } : { status: 'down', gate: true, detail: 'poll timer not running' }
	}
}
