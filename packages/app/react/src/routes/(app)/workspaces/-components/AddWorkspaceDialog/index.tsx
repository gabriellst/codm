import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconFolderOpen } from '@tabler/icons-react'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { addWorkspaceMutationRequestSchema, listWorkspacesQueryKey, useAddWorkspace } from '@codm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useFilePicker } from '@/services'
import { useDialogStore } from '@/stores/useDialogStore'

/** "Add folder" flow: point CodeDM at a project folder; badges are detected server-side. */
export function AddWorkspaceDialog() {
	const { t } = useTranslation()
	const hide = useDialogStore(s => s.hide)
	const queryClient = useQueryClient()
	const addWorkspace = useAddWorkspace()

	// The SAME schema the controller validates — `path` is a non-empty absolute path under 1024 chars.
	// Nothing here restates those rules, so they cannot drift from the backend's.
	const form = useForm({
		defaultValues: { path: '' },
		validators: { onChange: addWorkspaceMutationRequestSchema },
		onSubmit: async ({ value }) => {
			addWorkspace.mutate(
				{ data: value },
				{
					onSuccess: () => {
						queryClient.invalidateQueries({ queryKey: listWorkspacesQueryKey() })
						hide()
					},
				},
			)
		},
	})

	// OS folder picker via the FilePicker PORT (capability-gated: the browser binding
	// reports no path-capable picker, so the manual input stays the only affordance).
	const filePicker = useFilePicker()
	const [canPickFolder, setCanPickFolder] = useState(false)
	useEffect(() => {
		let cancelled = false
		filePicker.supportsFolderPicker().then(supported => {
			if (!cancelled) setCanPickFolder(supported)
		})
		return () => {
			cancelled = true
		}
	}, [filePicker])
	const pickFolder = async () => {
		const picked = await filePicker.pickFolder({ title: t('workspaces.addTitle') })
		if (picked) form.setFieldValue('path', picked)
	}

	return (
		<DialogContent>
			<DialogHeader>
				<DialogTitle>{t('workspaces.addTitle')}</DialogTitle>
				<DialogDescription>{t('workspaces.addDescription')}</DialogDescription>
			</DialogHeader>

			<form
				noValidate
				onSubmit={e => {
					e.preventDefault()
					e.stopPropagation()
					form.handleSubmit()
				}}
			>
				<form.Field name="path">
					{field => (
						<Field>
							<FieldLabel htmlFor={field.name}>{t('workspaces.projectFolder')}</FieldLabel>
							<div className="flex gap-2">
								<Input
									id={field.name}
									className="font-mono"
									placeholder={t('workspaces.pathPlaceholder')}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={e => field.handleChange(e.target.value)}
								/>
								{canPickFolder && (
									<Button type="button" variant="outline" onClick={pickFolder}>
										<IconFolderOpen data-icon="inline-start" /> {t('workspaces.browse')}
									</Button>
								)}
							</div>
							{field.state.meta.errors[0] && <FieldError>{String(field.state.meta.errors[0]?.message ?? '')}</FieldError>}
						</Field>
					)}
				</form.Field>

				<DialogFooter className="mt-4">
					<Button type="button" variant="ghost" onClick={hide}>
						{t('common.cancel')}
					</Button>
					<form.Subscribe selector={s => [s.canSubmit, s.isSubmitting] as const}>
						{([canSubmit, isSubmitting]) => (
							<Button type="submit" disabled={!canSubmit || addWorkspace.isPending}>
								{isSubmitting || addWorkspace.isPending ? <Spinner className="mr-2" /> : null}
								{addWorkspace.isPending ? t('workspaces.adding') : t('workspaces.addFolder')}
							</Button>
						)}
					</form.Subscribe>
				</DialogFooter>
			</form>
		</DialogContent>
	)
}
