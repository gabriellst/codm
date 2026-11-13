import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { IconCopy, IconRefresh } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { getThreadPanelLinkQueryKey, useGetThreadPanelLink, useRotateThreadPanelLink } from '@codm/client-typescript/typescript'
import { Button } from '@codm/app-ui/button'
import { tryCatchAsync } from '@/lib'
import { useDialogStore } from '@/stores/useDialogStore'
import { cn } from '@/lib/utils'

/**
 * The group's PANEL LINK (fase 1): the web page where everyone in this WhatsApp group sees the board and
 * each task's timeline, without the desktop app. Copy it into the group; replace it when someone leaves
 * or it leaks — the old link stops working at once.
 *
 * The link exists once the daemon has pushed this conversation to the cloud (every 15 s while logged in),
 * so a brand-new conversation shows "being prepared" for a moment.
 */
export function PanelLinkSection({ threadId, className, ...props }: { threadId: string } & ComponentProps<'section'>) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { confirm } = useDialogStore()
	const { data, isLoading } = useGetThreadPanelLink(threadId)
	// The effect lives on the HOOK (bp-30): it survives the dialog unmounting before the cloud answers.
	const rotate = useRotateThreadPanelLink({
		mutation: {
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: getThreadPanelLinkQueryKey(threadId) })
				toast.success(t('session.panelLink.rotated'))
			},
		},
	})
	const url = data?.url

	const onCopy = async () => {
		if (!url) return
		const result = await tryCatchAsync(() => navigator.clipboard.writeText(url))
		if (result.success) toast.success(t('session.panelLink.copied'))
		else toast.error(t('common.errorTitle'))
	}

	// Replacing kills the link everyone in the group has — confirmed first, like any destructive action here.
	const onRotate = async () => {
		const ok = await confirm({
			title: t('session.panelLink.rotateConfirmTitle'),
			description: t('session.panelLink.rotateConfirmDescription'),
			actionLabel: t('session.panelLink.rotate'),
			cancelLabel: t('common.cancel'),
			variant: 'destructive',
		})
		if (!ok) return
		rotate.mutate({ threadId })
	}

	return (
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			<div className="flex items-center justify-between gap-4 border-b border-border pb-2">
				<h3 className="text-sm font-bold text-foreground">{t('session.panelLink.sectionTitle')}</h3>
			</div>
			<p className="text-sm text-muted-foreground">{t('session.panelLink.hint')}</p>
			{isLoading ? null : url ? (
				<div className="flex flex-col gap-2">
					<code className="block truncate rounded-asymmetric-sm bg-muted px-3 py-2 font-mono text-xs" title={url}>
						{url}
					</code>
					<div className="flex flex-wrap gap-2">
						<Button variant="outline" size="sm" onClick={onCopy}>
							<IconCopy data-icon="inline-start" /> {t('session.panelLink.copy')}
						</Button>
						<Button variant="ghost" size="sm" disabled={rotate.isPending} onClick={onRotate}>
							<IconRefresh data-icon="inline-start" /> {t('session.panelLink.rotate')}
						</Button>
					</div>
				</div>
			) : (
				<p className="text-sm text-muted-foreground">{t('session.panelLink.pending')}</p>
			)}
		</section>
	)
}
