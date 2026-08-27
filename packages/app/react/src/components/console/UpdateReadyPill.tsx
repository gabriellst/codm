import type { ComponentProps } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconRefresh } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { useUpdate } from '@/services'

/**
 * Claude-Desktop-style restart prompt. The shell installs updates silently and automatically in
 * the background (`updater.rs`'s `run_check`) but deliberately stops short of restarting itself —
 * a self-triggered relaunch could drop the operator mid-conversation with zero warning. This pill
 * is the ONE surface that tells them a version is ready and lets THEM pick the moment; clicking it
 * is the only thing that restarts the app.
 *
 * PULL then PUSH, same shape as `SupervisionBanner`: `pending()` covers a
 * console that mounts AFTER the background check already finished installing (the ask+listen
 * pattern `commands/boot.rs` documents — an event fired before the page mounted is simply lost, so
 * the page also ASKS), `subscribe` covers an install completing while the console is already open.
 *
 * Renders nothing until a version is pending — most sessions never see this at all.
 */
export function UpdateReadyPill({ className, ...props }: ComponentProps<'button'>) {
	const { t } = useTranslation()
	const update = useUpdate()
	const [version, setVersion] = useState<string | null>(null)

	useEffect(() => {
		let cancelled = false
		let unsubscribe: (() => void) | undefined

		void update.pending().then(v => {
			if (!cancelled) setVersion(v)
		})
		void update
			.subscribe(v => {
				if (!cancelled) setVersion(v)
			})
			.then(fn => {
				// The subscription can resolve after teardown; drop it rather than leak a listener.
				if (cancelled) fn()
				else unsubscribe = fn
			})

		return () => {
			cancelled = true
			unsubscribe?.()
		}
	}, [update])

	if (!version) return null

	return (
		<button
			type="button"
			data-testid="update-ready-pill"
			data-version={version}
			onClick={() => void update.restart()}
			className={cn(
				// Cor do botão primário (mesma do variante `default` do Button): o aviso PRECISA chamar
				// atenção sobre o conteúdo, e o resto do console é deliberadamente plano. Sem sombra —
				// nenhuma outra superfície da UI tem, e a que existia aqui denunciava um componente
				// desenhado fora do sistema. A largura casa com a área interna da sidebar (w-60 menos o
				// px-4 dos dois lados = w-52), então o pill fica alinhado com os itens de navegação.
				'flex w-52 items-center gap-2.5 rounded-xl bg-primary px-3.5 py-2.5 text-left text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/85',
				className,
			)}
			{...props}
		>
			<IconRefresh className="size-4 shrink-0" />
			<span className="flex flex-col leading-tight">
				<span className="text-sm font-semibold">{t('console.update.restartTitle')}</span>
				<span className="text-xs text-primary-foreground/75">{t('console.update.version', { version })}</span>
			</span>
		</button>
	)
}
