import type { Meta, StoryObj } from '@storybook/react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../dialog'
import { Button } from '../button'
import { Input } from '../input'
import { Label } from '../label'

const meta: Meta<typeof Dialog> = {
	title: 'UI/Dialog',
	component: Dialog,
}

export default meta
type Story = StoryObj<typeof Dialog>

export const Default: Story = {
	render: () => (
		<Dialog>
			<DialogTrigger render={<Button />}>Open Dialog</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Are you absolutely sure?</DialogTitle>
					<DialogDescription>
						This action cannot be undone. This will permanently delete your account and remove your data from our servers.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline">Cancel</Button>
					<Button>Continue</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	),
}

export const WithForm: Story = {
	render: () => (
		<Dialog>
			<DialogTrigger render={<Button />}>Edit Profile</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit Profile</DialogTitle>
					<DialogDescription>Make changes to your profile here. Click save when you're done.</DialogDescription>
				</DialogHeader>
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
				<DialogFooter>
					<Button variant="outline">Cancel</Button>
					<Button>Save changes</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	),
}

export const WithoutCloseButton: Story = {
	render: () => (
		<Dialog>
			<DialogTrigger render={<Button />}>Open Dialog</DialogTrigger>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>Dialog without close button</DialogTitle>
					<DialogDescription>This dialog doesn't have a close button in the header.</DialogDescription>
				</DialogHeader>
				<DialogFooter showCloseButton>
					<Button variant="outline">Cancel</Button>
					<Button>Continue</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	),
}
