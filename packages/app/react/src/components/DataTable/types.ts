import type { ColumnDef } from '@tanstack/react-table'

/**
 * Project-specific extensions on TanStack's `ColumnDef['meta']`. Augmented
 * directly into `@tanstack/react-table` below so `column.columnDef.meta` is
 * typed everywhere it's read (header/row/cell renderers).
 *
 * - `align` — applied to header + cell via Tailwind text-{align} classes.
 * - `width` — passed to <TableHead style>/<TableCell style>; accepts any CSS width.
 * - `cellClassName` — extra classes applied to the cell only.
 * - `sortKey` — override the value sent to `config.onSortChange` (defaults to column id).
 *   Useful when the server's sort field differs from the column id.
 */
declare module '@tanstack/react-table' {
	interface ColumnMeta<TData, TValue> {
		width?: string
		align?: 'left' | 'center' | 'right'
		cellClassName?: string
		sortKey?: string
	}
}

/**
 * Controlled props consumed by the DataTable. Sorting/pagination/filtering are
 * server-driven — these are the externally-managed state the table reflects.
 */
export interface DataTableConfig<TRow> {
	columns: ColumnDef<TRow>[]
	getRowId: (row: TRow) => string
	data: TRow[]
	total: number
	totalPages: number
	isLoading: boolean
	page: number
	limit: number
	search: string
	sortBy?: string
	sortOrder?: 'ASC' | 'DESC'
	onPageChange: (page: number) => void
	onLimitChange: (limit: number) => void
	onSearchChange: (search: string) => void
	onSortChange?: (key: string) => void
}
