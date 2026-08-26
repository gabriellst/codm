export { DataTable, useDataTable } from './DataTable'
export { DataTableContent } from './DataTableContent'
export { DataTableSearch } from './DataTableSearch'
export { DataTablePagination } from './DataTablePagination'
export type { DataTableConfig } from './types'
// Re-export TanStack types — consumers use ColumnDef<TRow> from @tanstack/react-table and
// put project-specific options (align/width/cellClassName/sortKey) on `meta`. The module
// augmentation in types.ts types those fields everywhere.
export type { ColumnDef, Row, Table, CellContext, HeaderContext } from '@tanstack/react-table'
