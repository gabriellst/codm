import { injectable } from 'tsyringe-neo'
import { Controller, z } from '@codm/core-typescript'
import { PanelWebBundle } from '../services/PanelWebBundle'

export const PanelPageInputSchema = z.object({ params: z.object({ token: z.string().min(16).max(128) }) })
export const PanelPageOutputSchema = z.string().example(['<html>…</html>'])

/**
 * The shell's Content-Security-Policy: everything from this origin, nothing else. The panel's script and
 * styles are files of the bundle (no inline script), the fonts are the system's (no external fetch), and every
 * call is to `/panel/g/:token/*` on the same origin. `style-src 'unsafe-inline'` covers style ATTRIBUTES a
 * primitive may set; scripts get no such exception.
 */
export const PANEL_CSP = [
	"default-src 'self'",
	"script-src 'self'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data:",
	"connect-src 'self'",
	"font-src 'self'",
	"object-src 'none'",
	"base-uri 'none'",
	"form-action 'self'",
	"frame-ancestors 'none'",
].join('; ')

/** Headers every answer of the shell carries — the token is in the path. */
const SHELL_HEADERS = {
	'Content-Type': 'text/html; charset=utf-8',
	// The token is in the path: never send it onward as a referrer, never let the page be framed.
	'Referrer-Policy': 'no-referrer',
	'X-Frame-Options': 'DENY',
	'Cache-Control': 'no-store',
	'X-Robots-Tag': 'noindex, nofollow',
	'X-Content-Type-Options': 'nosniff',
	'Content-Security-Policy': PANEL_CSP,
} as const

/**
 * PUBLIC — the per-group panel page. Since 2026-11-24 it is the React app built with the console's own
 * components (`packages/app/react/src/panel`), served from this same origin and path so the links already in
 * the groups (`/panel/g/<token>#APP-12`) and the device cookie (`Path=/panel/g/<token>`) keep working.
 *
 * The shell holds no data and never the token: the app reads it from the address and calls `./board`,
 * `./issues/:id`… An unknown token renders the shell and the board call answers 404, which the app shows as
 * "link inválido". With no bundle built (dev without `build:panel`), 503 with what to run.
 */
@injectable()
export class PanelPageController extends Controller<typeof PanelPageInputSchema, typeof PanelPageOutputSchema> {
	readonly path = '/panel/g/:token'
	readonly method = 'get' as const
	readonly description = 'The per-group panel page (public HTML shell of the panel app)'
	readonly inputSchema = PanelPageInputSchema
	readonly outputSchema = PanelPageOutputSchema

	constructor(private readonly bundle: PanelWebBundle) {
		super()
	}

	async handle(): Promise<this['output']> {
		const shell = this.bundle.shell()
		if (shell === undefined) {
			return this.rawResponse(
				new Response('painel não buildado — rode `bun run --cwd packages/app/react build:panel`', {
					status: 503,
					headers: { ...SHELL_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
				}),
			)
		}
		return this.rawResponse(new Response(shell, { headers: SHELL_HEADERS }))
	}
}
