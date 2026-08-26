import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '../button'
import { IconPlus, IconTrash } from '@tabler/icons-react'

const meta: Meta<typeof Button> = {
	title: 'UI/Button',
	component: Button,
	argTypes: {
		variant: {
			control: 'select',
			options: ['default', 'destructive', 'outline', 'ghost', 'soft', 'secondary', 'link'],
		},
		size: {
			control: 'select',
			options: ['xs', 'sm', 'default', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'],
		},
		disabled: {
			control: 'boolean',
		},
	},
}

export default meta
type Story = StoryObj<typeof Button>

export const Default: Story = {
	args: {
		children: 'Button',
		variant: 'default',
		size: 'default',
	},
}

export const Destructive: Story = {
	args: {
		children: 'Delete',
		variant: 'destructive',
	},
}

export const Outline: Story = {
	args: {
		children: 'Outline',
		variant: 'outline',
	},
}

// `secondary` is the ON state of a toggle (D3), not "secondary action" — that's `outline`.
export const Secondary: Story = {
	args: {
		children: 'Secondary (on)',
		variant: 'secondary',
	},
}

export const Ghost: Story = {
	args: {
		children: 'Ghost',
		variant: 'ghost',
	},
}

export const Soft: Story = {
	args: {
		children: 'Soft',
		variant: 'soft',
	},
}

export const Link: Story = {
	args: {
		children: 'Link',
		variant: 'link',
	},
}

export const AllVariants: Story = {
	render: () => (
		<div className="flex flex-wrap gap-4">
			<Button variant="default">Default</Button>
			<Button variant="outline">Outline</Button>
			<Button variant="ghost">Ghost</Button>
			<Button variant="soft">Soft</Button>
			<Button variant="secondary">Secondary (on)</Button>
			<Button variant="destructive">Destructive</Button>
			<Button variant="link">Link</Button>
		</div>
	),
}

export const AllSizes: Story = {
	render: () => (
		<div className="flex items-center gap-4 flex-wrap">
			<Button size="xs">Extra Small</Button>
			<Button size="sm">Small</Button>
			<Button size="default">Default</Button>
			<Button size="lg">Large</Button>
		</div>
	),
}

export const IconSizes: Story = {
	render: () => (
		<div className="flex items-center gap-4">
			<Button size="icon-xs">
				<IconPlus />
			</Button>
			<Button size="icon-sm">
				<IconPlus />
			</Button>
			<Button size="icon">
				<IconPlus />
			</Button>
			<Button size="icon-lg">
				<IconPlus />
			</Button>
		</div>
	),
}

export const WithIcons: Story = {
	render: () => (
		<div className="flex flex-wrap gap-4">
			<Button>
				<IconPlus data-icon="inline-start" />
				Add Item
			</Button>
			<Button>
				Delete
				<IconTrash data-icon="inline-end" />
			</Button>
			<Button variant="outline">
				<IconPlus data-icon="inline-start" />
				Add Item
			</Button>
		</div>
	),
}

export const Disabled: Story = {
	render: () => (
		<div className="flex flex-wrap gap-4">
			<Button disabled>Disabled Default</Button>
			<Button variant="destructive" disabled>
				Disabled Destructive
			</Button>
			<Button variant="outline" disabled>
				Disabled Outline
			</Button>
		</div>
	),
}
