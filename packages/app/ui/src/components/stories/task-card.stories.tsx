import type { Meta, StoryObj } from '@storybook/react'
import { IconAlertTriangle, IconMessageQuestion, IconPaperclip } from '@tabler/icons-react'

import { StatusPill } from '../status-pill'
import { TaskCard } from '../task-card'

const meta: Meta<typeof TaskCard> = {
	title: 'UI/TaskCard',
	component: TaskCard,
	parameters: { layout: 'padded' },
	decorators: [
		Story => (
			<div className="w-[300px]">
				<Story />
			</div>
		),
	],
	argTypes: {
		metaTone: { control: 'inline-radio', options: ['default', 'strong', 'warn'] },
		size: { control: 'inline-radio', options: ['default', 'compact'] },
	},
}

export default meta
type Story = StoryObj<typeof TaskCard>

export const Default: Story = {
	args: {
		taskKey: 'APP-14',
		title: 'Página de frete grátis acima de R$ 199',
		meta: '2 artefatos · atualizada 10:40',
		metaIcon: <IconPaperclip />,
		status: <StatusPill tone="working">Fazendo</StatusPill>,
		render: <a href="#APP-14" />,
	},
}

export const StrongMeta: Story = {
	args: {
		taskKey: 'APP-12',
		title: 'Botão de cupom some no iPhone SE',
		size: 'compact',
		meta: 'D1 · publico agora ou no fim do dia?',
		metaIcon: <IconMessageQuestion />,
		metaTone: 'strong',
	},
}

export const WarnMeta: Story = {
	args: {
		taskKey: 'APP-11',
		title: 'Integração Pix — sandbox fora do ar',
		size: 'compact',
		meta: 'escalada pelo supervisor',
		metaIcon: <IconAlertTriangle />,
		metaTone: 'warn',
	},
}

export const Selected: Story = {
	args: {
		...Default.args,
		selected: true,
	},
}

export const Compact: Story = {
	args: {
		taskKey: 'APP-13',
		title: 'Corrigir ordenação da busca',
		size: 'compact',
		meta: '1 artefato · 10:38',
		metaIcon: <IconPaperclip />,
	},
}
