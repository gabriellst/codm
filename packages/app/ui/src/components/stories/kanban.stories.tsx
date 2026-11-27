import type { Meta, StoryObj } from '@storybook/react'
import { IconAlertTriangle, IconClock, IconListNumbers, IconMessageQuestion, IconPaperclip, IconPlayerPause } from '@tabler/icons-react'

import { Board, BoardColumnBody } from '../board'
import { KanbanColumn, KanbanColumnHeader } from '../kanban'
import { TaskCard } from '../task-card'

const meta: Meta<typeof KanbanColumnHeader> = {
	title: 'UI/Kanban',
	component: KanbanColumnHeader,
	parameters: { layout: 'padded' },
	argTypes: {
		tone: { control: 'select', options: ['working', 'needsYou', 'queued', 'waiting', 'stalled', 'done'] },
	},
	decorators: [
		Story => (
			<div className="w-[300px]">
				<Story />
			</div>
		),
	],
}

export default meta
type Story = StoryObj<typeof KanbanColumnHeader>

export const HeaderQueued: Story = { args: { tone: 'queued', title: 'Na fila', count: 2 } }
export const HeaderWorking: Story = { args: { tone: 'working', title: 'Fazendo', count: 3 } }
export const HeaderNeedsYou: Story = { args: { tone: 'needsYou', title: 'Precisa de você', count: 2, emphasis: true } }
export const HeaderWaiting: Story = { args: { tone: 'waiting', title: 'Esperando cota', count: 2 } }
export const HeaderStalled: Story = { args: { tone: 'stalled', title: 'Parada', count: 2 } }
export const HeaderDone: Story = { args: { tone: 'done', title: 'Concluída', count: 12 } }

export const Column: Story = {
	render: () => (
		<KanbanColumn className="w-full md:w-full">
			<KanbanColumnHeader tone="working" title="Fazendo" count={2} />
			<BoardColumnBody>
				<TaskCard
					size="compact"
					taskKey="APP-14"
					title="Página de frete grátis acima de R$ 199"
					meta="2 artefatos · 10:40"
					metaIcon={<IconPaperclip />}
				/>
				<TaskCard
					size="compact"
					taskKey="APP-13"
					title="Corrigir ordenação da busca"
					meta="1 artefato · 10:38"
					metaIcon={<IconPaperclip />}
				/>
			</BoardColumnBody>
		</KanbanColumn>
	),
}

export const FullBoard: Story = {
	decorators: [
		Story => (
			<div className="w-[1900px]">
				<Story />
			</div>
		),
	],
	render: () => (
		<Board>
			<KanbanColumn>
				<KanbanColumnHeader tone="queued" title="Na fila" count={1} />
				<BoardColumnBody>
					<TaskCard
						size="compact"
						taskKey="APP-16"
						title="Traduzir e-mails de carrinho abandonado"
						meta="próxima da fila"
						metaIcon={<IconListNumbers />}
					/>
				</BoardColumnBody>
			</KanbanColumn>
			<KanbanColumn>
				<KanbanColumnHeader tone="working" title="Fazendo" count={1} />
				<BoardColumnBody>
					<TaskCard
						size="compact"
						taskKey="APP-14"
						title="Página de frete grátis acima de R$ 199"
						meta="2 artefatos · 10:40"
						metaIcon={<IconPaperclip />}
					/>
				</BoardColumnBody>
			</KanbanColumn>
			<KanbanColumn>
				<KanbanColumnHeader tone="needsYou" title="Precisa de você" count={1} emphasis />
				<BoardColumnBody>
					<TaskCard
						size="compact"
						selected
						taskKey="APP-12"
						title="Botão de cupom some no iPhone SE"
						meta="D1 · publico agora ou no fim do dia?"
						metaTone="strong"
						metaIcon={<IconMessageQuestion />}
					/>
				</BoardColumnBody>
			</KanbanColumn>
			<KanbanColumn>
				<KanbanColumnHeader tone="waiting" title="Esperando cota" count={1} />
				<BoardColumnBody>
					<TaskCard
						size="compact"
						taskKey="APP-15"
						title="Relatório semanal de vendas"
						meta="volta sozinha às 14:00"
						metaIcon={<IconClock />}
					/>
				</BoardColumnBody>
			</KanbanColumn>
			<KanbanColumn>
				<KanbanColumnHeader tone="stalled" title="Parada" count={2} />
				<BoardColumnBody>
					<TaskCard
						size="compact"
						taskKey="APP-11"
						title="Integração Pix — sandbox fora do ar"
						meta="escalada pelo supervisor"
						metaTone="warn"
						metaIcon={<IconAlertTriangle />}
					/>
					<TaskCard
						size="compact"
						taskKey="APP-08"
						title="Export de pedidos em CSV"
						meta="pausada por Bruno"
						metaIcon={<IconPlayerPause />}
					/>
				</BoardColumnBody>
			</KanbanColumn>
			<KanbanColumn>
				<KanbanColumnHeader tone="done" title="Concluída" count={12} />
				<BoardColumnBody>
					<TaskCard size="compact" taskKey="APP-07" title="Favicon novo" meta="concluída 09:58" />
				</BoardColumnBody>
			</KanbanColumn>
		</Board>
	),
}
