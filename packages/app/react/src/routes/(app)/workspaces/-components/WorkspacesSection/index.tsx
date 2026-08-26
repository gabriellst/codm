import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconFolder, IconFolderPlus, IconPlus, IconTrash } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { listWorkspacesQueryKey, useListWorkspaces, useRemoveWorkspace } from '@codm/client-typescript/typescript'
import type { ListWorkspacesQueryResponse } from '@codm/client-typescript/typescript'
import { PageHeader } from '@/components/console/PageHeader'
import { enumLabel } from '@/lib'
import { cn } from '@/lib/utils'
import { workspaceBadgeVariant } from '@/components/console/glyphs'
import { Badge } from '@codm/app-ui/badge'
import { Button } from '@codm/app-ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@codm/app-ui/empty'
import { row, sectionLabelBare } from '@codm/app-ui/surfaces'
import { useDialogStore } from '@/stores/useDialogStore'
import { AddWorkspaceDialog } from '../AddWorkspaceDialog'

type Workspace = ListWorkspacesQueryResponse['workspaces'][number]

const workspaceGrid = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'

/** O contrato não carrega `name`: `path` é o único identificador humano, então o último segmento
 *  vira o título do card e o caminho inteiro vira a descrição embaixo. */
function folderName(path: string): string {
	return path.split('/').filter(Boolean).pop() ?? path
}

/** Registered project folders on this computer, with their git/Claude badges and thread counts (T07). */
export function WorkspacesSection({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const { data, isLoading } = useListWorkspaces()
	const show = useDialogStore(s => s.show)
	const workspaces = data?.workspaces ?? []

	return (
		<div className={cn('mx-auto flex w-full flex-col gap-8 px-6 pb-16 pt-20', className)} {...props}>
			<PageHeader
				title={t('workspaces.title')}
				action={
					<Button onClick={() => show(<AddWorkspaceDialog />)}>
						<IconPlus data-icon="inline-start" /> {t('workspaces.addFolder')}
					</Button>
				}
			/>

			<div className="flex flex-col gap-2.5">
				<h2 className={sectionLabelBare}>{t('workspaces.projectFolders')}</h2>
				{isLoading ? (
					<div className={workspaceGrid}>
						<WorkspaceCardSkeleton />
						<WorkspaceCardSkeleton />
						<WorkspaceCardSkeleton />
					</div>
				) : workspaces.length === 0 ? (
					<Empty className="border border-solid border-border bg-background">
						<EmptyHeader>
							<EmptyTitle className="text-lg font-extrabold text-foreground">{t('workspaces.emptyTitle')}</EmptyTitle>
							<EmptyDescription>{t('workspaces.emptyDescription')}</EmptyDescription>
						</EmptyHeader>
						<EmptyContent className="w-full max-w-none">
							<div className={cn(workspaceGrid, 'w-full')}>
								<AddFolderTile />
							</div>
						</EmptyContent>
					</Empty>
				) : (
					<div className={workspaceGrid}>
						{workspaces.map(workspace => (
							<WorkspaceCard key={workspace.workspaceId} workspace={workspace} />
						))}
						{/* D3 (R20) — the "add a folder" tile lives IN the grid too, next to the header
						    button, not only in the header. */}
						<AddFolderTile />
					</div>
				)}
			</div>
		</div>
	)
}

/** The dashed "Adicionar pasta" tile that rides along the folder grid (R20) — same action as the
 *  header button, rendered both in the loaded grid (trailing item) and the empty state. Composes
 *  from the shared `Button` (variant="ghost" + size="none", shape entirely in `className`) rather
 *  than a raw `<button>` — the same escape hatch `ChannelsSection`'s row already uses for a
 *  content-shaped clickable surface that isn't a normal button. */
function AddFolderTile({ className, ...props }: ComponentProps<'button'>) {
	const { t } = useTranslation()
	const show = useDialogStore(s => s.show)

	return (
		<Button
			variant="ghost"
			size="none"
			type="button"
			onClick={() => show(<AddWorkspaceDialog />)}
			className={cn(
				'flex flex-col items-center justify-center gap-3.5 rounded-asymmetric-lg border border-dashed border-input bg-card p-10 transition-colors hover:bg-muted/60',
				className,
			)}
			{...props}
		>
			<span className="flex size-11 shrink-0 items-center justify-center rounded-asymmetric-sm bg-muted text-muted-foreground">
				<IconFolderPlus className="size-5" />
			</span>
			<span className="text-sm font-bold text-foreground">{t('workspaces.addFolder')}</span>
		</Button>
	)
}

/** Loading placeholder shaped like `WorkspaceCard` itself (D3) — skeleton greys, not a generic box,
 *  so the grid doesn't jump in shape once the real cards land. */
function WorkspaceCardSkeleton({ className, ...props }: ComponentProps<'div'>) {
	return (
		<div className={cn('flex flex-col gap-4 rounded-asymmetric-lg border border-border bg-background p-5', className)} {...props}>
			<div className="flex flex-col gap-4">
				<div className="size-11 rounded-asymmetric-sm bg-skeleton" />
				<div className="flex flex-col gap-2">
					<div className="h-3.5 w-28 rounded-asymmetric-3xs bg-skeleton-strong" />
					<div className="h-2.5 w-44 rounded-asymmetric-3xs bg-skeleton" />
				</div>
			</div>
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<div className="h-[23px] w-10 rounded-asymmetric-2xs bg-skeleton" />
					<div className="h-[23px] w-24 rounded-asymmetric-2xs bg-skeleton" />
				</div>
				<div className="h-2.5 w-16 rounded-asymmetric-3xs bg-skeleton" />
			</div>
		</div>
	)
}

/** Card de grid: a pasta em cima, o caminho e os selos embaixo. O tile do ícone usa o par
 *  --secondary/--secondary-foreground que os tokens declaram como regra sem exceção, e a escada
 *  `rounded-asymmetric-*` — nunca um raio simétrico literal. */
function WorkspaceCard({ workspace, className, ...props }: ComponentProps<'div'> & { workspace: Workspace }) {
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
		<div className={cn('group flex flex-col gap-4 rounded-asymmetric-lg bg-background p-5', row, className)} {...props}>
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
			{/* D3 (R19) — the name/count sizes were the only mismatch here: fs17/fw700 and fs13,
			    not the generic text-sm/text-xs steps. */}
			<div className="flex min-w-0 flex-col gap-1">
				<span className="truncate text-[17px] font-bold text-foreground">{folderName(workspace.path)}</span>
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
				<span className="ml-auto shrink-0 text-[13px] text-muted-foreground">
					{t('workspaces.threadCount', { count: workspace.threadCount })}
				</span>
			</div>
		</div>
	)
}
