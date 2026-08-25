import type { Meta, StoryObj } from '@storybook/react'

import { Button } from '@codm/app-ui/button'
import { InfoHint } from '@codm/app-ui/info-hint'
import { BagIcon, CartIcon, MoneyIcon, LockIcon, MegaphoneIcon, PercentageIcon, AddIcon, RefreshIcon, TicketIcon } from '@codm/app-ui/icons'
import { StatCard } from '.'

const meta: Meta<typeof StatCard> = {
	title: 'Components/StatCard',
	component: StatCard,
	parameters: { layout: 'centered' },
}
export default meta
type Story = StoryObj<typeof StatCard>

const RefreshAndAdd = (
	<>
		<Button variant="outline" size="icon-sm" aria-label="Atualizar">
			<RefreshIcon className="size-3 opacity-55" />
		</Button>
		<Button variant="outline" size="icon-sm" aria-label="Adicionar">
			<AddIcon className="size-3 opacity-55" />
		</Button>
	</>
)

export const Default: Story = {
	args: { icon: MoneyIcon, label: 'Faturamento', value: 'R$ 9.499,31', deltaPct: 0.61 },
}

export const PositiveHighlight: Story = {
	args: { icon: MoneyIcon, label: 'Lucro', value: 'R$ 3.283,63', deltaPct: 0.8, tone: 'positive' },
}

export const NegativeHighlight: Story = {
	args: { icon: MoneyIcon, label: 'Lucro', value: '-R$ 1.204,00', deltaPct: -0.32, tone: 'negative' },
}

export const NegativeDelta: Story = {
	args: { icon: TicketIcon, label: 'Ticket Médio', value: 'R$ 135,70', deltaPct: -0.01 },
}

export const WithInfoHint: Story = {
	args: {
		icon: LockIcon,
		label: 'Taxas',
		value: 'R$ 490,33',
		deltaPct: 0.9,
		adornment: <InfoHint className="opacity-60">Gateway, checkout e chargeback.</InfoHint>,
	},
}

export const WithActions: Story = {
	args: { icon: MoneyIcon, label: 'C. de Produto', value: 'R$ 3.989,61', deltaPct: 0.52, actions: RefreshAndAdd },
}

export const CountValue: Story = {
	args: { icon: CartIcon, label: 'Unidades Vendidas', value: '80', deltaPct: 0.6 },
}

export const Grid: Story = {
	render: () => (
		<div className="grid w-[760px] grid-cols-2 gap-4">
			<StatCard icon={MoneyIcon} label="Lucro" value="R$ 3.283,63" deltaPct={0.8} tone="positive" />
			<StatCard icon={MoneyIcon} label="Faturamento" value="R$ 9.499,31" deltaPct={0.61} />
			<StatCard icon={PercentageIcon} label="Margem" value="34,6%" deltaPct={0.12} adornment={<InfoHint>Lucro / Faturamento.</InfoHint>} />
			<StatCard icon={MegaphoneIcon} label="Anúncios" value="R$ 1.735,73" deltaPct={0.46} actions={RefreshAndAdd} />
			<StatCard icon={BagIcon} label="Pedidos" value="91" deltaPct={0.75} />
			<StatCard icon={TicketIcon} label="Ticket Médio" value="R$ 135,70" deltaPct={-0.01} />
		</div>
	),
}
