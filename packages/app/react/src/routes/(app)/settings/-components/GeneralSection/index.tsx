import { useGetSettings } from '@codedm/client-typescript/typescript'
import { Skeleton } from '@/components/ui/skeleton'

/** General preferences and environment facts (T08): operator, timezone, data dir, app version. */
export function GeneralSection() {
	const { data, isLoading } = useGetSettings()

	if (isLoading || !data) {
		return (
			<section className="flex flex-col gap-3">
				<h2 className="label-eyebrow">General</h2>
				<Skeleton className="h-24 rounded-2xl" />
			</section>
		)
	}

	const rows: { label: string; value: string; mono?: boolean }[] = [
		{ label: 'Operator', value: data.general.operatorName },
		{ label: 'Timezone', value: data.general.timezone },
		{ label: 'Data directory', value: data.general.dataDir, mono: true },
		{ label: 'App version', value: data.appVersion, mono: true },
	]

	return (
		<section className="flex flex-col gap-3">
			<h2 className="label-eyebrow">General</h2>
			<div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
				{rows.map(row => (
					<div key={row.label} className="flex items-center justify-between gap-4 p-4">
						<span className="text-sm font-medium text-foreground">{row.label}</span>
						<span className={`truncate text-sm text-muted-foreground ${row.mono ? 'font-mono text-xs' : ''}`}>{row.value}</span>
					</div>
				))}
			</div>
		</section>
	)
}
