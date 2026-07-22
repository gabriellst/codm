import type { Meta, StoryObj } from '@storybook/react'
import { Textarea } from '../textarea'

const meta: Meta<typeof Textarea> = {
	title: 'UI/Textarea',
	component: Textarea,
	argTypes: {
		disabled: {
			control: 'boolean',
		},
		required: {
			control: 'boolean',
		},
		rows: {
			control: 'number',
		},
	},
}

export default meta
type Story = StoryObj<typeof Textarea>

export const Default: Story = {
	args: {
		placeholder: 'Enter your message...',
	},
}

export const WithValue: Story = {
	args: {
		defaultValue: 'This is a longer message that spans multiple lines to demonstrate how the textarea component handles content.',
	},
}

export const Disabled: Story = {
	args: {
		placeholder: 'Disabled textarea',
		disabled: true,
	},
}

export const Required: Story = {
	args: {
		placeholder: 'Required field',
		required: true,
	},
}

export const Invalid: Story = {
	args: {
		placeholder: 'Invalid textarea',
		'aria-invalid': true,
		defaultValue: 'Invalid content',
	},
}

export const CustomRows: Story = {
	args: {
		placeholder: 'Custom rows (10)',
		rows: 10,
	},
}

export const AllStates: Story = {
	render: () => (
		<div className="flex flex-col gap-4 w-full max-w-sm">
			<Textarea placeholder="Default" />
			<Textarea placeholder="With value" defaultValue="This is a longer message that spans multiple lines." />
			<Textarea placeholder="Disabled" disabled />
			<Textarea placeholder="Required" required />
			<Textarea placeholder="Invalid" aria-invalid defaultValue="Invalid content" />
		</div>
	),
}
