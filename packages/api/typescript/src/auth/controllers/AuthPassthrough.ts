import { injectable } from 'tsyringe-neo'
import { Controller, z, type HttpMethod } from '@codm/core-typescript'
import { BetterAuth } from '../services/Authentication'

export const AuthPassthroughInputSchema = z.unknown().example([{}])
export const AuthPassthroughOutputSchema = z.unknown().example([{}])

/**
 * Todas as rotas do better-auth, servidas como um controller COMUM do contexto (`/v1/auth/*`).
 *
 * O SP2 fixou o basePath em `/api/auth` só porque os apps OAuth de dev já apontavam para lá, e esse
 * caminho é inalcançável pelo `MainRouter` (que sempre prefixa a versão) — a consequência foi uma
 * classe declarada no `src/index.ts` e montada CRUA no HttpRouter, fora do sistema de contextos, com
 * um `if (isCloudProfile())` espalhando regra de rota pelo boot. Alinhado com o basePath `/v1/auth`,
 * a exceção inteira desaparece: o vocabulário de rota volta a viver só no `path` do controller, que
 * é a convenção declarada em `core/types/Router.ts`.
 *
 * O curinga é o ponto: o better-auth tem dezenas de rotas próprias (callback, session, sign-out,
 * OAuth de cada provedor) e elas são DELE — enumerá-las aqui seria redeclarar o contrato de uma
 * biblioteca e ficar desatualizado na primeira atualização. `request.raw` entra, a `Response` sai
 * inteira, com os cookies que o fluxo precisa.
 *
 * PUBLIC por natureza: quem chega aqui é um browser sem sessão nossa — autenticar ANTES de
 * autenticar não faz sentido. Sem `static mcpScopes`: não é ferramenta chamável por modelo.
 */
@injectable()
export class AuthPassthroughController extends Controller<typeof AuthPassthroughInputSchema, typeof AuthPassthroughOutputSchema> {
	readonly path = '/auth/*'
	readonly method: HttpMethod[] = ['get', 'post']
	readonly description = 'better-auth passthrough'
	readonly inputSchema = AuthPassthroughInputSchema
	readonly outputSchema = AuthPassthroughOutputSchema

	constructor(private readonly betterAuth: BetterAuth) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		return this.rawResponse(await this.betterAuth.auth.handler(request.raw))
	}
}
