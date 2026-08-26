import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { CloudSession } from '../services/CloudSession'

export const SetCloudTokenControllerInputSchema = z
	.object({
		body: z.object({ token: z.string().min(1) }),
	})
	.example([{ body: { token: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2' } }])

export const SetCloudTokenControllerOutputSchema = z.void()

/**
 * The console's half of the login handoff (T6 → T7, spec decisions 4-5): once the desktop trades its
 * one-time deep-link code for a device token (`POST /cloud/devices/exchange`, T2), it PUSHES the
 * plaintext HERE so the local daemon's `CloudSession` — the thing `LibSqlMailboxDispatcher` gates
 * every turn on — picks it up without a restart (AC-3). The exchange happens in the react console
 * process, not this daemon, so the token has to cross that process boundary somehow; this endpoint is
 * the crossing.
 *
 * ── SEM `CloudSessionMiddleware`, e isso é o conserto de um DEADLOCK ─────────────────────────────
 * Esta porta era gateada como todo endpoint local — e o gate exigia `CloudSession.identity()`, que
 * só existe depois que o token chegou, e o token só chega POR AQUI. Numa instalação nova a porta
 * que entrega a credencial exigia a credencial: 401. E o console ENGOLE esse erro de propósito (o
 * `pushToDaemon` é best-effort, para que uma falha do daemon não estrague um login que funcionou),
 * então ninguém via. O daemon simplesmente nunca era destravado, e o `MailboxDispatcher` ficava
 * parado para sempre.
 *
 * A porta de login não pode exigir login. Ela fica sem middleware, como `Health` e o
 * `TestIngressController` — e, como eles, é local-only por PLACEMENT: quem chama é o console desta
 * máquina, nunca a nuvem. O `ctx.ownerId` saiu junto, porque era validado e nunca usado
 * (`CloudSession` é processo-wide: um operador por daemon, spec "sem multi-conta por máquina") e
 * porque exigi-lo agora seria pedir de volta exatamente o que não existe ainda.
 */
@injectable()
export class SetCloudTokenController extends Controller<
	typeof SetCloudTokenControllerInputSchema,
	typeof SetCloudTokenControllerOutputSchema
> {
	readonly path = '/session/cloud-token'
	readonly method = 'post' as const
	readonly description = 'Push a freshly-exchanged session token into the local daemon'
	readonly inputSchema = SetCloudTokenControllerInputSchema
	readonly outputSchema = SetCloudTokenControllerOutputSchema

	constructor(private readonly cloudSession: CloudSession) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		this.cloudSession.setToken(request.body.token)
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
