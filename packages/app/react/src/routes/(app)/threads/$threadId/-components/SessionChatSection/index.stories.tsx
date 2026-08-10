import type { Meta, StoryObj } from '@storybook/react'
import { getNeedsYouPanelQueryOptions, getSessionChatQueryOptions, listArtifactsQueryOptions } from '@codm/client-typescript/typescript'
import { connected, mockQuery } from '@/storybook'
import { SessionChatSection } from '.'

/**
 * Story NOVA (T10, onda B) — SÓ-VISUAL, sem `play`. `SessionChatSection` é conectada
 * (`useGetSessionChat`/`useListArtifacts`) e MSW não intercepta sob bun (medido, ver
 * `tests/support/storybook.ts`), então nenhuma variante daqui roda comportamento sob `bun test` —
 * isso é o Storybook browser mostrando a seção, nada além.
 *
 * O COMPORTAMENTO (janela virtualizada, altura de rolagem, âncora na última mensagem, intercalação de
 * artefato por horário) continua em `index.test.tsx`, com o mecanismo de seed que já existia
 * (`spyOn(globalThis, 'fetch')`) — não migrou para o harness de integração porque a Task não pode
 * estender o tooling congelado (`@codm/api-typescript/testing` só reexporta `createGivenHelpers`/
 * `givenThread`; não há `given` para popular 1000 linhas de transcript/artefato). Ver o docblock do
 * `index.test.tsx` para o porquê completo.
 */
const THREAD = '019e4d24-6524-7041-9e1c-8108180cddae'

const meta = {
	title: 'Console/SessionChatSection',
	component: SessionChatSection,
	args: { threadId: THREAD },
	parameters: connected({
		route: { id: '/(app)/threads/$threadId/' },
		msw: {
			handlers: [
				mockQuery(getNeedsYouPanelQueryOptions(THREAD), { stops: [] }),
				mockQuery(listArtifactsQueryOptions(THREAD), { artifacts: [] }),
				mockQuery(getSessionChatQueryOptions(THREAD), {
					composerMode: 'DIRECT',
					activeStops: [],
					transcript: [
						{ entryId: '019e4d24-6524-7041-9e1c-8108180cdd01', kind: 'CONTACT', text: 'sobe o deploy?', at: '2026-08-06T10:00:00.000Z' },
						{ entryId: '019e4d24-6524-7041-9e1c-8108180cdd02', kind: 'DIRECT', text: 'subindo agora', at: '2026-08-06T10:01:00.000Z' },
					],
				}),
			],
		},
	}),
} satisfies Meta<typeof SessionChatSection>
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = {
	parameters: {
		msw: {
			handlers: [
				mockQuery(getNeedsYouPanelQueryOptions(THREAD), { stops: [] }),
				mockQuery(listArtifactsQueryOptions(THREAD), { artifacts: [] }),
				mockQuery(getSessionChatQueryOptions(THREAD), { composerMode: 'DIRECT', activeStops: [], transcript: [] }),
			],
		},
	},
}
