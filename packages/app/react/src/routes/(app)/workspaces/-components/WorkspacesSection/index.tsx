import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconFolder, IconPlus } from '@tabler/icons-react'
import { useListWorkspaces } from '@codm/client-typescript/typescript'
import type { ListWorkspacesQueryResponse } from '@codm/client-typescript/typescript'
import { PageHeader } from '@/components/console/PageHeader'
import { enumLabel } from '@/lib'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
import { useDialogStore } from '@/stores/useDialogStore'
import { AddWorkspaceDialog } from '../AddWorkspaceDialog'

type Workspace = ListWorkspacesQueryResponse['workspaces'][number]

/** Registered project folders on this Mac, with their git/Claude badges and thread counts (T07). */
export function WorkspacesSection({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const { data, isLoading } = useListWorkspaces()
	const show = useDialogStore(s => s.show)
	const workspaces = data?.workspaces ?? []

	return (
		<div className={cn('mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-16 pt-20', className)} {...props}>
			<PageHeader
				title={t('workspaces.title')}
				action={
					<Button onClick={() => show(<AddWorkspaceDialog />)}>
						<IconPlus data-icon="inline-start" /> {t('workspaces.addFolder')}
					</Button>
				}
			/>

			<div className="flex flex-col gap-2">
				<h2 className="label-eyebrow px-1">{t('workspaces.projectFolders')}</h2>
				{isLoading ? (
					<div className="flex flex-col gap-3">
						<Skeleton className="h-16 rounded-2xl" />
						<Skeleton className="h-16 rounded-2xl" />
					</div>
				) : workspaces.length === 0 ? (
					<Empty>
						<EmptyTitle>{t('workspaces.emptyTitle')}</EmptyTitle>
						<EmptyDescription>{t('workspaces.emptyDescription')}</EmptyDescription>
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
	const { t } = useTranslation()
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
							{enumLabel('WorkspaceBadge', badge)}
						</Badge>
					))}
				</div>
			</div>
			<span className="shrink-0 text-sm text-muted-foreground">{t('workspaces.threadCount', { count: workspace.threadCount })}</span>
		</div>
	)
}
