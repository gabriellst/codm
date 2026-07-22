'use client'

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// Plain background gradients (no gradient-box, no border ring) — tabs layer the
// gradient as a normal background-image so any active separator/underline (the
// trigger's ::after) sits visually on top of the bar fill, not on top of a
// gradient-box border.
const tabsListBg = 'bg-[linear-gradient(var(--background)_-20%,color-mix(in_oklab,var(--background),var(--foreground)_8%)_100%)]'
const tabsTriggerActiveBg =
	'data-active:bg-[linear-gradient(color-mix(in_oklab,var(--background),var(--foreground)_11%)_-15%,color-mix(in_oklab,var(--background),var(--foreground)_3%)_100%)]'

function Tabs({ className, orientation = 'horizontal', ...props }: TabsPrimitive.Root.Props) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			data-orientation={orientation}
			className={cn('gap-2 group/tabs flex data-[orientation=horizontal]:flex-col', className)}
			{...props}
		/>
	)
}

const tabsListVariants = cva(
	'rounded-lg p-[0.1875rem] group-data-horizontal/tabs:h-8 data-[variant=line]:rounded-none group/tabs-list text-muted-foreground inline-flex w-fit items-center justify-center group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col',
	{
		variants: {
			variant: {
				default: tabsListBg,
				line: 'gap-1 bg-transparent',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
)

function TabsList({ className, variant = 'default', ...props }: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
	return (
		<TabsPrimitive.List data-slot="tabs-list" data-variant={variant} className={cn(tabsListVariants({ variant }), className)} {...props} />
	)
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
	return (
		<TabsPrimitive.Tab
			data-slot="tabs-trigger"
			className={cn(
				"gap-1.5 rounded-md px-1.5 py-0.5 text-sm font-medium [&_svg:not([class*='size-'])]:size-4 focus-visible:ring-ring/50 hover:text-foreground dark:hover:text-foreground relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center whitespace-nowrap transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start focus-visible:ring-[0.1875rem] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				// Active state — apply the trigger fill as a plain background-image (no border, no clip).
				// Both default and line variants get it; line additionally shows the underline (::after below).
				`${tabsTriggerActiveBg} data-active:text-foreground`,
				'after:bg-foreground after:absolute after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:-bottom-[0.3125rem] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100',
				className,
			)}
			{...props}
		/>
	)
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
	return <TabsPrimitive.Panel data-slot="tabs-content" className={cn('text-sm flex-1 outline-none', className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
