import type { Meta, StoryObj } from '@storybook/react'

import { StatusPill } from '../status-pill'

const meta: Meta<typeof StatusPill> = {
	title: 'UI/StatusPill',
	component: StatusPill,
	parameters: { layout: 'centered' },
	argTypes: {
		tone: { control: 'select', options: ['working', 'needsYou', 'queued', 'waiting', 'stalled', 'done'] },
	},
}

export default meta
type Story = StoryObj<typeof StatusPill>

export const Working: Story = { args: { tone: 'working', children: 'Fazendo' } }
export const NeedsYou: Story = { args: { tone: 'needsYou', children: 'Precisa de você' } }
export const Queued: Story = { args: { tone: 'queued', children: 'Na fila' } }
export const Waiting: Story = { args: { tone: 'waiting', children: 'Esperando cota' } }
export const Stalled: Story = { args: { tone: 'stalled', children: 'Parada' } }
export const Done: Story = { args: { tone: 'done', children: 'Concluída' } }

export const AllTones: Story = {
	render: () => (
		<div className="flex flex-col items-start gap-3">
			<StatusPill tone="working">Fazendo</StatusPill>
			<StatusPill tone="needsYou">Precisa de você</StatusPill>
			<StatusPill tone="queued">Na fila</StatusPill>
			<StatusPill tone="waiting">Esperando cota</StatusPill>
			<StatusPill tone="stalled">Parada</StatusPill>
			<StatusPill tone="done">Concluída</StatusPill>
		</div>
	),
}
