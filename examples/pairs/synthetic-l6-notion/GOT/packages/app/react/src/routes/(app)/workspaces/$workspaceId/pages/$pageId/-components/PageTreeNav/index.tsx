import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteApi, Link } from '@tanstack/react-router'
import { useGetWorkspacePageTree } from '@codedm/client-typescript/typescript'
import type { PageTreeNode } from '@codedm/client-typescript/typescript'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const routeApi = getRouteApi('/(app)/workspaces/$workspaceId/pages/$pageId/')

function NavSkeleton() {
	return (
		<div className="flex flex-col gap-2 p-4">
			<Skeleton className="h-4 w-32 mb-2" />
			<Skeleton className="h-4 w-28" />
			<Skeleton className="h-4 w-36" />
			<Skeleton className="h-4 w-24" />
			<Skeleton className="h-4 w-30" />
		</div>
	)
}

interface PageTreeNavNodeProps {
	node: PageTreeNode
	workspaceId: string
	activePageId: string
	depth?: number
}

function PageTreeNavNode({ node, workspaceId, activePageId, depth = 0 }: PageTreeNavNodeProps) {
	const isActive = node.id === activePageId

	return (
		<li role="listitem" aria-label={node.title}>
			<Link
				to="/workspaces/$workspaceId/pages/$pageId"
				params={{ workspaceId, pageId: node.id }}
				className={cn(
					'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
					depth > 0 && 'ml-4',
					isActive
						? 'bg-accent text-accent-foreground font-medium'
						: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
				)}
				aria-current={isActive ? 'page' : undefined}
			>
				{node.title}
			</Link>
			{node.children.length > 0 && (
				<ul role="list" aria-label={node.title} className="mt-1">
					{node.children.map(child => (
						<PageTreeNavNode
							key={child.id}
							node={child}
							workspaceId={workspaceId}
							activePageId={activePageId}
							depth={depth + 1}
						/>
					))}
				</ul>
			)}
		</li>
	)
}

export function PageTreeNav({ className, ...props }: ComponentProps<'nav'>) {
	const { t } = useTranslation()
	const { workspaceId, pageId } = routeApi.useParams()

	const { data, isPending, isError } = useGetWorkspacePageTree(workspaceId)

	return (
		<nav
			className={cn('flex flex-col gap-2 w-60 shrink-0 border-r border-border pr-4', className)}
			aria-label={t('pageTree.navAriaLabel')}
			{...props}
		>
			<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-3 py-2">
				{t('pageTree.title')}
			</p>

			{isPending ? (
				<NavSkeleton />
			) : isError ? (
				<p className="px-3 text-sm text-destructive">{t('pageTree.loadError')}</p>
			) : data?.pages.length === 0 ? (
				<p className="px-3 text-sm text-muted-foreground">{t('pageTree.empty')}</p>
			) : (
				<ul role="list" aria-label={t('pageTree.navAriaLabel')} className="flex flex-col gap-1">
					{data?.pages.map(node => (
						<PageTreeNavNode
							key={node.id}
							node={node}
							workspaceId={workspaceId}
							activePageId={pageId}
						/>
					))}
				</ul>
			)}
		</nav>
	)
}
