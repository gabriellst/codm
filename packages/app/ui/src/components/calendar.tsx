import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { endOfMonth, endOfWeek, endOfYear, startOfMonth, startOfWeek, startOfYear, subDays, subMonths, subWeeks } from 'date-fns'
import { IconChevronDown, IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { DayPicker, getDefaultClassNames, type DateRange, type DayButton } from 'react-day-picker'

import { cn } from '../lib/cn'
import { Button, buttonVariants } from './button'
import { surface } from './surfaces'

export type DatePresetViewHint = 'day' | 'week' | 'month' | 'year'

export interface DatePreset {
	/** i18n key for the preset label — rendered through `t()` (a literal string falls through unchanged). */
	label: string
	getValue: () => Date
	/** Suggested calendar view this preset maps to (drives the range it selects). */
	viewHint?: DatePresetViewHint
}

/** Quick-range presets shown in the Calendar/DatePicker sidebar (past-focused for analytics ranges). */
export const defaultPresets: DatePreset[] = [
	{ label: 'calendar.presets.today', getValue: () => new Date(), viewHint: 'day' },
	{ label: 'calendar.presets.yesterday', getValue: () => subDays(new Date(), 1), viewHint: 'day' },
	{ label: 'calendar.presets.thisWeek', getValue: () => startOfWeek(new Date(), { weekStartsOn: 0 }), viewHint: 'week' },
	{ label: 'calendar.presets.lastWeek', getValue: () => startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 0 }), viewHint: 'week' },
	{ label: 'calendar.presets.thisMonth', getValue: () => startOfMonth(new Date()), viewHint: 'month' },
	{ label: 'calendar.presets.lastMonth', getValue: () => startOfMonth(subMonths(new Date(), 1)), viewHint: 'month' },
	{ label: 'calendar.presets.thisYear', getValue: () => startOfYear(new Date()), viewHint: 'year' },
]

/** The DateRange a preset represents in range mode, from its view hint. */
export function presetRange(date: Date, viewHint?: DatePresetViewHint): DateRange {
	if (viewHint === 'week') return { from: startOfWeek(date, { weekStartsOn: 0 }), to: endOfWeek(date, { weekStartsOn: 0 }) }
	if (viewHint === 'month') return { from: startOfMonth(date), to: endOfMonth(date) }
	if (viewHint === 'year') return { from: startOfYear(date), to: endOfYear(date) }
	return { from: date, to: date }
}

// react-day-picker's onSelect is typed per mode; this is the shared shape for invoking it from a preset click.
type CalendarSelectHandler = (
	selected: Date | DateRange | undefined,
	triggerDate: Date,
	modifiers: Record<string, boolean>,
	e: React.MouseEvent | React.KeyboardEvent,
) => void

function Calendar({
	className,
	classNames,
	showOutsideDays = true,
	captionLayout = 'label',
	buttonVariant = 'ghost',
	formatters,
	components,
	showPresets = false,
	presets = defaultPresets,
	onPresetSelect,
	...props
}: React.ComponentProps<typeof DayPicker> & {
	buttonVariant?: React.ComponentProps<typeof Button>['variant']
	/** Render the quick-range preset sidebar to the left of the calendar. */
	showPresets?: boolean
	/** Override the preset list (defaults to {@link defaultPresets}). */
	presets?: DatePreset[]
	/** Called after a preset is picked, with the preset's anchor date + its view hint. */
	onPresetSelect?: (date: Date, viewHint?: DatePresetViewHint) => void
}) {
	const defaultClassNames = getDefaultClassNames()
	const { t } = useTranslation()

	// A preset selects through the normal onSelect path (so controlled consumers update naturally):
	// range mode → the preset's range; single mode → its anchor date.
	const handlePreset = (preset: DatePreset, e: React.MouseEvent) => {
		const date = preset.getValue()
		// `props` is a discriminated union by mode; read the bits we need through a minimal shape.
		const { mode, onSelect } = props as { mode?: string; onSelect?: CalendarSelectHandler }
		const value = mode === 'range' ? presetRange(date, preset.viewHint) : date
		onSelect?.(value, date, {}, e)
		onPresetSelect?.(date, preset.viewHint)
	}

	const dayPicker = (
		<DayPicker
			showOutsideDays={showOutsideDays}
			className={cn(
				!showPresets && surface,
				'group/calendar p-3 [--cell-size:--spacing(8)]',
				!showPresets && 'rounded-asymmetric-lg',
				String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
				String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
				!showPresets && className,
			)}
			captionLayout={captionLayout}
			formatters={{
				formatMonthDropdown: date => date.toLocaleString('default', { month: 'short' }),
				...formatters,
			}}
			classNames={{
				root: cn('w-fit', defaultClassNames.root),
				months: cn('flex gap-4 flex-col md:flex-row relative', defaultClassNames.months),
				month: cn('flex flex-col w-full gap-4', defaultClassNames.month),
				nav: cn('flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between', defaultClassNames.nav),
				button_previous: cn(
					buttonVariants({ variant: buttonVariant }),
					'size-(--cell-size) aria-disabled:opacity-50 p-0 select-none hover:scale-110 active:scale-95 transition-transform duration-200',
					defaultClassNames.button_previous,
				),
				button_next: cn(
					buttonVariants({ variant: buttonVariant }),
					'size-(--cell-size) aria-disabled:opacity-50 p-0 select-none hover:scale-110 active:scale-95 transition-transform duration-200',
					defaultClassNames.button_next,
				),
				month_caption: cn('flex items-center justify-center h-(--cell-size) w-full px-(--cell-size)', defaultClassNames.month_caption),
				dropdowns: cn('w-full flex items-center text-sm font-medium justify-center h-(--cell-size) gap-1.5 ', defaultClassNames.dropdowns),
				dropdown_root: cn(
					'relative has-focus:border-ring border border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[0.1875rem] rounded-md',
					defaultClassNames.dropdown_root,
				),
				dropdown: cn('absolute bg-background inset-0 opacity-0', defaultClassNames.dropdown),
				caption_label: cn(
					'select-none font-medium ',
					captionLayout === 'label'
						? 'text-sm'
						: 'rounded-md pl-2 pr-1 flex items-center gap-1 text-sm h-8 [&>svg]:text-muted-foreground [&>svg]:size-3.5',
					defaultClassNames.caption_label,
				),
				table: 'w-full border-collapse',
				weekdays: cn('flex', defaultClassNames.weekdays),
				weekday: cn('text-muted-foreground rounded-md flex-1 font-normal text-sm select-none', defaultClassNames.weekday),
				week: cn('flex w-full mt-2 gap-0', defaultClassNames.week),
				week_number_header: cn('select-none w-(--cell-size)', defaultClassNames.week_number_header),
				week_number: cn('text-sm select-none text-muted-foreground', defaultClassNames.week_number),
				day: cn(
					'relative flex-1 flex p-0 text-center [&:last-child[data-selected=true]]:rounded-r-md [&:last-child[data-selected=true]_button]:rounded-r-md group/day select-none',
					props.showWeekNumber
						? '[&:nth-child(2)[data-selected=true]]:rounded-l-md [&:nth-child(2)[data-selected=true]_button]:rounded-l-md'
						: '[&:first-child[data-selected=true]]:rounded-l-md [&:first-child[data-selected=true]_button]:rounded-l-md',
					defaultClassNames.day,
				),
				range_start: cn('rounded-l-md bg-primary/20', defaultClassNames.range_start),
				range_middle: cn('rounded-none bg-primary/20', defaultClassNames.range_middle),
				range_end: cn('rounded-r-md bg-primary/20', defaultClassNames.range_end),
				today: cn(
					'rounded-md border border-primary/50 text-primary data-[selected=true]:rounded-none data-[selected=true]:border-transparent data-[selected=true]:bg-transparent',
					defaultClassNames.today,
				),
				outside: cn('text-muted-foreground opacity-40 aria-selected:text-muted-foreground', defaultClassNames.outside),
				disabled: cn('text-muted-foreground opacity-50', defaultClassNames.disabled),
				hidden: cn('invisible', defaultClassNames.hidden),
				...classNames,
			}}
			components={{
				Root: ({ className, rootRef, ...props }) => {
					return <div data-slot="calendar" ref={rootRef} className={cn(className)} {...props} />
				},
				Chevron: ({ className, orientation, ...props }) => {
					if (orientation === 'left') {
						return <IconChevronLeft className={cn('size-4', className)} {...props} />
					}

					if (orientation === 'right') {
						return <IconChevronRight className={cn('size-4', className)} {...props} />
					}

					return <IconChevronDown className={cn('size-4', className)} {...props} />
				},
				DayButton: CalendarDayButton,
				WeekNumber: ({ children, ...props }) => {
					return (
						<td {...props}>
							<div className="flex size-(--cell-size) items-center justify-center text-center">{children}</div>
						</td>
					)
				},
				...components,
			}}
			{...props}
		/>
	)

	if (!showPresets) return dayPicker

	return (
		<div className={cn(surface, 'flex w-fit rounded-asymmetric-lg', className)}>
			<div className="flex flex-col gap-1 border-r border-border p-3">
				{presets.map(preset => (
					<Button key={preset.label} variant="ghost" size="sm" className="justify-start font-normal" onClick={e => handlePreset(preset, e)}>
						{t(preset.label)}
					</Button>
				))}
			</div>
			{dayPicker}
		</div>
	)
}

function CalendarDayButton({ className, day, modifiers, ...props }: React.ComponentProps<typeof DayButton>) {
	const defaultClassNames = getDefaultClassNames()

	const ref = React.useRef<HTMLButtonElement>(null)
	React.useEffect(() => {
		if (modifiers.focused) ref.current?.focus()
	}, [modifiers.focused])

	return (
		<Button
			ref={ref}
			variant="ghost"
			size="icon"
			data-day={day.date.toLocaleDateString()}
			data-selected-single={modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle}
			data-range-start={modifiers.range_start}
			data-range-end={modifiers.range_end}
			data-range-middle={modifiers.range_middle}
			data-today={modifiers.today}
			className={cn(
				'data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[range-middle=true]:bg-primary/20 data-[range-middle=true]:text-primary-foreground data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-ring/50 hover:bg-primary/20 hover:text-primary-foreground data-[selected-single=true]:hover:bg-primary data-[range-start=true]:hover:bg-primary data-[range-end=true]:hover:bg-primary hover:scale-105 active:scale-95 transition-all duration-200 rounded-md flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[0.1875rem] data-[range-end=true]:rounded-r-md data-[range-end=true]:rounded-l-none data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-l-md data-[range-start=true]:rounded-r-none data-[range-middle=true]:hover:rounded-none data-[range-start=true]:hover:rounded-l-md data-[range-start=true]:hover:rounded-r-none data-[range-end=true]:hover:rounded-r-md data-[range-end=true]:hover:rounded-l-none data-[range-start=true]:data-[range-end=true]:rounded-md data-[range-start=true]:data-[range-end=true]:hover:rounded-md data-[today=true]:data-[range-middle=true]:bg-primary/30 [&>span]:text-xs [&>span]:opacity-70',
				defaultClassNames.day,
				className,
			)}
			{...props}
		/>
	)
}

export { Calendar, CalendarDayButton }
