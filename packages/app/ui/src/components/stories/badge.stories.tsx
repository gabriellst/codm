import type { Meta, StoryObj } from '@storybook/react'
import { Badge } from '../badge'
import { IconCheck, IconX } from '@tabler/icons-react'

const meta: Meta<typeof Badge> = {
	title: 'UI/Badge',
	component: Badge,
	argTypes: {
		variant: {
			control: 'select',
			options: ['default', 'secondary', 'destructive', 'outline', 'ghost', 'link'],
		},
	},
}

export default meta
type Story = StoryObj<typeof Badge>

export const Default: Story = {
	args: {
		children: 'Badge',
		variant: 'default',
	},
}

export const Secondary: Story = {
	args: {
		children: 'Badge',
		variant: 'secondary',
	},
}

export const Destructive: Story = {
	args: {
		children: 'Badge',
		variant: 'destructive',
	},
}

export const Outline: Story = {
	args: {
		children: 'Badge',
		variant: 'outline',
	},
}

export const Ghost: Story = {
	args: {
		children: 'Badge',
		variant: 'ghost',
	},
}

export const Link: Story = {
	args: {
		children: 'Badge',
		variant: 'link',
	},
}

export const AllVariants: Story = {
	render: () => (
		<div className="flex flex-wrap gap-2">
			<Badge variant="default">Default</Badge>
			<Badge variant="secondary">Secondary</Badge>
			<Badge variant="destructive">Destructive</Badge>
			<Badge variant="outline">Outline</Badge>
			<Badge variant="ghost">Ghost</Badge>
			<Badge variant="link">Link</Badge>
		</div>
	),
}

// D3 (R9) — `size="default"` (2xs, 12px) is the new majority shape (workspace/channel chips);
// `size="compact"` (3xs, 9px) is reserved for the session-loop chips (`LoopsSection.tsx`).
export const Sizes: Story = {
	render: () => (
		<div className="flex flex-wrap items-center gap-2">
			<Badge size="default">Default (2xs)</Badge>
			<Badge size="compact">Compact (3xs)</Badge>
		</div>
	),
}

export const WithIcons: Story = {
	render: () => (
		<div className="flex flex-wrap gap-2">
			<Badge>
				<IconCheck data-icon="inline-start" />
				Success
			</Badge>
			<Badge variant="destructive">
				<IconX data-icon="inline-start" />
				Error
			</Badge>
			<Badge variant="secondary">
				Info
				<IconCheck data-icon="inline-end" />
			</Badge>
		</div>
	),
}
