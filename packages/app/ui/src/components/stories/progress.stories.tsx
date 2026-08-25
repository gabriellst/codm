import type { Meta, StoryObj } from '@storybook/react'
import { Progress, ProgressLabel, ProgressValue } from '../progress'

const meta: Meta<typeof Progress> = {
	title: 'UI/Progress',
	component: Progress,
	argTypes: {
		value: {
			control: { type: 'range', min: 0, max: 100, step: 1 },
		},
	},
}

export default meta
type Story = StoryObj<typeof Progress>

export const Default: Story = {
	args: {
		value: 33,
	},
}

export const WithLabel: Story = {
	render: () => (
		<Progress value={33}>
			<ProgressLabel>Loading...</ProgressLabel>
		</Progress>
	),
}

export const WithValue: Story = {
	render: () => (
		<Progress value={66}>
			<ProgressLabel>Progress</ProgressLabel>
			<ProgressValue>{formattedValue => formattedValue ?? '66%'}</ProgressValue>
		</Progress>
	),
}

export const AllStates: Story = {
	render: () => (
		<div className="flex flex-col gap-4 w-full max-w-sm">
			<Progress value={0}>
				<ProgressLabel>Starting</ProgressLabel>
				<ProgressValue>{formattedValue => formattedValue ?? '0%'}</ProgressValue>
			</Progress>
			<Progress value={25}>
				<ProgressLabel>Quarter</ProgressLabel>
				<ProgressValue>{formattedValue => formattedValue ?? '25%'}</ProgressValue>
			</Progress>
			<Progress value={50}>
				<ProgressLabel>Halfway</ProgressLabel>
				<ProgressValue>{formattedValue => formattedValue ?? '50%'}</ProgressValue>
			</Progress>
			<Progress value={75}>
				<ProgressLabel>Almost there</ProgressLabel>
				<ProgressValue>{formattedValue => formattedValue ?? '75%'}</ProgressValue>
			</Progress>
			<Progress value={100}>
				<ProgressLabel>Complete</ProgressLabel>
				<ProgressValue>{formattedValue => formattedValue ?? '100%'}</ProgressValue>
			</Progress>
		</div>
	),
}
