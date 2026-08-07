import { injectable } from 'tsyringe-neo'
import { Controller, Config, z } from '@codm/core-typescript'
import { SocialProvider } from '../../enums/SocialProvider'
import { BetterAuth } from '../../services/Authentication'

export const SignInInputSchema = z.object({
	query: z.object({ provider: z.enum(SocialProvider) }),
})

export const SignInOutputSchema = z.string().example(['<redirect>'])

/** Para onde o better-auth manda o browser DEPOIS do provedor — a ponte que cunha o device code. */
const DESKTOP_CALLBACK = '/v1/cloud/desktop-callback'

/**
 * A porta que o app abre no browser do sistema para começar o login (spec decisão 4).
 *
 * Existe porque `/v1/auth/sign-in/social` do better-auth é **POST** com corpo JSON, e um app
 * desktop só sabe fazer uma coisa com o browser: navegar (GET). A v0.1.4 abria aquele endpoint
 * direto e o usuário via 404. Fazer o POST a partir do console também não serve: a origem do
 * webview não está no `trustedOrigins`, então o CORS barraria. Então o servidor orquestra.
 *
 * ### Por que passar pelo `auth.handler` em vez de `auth.api.signInSocial`
 * O fluxo OAuth é stateful: ao gerar a URL de autorização o better-auth EMITE COOKIES (o `state` e o
 * verifier do PKCE) que ele mesmo confere quando o provedor devolve o browser. A primeira versão
 * desta porta chamava `auth.api.signInSocial` e montava um 302 do zero — os cookies morriam ali, e o
 * callback do Google voltava com `?error=state_mismatch` (medido em 2026-08-07). Delegando ao
 * handler HTTP e REPASSANDO cada `Set-Cookie` da resposta dele, qualquer cookie que o fluxo precise
 * (hoje state+PKCE, amanhã o que a lib decidir) atravessa sem esta porta precisar conhecê-lo.
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
		const signIn = await this.betterAuth.auth.handler(
			new Request(`${Config.env.CODM_CLOUD_URL}/v1/auth/sign-in/social`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ provider: request.query.provider, callbackURL: DESKTOP_CALLBACK }),
			}),
		)
		const body = (await signIn.json()) as { url?: string }
		if (!signIn.ok || body.url === undefined)
			throw new Error(`better-auth recusou o sign-in de '${request.query.provider}' (HTTP ${signIn.status})`)

		const redirect = new Response(null, { status: 302, headers: { Location: body.url } })
		for (const cookie of signIn.headers.getSetCookie()) redirect.headers.append('Set-Cookie', cookie)
		return this.rawResponse(redirect)
	}
}
