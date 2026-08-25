import { useState, useEffect, useRef, useCallback } from 'react'

interface UseDebouncedSearchOptions {
	initialValue: string
	onSearch: (value: string) => void
	delay?: number
}

export function useDebouncedSearch({ initialValue, onSearch, delay = 300 }: UseDebouncedSearchOptions) {
	const [inputValue, setInputValue] = useState(initialValue)
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const onSearchRef = useRef(onSearch)
	onSearchRef.current = onSearch

	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current)
		}
	}, [])

	const handleSearchChange = useCallback(
		(value: string) => {
			setInputValue(value)

			if (timeoutRef.current) clearTimeout(timeoutRef.current)

			timeoutRef.current = setTimeout(() => {
				onSearchRef.current(value)
			}, delay)
		},
		[delay],
	)

	return { inputValue, handleSearchChange }
}
