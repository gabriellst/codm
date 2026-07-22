import type { Meta, StoryObj } from '@storybook/react'
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip'
import { Button } from '../button'

const meta: Meta<typeof Tooltip> = {
	title: 'UI/Tooltip',
	component: Tooltip,
}

export default meta
type Story = StoryObj<typeof Tooltip>

export const Default: Story = {
	render: () => (
		<Tooltip>
			<TooltipTrigger render={<Button variant="outline" />}>Hover me</TooltipTrigger>
			<TooltipContent>
				<p>This is a tooltip</p>
			</TooltipContent>
		</Tooltip>
	),
}

export const AllSides: Story = {
	render: () => (
		<div className="flex items-center justify-center gap-4 p-20">
			<Tooltip>
				<TooltipTrigger render={<Button variant="outline" />}>Top</TooltipTrigger>
				<TooltipContent side="top">
					<p>Tooltip on top</p>
				</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger render={<Button variant="outline" />}>Right</TooltipTrigger>
				<TooltipContent side="right">
					<p>Tooltip on right</p>
				</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger render={<Button variant="outline" />}>Bottom</TooltipTrigger>
				<TooltipContent side="bottom">
					<p>Tooltip on bottom</p>
				</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger render={<Button variant="outline" />}>Left</TooltipTrigger>
				<TooltipContent side="left">
					<p>Tooltip on left</p>
				</TooltipContent>
			</Tooltip>
		</div>
	),
}

export const LongContent: Story = {
	render: () => (
		<Tooltip>
			<TooltipTrigger render={<Button variant="outline" />}>Hover for long content</TooltipTrigger>
			<TooltipContent>
				<p>This is a longer tooltip message that demonstrates how the tooltip handles content that spans multiple lines.</p>
			</TooltipContent>
		</Tooltip>
	),
}
