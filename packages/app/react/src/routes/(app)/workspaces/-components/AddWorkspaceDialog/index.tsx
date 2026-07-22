import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
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

/** "Add folder" flow: point CodeDM at a project folder; badges are detected server-side. */
export function AddWorkspaceDialog() {
	const [open, setOpen] = useState(false)
	const [path, setPath] = useState('')
	const queryClient = useQueryClient()
	const addWorkspace = useAddWorkspace()

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
						<IconPlus data-icon="inline-start" /> Add folder
					</Button>
				}
			/>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add a workspace</DialogTitle>
					<DialogDescription>
						Point at a project folder on this Mac. Git and Claude-project badges are detected automatically.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-2">
					<Label htmlFor="workspace-path">Project folder</Label>
					<Input
						id="workspace-path"
						className="font-mono"
						placeholder="~/dev/acme-storefront"
						value={path}
						onChange={e => setPath(e.target.value)}
						onKeyDown={e => e.key === 'Enter' && submit()}
					/>
				</div>
				<DialogFooter>
					<DialogClose render={<Button variant="ghost">Cancel</Button>} />
					<Button onClick={submit} disabled={!path.trim() || addWorkspace.isPending}>
						{String(addWorkspace.isPending ? 'Adding…' : 'Add folder')}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
