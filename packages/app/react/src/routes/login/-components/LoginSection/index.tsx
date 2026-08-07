import * as React from 'react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { IconBrandGithub, IconBrandGoogle } from '@tabler/icons-react'

import { cn } from '@/lib/utils'
import { Config } from '@/lib/config'
import { Button } from '@/components/ui/button'
import { useCloudSession } from '@/services'
import { useCloudSessionStore } from '@/stores'

interface LoginSectionProps extends React.ComponentProps<'section'> {}

type OAuthProvider = 'github' | 'google'

/**
 * `${cloudUrl}/api/auth/sign-in/social?provider=<p>&callbackURL=/v1/cloud/desktop-callback`
 * (SP2 spec Decision 4) — better-auth's social sign-in entry on the CLOUD origin (`Config.cloudUrl`,
 * never the local daemon's own `Config.baseUrl` — see the doc comment on `cloudUrl`). Once the
 * provider completes, better-auth redirects the system browser back to that SAME origin's
 * `/v1/cloud/desktop-callback`, which bridges the fresh browser session into the one-time
 * `codm://auth?code=…` deep link `useDeepLinkAuth` listens for.
 */
function buildSignInUrl(provider: OAuthProvider): string {
	const params = new URLSearchParams({ provider, callbackURL: '/v1/cloud/desktop-callback' })
	return `${Config.cloudUrl}/api/auth/sign-in/social?${params.toString()}`
}

/**
 * The login screen (SP2 spec Decisions 4/5, AC-3). Owns the two OAuth entry points — the actual
 * device-code exchange that follows is `useDeepLinkAuth`'s job, mounted at the root so it keeps
 * listening no matter which screen is showing when the OS hands the deep link back.
 */
export function LoginSection({ className, ...props }: LoginSectionProps) {
	const { t } = useTranslation()
	const cloudSession = useCloudSession()
	const navigate = useNavigate()
	const status = useCloudSessionStore(s => s.status)

	// AC-3 "destrava sem restart": once useDeepLinkAuth (always mounted, always listening) flips the
	// store, this screen steps aside on its own — no reload, no manual navigation from the operator.
	// Also covers a direct visit to /login while already authenticated.
	useEffect(() => {
		if (status === 'authenticated') void navigate({ to: '/dashboard' })
	}, [status, navigate])

	return (
		<section className={cn('flex h-full w-full flex-col items-center justify-center gap-6 p-6 text-center', className)} {...props}>
			<header className="flex flex-col gap-1">
				<h2 className="text-xl font-semibold">{t('cloudAuth.login.title')}</h2>
				<p className="text-sm text-muted-foreground">{t('cloudAuth.login.subtitle')}</p>
			</header>
			<div className="flex w-full max-w-xs flex-col gap-2">
				<Button variant="outline" size="lg" onClick={() => void cloudSession.openBrowser(buildSignInUrl('github'))}>
					<IconBrandGithub />
					{t('cloudAuth.login.github')}
				</Button>
				<Button variant="outline" size="lg" onClick={() => void cloudSession.openBrowser(buildSignInUrl('google'))}>
					<IconBrandGoogle />
					{t('cloudAuth.login.google')}
				</Button>
			</div>
		</section>
	)
}
