import { cn } from '../lib/cn'

/**
 * A kanban BOARD: columns side by side that scroll horizontally on a narrow screen, each column a header
 * (title + count) over a vertical list of cards. Presentational only — what a column holds and in which
 * order is the caller's decision; there is no drag here (the plan allows dragging only where it is a real
 * command, and none is wired yet).
 */
function Board({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="board"
			className={cn('flex w-full min-w-0 snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]', className)}
			{...props}
		/>
	)
}

function BoardColumn({ className, ...props }: React.ComponentProps<'section'>) {
	return (
		<section
			data-slot="board-column"
			className={cn(
				'flex w-72 shrink-0 snap-start flex-col gap-2 rounded-asymmetric-md bg-muted/40 p-2 md:w-auto md:min-w-64 md:flex-1',
				className,
			)}
			{...props}
		/>
	)
}

function BoardColumnHeader({
	title,
	count,
	className,
	...props
}: React.ComponentProps<'header'> & { title: React.ReactNode; count: number }) {
	return (
		<header data-slot="board-column-header" className={cn('flex items-center justify-between gap-2 px-1.5 py-1', className)} {...props}>
			<h2 className="label-eyebrow truncate">{title}</h2>
			<span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{count}</span>
		</header>
	)
}

function BoardColumnBody({ className, ...props }: React.ComponentProps<'div'>) {
	return <div data-slot="board-column-body" className={cn('flex min-h-16 flex-col gap-2', className)} {...props} />
}

export { Board, BoardColumn, BoardColumnHeader, BoardColumnBody }
