import type { Meta, StoryObj } from '@storybook/react'
import { getSessionChatQueryOptions, getThreadSettingsQueryOptions } from '@codm/client-typescript/typescript'
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
						{ provider: 'CLAUDE_CODE', comingSoon: false },
						{ provider: 'CODEX', comingSoon: true },
					],
				}),
				mockQuery(getSessionChatQueryOptions(THREAD_ID), { thread: { displayName: 'Ada Lovelace' } }),
			],
		},
	}),
}
export default meta

type Story = StoryObj<typeof ThreadSettingsDialog>

export const Default: Story = {
	render: () => (
		<Dialog open>
			<ThreadSettingsDialog threadId={THREAD_ID} />
		</Dialog>
	),
}
