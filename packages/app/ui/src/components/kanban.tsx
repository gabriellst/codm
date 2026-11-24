import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../lib/cn'
import { BoardColumn } from './board'
import { statusDotVariants, type StatusTone } from './status-pill'

/**
 * The live-state kanban column (pen "Coluna / Kanban"), composed ON TOP of `board.tsx` — which stays
 * untouched (frozen screens use it). Compose as:
 *
 *   <Board>
 *     <KanbanColumn aria-labelledby="col-needs">
 *       <KanbanColumnHeader id="col-needs" tone="needsYou" title="Precisa de você" count={2} emphasis />
 *       <BoardColumnBody>…<TaskCard size="compact" />…</BoardColumnBody>
 *     </KanbanColumn>
 *   </Board>
 *
 * Column: `--card` fill, [18,18,18,6], padding/gap 8. Header: 30px, the SAME 7px dot per tone as
 * `StatusPill` (one map, imported), title 12.5 bold, count 12 bold caption. `emphasis` turns the
 * header into the dark strip (the "precisa de você" column).
 */

function KanbanColumn({ className, ...props }: React.ComponentProps<typeof BoardColumn>) {
	return <BoardColumn data-slot="kanban-column" className={cn('gap-1.75 bg-card p-1.75', className)} {...props} />
}

const kanbanColumnHeaderVariants = cva('flex h-6.25 min-w-0 items-center gap-2 rounded-asymmetric-xs px-2.25', {
	variants: {
		emphasis: {
			true: 'bg-foreground text-background',
			false: 'text-foreground',
		},
	},
	defaultVariants: { emphasis: false },
})

const kanbanColumnCountVariants = cva('shrink-0 text-xs font-bold tabular-nums', {
	variants: {
		emphasis: {
			true: 'text-background/60',
			false: 'text-caption-foreground',
		},
	},
	defaultVariants: { emphasis: false },
})

type KanbanColumnHeaderProps = Omit<React.ComponentProps<'header'>, 'title'> &
	VariantProps<typeof kanbanColumnHeaderVariants> & {
		tone: StatusTone
		title: React.ReactNode
		count: number
	}

function KanbanColumnHeader({ tone, title, count, emphasis = false, className, ...props }: KanbanColumnHeaderProps) {
	return (
		<header
			data-slot="kanban-column-header"
			data-tone={tone}
			className={cn(kanbanColumnHeaderVariants({ emphasis }), className)}
			{...props}
		>
			<span aria-hidden="true" className={statusDotVariants({ tone })} />
			<h2 className="min-w-0 flex-1 truncate text-[12.5px] font-bold">{title}</h2>
			<span className={kanbanColumnCountVariants({ emphasis })}>{count}</span>
		</header>
	)
}

export { KanbanColumn, KanbanColumnHeader, kanbanColumnHeaderVariants, kanbanColumnCountVariants }
