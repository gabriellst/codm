import type { Meta, StoryObj } from '@storybook/react'
import { expect } from 'storybook/test'
import { TranscriptBubble } from '.'

/**
 * Migrado de `index.test.tsx` (T10, onda B). `TranscriptBubble` é dumb/props-only (nenhum SDK hook;
 * `Link` do tanstack-router só é invocado quando `entry.issueId` existe — nenhuma das variantes
 * abaixo seta esse campo, então nenhuma precisa de router, igual ao teste antigo). Sem rede em jogo,
 * TODA asserção do antigo `index.test.tsx` cabe em `play` — ver `index.test.tsx` para o runner fino
 * e para os testes de `contactAvatarUrl` (módulo puro, sem tela).
 */

const THREAD = '019e4d24-6524-7041-9e1c-8108180cddae'
const CHANNEL = '019e4d24-6524-7041-9e1c-8108180cddaf'
const ADA_JID = '5511900000001@s.whatsapp.net'

type Entry = Parameters<typeof TranscriptBubble>[0]['entry']

/**
 * `at` é um INSTANTE ISO na transcrição, não um horário já formatado — construído a partir de
 * componentes LOCAIS, então "05:25" é o que o balão mostra em qualquer fuso em que a suíte rode.
 */
const AT = new Date(2026, 7, 8, 5, 25).toISOString()

const contactEntry = (sender?: Entry['sender']): Entry => ({
	entryId: '019e4d24-6524-7041-9e1c-8108180cdd01',
	kind: 'CONTACT',
	text: 'sobe o deploy?',
	at: AT,
	sender,
})

const meta = {
	title: 'Console/TranscriptBubble',
	component: TranscriptBubble,
	args: { threadId: THREAD },
} satisfies Meta<typeof TranscriptBubble>
export default meta

type Story = StoryObj<typeof meta>

/**
 * WHO SAID THIS — a atribuição que uma conversa em grupo é ilegível sem.
 *
 * NÃO checa `.bg-secondary` aqui de propósito (falseamento medido): a Fallback de iniciais do
 * `ThreadAvatar` (Base UI `Avatar.Fallback`, sempre visível sob happy-dom — nenhuma imagem carrega a
 * qualquer preço) TAMBÉM carrega `bg-secondary`, e vem ANTES do balão no DOM — um `querySelector`
 * casaria com o avatar, não com o balão, e a asserção do horário passaria por acidente sobre o texto
 * errado. O par balão+horário é coberto em `NoIdentity`, onde não há avatar nenhum para colidir.
 */
export const WithSender: Story = {
	args: { entry: contactEntry({ channelId: CHANNEL, externalId: ADA_JID, displayName: 'Ada Lovelace', hasAvatar: true }) },
	play: async ({ canvasElement }) => {
		await expect(canvasElement).toHaveTextContent('Ada Lovelace')
		await expect(canvasElement).toHaveTextContent('sobe o deploy?')
	},
}

/** Cai para as INICIAIS, não para um círculo vazio: um terço do livro de contatos real não tem foto. */
export const NoAvatarFallback: Story = {
	args: { entry: contactEntry({ channelId: CHANNEL, externalId: ADA_JID, displayName: 'Ada Lovelace', hasAvatar: false }) },
	play: async ({ canvasElement }) => {
		await expect(canvasElement).toHaveTextContent('AL')
		await expect(canvasElement).toHaveTextContent('Ada Lovelace')
	},
}

/**
 * O MESMO componente renderiza `GetIssueDetail.routedMessages`, um payload mais estreito sem
 * identidade nenhuma — isso tem que degradar para o balão que sempre foi, não para um avatar em
 * branco ou um crash. Sem avatar nenhum aqui, `.bg-secondary` só pode casar com o balão — é onde o
 * formato do horário (curta, local, ISO nunca chega à tela) é provado dentro do balão de entrada.
 */
export const NoIdentity: Story = {
	args: { entry: contactEntry(undefined) },
	play: async ({ canvasElement }) => {
		await expect(canvasElement).toHaveTextContent('sobe o deploy?')
		await expect(canvasElement.querySelector('[data-slot="avatar"]')).toBeNull()
		await expect(canvasElement).toHaveTextContent('05:25')
		await expect(canvasElement).not.toHaveTextContent(AT)
		await expect(canvasElement.querySelector('.bg-secondary')).toHaveTextContent('05:25')
	},
}

/** O horário dentro do balão de SAÍDA (`bg-primary`) — não num rótulo separado embaixo dele. */
export const OutboundDirect: Story = {
	args: { entry: { entryId: '019e4d24-6524-7041-9e1c-8108180cdd02', kind: 'DIRECT', text: 'subindo agora', at: AT } },
	play: async ({ canvasElement }) => {
		await expect(canvasElement.querySelector('.bg-primary')).toHaveTextContent('05:25')
	},
}
