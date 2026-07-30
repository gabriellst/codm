'use client'

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// CODM segmented control: a soft-gray track holds pill triggers; the active one
// lifts to a solid white (card) pill with a whisper of shadow. The `line` variant
// stays a bare row with an underline indicator (wizard-step tabs).
const tabsListBg = 'bg-muted'
// Scoped to the default (segmented) list so the `line` variant never gets a pill fill —
// it shows only the underline indicator.
const tabsTriggerActiveBg =
	'group-data-[variant=default]/tabs-list:data-active:bg-card group-data-[variant=default]/tabs-list:data-active:shadow-sm'

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
	'rounded-full p-1 group-data-horizontal/tabs:h-9 data-[variant=line]:rounded-none data-[variant=line]:p-0 group/tabs-list text-muted-foreground inline-flex w-fit items-center justify-center group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col',
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
				"gap-1.5 rounded-full px-3.5 py-0.5 text-sm font-medium [&_svg:not([class*='size-'])]:size-4 focus-visible:ring-ring/40 hover:text-foreground dark:hover:text-foreground relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center whitespace-nowrap transition-all group-data-[variant=line]/tabs-list:rounded-none group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start focus-visible:ring-[0.1875rem] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
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
