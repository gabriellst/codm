import type { Meta, StoryObj } from '@storybook/react'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from '../input-group'
import { IconSearch, IconUser, IconMail, IconLock } from '@tabler/icons-react'

const meta: Meta<typeof InputGroup> = {
	title: 'UI/InputGroup',
	component: InputGroup,
}

export default meta
type Story = StoryObj<typeof InputGroup>

export const WithIconStart: Story = {
	render: () => (
		<InputGroup>
			<InputGroupAddon align="inline-start">
				<IconSearch />
			</InputGroupAddon>
			<InputGroupInput placeholder="Search..." />
		</InputGroup>
	),
}

export const WithIconEnd: Story = {
	render: () => (
		<InputGroup>
			<InputGroupInput placeholder="Search..." />
			<InputGroupAddon align="inline-end">
				<IconSearch />
			</InputGroupAddon>
		</InputGroup>
	),
}

export const WithTextStart: Story = {
	render: () => (
		<InputGroup>
			<InputGroupAddon align="inline-start">
				<InputGroupText>https://</InputGroupText>
			</InputGroupAddon>
			<InputGroupInput placeholder="example.com" />
		</InputGroup>
	),
}

export const WithTextEnd: Story = {
	render: () => (
		<InputGroup>
			<InputGroupInput placeholder="Amount" type="number" />
			<InputGroupAddon align="inline-end">
				<InputGroupText>USD</InputGroupText>
			</InputGroupAddon>
		</InputGroup>
	),
}

export const WithButton: Story = {
	render: () => (
		<InputGroup>
			<InputGroupInput placeholder="Search..." />
			<InputGroupAddon align="inline-end">
				<InputGroupButton>
					<IconSearch />
				</InputGroupButton>
			</InputGroupAddon>
		</InputGroup>
	),
}

export const Complex: Story = {
	render: () => (
		<div className="flex flex-col gap-4 w-full max-w-sm">
			<InputGroup>
				<InputGroupAddon align="inline-start">
					<IconUser />
				</InputGroupAddon>
				<InputGroupInput placeholder="Username" />
			</InputGroup>
			<InputGroup>
				<InputGroupAddon align="inline-start">
					<IconMail />
				</InputGroupAddon>
				<InputGroupInput type="email" placeholder="Email" />
			</InputGroup>
			<InputGroup>
				<InputGroupAddon align="inline-start">
					<IconLock />
				</InputGroupAddon>
				<InputGroupInput type="password" placeholder="Password" />
			</InputGroup>
		</div>
	),
}
