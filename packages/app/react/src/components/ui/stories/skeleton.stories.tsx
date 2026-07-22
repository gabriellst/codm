import type { Meta, StoryObj } from '@storybook/react'
import { Skeleton } from '../skeleton'

const meta: Meta<typeof Skeleton> = {
	title: 'UI/Skeleton',
	component: Skeleton,
}

export default meta
type Story = StoryObj<typeof Skeleton>

export const Default: Story = {
	args: {
		className: 'h-4 w-[250px]',
	},
}

export const Circle: Story = {
	args: {
		className: 'h-12 w-12 rounded-full',
	},
}

export const Rectangle: Story = {
	args: {
		className: 'h-4 w-full',
	},
}

export const Card: Story = {
	render: () => (
		<div className="flex items-center space-x-4">
			<Skeleton className="h-12 w-12 rounded-full" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-[250px]" />
				<Skeleton className="h-4 w-[200px]" />
			</div>
		</div>
	),
}

export const Article: Story = {
	render: () => (
		<div className="flex flex-col space-y-3">
			<Skeleton className="h-[125px] w-[250px] rounded-xl" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-[250px]" />
				<Skeleton className="h-4 w-[200px]" />
			</div>
		</div>
	),
}
