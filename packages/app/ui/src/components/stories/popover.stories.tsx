import type { Meta, StoryObj } from '@storybook/react'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '../popover'
import { Button } from '../button'

const meta: Meta<typeof Popover> = {
	title: 'UI/Popover',
	component: Popover,
}

export default meta
type Story = StoryObj<typeof Popover>

export const Default: Story = {
	render: () => (
		<Popover>
			<PopoverTrigger render={<Button variant="outline" />}>Open popover</PopoverTrigger>
			<PopoverContent>
				<PopoverHeader>
					<PopoverTitle>Are you absolutely sure?</PopoverTitle>
					<PopoverDescription>This action cannot be undone. This will permanently delete your account.</PopoverDescription>
				</PopoverHeader>
			</PopoverContent>
		</Popover>
	),
}

export const AllSides: Story = {
	render: () => (
		<div className="flex items-center justify-center gap-4 p-20">
			<Popover>
				<PopoverTrigger render={<Button variant="outline" />}>Top</PopoverTrigger>
				<PopoverContent side="top">
					<PopoverHeader>
						<PopoverTitle>Popover on top</PopoverTitle>
						<PopoverDescription>Content here</PopoverDescription>
					</PopoverHeader>
				</PopoverContent>
			</Popover>
			<Popover>
				<PopoverTrigger render={<Button variant="outline" />}>Right</PopoverTrigger>
				<PopoverContent side="right">
					<PopoverHeader>
						<PopoverTitle>Popover on right</PopoverTitle>
						<PopoverDescription>Content here</PopoverDescription>
					</PopoverHeader>
				</PopoverContent>
			</Popover>
			<Popover>
				<PopoverTrigger render={<Button variant="outline" />}>Bottom</PopoverTrigger>
				<PopoverContent side="bottom">
					<PopoverHeader>
						<PopoverTitle>Popover on bottom</PopoverTitle>
						<PopoverDescription>Content here</PopoverDescription>
					</PopoverHeader>
				</PopoverContent>
			</Popover>
			<Popover>
				<PopoverTrigger render={<Button variant="outline" />}>Left</PopoverTrigger>
				<PopoverContent side="left">
					<PopoverHeader>
						<PopoverTitle>Popover on left</PopoverTitle>
						<PopoverDescription>Content here</PopoverDescription>
					</PopoverHeader>
				</PopoverContent>
			</Popover>
		</div>
	),
}
