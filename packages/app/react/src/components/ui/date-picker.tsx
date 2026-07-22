import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { format, isSameDay } from 'date-fns'
import { IconCalendar, IconClock } from '@tabler/icons-react'
import type { DateRange } from 'react-day-picker'
import { ptBR } from 'react-day-picker/locale'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar, defaultPresets, presetRange, type DatePreset, type DatePresetViewHint } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

// Presets now live with the Calendar; re-exported here so existing `from '.../date-picker'` imports keep working.
export { defaultPresets } from '@/components/ui/calendar'
export type { DatePreset, DatePresetViewHint } from '@/components/ui/calendar'

export interface DatePickerProps extends Omit<React.ComponentProps<typeof Popover>, 'children'> {
	/** Selected date */
	date?: Date
	/** Callback when date changes */
	onDateChange?: (date: Date | undefined) => void
	/** Selected range */
	range?: DateRange
	/** Callback when range changes */
	onRangeChange?: (range: DateRange | undefined) => void
	/** Callback when a preset is selected with its view hint */
	onPresetSelect?: (date: Date, viewHint?: DatePresetViewHint) => void
	/** Placeholder text when no date selected */
	placeholder?: string
	/** Additional CSS classes */
	className?: string
	/** Locale for date formatting */
	locale?: typeof ptBR
	/** Date format string */
	dateFormat?: string
	/** Show preset options */
	showPresets?: boolean
	/** Custom presets (uses defaultPresets if not provided) */
	presets?: DatePreset[]
	/** Custom trigger content */
	triggerContent?: React.ReactNode
	/** Variant for the trigger button (default `secondary` = the interactive `trigger` surface) */
	variant?: 'default' | 'ghost' | 'outline' | 'secondary'
	/** Size for the trigger button */
	size?: 'default' | 'sm' | 'lg' | 'icon'
	/** Selection mode */
	mode?: 'single' | 'range'
	/** Show time inputs below the calendar */
	showTime?: boolean
	/** Current time value (HH:mm) - used with showTime */
	time?: string
	/** Callback when time changes - used with showTime */
	onTimeChange?: (time: string) => void
	/** Show year/month dropdowns — useful for birth date pickers */
	showYearNavigation?: boolean
	/** First year in the year dropdown (default: 1900). Only used with showYearNavigation */
	fromYear?: number
	/** Last year in the year dropdown (default: current year). Only used with showYearNavigation */
	toYear?: number
}

export function DatePicker({
	date,
	onDateChange,
	range,
	onRangeChange,
	onPresetSelect,
	placeholder = 'Selecionar data',
	className,
	locale = ptBR,
	dateFormat = "d 'de' MMMM 'de' yyyy",
	showPresets = false,
	presets = defaultPresets,
	triggerContent,
	variant = 'secondary',
	size = 'default',
	mode = 'single',
	showTime = false,
	time,
	onTimeChange,
	showYearNavigation = false,
	fromYear = 1900,
	toYear = new Date().getFullYear(),
	...props
}: DatePickerProps) {
	const { t } = useTranslation()
	const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(date)
	const [selectedRange, setSelectedRange] = React.useState<DateRange | undefined>(range)
	const [open, setOpen] = React.useState(false)

	React.useEffect(() => {
		setSelectedDate(date)
	}, [date])

	React.useEffect(() => {
		setSelectedRange(range)
	}, [range])

	const handleSelect = (newDate: Date | undefined) => {
		setSelectedDate(newDate)
		onDateChange?.(newDate)
		if (!showTime) {
			setOpen(false)
		}
	}

	const handleRangeSelect = (newRange: DateRange | undefined) => {
		const hasPendingStart = Boolean(selectedRange?.from && !selectedRange?.to)
		const hasCompleteRange = Boolean(selectedRange?.from && selectedRange?.to)
		const isSameDayRange = Boolean(newRange?.from && newRange?.to && isSameDay(newRange.from, newRange.to))
		const isSameDayPendingClick =
			hasPendingStart && Boolean(newRange?.from && isSameDay(newRange.from, selectedRange?.from as Date) && !newRange.to)
		const shouldResetCompleted = Boolean(hasCompleteRange && newRange?.from && newRange?.to)

		const normalizedRange = shouldResetCompleted
			? (() => {
					let nextStart = newRange?.from

					if (selectedRange?.from && newRange?.from && isSameDay(newRange.from, selectedRange.from)) {
						nextStart = newRange?.to ?? newRange?.from
					} else if (selectedRange?.to && newRange?.to && isSameDay(newRange.to, selectedRange.to)) {
						nextStart = newRange?.from
					} else if (selectedRange?.from && newRange?.to && isSameDay(newRange.to, selectedRange.from)) {
						nextStart = newRange?.from
					} else if (selectedRange?.to && newRange?.from && isSameDay(newRange.from, selectedRange.to)) {
						nextStart = newRange?.to ?? newRange?.from
					}

					return { from: nextStart, to: undefined }
				})()
			: isSameDayPendingClick
				? { from: newRange?.from, to: newRange?.from }
				: isSameDayRange && !hasPendingStart
					? { from: newRange?.from, to: undefined }
					: newRange

		setSelectedRange(normalizedRange)
		onRangeChange?.(normalizedRange)
		if (normalizedRange?.from && normalizedRange?.to) {
			setOpen(false)
		}
	}

	const handlePresetClick = (preset: DatePreset) => {
		const newDate = preset.getValue()
		if (mode === 'range') {
			const rangeValue = presetRange(newDate, preset.viewHint)

			setSelectedRange(rangeValue)
			onRangeChange?.(rangeValue)
			if (onPresetSelect) {
				onPresetSelect(newDate, preset.viewHint)
			}
		} else {
			setSelectedDate(newDate)
			if (onPresetSelect) {
				onPresetSelect(newDate, preset.viewHint)
			} else {
				onDateChange?.(newDate)
			}
		}
		setOpen(false)
	}

	const renderLabel = () => {
		if (mode === 'range') {
			if (selectedRange?.from && selectedRange?.to) {
				return (
					<span className="capitalize">
						{format(selectedRange.from, dateFormat, { locale: locale as never })} -{' '}
						{format(selectedRange.to, dateFormat, { locale: locale as never })}
					</span>
				)
			}
			if (selectedRange?.from) {
				return <span className="capitalize">{format(selectedRange.from, dateFormat, { locale: locale as never })}</span>
			}
			return <span className="opacity-60">{placeholder}</span>
		}

		return selectedDate ? (
			<span className="capitalize">
				{format(selectedDate, dateFormat, { locale: locale as never })}
				{showTime && time ? ` ${time}` : ''}
			</span>
		) : (
			<span className="opacity-60">{placeholder}</span>
		)
	}

	return (
		<Popover open={open} onOpenChange={setOpen} {...props}>
			<PopoverTrigger
				render={
					<Button
						variant={variant}
						size={size}
						data-empty={mode === 'range' ? !selectedRange?.from : !selectedDate}
						className={cn(
							'data-[empty=true]:text-muted-foreground justify-start text-left font-normal',
							size !== 'icon' && !triggerContent && 'min-w-52',
							className,
						)}
					/>
				}
			>
				{triggerContent ? (
					triggerContent
				) : (
					<>
						<IconCalendar className="mr-2 size-4" />
						{renderLabel()}
					</>
				)}
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<div className={cn('flex', showPresets && 'flex-row')}>
					{showPresets && (
						<div className="flex flex-col gap-1 border-r border-border p-3">
							{presets.map(preset => (
								<Button
									key={preset.label}
									variant="ghost"
									size="sm"
									className="justify-start text-sm font-normal"
									onClick={() => handlePresetClick(preset)}
								>
									{t(preset.label)}
								</Button>
							))}
						</div>
					)}
					<div>
						{mode === 'range' ? (
							<Calendar mode="range" selected={selectedRange} onSelect={handleRangeSelect} locale={locale} />
						) : (
							<Calendar
								mode="single"
								selected={selectedDate}
								onSelect={handleSelect}
								locale={locale}
								{...(showYearNavigation && {
									captionLayout: 'dropdown',
									fromYear,
									toYear,
								})}
							/>
						)}
						{showTime && (
							<div className="border-t border-border px-3 py-2 flex items-center gap-2">
								<IconClock className="size-4 text-muted-foreground" />
								<Input type="time" className="w-auto h-8 text-sm" value={time ?? ''} onChange={e => onTimeChange?.(e.target.value)} />
							</div>
						)}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	)
}
