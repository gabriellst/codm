import type { Meta, StoryObj } from '@storybook/react'

import { MetricDelta } from '../metric-delta'

const meta: Meta<typeof MetricDelta> = {
	title: 'UI/MetricDelta',
	component: MetricDelta,
	parameters: { layout: 'centered' },
}
export default meta
type Story = StoryObj<typeof MetricDelta>

export const Positive: Story = { args: { pct: 0.52 } }
export const Negative: Story = { args: { pct: -0.1 } }
export const OnColor: Story = {
	render: () => (
		<span className="inline-flex rounded-lg bg-success px-3 py-1 text-success-foreground">
			<MetricDelta pct={0.8} onColor />
		</span>
	),
}
