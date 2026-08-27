import * as React from 'react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { IconBrandGithub, IconBrandGoogle } from '@tabler/icons-react'

import { cn } from '@/lib/utils'
import { Config, daemonBaseUrl } from '@/lib/config'
import { Button } from '@codm/app-ui/button'
import { CodmLogoIcon } from '@codm/app-ui/icons'
import { useCloudSession } from '@/services'
import { useCloudSessionStore } from '@/stores'

interface LoginSectionProps extends React.ComponentProps<'section'> {}

type OAuthProvider = 'github' | 'google'

/**
 * `${cloudUrl}/sign-in/social?provider=<p>` — NOSSA porta, o GÊMEO GET do `POST
 * /auth/sign-in/social` do better-auth, na origem da NUVEM (`Config.cloudUrl`, nunca
 * o daemon local), que responde 302 para o provedor.
 *
 * ── por que não `auth.signIn.social` daqui, que seria mais direto ────────────────────────────────
 * Foi tentado em 2026-08-15 e o login PAROU de fechar. O client faz o POST e devolve a URL
 * (`disableRedirect`), o app a abre no navegador do sistema, o Google autentica — e o callback
 * recusa com `state_mismatch`. A razão é que o fluxo OAuth é stateful: o better-auth emite um cookie
 * de `state` ao gerar a URL, e o confere na volta. Fazendo o POST daqui, esse cookie fica no pote do
 * WEBVIEW, e quem volta do Google é o NAVEGADOR DO SISTEMA, que nunca o teve.
 *
 * A regra não é sobre CORS (as origens do desktop estão no `trustedOrigins` desde então): é que
 * **quem inicia o fluxo tem de ser quem o conclui**. Esta URL coloca o navegador do sistema na
 * primeira ponta. Ver o docblock de `auth/controllers/SignIn.ts` para a medição A/B.
 *
 * Concluído o provedor, o better-auth manda o browser para `/desktop-callback` na MESMA origem,
 * que cunha o código de uso único e o devolve ao LISTENER DE LOOPBACK do daemon local
 * (`127.0.0.1:<porta>`), de onde o `useLoopbackAuth` o retira.
 */
function buildSignInUrl(provider: OAuthProvider): string {
	// A PORTA do daemon local vai junto: é para lá que o código volta (RFC 8252). Ela sai de
	// `daemonBaseUrl()` — a origem que o host RESOLVEU no boot —, nunca de `Config.baseUrl`, que é o
	// valor assado no bundle. Num app empacotado o daemon não escuta mais em 3030: o shell fica com a
	// primeira candidata livre de `tauri/config/ports.ts`. Lendo o valor assado, o `/desktop-callback`
	// redirecionava o navegador para `http://127.0.0.1:3030/sign-in/loopback?code=…` — porta sem
	// ninguém do outro lado, e o login não fechava (medido em 26/08/2026).
	const port = new URL(daemonBaseUrl()).port
	return `${Config.cloudUrl}/sign-in/social?${new URLSearchParams({ provider, port }).toString()}`
}

/**
 * The login screen (SP2 spec Decisions 4/5, AC-3). Owns the two OAuth entry points — the actual
 * device-code exchange that follows is `useLoopbackAuth`'s job, mounted at the root so it keeps
 * listening no matter which screen is showing when the OS hands the deep link back.
 */
export function LoginSection({ className, ...props }: LoginSectionProps) {
	const { t } = useTranslation()
	const status = useCloudSessionStore(s => s.status)
	const cloudSession = useCloudSession()
	const navigate = useNavigate()

	// AC-3 "destrava sem restart": once useLoopbackAuth (always mounted, always listening) flips the
	// store, this screen steps aside on its own — no reload, no manual navigation from the operator.
	// Also covers a direct visit to /login while already authenticated.
	useEffect(() => {
		if (status === 'authenticated') void navigate({ to: '/dashboard' })
	}, [status, navigate])

	return (
		<section className={cn('flex h-full w-full items-center justify-center p-6', className)} {...props}>
			{/* D3 (screen egPQt) — one white bordered card (seal, title/subtitle, both providers, a
			    caption footer), swapped for the plain centered stack it replaces. Provider order flips
			    to Google-then-GitHub to match the design; the brand mark is `CodmLogoIcon` (the fixed
			    two-tone bubble+"dm" mark) — it already IS the seal, no extra colored square around it. */}
			<div className="flex w-full max-w-md flex-col items-center gap-7 rounded-asymmetric-xl border border-border bg-background p-11 text-center">
				<CodmLogoIcon className="h-14 w-auto" />
				<header className="flex flex-col gap-1.5">
					<h2 className="heading-display text-2xl text-foreground">{t('cloudAuth.login.title')}</h2>
					<p className="text-sm text-muted-foreground">{t('cloudAuth.login.subtitle')}</p>
				</header>
				<div className="flex w-full flex-col gap-3">
					<Button
						variant="outline"
						size="lg"
						className="w-full justify-start gap-3.5 px-6 text-foreground"
						onClick={() => void cloudSession.openBrowser(buildSignInUrl('google'))}
					>
						<IconBrandGoogle />
						{t('cloudAuth.login.google')}
					</Button>
					<Button
						variant="outline"
						size="lg"
						className="w-full justify-start gap-3.5 px-6 text-foreground"
						onClick={() => void cloudSession.openBrowser(buildSignInUrl('github'))}
					>
						<IconBrandGithub />
						{t('cloudAuth.login.github')}
					</Button>
				</div>
				<p className="text-xs text-caption-foreground">{t('console.footerLocal')}</p>
			</div>
		</section>
	)
}
