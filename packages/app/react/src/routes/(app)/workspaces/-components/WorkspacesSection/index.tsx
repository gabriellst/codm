import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconFolder, IconPlus, IconTrash } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { listWorkspacesQueryKey, useListWorkspaces, useRemoveWorkspace } from '@codm/client-typescript/typescript'
import type { ListWorkspacesQueryResponse } from '@codm/client-typescript/typescript'
import { PageHeader } from '@/components/console/PageHeader'
import { enumLabel } from '@/lib'
import { cn } from '@/lib/utils'
import { workspaceBadgeVariant } from '@/components/console/glyphs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
import { row } from '@/components/ui/surfaces'
import { useDialogStore } from '@/stores/useDialogStore'
import { AddWorkspaceDialog } from '../AddWorkspaceDialog'

type Workspace = ListWorkspacesQueryResponse['workspaces'][number]

const workspaceGrid = 'grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3'

/** O contrato não carrega `name`: `path` é o único identificador humano, então o último segmento
 *  vira o título do card e o caminho inteiro vira a descrição embaixo. */
function folderName(path: string): string {
	return path.split('/').filter(Boolean).pop() ?? path
}

/** Registered project folders on this Mac, with their git/Claude badges and thread counts (T07). */
export function WorkspacesSection({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const { data, isLoading } = useListWorkspaces()
	const show = useDialogStore(s => s.show)
	const workspaces = data?.workspaces ?? []

	return (
		<div className={cn('mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 pb-16 pt-20', className)} {...props}>
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
					<div className={workspaceGrid}>
						<Skeleton className="h-36 rounded-asymmetric-lg" />
						<Skeleton className="h-36 rounded-asymmetric-lg" />
						<Skeleton className="h-36 rounded-asymmetric-lg" />
					</div>
				) : workspaces.length === 0 ? (
					<Empty>
						<EmptyTitle>{t('workspaces.emptyTitle')}</EmptyTitle>
						<EmptyDescription>{t('workspaces.emptyDescription')}</EmptyDescription>
					</Empty>
				) : (
					<div className={workspaceGrid}>
						{workspaces.map(workspace => (
							<WorkspaceCard key={workspace.workspaceId} workspace={workspace} />
						))}
					</div>
				)}
			</div>
		</div>
	)
}

/** Card de grid: a pasta em cima, o caminho e os selos embaixo. O tile do ícone usa o par
 *  --secondary/--secondary-foreground que os tokens declaram como regra sem exceção, e a escada
 *  `rounded-asymmetric-*` — nunca um raio simétrico literal. */
function WorkspaceCard({ workspace }: { workspace: Workspace }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const confirm = useDialogStore(s => s.confirm)
	// Callback no HOOK, não no `mutate()`: `confirm()` ocupa o mesmo slot de conteúdo do dialog e a
	// convenção do repo é manter o efeito na mutação, não no observer do componente. O ERRO não
	// precisa de tratamento aqui — o `MutationCache` global do router.tsx já vira toast, e
	// `WORKSPACE_IN_USE` (422, quando uma issue está WORKING na pasta) já tem tradução em pt e en.
	const removeWorkspace = useRemoveWorkspace({
		mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: listWorkspacesQueryKey() }) },
	})

	const onRemove = async () => {
		const ok = await confirm({
			title: t('workspaces.removeConfirmTitle'),
			description: t('workspaces.removeConfirmDescription', { name: folderName(workspace.path) }),
			actionLabel: t('workspaces.removeConfirmAction'),
			cancelLabel: t('common.cancel'),
			variant: 'destructive',
		})
		if (!ok) return
		removeWorkspace.mutate({ workspaceId: workspace.workspaceId })
	}

	return (
		<div className={cn('group flex flex-col gap-3 rounded-asymmetric-lg bg-background p-4', row)}>
			<div className="flex items-start justify-between gap-2">
				<span className="flex size-11 shrink-0 items-center justify-center rounded-asymmetric-sm bg-secondary text-secondary-foreground">
					<IconFolder className="size-5" />
				</span>
				{/* Ação destrutiva só aparece no hover do card — `group-hover:`, a convenção que os
				    tokens documentam para descendentes ecoarem a afordância da row. */}
				<Button
					variant="ghost"
					size="icon"
					type="button"
					aria-label={t('workspaces.remove')}
					disabled={removeWorkspace.isPending}
					onClick={onRemove}
					className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
				>
					<IconTrash className="size-4" />
				</Button>
			</div>
			<div className="flex min-w-0 flex-col gap-1">
				<span className="truncate text-sm font-semibold text-foreground">{folderName(workspace.path)}</span>
				<span className="truncate font-mono text-xs text-muted-foreground" title={workspace.path}>
					{workspace.path}
				</span>
			</div>
			<div className="flex flex-wrap items-center gap-1.5">
				{workspace.badges.map(badge => (
					<Badge key={badge} variant={workspaceBadgeVariant[badge]}>
						{enumLabel('WorkspaceBadge', badge)}
					</Badge>
				))}
				<span className="ml-auto shrink-0 text-xs text-muted-foreground">
					{t('workspaces.threadCount', { count: workspace.threadCount })}
				</span>
			</div>
		</div>
	)
}
