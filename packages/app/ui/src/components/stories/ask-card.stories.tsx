import type { Meta, StoryObj } from '@storybook/react'

import { AskCard, AskCardOption } from '../ask-card'

const meta: Meta<typeof AskCard> = {
	title: 'UI/AskCard',
	component: AskCard,
	parameters: { layout: 'padded' },
	decorators: [
		Story => (
			<div className="w-[420px]">
				<Story />
			</div>
		),
	],
}

export default meta
type Story = StoryObj<typeof AskCard>

export const Decision: Story = {
	args: {
		code: 'APP-12 · D1',
		kind: 'Decisão',
		age: 'há 8 min',
		question: 'A prévia está pronta. Publico o ajuste do cupom agora ou espero o fim do dia?',
		note: 'Só quem pode liberar responde · ou responda no grupo citando APP-12 · D1',
		children: (
			<>
				<AskCardOption variant="primary">Publicar agora</AskCardOption>
				<AskCardOption variant="outline">Esperar o fim do dia</AskCardOption>
			</>
		),
	},
}

export const Question: Story = {
	args: {
		code: 'APP-12 · P2',
		kind: 'Pergunta',
		age: 'há 8 min',
		question: 'Mantenho o texto “Aplicar cupom” ou troco para “Usar cupom”?',
		note: 'Segue com “Aplicar cupom” às 10:45 se ninguém responder',
		children: (
			<>
				<AskCardOption variant="outline">Aplicar cupom</AskCardOption>
				<AskCardOption variant="outline">Usar cupom</AskCardOption>
			</>
		),
	},
}

export const Locked: Story = {
	args: {
		...Decision.args,
		locked: true,
		note: 'Só quem pode liberar responde — peça para o Bruno',
	},
}
