import { type ComponentProps } from 'react'
import { flexRender, type Row } from '@tanstack/react-table'
import { IconArrowUp, IconArrowDown, IconArrowsUpDown, IconDatabaseOff } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { surface } from '@/components/ui/surfaces'
import { cn } from '@/lib/utils'

import { useDataTable } from './DataTable'

interface DataTableContentProps extends ComponentProps<'div'> {
	/** Replaces the default empty state. */
	emptyState?: React.ReactNode
	/** Replaces the default loading skeleton. */
	loadingState?: React.ReactNode
	/** Rows drawn by the default loading skeleton. */
	loadingRows?: number
}

/**
 * Surface-wrapped table body. Renders the header, then dispatches to one of:
 * loading skeleton (when `config.isLoading`), empty state (when `data.length === 0`),
 * or the actual row model. `children` is rendered above the table (typically a toolbar).
 */
export function DataTableContent({ children, className, emptyState, loadingState, loadingRows = 5, ...props }: DataTableContentProps) {
	const { config } = useDataTable()

	return (
		<div
			className={cn(
				surface,
				'rounded-lg text-foreground shadow-[0_0.125rem_0.5rem_rgb(0_0_0_/_0.08)] dark:shadow-[0_0.125rem_0.5rem_rgb(0_0_0_/_0.15)]',
				className,
			)}
			{...props}
		>
			{children}
			<Table>
				<DataTableHeader />
				{config.isLoading ? (
					(loadingState ?? <DataTableLoading rows={loadingRows} />)
				) : config.data.length === 0 ? (
					<TableBody>{emptyState ?? <DataTableEmpty />}</TableBody>
				) : (
					<DataTableBody />
				)}
			</Table>
		</div>
	)
}

// ──────────────────────────────────────────────
// Internal renderers — header, body, row, empty, loading.
// Kept private to this file (no public exports) because they're implementation
// details of <DataTableContent>. Consumers customize via the `emptyState` /
// `loadingState` props or by replacing <DataTableContent> wholesale.
// ──────────────────────────────────────────────

function DataTableHeader() {
	const { table, config } = useDataTable()
	return (
		<TableHeader>
			{table.getHeaderGroups().map(headerGroup => (
				<TableRow key={headerGroup.id} className="hover:bg-hover/20 h-25">
					<TableHead className="w-10">
						<Checkbox
							checked={table.getIsAllRowsSelected()}
							indeterminate={table.getIsSomeRowsSelected()}
							onCheckedChange={() => table.toggleAllRowsSelected()}
						/>
					</TableHead>
					{headerGroup.headers.map(header => {
						const meta = header.column.columnDef.meta
						const canSort = header.column.getCanSort()
						const sortKey = meta?.sortKey ?? header.column.id
						const isActive = config.sortBy === sortKey
						return (
							<TableHead
								key={header.id}
								style={{ width: meta?.width }}
								className={cn(
									'text-foreground/70 text-sm font-semibold',
									meta?.align === 'right' && 'text-right',
									meta?.align === 'center' && 'text-center',
									canSort && 'cursor-pointer select-none hover:opacity-70 transition-opacity',
								)}
								onClick={canSort && config.onSortChange ? () => config.onSortChange?.(sortKey) : undefined}
							>
								<span className="inline-flex items-center gap-2">
									{flexRender(header.column.columnDef.header, header.getContext())}
									{canSort && (
										<span className="text-foreground/40">
											{isActive && config.sortOrder === 'ASC' && <IconArrowUp className="size-3.5" />}
											{isActive && config.sortOrder === 'DESC' && <IconArrowDown className="size-3.5" />}
											{!isActive && <IconArrowsUpDown className="size-3.5" />}
										</span>
									)}
								</span>
							</TableHead>
						)
					})}
				</TableRow>
			))}
		</TableHeader>
	)
}

function DataTableBody() {
	const { table } = useDataTable()
	return (
		<TableBody>
			{table.getRowModel().rows.map(row => (
				<DataTableRow key={row.id} row={row} />
			))}
		</TableBody>
	)
}

function DataTableRow<TRow>({ row }: { row: Row<TRow> }) {
	// Clicking anywhere on the row toggles selection, EXCEPT when the click originates inside
	// an interactive element (button/input/anchor/role-driven controls, popover triggers, or any
	// element opting out via `data-row-click-ignore`). Without this guard, clicking an editable
	// cell's popover trigger would also toggle the row.
	const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
		const target = e.target as HTMLElement
		if (
			target.closest('button, a, input, textarea, select, [role="button"], [role="menuitem"], [role="option"], [data-row-click-ignore]')
		) {
			return
		}
		row.toggleSelected()
	}

	return (
		<TableRow
			className="border-border/20 hover:bg-hover/20 transition-colors h-26 cursor-pointer"
			data-state={row.getIsSelected() ? 'selected' : undefined}
			onClick={handleRowClick}
		>
			<TableCell className="w-10">
				<Checkbox checked={row.getIsSelected()} onCheckedChange={() => row.toggleSelected()} />
			</TableCell>
			{row.getVisibleCells().map(cell => {
				const meta = cell.column.columnDef.meta
				return (
					<TableCell
						key={cell.id}
						style={{ width: meta?.width }}
						className={cn(
							'text-sm',
							meta?.align === 'right' && 'text-right',
							meta?.align === 'center' && 'text-center',
							meta?.cellClassName,
						)}
					>
						{flexRender(cell.column.columnDef.cell, cell.getContext())}
					</TableCell>
				)
			})}
		</TableRow>
	)
}

function DataTableEmpty() {
	const { t } = useTranslation()
	const { table } = useDataTable()
	const visibleCount = table.getVisibleLeafColumns().length + 1 // +1 for selection column

	return (
		<TableRow className="hover:bg-hover/20">
			<TableCell colSpan={visibleCount}>
				<Empty className="py-12">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<IconDatabaseOff />
						</EmptyMedia>
						<EmptyTitle>{t('dataTable.emptyTitle')}</EmptyTitle>
						<EmptyDescription>{t('dataTable.emptyDescription')}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</TableCell>
		</TableRow>
	)
}

function DataTableLoading({ rows }: { rows: number }) {
	const { table } = useDataTable()
	const visibleCount = table.getVisibleLeafColumns().length + 1 // +1 for selection column

	return (
		<TableBody>
			{Array.from({ length: rows }).map((_, rowIdx) => (
				<TableRow key={rowIdx} className="border-border/30 hover:bg-hover/20">
					{Array.from({ length: visibleCount }).map((_, colIdx) => (
						<TableCell key={colIdx}>
							<Skeleton className="h-4 w-full" />
						</TableCell>
					))}
				</TableRow>
			))}
		</TableBody>
	)
}
