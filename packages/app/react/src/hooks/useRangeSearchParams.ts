import { useCallback, useState } from 'react'
import { endOfDay, startOfDay } from 'date-fns'
import type { DateRange } from 'react-day-picker'

interface RangeSearchParams {
	startDate?: Date
	endDate?: Date
}

export function useRangeSearchParams<T extends RangeSearchParams>(onSearchParamsChange: (updates: Partial<T>) => void) {
	const [pendingRange, setPendingRange] = useState<DateRange | undefined>(undefined)

	const handleRangeChange = useCallback(
		(range: DateRange | undefined, partialChanges: Partial<T>) => {
			if (!range?.from) return

			setPendingRange(range)

			if (!range.to) return

			const newStartDate = startOfDay(range.from)
			const newEndDate = endOfDay(range.to)

			onSearchParamsChange({
				...partialChanges,
				startDate: newStartDate,
				endDate: newEndDate,
			})
		},
		[onSearchParamsChange],
	)

	return { pendingRange, handleRangeChange }
}
