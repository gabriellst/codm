// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-react-primitive-variant
// task:        synthetic-react-primitive-variant
// stamp:       agent-wave1-38ff876
// docTreeHash: 213519a54e23
// model:       sonnet
// graded:      2026-07-21T23:33:24.162Z
// source:      packages/app/react/src/components/ui/stories/badge.stories.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { useState } from 'react'
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
		size: {
			control: 'select',
			options: ['sm', 'default', 'lg'],
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

export const AllSizes: Story = {
	render: () => (
		<div className="flex flex-wrap items-center gap-2">
			<Badge size="sm">Small</Badge>
			<Badge size="default">Default</Badge>
			<Badge size="lg">Large</Badge>
		</div>
	),
}

export const Dismissible: Story = {
	render: function DismissibleStory() {
		const [chips, setChips] = useState(['React', 'TypeScript', 'Astro'])
		return (
			<div className="flex flex-wrap gap-2">
				{chips.map(chip => (
					<Badge
						key={chip}
						variant="secondary"
						onDismiss={() => setChips(prev => prev.filter(c => c !== chip))}
						dismissLabel={`Remover ${chip}`}
					>
						{chip}
					</Badge>
				))}
				{chips.length === 0 ? <span className="text-muted-foreground text-sm">Nenhum filtro ativo</span> : null}
			</div>
		)
	},
}

export const DismissibleSizes: Story = {
	render: () => (
		<div className="flex flex-wrap items-center gap-2">
			<Badge size="sm" variant="outline" onDismiss={() => {}} dismissLabel="Remover filtro pequeno">
				Small
			</Badge>
			<Badge size="default" variant="outline" onDismiss={() => {}} dismissLabel="Remover filtro padrão">
				Default
			</Badge>
			<Badge size="lg" variant="outline" onDismiss={() => {}} dismissLabel="Remover filtro grande">
				Large
			</Badge>
		</div>
	),
}
