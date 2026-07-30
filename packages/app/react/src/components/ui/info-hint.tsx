import type { ComponentProps, ReactNode } from 'react'
import { IconInfoCircleFilled } from '@tabler/icons-react'

import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// `children` is the tooltip CONTENT, not the trigger's — it stays outside the spread so
// `ComponentProps<typeof TooltipTrigger>['children']` never leaks the wrong slot to callers.
interface InfoHintProps extends Omit<ComponentProps<typeof TooltipTrigger>, 'children'> {
	/** Tooltip content (caller passes a translated string). */
	children: ReactNode
	/** aria-label for the trigger. */
	label?: string
}

/** InfoHint — an (i) info dot that reveals a tooltip. */
export function InfoHint({ children, label = 'Info', className, ...props }: InfoHintProps) {
	return (
		<Tooltip>
			<TooltipTrigger
				aria-label={label}
				className={cn('inline-flex text-muted-foreground transition-colors hover:text-foreground', className)}
				{...props}
			>
				<IconInfoCircleFilled className="size-3" />
			</TooltipTrigger>
			<TooltipContent>{children}</TooltipContent>
		</Tooltip>
	)
}
