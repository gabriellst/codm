import { injectable } from 'tsyringe-neo'
import { Controller, z } from '@codm/core-typescript'
import { SocialProvider } from '../../enums/SocialProvider'
import { BetterAuth } from '../../services/Authentication'

export const SignInInputSchema = z.object({
	query: z.object({ provider: z.enum(SocialProvider) }),
})

export const SignInOutputSchema = z.string().example(['<redirect>'])

/**
 * A porta que o app abre no browser do sistema para começar o login (spec decisão 4).
 *
 * Existe porque `/api/auth/sign-in/social` do better-auth é **POST** com corpo JSON, e um app
 * desktop só sabe fazer uma coisa com o browser: navegar (GET). A v0.1.4 abria aquele endpoint
 * direto e o usuário via 404 — o navegador mandava GET onde só POST responde. Fazer o POST a
 * partir do console também não serve: a origem do webview não está no `trustedOrigins`, então o
 * CORS barraria. Então o servidor orquestra: recebe um GET, pergunta a URL de autorização ao
 * better-auth e devolve 302 para o provedor.
 *
 * PUBLIC por natureza, como o `/cloud/desktop-callback` ao lado: quem chega aqui é um browser que
 * nunca falou com este serviço — não há sessão nem operador para autenticar ANTES do login. Sem
 * `static mcpScopes`: redirecionar um browser não é ferramenta chamável por modelo.
 */
@injectable()
export class SignInController extends Controller<typeof SignInInputSchema, typeof SignInOutputSchema> {
	readonly path = '/cloud/sign-in'
	readonly method = 'get' as const
	readonly description = 'Redireciona o browser do sistema para o provedor social escolhido, iniciando o login do desktop'
	readonly inputSchema = SignInInputSchema
	readonly outputSchema = SignInOutputSchema

	constructor(private readonly betterAuth: BetterAuth) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		// `callbackURL` é para onde o better-auth manda o browser DEPOIS do provedor — a ponte que
		// cunha o device code e dispara o deep link `codm://`.
		const { url } = await this.betterAuth.auth.api.signInSocial({
			body: { provider: request.query.provider, callbackURL: '/v1/cloud/desktop-callback' },
		})
		if (url === undefined) throw new Error(`better-auth não devolveu URL de autorização para '${request.query.provider}'`)

		return this.rawResponse(new Response(null, { status: 302, headers: { Location: url } }))
	}
}
