import type { Meta, StoryObj } from '@storybook/react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from '../card'
import { Button } from '../button'
import { Badge } from '../badge'

const meta: Meta<typeof Card> = {
	title: 'UI/Card',
	component: Card,
	argTypes: {
		size: {
			control: 'select',
			options: ['default', 'sm'],
		},
	},
}

export default meta
type Story = StoryObj<typeof Card>

export const Default: Story = {
	render: () => (
		<Card>
			<CardHeader>
				<CardTitle>Card Title</CardTitle>
				<CardDescription>Card description goes here</CardDescription>
			</CardHeader>
			<CardContent>
				<p>Card content goes here. This is where you would put the main content of your card.</p>
			</CardContent>
		</Card>
	),
}

export const WithFooter: Story = {
	render: () => (
		<Card>
			<CardHeader>
				<CardTitle>Card Title</CardTitle>
				<CardDescription>Card description goes here</CardDescription>
			</CardHeader>
			<CardContent>
				<p>Card content goes here.</p>
			</CardContent>
			<CardFooter>
				<Button>Action</Button>
			</CardFooter>
		</Card>
	),
}

export const WithAction: Story = {
	render: () => (
		<Card>
			<CardHeader>
				<CardTitle>Card Title</CardTitle>
				<CardDescription>Card description goes here</CardDescription>
				<CardAction>
					<Button variant="ghost" size="icon-sm">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<circle cx="12" cy="12" r="1" />
							<circle cx="19" cy="12" r="1" />
							<circle cx="5" cy="12" r="1" />
						</svg>
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent>
				<p>Card content goes here.</p>
			</CardContent>
		</Card>
	),
}

export const Small: Story = {
	render: () => (
		<Card size="sm">
			<CardHeader>
				<CardTitle>Small Card</CardTitle>
				<CardDescription>This is a small card</CardDescription>
			</CardHeader>
			<CardContent>
				<p>Card content goes here.</p>
			</CardContent>
		</Card>
	),
}

export const Complex: Story = {
	render: () => (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle>Project Alpha</CardTitle>
				<CardDescription>Active project with 12 tasks</CardDescription>
				<CardAction>
					<Badge variant="secondary">Active</Badge>
				</CardAction>
			</CardHeader>
			<CardContent>
				<p>This is a more complex card example with multiple elements and actions.</p>
			</CardContent>
			<CardFooter className="gap-2">
				<Button variant="outline">Cancel</Button>
				<Button>Save</Button>
			</CardFooter>
		</Card>
	),
}
