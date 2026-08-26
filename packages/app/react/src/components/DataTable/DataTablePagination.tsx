import { type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
	PaginationEllipsis,
} from '@codm/app-ui/pagination'
import { Combobox, ComboboxSelectTrigger, ComboboxContent, ComboboxList, ComboboxItem } from '@codm/app-ui/combobox'
import { useDataTable } from './DataTable'
import { cn } from '@/lib/utils'

interface DataTablePaginationProps extends ComponentProps<'div'> {
	pageSizeOptions?: number[]
}

export function DataTablePagination({ pageSizeOptions = [10, 20, 50, 100], className, ...props }: DataTablePaginationProps) {
	const { t } = useTranslation()
	const { config } = useDataTable()
	const { page, totalPages, limit, onPageChange, onLimitChange } = config

	const pages = getPageNumbers(page, totalPages)

	return (
		<div className={cn('flex items-center justify-between gap-4 py-4', className)} {...props}>
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Combobox value={String(limit)} onValueChange={v => v && onLimitChange(Number(v))}>
					<ComboboxSelectTrigger size="sm">{limit}</ComboboxSelectTrigger>
					<ComboboxContent>
						<ComboboxList>
							{pageSizeOptions.map(size => (
								<ComboboxItem key={size} value={String(size)}>
									{size}
								</ComboboxItem>
							))}
						</ComboboxList>
					</ComboboxContent>
				</Combobox>
				<span>{t('dataTable.itemsPerPage')}</span>
			</div>

			{totalPages > 1 && (
				<Pagination className="mx-0 w-auto justify-end">
					<PaginationContent>
						<PaginationItem>
							<PaginationPrevious
								onClick={() => page > 1 && onPageChange(page - 1)}
								className={cn(page <= 1 && 'pointer-events-none opacity-50')}
							/>
						</PaginationItem>

						{pages.map((p, i) =>
							p === 'ellipsis' ? (
								<PaginationItem key={`ellipsis-${i}`}>
									<PaginationEllipsis />
								</PaginationItem>
							) : (
								<PaginationItem key={p}>
									<PaginationLink isActive={p === page} onClick={() => onPageChange(p)}>
										{p}
									</PaginationLink>
								</PaginationItem>
							),
						)}

						<PaginationItem>
							<PaginationNext
								onClick={() => page < totalPages && onPageChange(page + 1)}
								className={cn(page >= totalPages && 'pointer-events-none opacity-50')}
							/>
						</PaginationItem>
					</PaginationContent>
				</Pagination>
			)}
		</div>
	)
}

function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
	if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1)

	const pages: (number | 'ellipsis')[] = []

	if (current <= 3) {
		for (let i = 1; i <= 3; i++) pages.push(i)
	} else {
		pages.push(1)
		pages.push('ellipsis')
		pages.push(current)
	}

	if (current < total - 2) {
		pages.push('ellipsis')
	}

	if (pages[pages.length - 1] !== total) {
		pages.push(total)
	}

	return pages
}
