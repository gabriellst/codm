import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteApi } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useGetPageView, getPageViewQueryKey } from '@template/client-typescript/typescript'
import { useServerEvents } from '@/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import { Block } from './Block'
import { CreateBlockControl } from './CreateBlockControl'

const routeApi = getRouteApi('/(app)/workspaces/$workspaceId/pages/$pageId/')

function PageSkeleton() {
	return (
		<div className="flex flex-col gap-4">
			<Skeleton className="h-8 w-64" />
			<Skeleton className="h-4 w-full" />
			<Skeleton className="h-4 w-3/4" />
			<Skeleton className="h-4 w-5/6" />
		</div>
	)
}

export function PageViewSection({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const { workspaceId, pageId } = routeApi.useParams()
	const queryClient = useQueryClient()

	const { data, isPending, isError } = useGetPageView(pageId)

	useServerEvents('integration.shared.page.content_changed', event => {
		if (event.payload.workspaceId !== workspaceId) return
		queryClient.invalidateQueries({ queryKey: getPageViewQueryKey(pageId) })
	})

	const blocks = data?.blocks ?? []

	return (
		<div className={cn('flex flex-col gap-4', className)} {...props}>
			{isPending ? (
				<PageSkeleton />
			) : isError ? (
				<p className="text-sm text-destructive">{t('page.loadError')}</p>
			) : (
				<>
					<h1 className="text-2xl font-bold text-foreground">{data?.title ?? t('page.untitled')}</h1>
					<div className="flex flex-col gap-2" role="list" aria-label={t('page.blocksListAriaLabel')}>
						{blocks.map(b => (
							<Block key={b.id} block={b} pageId={pageId} />
						))}
					</div>
					<CreateBlockControl pageId={pageId} parentBlockId={null} />
				</>
			)}
		</div>
	)
}
