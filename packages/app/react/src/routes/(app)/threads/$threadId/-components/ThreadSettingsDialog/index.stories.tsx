import type { Meta, StoryObj } from '@storybook/react'
import { getSessionChatQueryOptions, getThreadSettingsQueryOptions, listThreadLoopsQueryOptions } from '@codm/client-typescript/typescript'
import { Dialog } from '@codm/app-ui/dialog'
import { connected, mockQuery } from '@/storybook'
import { ThreadSettingsDialog } from '.'

const THREAD_ID = '019e4d24-6524-7041-9e1c-8108180cddae'

const meta: Meta<typeof ThreadSettingsDialog> = {
	title: 'Console/ThreadSettingsDialog',
	component: ThreadSettingsDialog,
	parameters: connected({
		route: { id: '/(app)/threads/$threadId/' },
		msw: {
			handlers: [
				mockQuery(getThreadSettingsQueryOptions(THREAD_ID), {
					mentionGate: { enabled: true, tag: '@codm' },
					thinkingIndicator: { enabled: true },
					reactions: { enabled: true },
					streaming: { enabled: true },
					// DECLARADO diferente do efetivo de propósito: é o único estado em que a seção mostra as
					// duas coisas que ela tem para dizer — o valor escolhido no seletor E o botão de voltar
					// ao padrão da conta, que só existe quando há escolha a desfazer.
					language: { declared: 'en-US', effective: 'en-US' },
					participants: [
						{ participantId: 'operator', name: 'Operator', source: 'Operator nesta máquina', canInvoke: true },
						{ participantId: 'ada', name: 'Ada Lovelace', source: 'WhatsApp · +55 11 90000-0000', canInvoke: false },
					],
					invokerCount: 1,
					bufferSize: '50',
					customPrompt: 'Fale sempre em inglês com este cliente. Nunca prometa prazo.',
					customPromptMaxLength: 8000,
					providers: [
						// Claude has an explicit model catalog; Codex is drivable with DEFAULT while its
						// provider-specific catalog remains intentionally empty.
						{
							provider: 'CLAUDE_CODE',
							comingSoon: false,
							model: 'OPUS',
							models: ['DEFAULT', 'OPUS', 'SONNET', 'HAIKU'],
						},
						{ provider: 'CODEX', comingSoon: false, model: 'DEFAULT', models: [] },
					],
				}),
				mockQuery(getSessionChatQueryOptions(THREAD_ID), { thread: { displayName: 'Ada Lovelace' } }),
				// THREE loops on purpose: a running wall clock, a running cadence, and a paused one. The two
				// schedule shapes render different badges, and the paused row's styling (dimmed, "Pausado"
				// instead of a next run) has no other way of being seen.
				mockQuery(listThreadLoopsQueryOptions(THREAD_ID), {
					loops: [
						{
							loopId: '019e4d24-6524-7041-9e1c-8108180cddb1',
							prompt: 'Pergunte ao time como está o deploy de hoje e resuma em três linhas.',
							schedule: {
								kind: 'DAILY',
								timeOfDay: '09:00',
								weekdays: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
								timezone: 'America/Sao_Paulo',
							},
							enabled: true,
							nextRunAt: '2026-08-05T12:00:00.000Z',
							lastFiredAt: '2026-08-03T12:00:00.000Z',
						},
						{
							loopId: '019e4d24-6524-7041-9e1c-8108180cddb3',
							prompt: 'Veja se o build quebrou e avise se sim.',
							schedule: { kind: 'INTERVAL', everyMinutes: 15 },
							enabled: true,
							nextRunAt: '2026-08-04T12:15:00.000Z',
							lastFiredAt: '2026-08-04T12:00:00.000Z',
						},
						{
							loopId: '019e4d24-6524-7041-9e1c-8108180cddb2',
							prompt: 'Feche a semana: o que ficou pendente?',
							schedule: { kind: 'DAILY', timeOfDay: '18:30', weekdays: ['FRIDAY'], timezone: 'America/Sao_Paulo' },
							enabled: false,
						},
					],
					promptMaxLength: 2000,
					minIntervalMinutes: 1,
					maxIntervalMinutes: 1440,
				}),
			],
		},
	}),
}
export default meta

type Story = StoryObj<typeof ThreadSettingsDialog>

/**
 * SÓ-VISUAL (T10, onda B) — MSW não intercepta sob bun (medido), então esta story nunca ganhou
 * `play`. O comportamento que o `.test.tsx` antigo asseverava contra um stub manual de `fetch`
 * (agentes marcados, prompt persistindo, seleção de modelo, e a exclusão real) migrou inteiro para o
 * harness de integração em `index.test.tsx` — o backend REAL responde exatamente o que esta story só
 * finge, e a exclusão vira uma ausência computável (a releitura pós-DELETE falha de verdade) em vez
 * de uma contagem de requisições contra um dublê.
 */
export const Default: Story = {
	render: () => (
		<Dialog open>
			<ThreadSettingsDialog threadId={THREAD_ID} />
		</Dialog>
	),
}
