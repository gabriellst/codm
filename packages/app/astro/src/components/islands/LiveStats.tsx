import { useEffect, useState } from 'react'

interface Props {
	/** Static string shown until (and unless) a live value arrives. */
	fallback: string
}

/**
 * Live-number pill (§2.4). Dormant infrastructure: when PUBLIC_STATS_URL is unset
 * the fallback renders and no request is ever made — the landing works with no
 * daemon. On any fetch failure the fallback stays. Same pill markup either way,
 * so a live value causes zero layout shift.
 */
export default function LiveStats({ fallback }: Props) {
	const [value, setValue] = useState(fallback)

	useEffect(() => {
		const url = import.meta.env.PUBLIC_STATS_URL
		if (!url) return

		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), 3000)

		fetch(url, { signal: controller.signal })
			.then(r => {
				if (!r.ok) throw new Error(`stats fetch ${r.status}`)
				return r.json()
			})
			.then((data: { value?: string | number }) => {
				if (data.value !== undefined) setValue(String(data.value))
			})
			.catch(() => {
				/* keep the fallback */
			})
			.finally(() => clearTimeout(timeout))

		return () => {
			clearTimeout(timeout)
			controller.abort()
		}
	}, [])

	return (
		<span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-[var(--muted)] px-4 py-1.5 font-mono text-xs text-[var(--muted-foreground)]">
			{value}
		</span>
	)
}
