import type { Meta, StoryObj } from '@storybook/react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../tabs'

const meta: Meta<typeof Tabs> = {
	title: 'UI/Tabs',
	component: Tabs,
	argTypes: {
		orientation: {
			control: 'select',
			options: ['horizontal', 'vertical'],
		},
	},
}

export default meta
type Story = StoryObj<typeof Tabs>

export const Default: Story = {
	render: () => (
		<Tabs defaultValue="account">
			<TabsList>
				<TabsTrigger value="account">Account</TabsTrigger>
				<TabsTrigger value="password">Password</TabsTrigger>
			</TabsList>
			<TabsContent value="account">
				<p className="text-sm text-muted-foreground">Make changes to your account here. Click save when you're done.</p>
			</TabsContent>
			<TabsContent value="password">
				<p className="text-sm text-muted-foreground">Change your password here. After saving, you'll be logged out.</p>
			</TabsContent>
		</Tabs>
	),
}

export const LineVariant: Story = {
	render: () => (
		<Tabs defaultValue="account">
			<TabsList variant="line">
				<TabsTrigger value="account">Account</TabsTrigger>
				<TabsTrigger value="password">Password</TabsTrigger>
				<TabsTrigger value="settings">Settings</TabsTrigger>
			</TabsList>
			<TabsContent value="account">
				<p className="text-sm text-muted-foreground">Account content</p>
			</TabsContent>
			<TabsContent value="password">
				<p className="text-sm text-muted-foreground">Password content</p>
			</TabsContent>
			<TabsContent value="settings">
				<p className="text-sm text-muted-foreground">Settings content</p>
			</TabsContent>
		</Tabs>
	),
}

export const Vertical: Story = {
	render: () => (
		<Tabs defaultValue="account" orientation="vertical" className="flex gap-4">
			<TabsList variant="line" className="flex-col">
				<TabsTrigger value="account">Account</TabsTrigger>
				<TabsTrigger value="password">Password</TabsTrigger>
				<TabsTrigger value="settings">Settings</TabsTrigger>
			</TabsList>
			<TabsContent value="account">
				<p className="text-sm text-muted-foreground">Account content</p>
			</TabsContent>
			<TabsContent value="password">
				<p className="text-sm text-muted-foreground">Password content</p>
			</TabsContent>
			<TabsContent value="settings">
				<p className="text-sm text-muted-foreground">Settings content</p>
			</TabsContent>
		</Tabs>
	),
}

export const MultipleTabs: Story = {
	render: () => (
		<Tabs defaultValue="overview">
			<TabsList>
				<TabsTrigger value="overview">Overview</TabsTrigger>
				<TabsTrigger value="analytics">Analytics</TabsTrigger>
				<TabsTrigger value="reports">Reports</TabsTrigger>
				<TabsTrigger value="notifications">Notifications</TabsTrigger>
			</TabsList>
			<TabsContent value="overview">
				<p className="text-sm text-muted-foreground">Overview content goes here.</p>
			</TabsContent>
			<TabsContent value="analytics">
				<p className="text-sm text-muted-foreground">Analytics content goes here.</p>
			</TabsContent>
			<TabsContent value="reports">
				<p className="text-sm text-muted-foreground">Reports content goes here.</p>
			</TabsContent>
			<TabsContent value="notifications">
				<p className="text-sm text-muted-foreground">Notifications content goes here.</p>
			</TabsContent>
		</Tabs>
	),
}
