import type { Meta, StoryObj } from '@storybook/react'
import { Input } from '../input'

const meta: Meta<typeof Input> = {
	title: 'UI/Input',
	component: Input,
	argTypes: {
		type: {
			control: 'select',
			options: ['text', 'email', 'password', 'number', 'tel', 'url', 'search'],
		},
		disabled: {
			control: 'boolean',
		},
		required: {
			control: 'boolean',
		},
	},
}

export default meta
type Story = StoryObj<typeof Input>

export const Default: Story = {
	args: {
		placeholder: 'Enter text...',
		type: 'text',
	},
}

export const WithValue: Story = {
	args: {
		defaultValue: 'John Doe',
		type: 'text',
	},
}

export const Email: Story = {
	args: {
		type: 'email',
		placeholder: 'email@example.com',
	},
}

export const Password: Story = {
	args: {
		type: 'password',
		placeholder: 'Enter password',
	},
}

export const NumberInput: Story = {
	args: {
		type: 'number',
		placeholder: 'Enter number',
	},
}

export const Disabled: Story = {
	args: {
		placeholder: 'Disabled input',
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
		placeholder: 'Invalid input',
		'aria-invalid': true,
		defaultValue: 'invalid@',
	},
}

export const AllStates: Story = {
	render: () => (
		<div className="flex flex-col gap-4 w-full max-w-sm">
			<Input placeholder="Default" />
			<Input placeholder="With value" defaultValue="John Doe" />
			<Input placeholder="Disabled" disabled />
			<Input placeholder="Required" required />
			<Input placeholder="Invalid" aria-invalid defaultValue="invalid@" />
		</div>
	),
}
