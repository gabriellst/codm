import { IconFolder } from '@tabler/icons-react'
import { useListWorkspaces } from '@codedm/client-typescript/typescript'
import type { ListWorkspacesQueryResponse, WorkspaceBadge } from '@codedm/client-typescript/typescript'
import { PageHeader } from '@/components/console/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
import { AddWorkspaceDialog } from '../AddWorkspaceDialog'

const badgeLabel: Record<WorkspaceBadge, string> = { GIT: 'git', CLAUDE_PROJECT: 'Claude project' }

type Workspace = ListWorkspacesQueryResponse['workspaces'][number]

/** Registered project folders on this Mac, with their git/Claude badges and thread counts (T07). */
export function WorkspacesSection() {
	const { data, isLoading } = useListWorkspaces()
	const workspaces = data?.workspaces ?? []

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-16 pt-20">
			<PageHeader title="Workspaces" action={<AddWorkspaceDialog />} />

			<div className="flex flex-col gap-2">
				<h2 className="label-eyebrow px-1">Project folders</h2>
				{isLoading ? (
					<div className="flex flex-col gap-3">
						<Skeleton className="h-16 rounded-2xl" />
						<Skeleton className="h-16 rounded-2xl" />
					</div>
				) : workspaces.length === 0 ? (
					<Empty>
						<EmptyTitle>No workspaces yet</EmptyTitle>
						<EmptyDescription>Add a project folder and CodeDM will detect its git repo and Claude project.</EmptyDescription>
					</Empty>
				) : (
					<div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
						{workspaces.map(workspace => (
							<WorkspaceRow key={workspace.workspaceId} workspace={workspace} />
						))}
					</div>
				)}
			</div>
		</div>
	)
}

function WorkspaceRow({ workspace }: { workspace: Workspace }) {
	return (
		<div className="flex items-center gap-4 p-4">
			<span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
				<IconFolder className="size-5" />
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<span className="truncate font-mono text-sm font-semibold text-foreground">{workspace.path}</span>
				<div className="flex flex-wrap gap-1.5">
					{workspace.badges.map(badge => (
						<Badge key={badge} variant="outline">
							{badgeLabel[badge]}
						</Badge>
					))}
				</div>
			</div>
			<span className="shrink-0 text-sm text-muted-foreground">
				{workspace.threadCount} {String(workspace.threadCount === 1 ? 'thread' : 'threads')}
			</span>
		</div>
	)
}
