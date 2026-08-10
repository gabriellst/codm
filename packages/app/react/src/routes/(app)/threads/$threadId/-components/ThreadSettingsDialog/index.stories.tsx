import type { Meta, StoryObj } from '@storybook/react'
import { getSessionChatQueryOptions, getThreadSettingsQueryOptions, listThreadLoopsQueryOptions } from '@codm/client-typescript/typescript'
import { Dialog } from '@/components/ui/dialog'
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
					participants: [
						{ participantId: 'operator', name: 'Operator', source: 'Operator nesta máquina', canInvoke: true },
						{ participantId: 'ada', name: 'Ada Lovelace', source: 'WhatsApp · +55 11 90000-0000', canInvoke: false },
					],
					invokerCount: 1,
					bufferSize: '50',
					customPrompt: 'Fale sempre em inglês com este cliente. Nunca prometa prazo.',
					customPromptMaxLength: 8000,
					providers: [
						// Um agente com catálogo (seletor de modelo, já numa escolha explícita para a escolha
						// aparecer selecionada) e um sem (só o selo "Em breve") — as duas metades da linha.
						{
							provider: 'CLAUDE_CODE',
							comingSoon: false,
							model: 'OPUS',
							models: ['DEFAULT', 'OPUS', 'SONNET', 'HAIKU'],
						},
						{ provider: 'CODEX', comingSoon: true, model: 'DEFAULT', models: [] },
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
