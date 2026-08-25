import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import { DatePicker } from '../date-picker'

const meta: Meta<typeof DatePicker> = {
	title: 'UI/DatePicker',
	component: DatePicker,
}

export default meta
type Story = StoryObj<typeof DatePicker>

export const Default: Story = {
	render: () => {
		const [date, setDate] = React.useState<Date | undefined>(undefined)
		return <DatePicker date={date} onDateChange={setDate} />
	},
}

export const WithInitialDate: Story = {
	render: () => {
		const [date, setDate] = React.useState<Date | undefined>(new Date())
		return <DatePicker date={date} onDateChange={setDate} />
	},
}

export const WithPresets: Story = {
	render: () => {
		const [date, setDate] = React.useState<Date | undefined>(new Date())
		return <DatePicker date={date} onDateChange={setDate} showPresets />
	},
}

export const CustomPlaceholder: Story = {
	render: () => {
		const [date, setDate] = React.useState<Date | undefined>(undefined)
		return <DatePicker date={date} onDateChange={setDate} placeholder="Select a date" />
	},
}

export const MultipleDatePickers: Story = {
	render: () => {
		const [startDate, setStartDate] = React.useState<Date | undefined>(undefined)
		const [endDate, setEndDate] = React.useState<Date | undefined>(undefined)
		return (
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-2">
					<label className="text-sm font-medium">Start Date</label>
					<DatePicker date={startDate} onDateChange={setStartDate} placeholder="Pick start date" />
				</div>
				<div className="flex flex-col gap-2">
					<label className="text-sm font-medium">End Date</label>
					<DatePicker date={endDate} onDateChange={setEndDate} placeholder="Pick end date" />
				</div>
			</div>
		)
	},
}
