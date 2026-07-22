import { createContext, useContext, useMemo } from 'react'
import { useReactTable, getCoreRowModel, type SortingState, type Table } from '@tanstack/react-table'

import type { DataTableConfig } from './types'

// ──────────────────────────────────────────────
// Context — provides the TanStack Table instance + controlled config to slot
// components (DataTableContent, DataTableSearch, DataTablePagination).
// Lives in this file because it's tightly coupled to <DataTable>.
// ──────────────────────────────────────────────

interface DataTableContextValue<TRow = unknown> {
	table: Table<TRow>
	config: DataTableConfig<TRow>
}

const DataTableContext = createContext<DataTableContextValue | null>(null)

export function useDataTable<TRow = unknown>(): DataTableContextValue<TRow> {
	const ctx = useContext(DataTableContext)
	if (!ctx) throw new Error('useDataTable must be used within a <DataTable>')
	return ctx as DataTableContextValue<TRow>
}

// ──────────────────────────────────────────────
// <DataTable> — wires controlled props into useReactTable and exposes the
// instance via context. Sorting/pagination/filtering are server-driven; we
// only track state here so the table instance has accurate `state.sorting`,
// row-selection, and visibility for future features (multi-sort, column-menu,
// resizing, expansion, virtualization).
// ──────────────────────────────────────────────

interface DataTableProps<TRow> extends DataTableConfig<TRow> {
	children: React.ReactNode
	/** Column ids that start hidden. Toggle at runtime via `table.setColumnVisibility`. */
	initialHiddenColumns?: string[]
}

export function DataTable<TRow>({ children, initialHiddenColumns, ...config }: DataTableProps<TRow>) {
	// Resolve `config.sortBy` (server's sort field) back to a column id via `meta.sortKey`.
	const sorting: SortingState = useMemo(() => {
		if (!config.sortBy) return []
		const matched = config.columns.find(c => (c.meta?.sortKey ?? c.id) === config.sortBy)
		if (!matched?.id) return []
		return [{ id: matched.id, desc: config.sortOrder === 'DESC' }]
	}, [config.sortBy, config.sortOrder, config.columns])

	const initialColumnVisibility = useMemo(() => {
		const out: Record<string, boolean> = {}
		if (initialHiddenColumns) for (const id of initialHiddenColumns) out[id] = false
		return out
	}, [])

	const table = useReactTable<TRow>({
		data: config.data,
		columns: config.columns,
		getRowId: config.getRowId,
		manualSorting: true,
		manualPagination: true,
		manualFiltering: true,
		state: { sorting },
		enableRowSelection: true,
		enableHiding: true,
		initialState: { columnVisibility: initialColumnVisibility },
		getCoreRowModel: getCoreRowModel(),
	})

	return <DataTableContext.Provider value={{ table, config } as DataTableContextValue}>{children}</DataTableContext.Provider>
}
