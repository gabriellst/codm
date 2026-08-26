import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { LoopbackSignIn } from '../services/LoopbackSignIn'

export const ClaimSignInCodeInputSchema = z.object({}).example([{}])

export const ClaimSignInCodeOutputSchema = z
	.object({
		/** `null` enquanto o operador ainda não terminou o login no navegador. */
		code: z.string().nullable(),
	})
	.example([{ code: null }])

/**
 * O console RETIRA o código que o navegador deixou — e a gaveta fica vazia.
 *
 * Enquanto a tela de login está aberta, o console consulta esta porta em laço. Ela responde
 * `{ code: null }` até o operador terminar no navegador, e então devolve o código UMA vez.
 *
 * ── por que o console retira, em vez de o daemon resgatar ────────────────────────────────────────
 * O resgate (trocar o código por sessão contra a nuvem) já existe no console, com testes, usando o
 * client do better-auth — `auth.oneTimeToken.verify`. Movê-lo para cá exigiria um segundo client no
 * servidor para chamar uma rota que a SDK gerada não sabe expressar (o passthrough tem URL literal
 * `/auth/*`). O daemon fica burro de propósito: ele é o socket de loopback, não o participante do
 * fluxo.
 *
 * SEM MIDDLEWARE: é parte da porta de login, e exigir sessão aqui seria pedir de volta exatamente o
 * que ainda não existe.
 */
@injectable()
export class ClaimSignInCodeController extends Controller<typeof ClaimSignInCodeInputSchema, typeof ClaimSignInCodeOutputSchema> {
	readonly path = '/sign-in/loopback/claim'
	readonly method = 'get' as const
	readonly description = 'Claims the one-time sign-in code delivered to the loopback landing (single use)'
	readonly inputSchema = ClaimSignInCodeInputSchema
	readonly outputSchema = ClaimSignInCodeOutputSchema

	constructor(private readonly loopback: LoopbackSignIn) {
		super()
	}

	async handle(): Promise<this['output']> {
		return { status: HttpStatusCode.OK, data: { code: this.loopback.claim() ?? null } }
	}
}
