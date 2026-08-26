import { injectable } from 'tsyringe-neo'
import { Controller, BaseError, Config, z } from '@codm/core-typescript'
import { SocialProvider } from '../enums/SocialProvider'
import { BetterAuth } from '../services/Authentication'
import type { InterfaceErrors } from '../errors'
import { DESKTOP_CALLBACK_PATH } from './DesktopCallback'

export const SignInSocialInputSchema = z.object({
	query: z.object({
		provider: z.enum(SocialProvider),
		/**
		 * A porta do LISTENER DE LOOPBACK do app (RFC 8252), para onde o código volta.
		 *
		 * Inteiro e acima de 1023 porque é o que um processo de usuário consegue vincular — e porque
		 * o servidor vai INTERPOLAR isto numa URL. Validar aqui é o que torna essa interpolação
		 * segura: um `z.string()` deixaria passar `1@evil.com` e transformaria o redirecionamento
		 * numa porta aberta para qualquer destino.
		 */
		port: z.coerce.number().int().min(1024).max(65535),
	}),
})

export const SignInSocialOutputSchema = z.string().example(['<redirect>'])

/**
 * O que o better-auth devolve quando ACEITA o sign-in social.
 *
 * Isto era um `as { url?: string }` — uma afirmação sobre a resposta de outra biblioteca, feita sem
 * olhar. Um cast não falha quando o contrato muda; ele adia a falha até `Location: undefined` sair
 * no fio e o navegador não ir a lugar nenhum. `z.url()` recusa na fronteira, com a mensagem certa.
 */
const AuthorizeUrlSchema = z.object({ url: z.url() })

/**
 * O que ele devolve quando RECUSA — `code` e `message` são o vocabulário DELE, e é justamente isso
 * que queremos repassar. Ambos opcionais porque a forma do erro é da biblioteca, não nossa: um
 * `.parse()` estrito aqui trocaria a causa real por um erro de validação sobre o erro.
 */
const BetterAuthErrorSchema = z.object({ code: z.string().optional(), message: z.string().optional() })

/** Para onde o better-auth manda o browser DEPOIS do provedor — a ponte que cunha o código.
 *
 * DERIVADO do controller, não redigitado: o dia em que aquela rota mudar de endereço, esta constante
 * muda junto. Foi um literal desalinhado que quebrou este mesmo fluxo — a ponte virou
 * `/desktop-callback` e o `callbackURL` ficou apontando para `/cloud/desktop-callback`, de
 * modo que o login morria num 404 DEPOIS de o provedor já ter autenticado. O trilho DCB-01 guarda
 * esta igualdade.
 *
 * É o próprio `path` do controller, sem nada na frente: o prefixo de versão que o `MainRouter`
 * acrescentava — e que esta constante redigitava — saiu do roteador. O que o controller declara é o
 * que o servidor serve.
 */
export const DESKTOP_CALLBACK = DESKTOP_CALLBACK_PATH

/**
 * O GÊMEO GET do `POST /auth/sign-in/social` do better-auth — daí o nome e o caminho.
 *
 * Existe porque aquele endpoint é POST com corpo JSON, e um app desktop só sabe fazer uma coisa com
 * o browser: navegar (GET). A v0.1.4 abria o endpoint do better-auth direto e o usuário via 404.
 *
 * ── POR QUE O CONSOLE NÃO PODE FAZER ESSE POST SOZINHO ───────────────────────────────────────────
 * Esta porta foi REMOVIDA em 2026-08-15 e restaurada no mesmo dia, e o motivo da remoção merece
 * ficar escrito porque é convincente e é errado. O raciocínio foi: o docblock antigo dava duas
 * razões — o 404 no GET e o CORS barrando o POST do webview — e a segunda tinha caído quando as
 * origens do desktop entraram no `trustedOrigins`. Logo, argumentou-se, o client do better-auth
 * podia fazer o POST com `disableRedirect: true` e o app só abriria a URL devolvida.
 *
 * O POST passa a funcionar, sim. O LOGIN é que não fecha. O fluxo OAuth é STATEFUL: ao gerar a URL
 * de autorização o better-auth emite um cookie de `state` (e o verifier do PKCE) e o confere quando
 * o provedor devolve o browser. Se o POST sai do WEBVIEW, o cookie fica no pote do webview — e quem
 * volta do provedor é o NAVEGADOR DO SISTEMA, que nunca o teve. São processos com potes de cookie
 * distintos; nenhuma configuração de servidor atravessa essa fronteira.
 *
 * Medido duas vezes, com a mesma assinatura:
 *   2026-08-07  a primeira versão desta porta chamava `auth.api.signInSocial` e montava um 302 do
 *               zero; os cookies morriam ali e o provedor voltava com `?error=state_mismatch`.
 *   2026-08-15  sem esta porta, o console fazia o POST e abria a URL; mesmo erro. A/B controlado
 *               sobre o MESMO `state`, com a linha viva no banco: sem cookie → `state_mismatch`;
 *               com o cookie que o sign-in devolveu → `invalid_code`, isto é, passou do state.
 *
 * A regra, então, não é sobre CORS: **quem inicia o fluxo tem de ser quem o conclui**. O navegador
 * do sistema faz as duas pontas porque esta porta o coloca na primeira.
 *
 * ── por que passar pelo `auth.handler`, e não por `auth.api.signInSocial` ────────────────────────
 * Porque é o handler HTTP que EMITE os cookies. Chamando a API programática e montando o 302 à mão,
 * eles não existem — foi exatamente a falha de 2026-08-07. Repassando cada `Set-Cookie` da resposta
 * dele, qualquer cookie que o fluxo precise (hoje state+PKCE, amanhã o que a lib decidir) atravessa
 * sem esta porta precisar conhecê-lo pelo nome.
 *
 * PÚBLICA por natureza, como o `/desktop-callback` ao lado: quem chega aqui é um browser que nunca
 * falou com este serviço — não há sessão nem operador para autenticar ANTES do login. Sem
 * `static mcpScopes`: redirecionar um browser não é ferramenta chamável por modelo.
 */
@injectable()
export class SignInSocialController extends Controller<typeof SignInSocialInputSchema, typeof SignInSocialOutputSchema> {
	readonly path = '/sign-in/social'
	readonly method = 'get' as const
	readonly description = 'Redireciona o browser do sistema para o provedor social escolhido, iniciando o login do desktop'
	readonly inputSchema = SignInSocialInputSchema
	readonly outputSchema = SignInSocialOutputSchema

	constructor(private readonly betterAuth: BetterAuth) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const signIn = await this.betterAuth.auth.handler(
			new Request(`${Config.env.CODM_CLOUD_URL}/auth/sign-in/social`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					provider: request.query.provider,
					callbackURL: `${DESKTOP_CALLBACK}?port=${request.query.port}`,
				}),
			}),
		)

		const payload: unknown = await signIn.json()
		if (!signIn.ok) throw refusal(request.query.provider, signIn.status, payload)

		const parsed = AuthorizeUrlSchema.safeParse(payload)
		// Um 200 sem `url` utilizável é uma recusa que não se declarou como tal — trata-se dela do
		// mesmo jeito, em vez de deixar um `undefined` virar `Location: undefined` no navegador.
		if (!parsed.success) throw refusal(request.query.provider, signIn.status, payload)

		const redirect = new Response(null, { status: 302, headers: { Location: parsed.data.url } })
		// A LINHA QUE FAZ O LOGIN FECHAR. Sem ela o browser do sistema chega ao provedor sem o cookie
		// de state e volta para `?error=state_mismatch`. O witness SGI-02 a guarda.
		for (const cookie of signIn.headers.getSetCookie()) redirect.headers.append('Set-Cookie', cookie)
		return this.rawResponse(redirect)
	}
}

/**
 * A recusa do better-auth, VESTIDA COM O NOSSO ERRO mas falando com as palavras DELE.
 *
 * O `code`/`message` que a biblioteca devolve entram na mensagem porque são a informação que
 * resolve o problema — `MISSING_CLIENT_ID` nomeia a env que falta; um `throw new Error()` genérico
 * viraria UNKNOWN_ERROR/500 e diria "erro desconhecido" sobre algo que tem nome. Quando a resposta
 * não traz nenhum dos dois (uma recusa muda), o status HTTP é o que sobra e é o que vai.
 */
function refusal(provider: SocialProvider, status: number, payload: unknown): BaseError<InterfaceErrors> {
	const error = BetterAuthErrorSchema.safeParse(payload)
	const detail = error.success ? [error.data.code, error.data.message].filter(Boolean).join(': ') : ''
	return new BaseError<InterfaceErrors>(
		'SOCIAL_SIGN_IN_FAILED',
		`better-auth recusou o sign-in de '${provider}' (HTTP ${status})${detail === '' ? '' : ` — ${detail}`}`,
	)
}
