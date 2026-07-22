import type { Meta, StoryObj } from '@storybook/react'
import { Label } from '../label'
import { Input } from '../input'
import { Checkbox } from '../checkbox'

const meta: Meta<typeof Label> = {
	title: 'UI/Label',
	component: Label,
}

export default meta
type Story = StoryObj<typeof Label>

export const Default: Story = {
	args: {
		children: 'Label',
	},
}

export const WithInput: Story = {
	render: () => (
		<div className="flex flex-col gap-2 w-full max-w-sm">
			<Label htmlFor="email">Email</Label>
			<Input id="email" type="email" placeholder="Enter your email" />
		</div>
	),
}

export const WithCheckbox: Story = {
	render: () => (
		<div className="flex items-center gap-2">
			<Checkbox id="terms" />
			<Label htmlFor="terms">Accept terms and conditions</Label>
		</div>
	),
}

export const Required: Story = {
	render: () => (
		<div className="flex flex-col gap-2 w-full max-w-sm">
			<Label htmlFor="required">
				Required Field
				<span className="text-destructive ml-1">*</span>
			</Label>
			<Input id="required" required />
		</div>
	),
}

export const Disabled: Story = {
	render: () => (
		<div className="flex flex-col gap-2 w-full max-w-sm">
			<Label htmlFor="disabled" className="opacity-50">
				Disabled Field
			</Label>
			<Input id="disabled" disabled />
		</div>
	),
}
