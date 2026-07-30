import { injectable } from 'tsyringe-neo'
import { Controller, HealthService, HttpStatusCode, z } from '@codm/core-typescript'

export const HealthInputSchema = z.object({})

export const HealthComponentSchema = z.object({
	status: z.enum(['up', 'down']),
	/** `true` = reprovar aqui reprova a prontidão. `false` = diagnóstico (canal WhatsApp). */
	gate: z.boolean(),
	detail: z.string().optional(),
})

export const HealthOutputSchema = z.object({
	status: z.enum(['ok', 'not_ready']),
	components: z.record(z.string(), HealthComponentSchema),
})

/**
 * O PRIMEIRO CONTROLLER PÚBLICO DO REPO, e a ausência de `middlewares` é a decisão, não um
 * esquecimento.
 *
 * Todo outro controller declara `override middlewares = [OperatorMiddleware]`. Este não pode: quem
 * pergunta se o daemon subiu é o supervisor da shell, ANTES de existir qualquer sessão — exigir
 * identidade para responder "eu terminei de subir" é exigir que o app esteja pronto para descobrir
 * se ele está pronto. Mecanicamente: `middlewares` fica no default `[]` herdado de `Controller`, e a
 * classe NÃO declara `static mcpScopes`, então `Controller.effectiveMiddlewares` devolve a lista
 * declarada intacta (a auto-aplicação de `AgentIdentityMiddleware` é condicionada a `mcpScopes`
 * não-vazio). Um `static mcpScopes` aqui também seria errado por outro motivo: readiness de processo
 * não é ferramenta de modelo.
 *
 * 503 e não 200-com-status-no-corpo: o consumidor primário é um probe, e o predicado que ele usa é o
 * código HTTP. O payload é o mesmo nos dois casos — quem está down aparece marcado, sempre.
 */
@injectable()
export class HealthController extends Controller<typeof HealthInputSchema, typeof HealthOutputSchema> {
	readonly path = '/health'
	readonly method = 'get' as const
	readonly description = 'Readiness do daemon: banco, migrações e os timers de poll (canal WhatsApp entra só como diagnóstico)'
	readonly inputSchema = HealthInputSchema
	readonly outputSchema = HealthOutputSchema

	constructor(private readonly health: HealthService) {
		super()
	}

	async handle(_request: this['input']): Promise<this['output']> {
		const report = await this.health.report()
		return {
			status: report.ready ? HttpStatusCode.OK : HttpStatusCode.SERVICE_UNAVAILABLE,
			data: { status: report.ready ? 'ok' : 'not_ready', components: report.components },
		}
	}
}
