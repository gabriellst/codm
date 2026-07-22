import type { ReactNode } from 'react'
import { IconInfoCircleFilled } from '@tabler/icons-react'

import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface InfoHintProps {
	/** Tooltip content (caller passes a translated string). */
	children: ReactNode
	/** aria-label for the trigger. */
	label?: string
	className?: string
}

/** InfoHint — an (i) info dot that reveals a tooltip. */
export function InfoHint({ children, label = 'Info', className }: InfoHintProps) {
	return (
		<Tooltip>
			<TooltipTrigger
				aria-label={label}
				className={cn('inline-flex text-muted-foreground transition-colors hover:text-foreground', className)}
			>
				<IconInfoCircleFilled className="size-3" />
			</TooltipTrigger>
			<TooltipContent>{children}</TooltipContent>
		</Tooltip>
	)
}
