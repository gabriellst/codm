import { useCallback, useEffect, useRef } from 'react'

export function useTimeout() {
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	const clear = useCallback(() => {
		if (!timeoutRef.current) return

		clearTimeout(timeoutRef.current)
		timeoutRef.current = null
	}, [])

	const start = useCallback(
		(callback: () => void, delay: number) => {
			clear()

			timeoutRef.current = setTimeout(() => {
				timeoutRef.current = null
				callback()
			}, delay)
		},
		[clear],
	)

	useEffect(() => clear, [clear])

	return { start, clear }
}
