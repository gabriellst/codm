import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@codm/app-ui/dialog'
import { cn } from '@/lib/utils'
import { useDialogStore } from '@/stores/useDialogStore'
import { PublishCommandForm } from '../PublishCommandForm'

/** "Publish command" dialog shell — chrome only; the read, the argument list and the save live in `PublishCommandForm`. */
export function PublishCommandDialog({
	workspaceId,
	className,
}: Pick<ComponentProps<typeof DialogContent>, 'className'> & { workspaceId: string }) {
	const { t } = useTranslation()
	const hide = useDialogStore(s => s.hide)

	return (
		<DialogContent className={cn(className)}>
			<DialogHeader>
				<DialogTitle>{t('workspaces.publishCommand.title')}</DialogTitle>
				<DialogDescription>{t('workspaces.publishCommand.description')}</DialogDescription>
			</DialogHeader>
			<PublishCommandForm workspaceId={workspaceId} onDone={hide} />
		</DialogContent>
	)
}
