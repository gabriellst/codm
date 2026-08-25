import { type ComponentProps, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@codm/app-ui/button'
import { cn } from '@/lib/utils'
import { useSupervision } from '@/services'
import type { SupervisionState } from '@/services'

/**
 * THE CHANNEL IS DEAF AND THE OPERATOR HAS TO KNOW. Fixed, non-dismissible, one action.
 *
 * Only the GATEWAY's death renders here (spec Decision 6). A dead daemon is the shell's reaction —
 * it hides this window and brings the boot-error splash back — so a banner for it would be a second
 * story about the same failure, painted in a window on its way out.
 *
 * `degraded` deliberately renders nothing: that is a process that ANSWERED (a 503 from its own
 * health, an internal gate reproving itself) and usually recovers unattended. A banner for every
 * hiccup is how an operator learns to ignore banners.
 *
 * PULL then PUSH, and the order matters. `current()` covers the console that mounts with the gateway
 * ALREADY down — for that operator no transition will ever be emitted, and a push-only banner would
 * leave them staring at a console that looks fine (the `boot_failures` lesson, spec Decision 9).
 *
 * NOT DISMISSIBLE on purpose: the only control is the one that fixes it. Hiding this is hiding the
 * fact that messages are not going out.
 */
export function SupervisionBanner({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const supervision = useSupervision()
	const [state, setState] = useState<SupervisionState>({ kind: 'healthy' })

	useEffect(() => {
		let cancelled = false
		let unsubscribe: (() => void) | undefined

		void supervision.current().then(current => {
			if (!cancelled) setState(current)
		})
		void supervision
			.subscribe(next => {
				if (!cancelled) setState(next)
			})
			.then(fn => {
				// The subscription can resolve after the effect was torn down; drop it immediately
				// rather than leaking a listener that outlives the component.
				if (cancelled) fn()
				else unsubscribe = fn
			})

		return () => {
			cancelled = true
			unsubscribe?.()
		}
	}, [supervision])

	if (state.kind !== 'down' || state.sidecar !== 'gateway') return null

	return (
		<div
			role="alert"
			data-testid="supervision-banner"
			data-sidecar={state.sidecar}
			className={cn(
				'flex shrink-0 items-center justify-center gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-foreground',
				className,
			)}
			{...props}
		>
			<span className="font-medium">{t('console.supervision.gatewayDownTitle')}</span>
			<span className="text-muted-foreground">{t('console.supervision.gatewayDownDescription')}</span>
			<Button data-testid="supervision-restart" size="sm" variant="outline" onClick={() => void supervision.restart()}>
				{t('console.supervision.restart')}
			</Button>
		</div>
	)
}
