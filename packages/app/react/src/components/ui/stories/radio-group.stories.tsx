import type { Meta, StoryObj } from '@storybook/react'
import { RadioGroup, RadioGroupItem } from '../radio-group'
import { Label } from '../label'
import { Field } from '../field'

const meta: Meta<typeof RadioGroup> = {
	title: 'UI/RadioGroup',
	component: RadioGroup,
	argTypes: {
		disabled: {
			control: 'boolean',
		},
	},
}

export default meta
type Story = StoryObj<typeof RadioGroup>

export const Default: Story = {
	render: () => (
		<RadioGroup defaultValue="option1">
			<Field orientation="horizontal">
				<RadioGroupItem value="option1" id="option1" />
				<Label htmlFor="option1">Option 1</Label>
			</Field>
			<Field orientation="horizontal">
				<RadioGroupItem value="option2" id="option2" />
				<Label htmlFor="option2">Option 2</Label>
			</Field>
			<Field orientation="horizontal">
				<RadioGroupItem value="option3" id="option3" />
				<Label htmlFor="option3">Option 3</Label>
			</Field>
		</RadioGroup>
	),
}

export const WithDefaultValue: Story = {
	render: () => (
		<RadioGroup defaultValue="option2">
			<Field orientation="horizontal">
				<RadioGroupItem value="option1" id="option1" />
				<Label htmlFor="option1">Option 1</Label>
			</Field>
			<Field orientation="horizontal">
				<RadioGroupItem value="option2" id="option2" />
				<Label htmlFor="option2">Option 2 (default)</Label>
			</Field>
			<Field orientation="horizontal">
				<RadioGroupItem value="option3" id="option3" />
				<Label htmlFor="option3">Option 3</Label>
			</Field>
		</RadioGroup>
	),
}

export const Disabled: Story = {
	render: () => (
		<RadioGroup defaultValue="option1" disabled>
			<Field orientation="horizontal">
				<RadioGroupItem value="option1" id="option1" />
				<Label htmlFor="option1">Option 1</Label>
			</Field>
			<Field orientation="horizontal">
				<RadioGroupItem value="option2" id="option2" />
				<Label htmlFor="option2">Option 2</Label>
			</Field>
			<Field orientation="horizontal">
				<RadioGroupItem value="option3" id="option3" />
				<Label htmlFor="option3">Option 3</Label>
			</Field>
		</RadioGroup>
	),
}

export const Vertical: Story = {
	render: () => (
		<RadioGroup defaultValue="option1" className="flex flex-col gap-3">
			<Field orientation="horizontal">
				<RadioGroupItem value="option1" id="option1" />
				<Label htmlFor="option1">Option 1</Label>
			</Field>
			<Field orientation="horizontal">
				<RadioGroupItem value="option2" id="option2" />
				<Label htmlFor="option2">Option 2</Label>
			</Field>
			<Field orientation="horizontal">
				<RadioGroupItem value="option3" id="option3" />
				<Label htmlFor="option3">Option 3</Label>
			</Field>
		</RadioGroup>
	),
}
