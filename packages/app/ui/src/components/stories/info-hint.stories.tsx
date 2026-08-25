import type { Meta, StoryObj } from '@storybook/react'

import { InfoHint } from '../info-hint'

const meta: Meta<typeof InfoHint> = {
	title: 'UI/InfoHint',
	component: InfoHint,
	parameters: { layout: 'centered' },
}
export default meta
type Story = StoryObj<typeof InfoHint>

export const Default: Story = {
	render: () => (
		<span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
			Custos Totais
			<InfoHint>Soma de anúncios, produto, taxas e custos adicionais.</InfoHint>
		</span>
	),
}
