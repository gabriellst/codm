import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useGetPanelBoard } from '@codm/client-typescript/typescript-cloud'
import { Board, BoardColumnBody } from '@codm/app-ui/board'
import { KanbanColumn, KanbanColumnHeader } from '@codm/app-ui/kanban'
import { statusDotVariants } from '@codm/app-ui/status-pill'
import { groupByTaskColumn, TASK_COLUMNS, type TaskColumn } from '@/lib/task/issueBoard'
import { cn } from '@/lib/utils'
import { BatchChips, GroupTitle, HealthLine, IdentityChip } from './PanelHeader'
import { PanelTaskCard } from './PanelTaskCard'
import { usePanelToken } from './panelToken'

const columnId = (column: TaskColumn) => `panel-column-${column}`

/**
 * THE BOARD (N6 wide, N7 phone — one tree, the cut is `md`): the group's header (name and counts, health, the
 * batches, who this device is) and the six columns by live state, "Precisa de você" emphasized. On a phone the
 * columns become a horizontal snap strip, one column at a time, with tabs above it that jump to a column.
 */
export function PanelBoard({ className, ...props }: ComponentProps<'div'>) {
	return (
		<div className={cn('flex h-full min-h-0 flex-col gap-4 px-4 pt-4 pb-2 md:px-6 md:pt-6', className)} {...props}>
			<header className="flex flex-wrap items-center justify-between gap-3">
				<GroupTitle />
				<IdentityChip className="md:order-last" />
				<div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:flex-1 md:justify-end">
					<HealthLine />
					<BatchChips />
				</div>
			</header>
			<PanelColumns className="min-h-0 flex-1" />
		</div>
	)
}

function PanelColumns({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const token = usePanelToken()
	const { data: board } = useGetPanelBoard(token)
	const byColumn = useMemo(() => groupByTaskColumn(board?.issues ?? []), [board])
	const strip = useRef<HTMLDivElement>(null)
	// Which column the phone strip shows — scroll position mirrored for the tabs' highlight; truly local
	// transient UI (state placement, case 5): it is not a view anyone links to.
	const [shown, setShown] = useState<TaskColumn>('needsYou')

	// On a phone the strip opens on "Precisa de você" (N7) — once, when the board first arrives.
	const loaded = board !== undefined
	useEffect(() => {
		const el = strip.current
		const target = document.getElementById(columnId('needsYou'))
		// Only where the tabs show (below `md`): a wider strip that scrolls starts at its first column.
		if (!loaded || !el || !target || window.matchMedia('(min-width: 48rem)').matches) return
		el.scrollLeft = target.offsetLeft - el.offsetLeft - 16
	}, [loaded])

	const jumpTo = (column: TaskColumn) => {
		setShown(column)
		document.getElementById(columnId(column))?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
	}
	const onScroll = () => {
		const el = strip.current
		const first = el?.firstElementChild
		if (!el || !(first instanceof HTMLElement)) return
		const index = Math.round(el.scrollLeft / (first.offsetWidth + 12))
		const column = TASK_COLUMNS[Math.min(TASK_COLUMNS.length - 1, Math.max(0, index))]
		if (column && column !== shown) setShown(column)
	}

	return (
		<div className={cn('flex flex-col gap-3', className)} {...props}>
			<nav aria-label={t('panel.board.columns')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:hidden">
				{TASK_COLUMNS.map(column => (
					<button
						key={column}
						type="button"
						aria-current={shown === column || undefined}
						onClick={() => jumpTo(column)}
						className="flex shrink-0 cursor-pointer items-center gap-2 rounded-full bg-muted px-3.5 py-2 text-sm font-bold text-foreground aria-current:bg-foreground aria-current:text-background"
					>
						<span aria-hidden="true" className={statusDotVariants({ tone: column })} />
						{t(`task.columns.${column}`)}
						<span className="font-semibold opacity-60">{byColumn.get(column)?.length ?? 0}</span>
					</button>
				))}
			</nav>
			<Board
				ref={strip}
				data-testid="panel-board"
				onScroll={onScroll}
				className="-mx-4 min-h-0 w-auto flex-1 items-stretch px-4 md:mx-0 md:w-full md:px-0"
			>
				{TASK_COLUMNS.map(column => (
					<KanbanColumn
						key={column}
						id={columnId(column)}
						data-column={column}
						className="w-[calc(100%-3rem)] max-w-96 md:w-auto md:max-w-none md:min-w-52 xl:min-w-0"
					>
						<KanbanColumnHeader
							tone={column}
							emphasis={column === 'needsYou'}
							title={t(`task.columns.${column}`)}
							count={byColumn.get(column)?.length ?? 0}
						/>
						<BoardColumnBody className="overflow-y-auto">
							{(byColumn.get(column) ?? []).map(issue => (
								<PanelTaskCard key={issue.issueId} issue={issue} />
							))}
						</BoardColumnBody>
					</KanbanColumn>
				))}
			</Board>
		</div>
	)
}
