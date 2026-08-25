import type { Meta, StoryObj } from '@storybook/react'
import { Switch } from '../switch'
import { Label } from '../label'
import { Field } from '../field'

const meta: Meta<typeof Switch> = {
	title: 'UI/Switch',
	component: Switch,
	argTypes: {
		checked: {
			control: 'boolean',
		},
		disabled: {
			control: 'boolean',
		},
		size: {
			control: 'select',
			options: ['sm', 'default'],
		},
	},
}

export default meta
type Story = StoryObj<typeof Switch>

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

export const Small: Story = {
	args: {
		size: 'sm',
	},
}

export const WithLabel: Story = {
	render: () => (
		<Field orientation="horizontal">
			<Switch id="notifications" />
			<Label htmlFor="notifications">Enable notifications</Label>
		</Field>
	),
}

export const AllSizes: Story = {
	render: () => (
		<div className="flex flex-col gap-4">
			<Field orientation="horizontal">
				<Switch size="sm" />
				<Label>Small</Label>
			</Field>
			<Field orientation="horizontal">
				<Switch size="default" />
				<Label>Default</Label>
			</Field>
		</div>
	),
}

export const AllStates: Story = {
	render: () => (
		<div className="flex flex-col gap-4">
			<Field orientation="horizontal">
				<Switch />
				<Label>Unchecked</Label>
			</Field>
			<Field orientation="horizontal">
				<Switch defaultChecked />
				<Label>Checked</Label>
			</Field>
			<Field orientation="horizontal">
				<Switch disabled />
				<Label>Disabled</Label>
			</Field>
			<Field orientation="horizontal">
				<Switch defaultChecked disabled />
				<Label>Disabled Checked</Label>
			</Field>
		</div>
	),
}
