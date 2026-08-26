import { injectable } from 'tsyringe-neo'
import { Controller, BaseError, z } from '@codm/core-typescript'
import type { InterfaceErrors } from '../errors'
import { BetterAuth } from '../services/Authentication'

export const DesktopCallbackInputSchema = z.object({
	query: z.object({
		/**
		 * A porta do listener de LOOPBACK do app (RFC 8252) — para onde o código volta.
		 *
		 * Validada como inteiro em faixa de porta de usuário porque o valor é INTERPOLADO numa URL de
		 * redirecionamento. É essa validação que impede a porta de virar um redirecionamento aberto:
		 * um `z.string()` aceitaria `1@evil.com` e mandaria o código do operador para lá.
		 *
		 * O host NUNCA vem do request — é a constante `127.0.0.1` abaixo. O RFC 8252 pede o IP
		 * literal, e não `localhost`, para que nenhuma resolução de nome possa apontar para outro
		 * lugar.
		 */
		port: z.coerce.number().int().min(1024).max(65535),
	}),
})

export const DesktopCallbackOutputSchema = z.string().example(['<redirect>'])

/**
 * O caminho desta ponte, como CONSTANTE — porque quem a aponta é outro arquivo.
 *
 * O `SignInSocialController` manda este endereço ao better-auth como `callbackURL`, e um literal
 * redigitado lá já quebrou o fluxo: a rota saiu de `/cloud/desktop-callback` para
 * `/desktop-callback` e o `callbackURL` ficou para trás, de modo que o login morria num 404 DEPOIS
 * de o provedor ter autenticado — falha silenciosa e tardia, no pior lugar possível.
 */
export const DESKTOP_CALLBACK_PATH = '/desktop-callback' as const

/**
 * A ponte browser→app (spec decision 4/7). É aqui que o fluxo social aterrissa quando o better-auth
 * termina: o browser ainda segura o cookie de sessão recém-criado, esta porta o lê, cunha um código
 * de uso único e o devolve ao app pelo LISTENER DE LOOPBACK dele.
 *
 * ── por que loopback, e não mais o deep link `codm://` ───────────────────────────────────────────
 * O deep link não alcança um build de desenvolvimento no macOS, e isso é limitação de PLATAFORMA,
 * não de configuração: o roteamento de esquema exige um `.app` com o esquema no `Info.plist`, o
 * `tauri dev` não gera bundle nenhum, e o registro em runtime é explicitamente recusado —
 * `tauri-plugin-deep-link` documenta *"macOS / Android / iOS: Unsupported, will return
 * UnsupportedPlatform"*. Medido em 2026-08-15: os únicos registrantes de `codm://` na máquina eram
 * o app instalado em `/Applications` e um DMG montado; o processo de dev não era sequer candidato,
 * então o login abria o app errado.
 *
 * O loopback do RFC 8252 resolve três coisas de uma vez. Funciona igual em dev e em produção,
 * porque não passa pelo registro do SO. Elimina a corrida de registro — quem vincula a porta é o
 * processo, e o SO não a entrega a mais ninguém. E fecha o sequestro de esquema, que era o risco
 * residual do desenho anterior: qualquer app pode registrar `codm://` e receber o código.
 *
 * ── por que a porta do DAEMON, e não um listener efêmero ─────────────────────────────────────────
 * O RFC recomenda porta efêmera, e a razão é que o app precisa de ALGUM socket de loopback. Este
 * app já tem um: o daemon local, que sobe com ele nos dois deployments e cuja porta o console já
 * conhece. Um segundo servidor dentro do shell Rust seria um socket a mais para manter, supervisionar
 * e desligar — para fazer o que o primeiro já faz.
 *
 * PÚBLICA de propósito: quem chega é uma aba de browser que nunca falou com este serviço, e a
 * identidade dela é o cookie do better-auth, verificado inline.
 */
@injectable()
export class DesktopCallbackController extends Controller<typeof DesktopCallbackInputSchema, typeof DesktopCallbackOutputSchema> {
	readonly path = DESKTOP_CALLBACK_PATH
	readonly method = 'get' as const
	readonly description = 'Bridges a better-auth browser session into a one-time token, returned to the app over its loopback listener'
	readonly inputSchema = DesktopCallbackInputSchema
	readonly outputSchema = DesktopCallbackOutputSchema

	constructor(private readonly betterAuth: BetterAuth) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const session = await this.betterAuth.auth.api.getSession({ headers: request.raw.headers })
		if (!session) throw new BaseError<InterfaceErrors>('UNAUTHORIZED', 'no better-auth session cookie on the desktop callback')

		const { token } = await this.betterAuth.auth.api.generateOneTimeToken({ headers: request.raw.headers })

		// 127.0.0.1 é CONSTANTE aqui, e só a porta vem do request (validada como inteiro em faixa).
		// É a única forma de o destino ser sempre a máquina de quem está logando.
		const loopback = `http://127.0.0.1:${request.query.port}${LOOPBACK_LANDING}?code=${encodeURIComponent(token)}`
		return this.rawResponse(new Response(null, { status: 302, headers: { Location: loopback } }))
	}
}

/**
 * Onde o app escuta a volta — declarado AQUI porque é esta porta que monta a URL.
 *
 * O valor tem de bater com o `path` do controller que o daemon local serve; o trilho DCB-02 guarda
 * essa igualdade, pela mesma razão que o DCB-01 guarda a outra ponta: um literal desalinhado entre
 * dois pacotes falha tarde, depois de o provedor já ter autenticado.
 */
export const LOOPBACK_LANDING = '/sign-in/loopback' as const
