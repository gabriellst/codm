import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@codm/app-ui/dialog'
import { cn } from '@/lib/utils'
import { useDialogStore } from '@/stores/useDialogStore'
import { AddWorkspaceForm } from '../AddWorkspaceForm'

/** "Add folder" dialog shell — chrome only; the form + folder picker live in `AddWorkspaceForm`. */
export function AddWorkspaceDialog({ className }: Pick<ComponentProps<typeof DialogContent>, 'className'>) {
	const { t } = useTranslation()
	const hide = useDialogStore(s => s.hide)

	return (
		<DialogContent className={cn(className)}>
			<DialogHeader>
				<DialogTitle>{t('workspaces.addTitle')}</DialogTitle>
				<DialogDescription>{t('workspaces.addDescription')}</DialogDescription>
			</DialogHeader>
			<AddWorkspaceForm onDone={hide} />
		</DialogContent>
	)
}
