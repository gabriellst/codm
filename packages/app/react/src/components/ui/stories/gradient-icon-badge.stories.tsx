import type { Meta, StoryObj } from '@storybook/react'

import { GradientIconBadge } from '../gradient-icon-badge'
import { MoneyIcon, LockIcon, MegaphoneIcon } from '../icons'

const meta: Meta<typeof GradientIconBadge> = {
	title: 'UI/GradientIconBadge',
	component: GradientIconBadge,
	parameters: { layout: 'centered' },
}
export default meta
type Story = StoryObj<typeof GradientIconBadge>

export const Default: Story = { args: { icon: MoneyIcon } }

export const Icons: Story = {
	render: () => (
		<div className="flex gap-4">
			<GradientIconBadge icon={MoneyIcon} />
			<GradientIconBadge icon={LockIcon} />
			<GradientIconBadge icon={MegaphoneIcon} />
		</div>
	),
}

export const OnColor: Story = {
	render: () => (
		<div className="flex gap-4 rounded-xl bg-success p-5 text-success-foreground">
			<GradientIconBadge icon={MoneyIcon} onColor />
		</div>
	),
}
