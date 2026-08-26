import type { Meta, StoryObj } from '@storybook/react'
import { Field, FieldLabel, FieldDescription, FieldError, FieldGroup, FieldContent } from '../field'
import { Input } from '../input'
import { Checkbox } from '../checkbox'

const meta: Meta<typeof Field> = {
	title: 'UI/Field',
	component: Field,
	argTypes: {
		orientation: {
			control: 'select',
			options: ['vertical', 'horizontal', 'responsive'],
		},
	},
}

export default meta
type Story = StoryObj<typeof Field>

export const Vertical: Story = {
	render: () => (
		<Field>
			<FieldLabel htmlFor="email">Email</FieldLabel>
			<FieldContent>
				<Input id="email" type="email" placeholder="Enter your email" />
				<FieldDescription>We'll never share your email with anyone else.</FieldDescription>
			</FieldContent>
		</Field>
	),
}

export const Horizontal: Story = {
	render: () => (
		<Field orientation="horizontal">
			<FieldLabel htmlFor="name">Name</FieldLabel>
			<FieldContent>
				<Input id="name" placeholder="Enter your name" />
			</FieldContent>
		</Field>
	),
}

export const WithError: Story = {
	render: () => (
		<Field>
			<FieldLabel htmlFor="email-error">Email</FieldLabel>
			<FieldContent>
				<Input id="email-error" type="email" placeholder="Enter your email" aria-invalid />
				<FieldError>Please enter a valid email address.</FieldError>
			</FieldContent>
		</Field>
	),
}

export const WithCheckbox: Story = {
	render: () => (
		<Field orientation="horizontal">
			<Checkbox id="terms" />
			<FieldLabel htmlFor="terms">Accept terms and conditions</FieldLabel>
		</Field>
	),
}

export const FieldGroupExample: Story = {
	render: () => (
		<FieldGroup>
			<Field>
				<FieldLabel htmlFor="first-name">First Name</FieldLabel>
				<FieldContent>
					<Input id="first-name" placeholder="John" />
				</FieldContent>
			</Field>
			<Field>
				<FieldLabel htmlFor="last-name">Last Name</FieldLabel>
				<FieldContent>
					<Input id="last-name" placeholder="Doe" />
				</FieldContent>
			</Field>
			<Field>
				<FieldLabel htmlFor="email-group">Email</FieldLabel>
				<FieldContent>
					<Input id="email-group" type="email" placeholder="john@example.com" />
					<FieldDescription>We'll never share your email.</FieldDescription>
				</FieldContent>
			</Field>
		</FieldGroup>
	),
}
