import type { ComponentProps } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  useGetBoard,
  getBoardQueryKey,
  type GetBoardListItem,
  type GetBoardCardItem,
} from '@codedm/client-typescript/typescript'
import { useServerEvents } from '@/hooks'
import { useDialogStore } from '@/stores/useDialogStore'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CreateCardDialog } from '../CreateCardDialog'

const routeApi = getRouteApi('/(app)/kanban/$boardId/')

export function BoardSection({ className, ...props }: ComponentProps<'div'>) {
  const { boardId } = routeApi.useParams()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { show } = useDialogStore()

  const { data: board, isLoading } = useGetBoard(boardId)

  useServerEvents('integration.shared.card.moved', event => {
    if (event.payload.boardId !== boardId) return
    queryClient.invalidateQueries({ queryKey: getBoardQueryKey(boardId) })
  })

  if (isLoading) {
    return (
      <div className={cn('flex gap-4', className)} {...props}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-64 shrink-0 rounded-lg" />
        ))}
      </div>
    )
  }

  if (!board) return null

  return (
    <div className={cn('flex flex-col gap-4', className)} {...props}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{board.title}</h1>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {board.lists.map(list => (
          <BoardListColumn
            key={list.id}
            list={list}
            onAddCard={() =>
              show(<CreateCardDialog boardId={boardId} listId={list.id} />)
            }
            t={t}
          />
        ))}
      </div>
    </div>
  )
}

interface BoardListColumnProps extends ComponentProps<'div'> {
  list: GetBoardListItem
  onAddCard: () => void
  t: (key: string) => string
}

function BoardListColumn({ list, onAddCard, t, className, ...props }: BoardListColumnProps) {
  return (
    <div className={cn('flex w-64 shrink-0 flex-col gap-2 rounded-lg border border-border bg-card p-3', className)} {...props}>
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{list.title}</h2>
        <span className="text-sm text-muted-foreground">{list.cards.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {list.cards.map(card => (
          <CardItem key={card.id} card={card} />
        ))}
      </div>
      <Button variant="ghost" size="sm" className="mt-1 justify-start" onClick={onAddCard}>
        {`+ ${t('kanban.board.addCard')}`}
      </Button>
    </div>
  )
}

interface CardItemProps extends ComponentProps<'div'> {
  card: GetBoardCardItem
}

function CardItem({ card, className, ...props }: CardItemProps) {
  return (
    <div className={cn('rounded border border-border bg-background p-2 text-sm', className)} {...props}>
      {card.title}
    </div>
  )
}
