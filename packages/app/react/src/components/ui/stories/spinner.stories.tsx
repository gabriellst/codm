import type { Meta, StoryObj } from '@storybook/react'
import { Spinner } from '../spinner'
import { Button } from '../button'

const meta: Meta<typeof Spinner> = {
	title: 'UI/Spinner',
	component: Spinner,
	argTypes: {
		className: {
			control: 'text',
		},
	},
}

export default meta
type Story = StoryObj<typeof Spinner>

export const Default: Story = {
	args: {},
}

export const AllSizes: Story = {
	render: () => (
		<div className="flex items-center gap-4">
			<div className="flex flex-col items-center gap-2">
				<Spinner className="size-2" />
				<span className="text-xs text-muted-foreground">size-2</span>
			</div>
			<div className="flex flex-col items-center gap-2">
				<Spinner className="size-4" />
				<span className="text-xs text-muted-foreground">size-4</span>
			</div>
			<div className="flex flex-col items-center gap-2">
				<Spinner className="size-6" />
				<span className="text-xs text-muted-foreground">size-6</span>
			</div>
			<div className="flex flex-col items-center gap-2">
				<Spinner className="size-8" />
				<span className="text-xs text-muted-foreground">size-8</span>
			</div>
			<div className="flex flex-col items-center gap-2">
				<Spinner className="size-12" />
				<span className="text-xs text-muted-foreground">size-12</span>
			</div>
		</div>
	),
}

export const Colors: Story = {
	render: () => (
		<div className="flex items-center gap-4">
			<div className="flex flex-col items-center gap-2">
				<Spinner className="text-primary" />
				<span className="text-xs text-muted-foreground">Primary</span>
			</div>
			<div className="flex flex-col items-center gap-2">
				<Spinner className="text-secondary-foreground" />
				<span className="text-xs text-muted-foreground">Secondary</span>
			</div>
			<div className="flex flex-col items-center gap-2">
				<Spinner className="text-destructive" />
				<span className="text-xs text-muted-foreground">Destructive</span>
			</div>
			<div className="flex flex-col items-center gap-2">
				<Spinner className="text-muted-foreground" />
				<span className="text-xs text-muted-foreground">Muted</span>
			</div>
		</div>
	),
}

export const InButton: Story = {
	render: () => (
		<div className="flex flex-wrap gap-4">
			<Button disabled>
				<Spinner className="size-4" />
				Loading...
			</Button>
			<Button variant="outline" disabled>
				<Spinner className="size-4" />
				Processing
			</Button>
			<Button variant="destructive" disabled>
				<Spinner className="size-4" />
				Deleting...
			</Button>
		</div>
	),
}

export const InText: Story = {
	render: () => (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-2">
				<Spinner className="size-4" />
				<span>Loading content...</span>
			</div>
			<div className="flex items-center gap-2">
				<span>Processing</span>
				<Spinner className="size-4" />
			</div>
			<div className="flex items-center gap-2">
				<Spinner className="size-3 text-muted-foreground" />
				<span className="text-sm text-muted-foreground">Fetching data...</span>
			</div>
		</div>
	),
}

export const Centered: Story = {
	render: () => (
		<div className="flex items-center justify-center p-8 border rounded-lg">
			<Spinner className="size-8" />
		</div>
	),
}
