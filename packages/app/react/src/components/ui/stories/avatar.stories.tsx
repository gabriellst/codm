import type { Meta, StoryObj } from '@storybook/react'
import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from '../avatar'

const meta: Meta<typeof Avatar> = {
	title: 'UI/Avatar',
	component: Avatar,
	argTypes: {
		size: {
			control: 'select',
			options: ['sm', 'default', 'lg'],
		},
	},
}

export default meta
type Story = StoryObj<typeof Avatar>

export const Default: Story = {
	render: () => (
		<Avatar>
			<AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
			<AvatarFallback>CN</AvatarFallback>
		</Avatar>
	),
}

export const WithFallback: Story = {
	render: () => (
		<Avatar>
			<AvatarImage src="https://invalid-url.png" alt="@invalid" />
			<AvatarFallback>JD</AvatarFallback>
		</Avatar>
	),
}

export const AllSizes: Story = {
	render: () => (
		<div className="flex items-center gap-4">
			<Avatar size="sm">
				<AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
				<AvatarFallback>CN</AvatarFallback>
			</Avatar>
			<Avatar size="default">
				<AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
				<AvatarFallback>CN</AvatarFallback>
			</Avatar>
			<Avatar size="lg">
				<AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
				<AvatarFallback>CN</AvatarFallback>
			</Avatar>
		</div>
	),
}

export const WithBadge: Story = {
	render: () => (
		<Avatar>
			<AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
			<AvatarFallback>CN</AvatarFallback>
			<AvatarBadge />
		</Avatar>
	),
}

export const Group: Story = {
	render: () => (
		<AvatarGroup>
			<Avatar>
				<AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
				<AvatarFallback>CN</AvatarFallback>
			</Avatar>
			<Avatar>
				<AvatarImage src="https://github.com/vercel.png" alt="@vercel" />
				<AvatarFallback>VC</AvatarFallback>
			</Avatar>
			<Avatar>
				<AvatarImage src="https://github.com/nextjs.png" alt="@nextjs" />
				<AvatarFallback>NJ</AvatarFallback>
			</Avatar>
			<AvatarGroupCount>+5</AvatarGroupCount>
		</AvatarGroup>
	),
}
