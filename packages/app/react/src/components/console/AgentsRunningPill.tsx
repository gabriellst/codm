import { useQueryClient } from '@tanstack/react-query'
import { getHomeDashboardQueryKey, useGetHomeDashboard } from '@codedm/client-typescript/typescript'
import { useServerEvents } from '@/hooks'
import { Dot } from './StatusDot'

/**
 * The persistent operating pulse in the top-right of every console page: how many
 * agents are running right now. Owns its own data and stays live — the SSE
 * `browser.thread_status_changed` frame carries a fresh count, so we invalidate the
 * dashboard read (never hand-mutate the cache) whenever a thread flips state.
 */
export function AgentsRunningPill() {
	const queryClient = useQueryClient()
	const { data } = useGetHomeDashboard()

	useServerEvents('browser.thread_status_changed', () => {
		queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() })
	})

	const count = data?.agentsRunningNow ?? 0
	const running = count > 0

	return (
		<span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3.5 py-1.5 text-sm font-medium text-secondary-foreground shadow-sm">
			<Dot className={running ? 'bg-success' : 'bg-muted-foreground/40'} />
			{count} {String(count === 1 ? 'agent' : 'agents')} running
		</span>
	)
}
