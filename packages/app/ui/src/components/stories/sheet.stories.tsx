import type { Meta, StoryObj } from '@storybook/react'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '../sheet'
import { Button } from '../button'
import { Input } from '../input'
import { Label } from '../label'

const meta: Meta<typeof Sheet> = {
	title: 'UI/Sheet',
	component: Sheet,
}

export default meta
type Story = StoryObj<typeof Sheet>

export const Right: Story = {
	render: () => (
		<Sheet>
			<SheetTrigger render={<Button variant="outline" />}>Open Right</SheetTrigger>
			<SheetContent side="right">
				<SheetHeader>
					<SheetTitle>Edit profile</SheetTitle>
					<SheetDescription>Make changes to your profile here. Click save when you're done.</SheetDescription>
				</SheetHeader>
				<div className="grid gap-4 py-4">
					<div className="grid gap-2">
						<Label htmlFor="name">Name</Label>
						<Input id="name" defaultValue="Pedro Duarte" />
					</div>
					<div className="grid gap-2">
						<Label htmlFor="username">Username</Label>
						<Input id="username" defaultValue="@peduarte" />
					</div>
				</div>
				<SheetFooter>
					<Button>Save changes</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	),
}

export const Left: Story = {
	render: () => (
		<Sheet>
			<SheetTrigger render={<Button variant="outline" />}>Open Left</SheetTrigger>
			<SheetContent side="left">
				<SheetHeader>
					<SheetTitle>Sidebar</SheetTitle>
					<SheetDescription>This is a left-side sheet.</SheetDescription>
				</SheetHeader>
			</SheetContent>
		</Sheet>
	),
}

export const Top: Story = {
	render: () => (
		<Sheet>
			<SheetTrigger render={<Button variant="outline" />}>Open Top</SheetTrigger>
			<SheetContent side="top">
				<SheetHeader>
					<SheetTitle>Top Sheet</SheetTitle>
					<SheetDescription>This is a top-side sheet.</SheetDescription>
				</SheetHeader>
			</SheetContent>
		</Sheet>
	),
}

export const Bottom: Story = {
	render: () => (
		<Sheet>
			<SheetTrigger render={<Button variant="outline" />}>Open Bottom</SheetTrigger>
			<SheetContent side="bottom">
				<SheetHeader>
					<SheetTitle>Bottom Sheet</SheetTitle>
					<SheetDescription>This is a bottom-side sheet.</SheetDescription>
				</SheetHeader>
			</SheetContent>
		</Sheet>
	),
}
