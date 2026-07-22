import type { Meta, StoryObj } from '@storybook/react'
import { Separator } from '../separator'

const meta: Meta<typeof Separator> = {
	title: 'UI/Separator',
	component: Separator,
	argTypes: {
		orientation: {
			control: 'select',
			options: ['horizontal', 'vertical'],
		},
	},
}

export default meta
type Story = StoryObj<typeof Separator>

export const Horizontal: Story = {
	args: {
		orientation: 'horizontal',
	},
}

export const Vertical: Story = {
	args: {
		orientation: 'vertical',
	},
}

export const InContent: Story = {
	render: () => (
		<div className="w-full max-w-md">
			<div className="space-y-1">
				<h4 className="text-sm font-medium">Radix Primitives</h4>
				<p className="text-sm text-muted-foreground">An open-source UI component library.</p>
			</div>
			<Separator className="my-4" />
			<div className="flex h-5 items-center space-x-4 text-sm">
				<div>Blog</div>
				<Separator orientation="vertical" />
				<div>Docs</div>
				<Separator orientation="vertical" />
				<div>Source</div>
			</div>
		</div>
	),
}
