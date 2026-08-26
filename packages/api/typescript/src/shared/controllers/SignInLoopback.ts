import { injectable } from 'tsyringe-neo'
import { Controller, z } from '@codm/core-typescript'
import { LoopbackSignIn } from '../services/LoopbackSignIn'

export const SignInLoopbackInputSchema = z.object({
	query: z.object({ code: z.string().min(1) }),
})

export const SignInLoopbackOutputSchema = z.string().example(['<html>…</html>'])

/**
 * ONDE O LOGIN ATERRISSA DE VOLTA NA MÁQUINA — o listener de loopback do RFC 8252.
 *
 * O navegador do sistema termina o OAuth na nuvem, o `/desktop-callback` de lá cunha um código de
 * uso único e redireciona para cá, em `127.0.0.1`. Esta porta guarda o código e mostra ao operador
 * uma página dizendo que ele pode voltar ao app; o console o retira em seguida
 * (`/sign-in/loopback/claim`) e o troca por sessão.
 *
 * ── por que não é mais um deep link `codm://` ────────────────────────────────────────────────────
 * Porque o deep link não alcança um build de desenvolvimento no macOS, e isso é limitação de
 * PLATAFORMA: o roteamento de esquema exige um `.app` com o esquema no `Info.plist`, o `tauri dev`
 * não gera bundle, e o registro em runtime é recusado (`tauri-plugin-deep-link`: *"macOS: Unsupported,
 * will return UnsupportedPlatform"*). Medido em 2026-08-15: os registrantes de `codm://` eram o app
 * instalado e um DMG montado — o processo de dev não era candidato, e o login abria o app errado.
 *
 * SEM MIDDLEWARE, e pela mesma razão que o `SetCloudToken` ao lado: esta é a porta que ENTREGA a
 * credencial. Exigir sessão aqui seria o deadlock que já custou um daemon que nunca destravava.
 *
 * Monta nos DOIS deployments porque `shared` é dual por desenho e não há eixo por controller. A
 * cópia da nuvem é inerte: a URL que o callback monta aponta sempre para `127.0.0.1`, então ninguém
 * aterrissa na de lá — e quem tentasse estaria depositando um código que só ele já possui.
 */
@injectable()
export class SignInLoopbackController extends Controller<typeof SignInLoopbackInputSchema, typeof SignInLoopbackOutputSchema> {
	readonly path = '/sign-in/loopback'
	readonly method = 'get' as const
	readonly description = 'Loopback landing (RFC 8252): receives the one-time sign-in code from the system browser'
	readonly inputSchema = SignInLoopbackInputSchema
	readonly outputSchema = SignInLoopbackOutputSchema

	constructor(private readonly loopback: LoopbackSignIn) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		this.loopback.deliver(request.query.code)

		const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Pronto</title></head>
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0">
<p>Login concluído. Você já pode voltar ao codm e fechar esta aba.</p>
</body>
</html>`
		return this.rawResponse(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
	}
}
