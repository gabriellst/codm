import * as React from 'react'
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'

import { cn } from '@/lib/utils'
import { surface } from './surfaces'

function TooltipProvider({ delay = 0, ...props }: TooltipPrimitive.Provider.Props) {
	return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
	return (
		<TooltipProvider>
			<TooltipPrimitive.Root data-slot="tooltip" {...props} />
		</TooltipProvider>
	)
}

const TooltipTrigger = React.forwardRef<HTMLButtonElement, TooltipPrimitive.Trigger.Props>(function TooltipTrigger({ ...props }, ref) {
	return <TooltipPrimitive.Trigger ref={ref} data-slot="tooltip-trigger" {...props} />
})

function TooltipContent({
	className,
	side = 'top',
	sideOffset = 4,
	align = 'center',
	alignOffset = 0,
	positionMethod = 'fixed',
	children,
	...props
}: TooltipPrimitive.Popup.Props &
	Pick<TooltipPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset' | 'positionMethod'>) {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Positioner
				align={align}
				alignOffset={alignOffset}
				side={side}
				sideOffset={sideOffset}
				positionMethod={positionMethod}
				className="pointer-events-none isolate z-50"
			>
				<TooltipPrimitive.Popup
					data-slot="tooltip-content"
					className={cn(
						surface,
						// Pure opacity fade — no slide/zoom transform. Any transform animates the popup (and its
						// arrow) through fractional-pixel positions, and the rotated arrow snaps/shimmers as it
						// settles (the "twitch" / half-pixel). Fading in place keeps the arrow pixel-stable.
						// `pointer-events-none` so an open tooltip never intercepts the pointer — you can hover
						// the trigger behind/below it and open the next tooltip (no dead "safe zone").
						'transform-gpu backface-hidden pointer-events-none data-open:animate-in data-open:fade-in-0 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-closed:animate-out data-closed:fade-out-0 rounded-md px-3 py-2 text-xs z-50 w-fit max-w-xs',
						className,
					)}
					{...props}
				>
					{children}
					{/* Arrow color matches the box's gradient edge per side (surface fades background→+8% top→bottom),
					    so the indicator blends instead of showing a flat patch. */}
					<TooltipPrimitive.Arrow className="size-2.5 transform-gpu translate-y-[calc(-50%_-_0.125rem)] rotate-45 rounded-[0.15rem] bg-[color-mix(in_oklab,var(--background),var(--foreground)_4%)] fill-[color-mix(in_oklab,var(--background),var(--foreground)_4%)] z-50 data-[side=top]:left-1/2! data-[side=top]:-translate-x-1/2 data-[side=bottom]:left-1/2! data-[side=bottom]:-translate-x-1/2 data-[side=top]:bg-[color-mix(in_oklab,var(--background),var(--foreground)_8%)] data-[side=top]:fill-[color-mix(in_oklab,var(--background),var(--foreground)_8%)] data-[side=bottom]:bg-background data-[side=bottom]:fill-[var(--background)] data-[side=bottom]:top-1 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5" />
				</TooltipPrimitive.Popup>
			</TooltipPrimitive.Positioner>
		</TooltipPrimitive.Portal>
	)
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
