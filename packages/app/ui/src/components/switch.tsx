'use client'

import { Switch as SwitchPrimitive } from '@base-ui/react/switch'

import { cn } from '../lib/cn'

/**
 * Pill switch. Track and thumb are proportioned so the thumb sits with an even 3px gutter on every
 * side (a real inset, not a thumb that fills the track), and both track colour and thumb travel
 * ease over 200ms. `default` is the settings-row size; `sm` is for dense inline rows.
 *
 * Geometry (no border, so insets are exact): thumb travel = trackWidth − thumbWidth − 3px, starting
 * 3px in from the left. default 42×24 track / 18 thumb → 21px travel; sm 36×20 track / 14 thumb → 19px.
 */
function Switch({
	className,
	size = 'default',
	...props
}: SwitchPrimitive.Root.Props & {
	size?: 'sm' | 'default'
}) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			data-size={size}
			className={cn(
				'group/switch peer relative inline-flex shrink-0 cursor-pointer items-center rounded-full outline-none transition-colors duration-200 ease-out',
				'data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80',
				'data-[size=default]:h-6 data-[size=default]:w-[2.625rem] data-[size=sm]:h-5 data-[size=sm]:w-9',
				'focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
				'data-disabled:cursor-not-allowed data-disabled:opacity-50',
				// widen the touch target without changing the visual footprint
				'after:absolute after:-inset-x-2 after:-inset-y-2',
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className={cn(
					'pointer-events-none block rounded-full bg-background shadow-sm ring-0 transition-transform duration-200 ease-out',
					'dark:data-unchecked:bg-foreground dark:data-checked:bg-primary-foreground',
					'group-data-[size=default]/switch:size-[1.125rem] group-data-[size=sm]/switch:size-3.5',
					'group-data-[size=default]/switch:data-unchecked:translate-x-[3px] group-data-[size=default]/switch:data-checked:translate-x-[1.3125rem]',
					'group-data-[size=sm]/switch:data-unchecked:translate-x-[3px] group-data-[size=sm]/switch:data-checked:translate-x-[1.1875rem]',
				)}
			/>
		</SwitchPrimitive.Root>
	)
}

export { Switch }
