import type { Meta, StoryObj } from '@storybook/react'

import { Avatar, AvatarFallback } from '../avatar'
import { ChatBubble, ChatEvent, ChatReceipt } from '../chat-bubble'

const meta: Meta<typeof ChatBubble> = {
	title: 'UI/ChatBubble',
	component: ChatBubble,
	parameters: { layout: 'padded' },
	decorators: [
		Story => (
			<div className="w-[560px]">
				<Story />
			</div>
		),
	],
	argTypes: {
		side: { control: 'inline-radio', options: ['in', 'out'] },
		look: { control: 'inline-radio', options: ['person', 'agent', 'steer'] },
	},
}

export default meta
type Story = StoryObj<typeof ChatBubble>

export const Person: Story = {
	args: {
		side: 'in',
		look: 'person',
		author: 'Ana Ribeiro',
		time: '10:02',
		avatar: (
			<Avatar size="sm">
				<AvatarFallback>AN</AvatarFallback>
			</Avatar>
		),
		children: 'o botão de cupom some no iPhone SE, consegue ver?',
	},
}

export const Agent: Story = {
	args: {
		side: 'out',
		look: 'agent',
		time: '10:06',
		children: 'Achei: o container corta em 320 px. Corrigindo e subo uma prévia.',
	},
}

export const Steer: Story = {
	args: {
		side: 'out',
		look: 'steer',
		author: 'Orientação · Bruno',
		footer: <ChatReceipt>lida pelo agente · 10:09</ChatReceipt>,
		children: 'não mexe no checkout do desktop, só no mobile',
	},
}

export const Event: Story = {
	render: () => <ChatEvent>tarefa criada a partir da mensagem de Ana · roteada por regra</ChatEvent>,
}

export const EventTones: Story = {
	render: () => (
		<div className="flex flex-col gap-3">
			<ChatEvent tone="default">tarefa criada a partir da mensagem de Ana</ChatEvent>
			<ChatEvent tone="muted">lembrete enviado ao agente</ChatEvent>
			<ChatEvent tone="attention">nova tentativa às 10:52 (2 de 5)</ChatEvent>
		</div>
	),
}

export const Conversation: Story = {
	render: () => (
		<div className="flex flex-col gap-3">
			<ChatEvent>tarefa criada a partir da mensagem de Ana</ChatEvent>
			<ChatBubble
				side="in"
				look="person"
				author="Ana Ribeiro"
				time="10:02"
				avatar={
					<Avatar size="sm">
						<AvatarFallback>AN</AvatarFallback>
					</Avatar>
				}
			>
				o botão de cupom some no iPhone SE, consegue ver?
			</ChatBubble>
			<ChatBubble side="out" look="agent" time="10:06">
				Achei: o container corta em 320 px. Corrigindo e subo uma prévia.
			</ChatBubble>
			<ChatBubble side="out" look="steer" author="Orientação · Bruno" footer={<ChatReceipt>lida pelo agente · 10:09</ChatReceipt>}>
				não mexe no checkout do desktop, só no mobile
			</ChatBubble>
		</div>
	),
}
