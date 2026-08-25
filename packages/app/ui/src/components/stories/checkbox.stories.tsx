import type { Meta, StoryObj } from '@storybook/react'
import { Checkbox } from '../checkbox'
import { Label } from '../label'
import { Field } from '../field'

const meta: Meta<typeof Checkbox> = {
	title: 'UI/Checkbox',
	component: Checkbox,
	argTypes: {
		checked: {
			control: 'boolean',
		},
		disabled: {
			control: 'boolean',
		},
	},
}

export default meta
type Story = StoryObj<typeof Checkbox>

export const Default: Story = {
	args: {},
}

export const Checked: Story = {
	args: {
		checked: true,
	},
}

export const Disabled: Story = {
	args: {
		disabled: true,
	},
}

export const DisabledChecked: Story = {
	args: {
		checked: true,
		disabled: true,
	},
}

export const WithLabel: Story = {
	render: () => (
		<Field orientation="horizontal">
			<Checkbox id="terms" />
			<Label htmlFor="terms">Accept terms and conditions</Label>
		</Field>
	),
}

export const Multiple: Story = {
	render: () => (
		<div className="flex flex-col gap-3">
			<Field orientation="horizontal">
				<Checkbox id="option1" />
				<Label htmlFor="option1">Option 1</Label>
			</Field>
			<Field orientation="horizontal">
				<Checkbox id="option2" defaultChecked />
				<Label htmlFor="option2">Option 2</Label>
			</Field>
			<Field orientation="horizontal">
				<Checkbox id="option3" disabled />
				<Label htmlFor="option3">Option 3 (disabled)</Label>
			</Field>
		</div>
	),
}

export const AllStates: Story = {
	render: () => (
		<div className="flex flex-col gap-4">
			<Field orientation="horizontal">
				<Checkbox />
				<Label>Unchecked</Label>
			</Field>
			<Field orientation="horizontal">
				<Checkbox defaultChecked />
				<Label>Checked</Label>
			</Field>
			<Field orientation="horizontal">
				<Checkbox disabled />
				<Label>Disabled</Label>
			</Field>
			<Field orientation="horizontal">
				<Checkbox defaultChecked disabled />
				<Label>Disabled Checked</Label>
			</Field>
		</div>
	),
}
