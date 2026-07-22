import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { useListBoards } from '@template/client-typescript/typescript'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function BoardsListSection({ className, ...props }: ComponentProps<'div'>) {
  const { t } = useTranslation()
  const { data, isLoading } = useListBoards()

  if (isLoading) {
    return (
      <div className={cn('flex flex-col gap-4', className)} {...props}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  const items = data?.items ?? []

  return (
    <div className={cn('flex flex-col gap-4', className)} {...props}>
      <h1 className="text-xl font-semibold">{t('kanban.boards.title')}</h1>
      {items.length === 0 ? (
        <p className="text-muted-foreground">{t('kanban.boards.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map(board => (
            <li key={board.id}>
              <Link
                to="/kanban/$boardId"
                params={{ boardId: board.id }}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 hover:bg-card/80 transition-colors"
              >
                <span className="font-medium">{board.title}</span>
                <span className="ml-auto text-sm text-muted-foreground">
                  {t('kanban.boards.listCount', { count: board.listCount })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
