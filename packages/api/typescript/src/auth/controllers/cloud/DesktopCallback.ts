import { injectable } from 'tsyringe-neo'
import { Controller, BaseError, z } from '@codm/core-typescript'
import type { InterfaceErrors } from '../../errors'
import { BetterAuth } from '../../services/Authentication'
import { IssueDeviceCode } from '../../usecases/IssueDeviceCode'

export const DesktopCallbackInputSchema = z.object({}).example([{}])

export const DesktopCallbackOutputSchema = z.string().example(['<html>…</html>'])

/**
 * The browser→app bridge (spec decision 4/7). This is where the social OAuth flow (T6's
 * `callbackURL`) lands once better-auth finishes: the browser still holds the fresh session cookie,
 * this door reads it, mints a one-time device code, and hands the desktop app a
 * `codm://auth?code=…` deep link via a zero-JS `<meta http-equiv="refresh">` — no cookie means no
 * session to bridge, so a request with none gets 401 and nothing is minted.
 *
 * PUBLIC on purpose, and it must stay that way: the caller is a browser tab that has never talked
 * to this daemon before, so OperatorMiddleware (which every other controller in this repo declares)
 * cannot run here — its identity IS the better-auth session cookie, verified inline via
 * `auth.api.getSession`, not the local operator constant. No `static mcpScopes` either: a browser
 * redirect is not a model-callable tool.
 */
@injectable()
export class DesktopCallbackController extends Controller<typeof DesktopCallbackInputSchema, typeof DesktopCallbackOutputSchema> {
	readonly path = '/cloud/desktop-callback'
	readonly method = 'get' as const
	readonly description = 'Bridges a better-auth browser session into a one-time device code, handed to the app via the codm:// deep link'
	readonly inputSchema = DesktopCallbackInputSchema
	readonly outputSchema = DesktopCallbackOutputSchema

	constructor(
		private readonly betterAuth: BetterAuth,
		private readonly issueDeviceCode: IssueDeviceCode,
	) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const session = await this.betterAuth.auth.api.getSession({ headers: request.raw.headers })
		if (!session) throw new BaseError<InterfaceErrors>('UNAUTHORIZED', 'no better-auth session cookie on the desktop callback')

		const { code } = await this.issueDeviceCode.execute({ userId: session.session.userId })

		const html = `<!doctype html>
<html>
<head><meta http-equiv="refresh" content="0;url=codm://auth?code=${code}"></head>
<body>Volte ao codm.</body>
</html>`
		return this.rawResponse(new Response(html, { headers: { 'Content-Type': 'text/html' } }))
	}
}
