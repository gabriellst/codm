import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconFolderOpen, IconPlus } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { listWorkspacesQueryKey, useAddWorkspace } from '@codedm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFilePicker } from '@/services'

/** "Add folder" flow: point CodeDM at a project folder; badges are detected server-side. */
export function AddWorkspaceDialog() {
	const { t } = useTranslation()
	const [open, setOpen] = useState(false)
	const [path, setPath] = useState('')
	const queryClient = useQueryClient()
	const addWorkspace = useAddWorkspace()
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
		if (picked) setPath(picked)
	}

	const submit = () => {
		const trimmed = path.trim()
		if (!trimmed) return
		addWorkspace.mutate(
			{ data: { path: trimmed } },
			{
				onSuccess: () => {
					queryClient.invalidateQueries({ queryKey: listWorkspacesQueryKey() })
					setPath('')
					setOpen(false)
				},
			},
		)
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				render={
					<Button>
						<IconPlus data-icon="inline-start" /> {t('workspaces.addFolder')}
					</Button>
				}
			/>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t('workspaces.addTitle')}</DialogTitle>
					<DialogDescription>{t('workspaces.addDescription')}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-2">
					<Label htmlFor="workspace-path">{t('workspaces.projectFolder')}</Label>
					<div className="flex gap-2">
						<Input
							id="workspace-path"
							className="font-mono"
							placeholder={t('workspaces.pathPlaceholder')}
							value={path}
							onChange={e => setPath(e.target.value)}
							onKeyDown={e => e.key === 'Enter' && submit()}
						/>
						{canPickFolder && (
							<Button variant="outline" onClick={pickFolder}>
								<IconFolderOpen data-icon="inline-start" /> {t('workspaces.browse')}
							</Button>
						)}
					</div>
				</div>
				<DialogFooter>
					<DialogClose render={<Button variant="ghost">{t('common.cancel')}</Button>} />
					<Button onClick={submit} disabled={!path.trim() || addWorkspace.isPending}>
						{addWorkspace.isPending ? t('workspaces.adding') : t('workspaces.addFolder')}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
