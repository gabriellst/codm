import type { ComponentProps } from 'react'
import { IconPlayerPause } from '@tabler/icons-react'
import type { StopKind, StopResolution } from '@codm/client-typescript/typescript'
import { Button } from '@codm/app-ui/button'
import { resolutionIsPrimary } from '@/components/console/glyphs'
import { enumLabel } from '@/lib/enums'
import { cn } from '@/lib/utils'
import { useTaskSurface } from './TaskSurface'

/**
 * An OPEN stop without an ask, inline in the task conversation — the agent stopped (server error, approval,
 * permission…) and waits for one of the resolutions the stop admits. The pastel card the detail page has
 * always used for it; the buttons go through the surface's port.
 */
export function TaskStopCard({
	stopId,
	stopKind,
	title,
	resolutions,
	className,
	...props
}: Omit<ComponentProps<'div'>, 'title'> & { stopId: string; stopKind: StopKind; title: string; resolutions: readonly StopResolution[] }) {
	const surface = useTaskSurface()
	return (
		<div
			data-testid="task-stop"
			className={cn(
				'flex flex-wrap items-center gap-3.5 rounded-asymmetric-md bg-secondary px-4 py-3.5 text-secondary-foreground',
				className,
			)}
			{...props}
		>
			<IconPlayerPause className="size-[1.1875rem] shrink-0" />
			<p className="min-w-0 flex-1 text-sm font-medium">
				{enumLabel('StopKind', stopKind)}
				{title ? ` — ${title}` : ''}
			</p>
			{surface.canAct && resolutions.length > 0 && (
				<div className="flex shrink-0 flex-wrap items-center gap-2">
					{resolutions.map(resolution => (
						<Button
							key={resolution}
							size="sm"
							variant={resolutionIsPrimary[resolution] ? 'default' : 'outline'}
							disabled={surface.pending || !surface.canRelease}
							onClick={() => surface.resolveStop(stopId, resolution)}
						>
							{enumLabel('StopResolution', resolution)}
						</Button>
					))}
				</div>
			)}
		</div>
	)
}
