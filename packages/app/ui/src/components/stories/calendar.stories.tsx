import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import type { DateRange } from 'react-day-picker'
import { Calendar } from '../calendar'

const meta: Meta<typeof Calendar> = {
	title: 'UI/Calendar',
	component: Calendar,
}

export default meta
type Story = StoryObj<typeof Calendar>

export const Default: Story = {
	render: () => {
		const [date, setDate] = React.useState<Date | undefined>(new Date())
		return <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-md border shadow-sm" />
	},
}

export const WithDropdowns: Story = {
	render: () => {
		const [date, setDate] = React.useState<Date | undefined>(new Date())
		return <Calendar mode="single" selected={date} onSelect={setDate} captionLayout="dropdown" className="rounded-md border shadow-sm" />
	},
}

export const Range: Story = {
	render: () => {
		const [range, setRange] = React.useState<DateRange | undefined>({
			from: undefined,
			to: undefined,
		})
		return <Calendar mode="range" selected={range} onSelect={setRange} numberOfMonths={2} className="rounded-md border shadow-sm" />
	},
}

/** Range mode with the quick-range preset sidebar (Hoje, Ontem, Essa semana … Este ano). */
export const RangeWithPresets: Story = {
	render: () => {
		const [range, setRange] = React.useState<DateRange | undefined>({ from: undefined, to: undefined })
		return <Calendar mode="range" selected={range} onSelect={setRange} numberOfMonths={2} showPresets />
	},
}

export const Multiple: Story = {
	render: () => {
		const [dates, setDates] = React.useState<Date[] | undefined>([])
		return <Calendar mode="multiple" selected={dates} onSelect={setDates} className="rounded-md border shadow-sm" />
	},
}

export const WithWeekNumbers: Story = {
	render: () => {
		const [date, setDate] = React.useState<Date | undefined>(new Date())
		return <Calendar mode="single" selected={date} onSelect={setDate} showWeekNumber className="rounded-md border shadow-sm" />
	},
}
