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
					thread: { status: 'IDLE' },
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
				mockQuery(getSessionChatQueryOptions(THREAD), {
					thread: { status: 'IDLE' },
					composerMode: 'DIRECT',
					activeStops: [],
					transcript: [],
				}),
			],
		},
	},
}

/**
 * T3 — a WORKING thread whose newest transcript row is still the contact's own inbound message: no
 * text of the current turn has landed yet, so `SessionChatSection` mounts `ThinkingIndicator` between
 * the transcript and the composer (spec Decision 3, AC-4).
 */
export const Pensando: Story = {
	parameters: {
		msw: {
			handlers: [
				mockQuery(getNeedsYouPanelQueryOptions(THREAD), { stops: [] }),
				mockQuery(listArtifactsQueryOptions(THREAD), { artifacts: [] }),
				mockQuery(getSessionChatQueryOptions(THREAD), {
					thread: { status: 'RUNNING', language: 'pt-BR' },
					composerMode: 'DIRECT',
					activeStops: [],
					transcript: [
						{ entryId: '019e4d24-6524-7041-9e1c-8108180cdd03', kind: 'CONTACT', text: 'sobe o deploy?', at: '2026-08-06T10:00:00.000Z' },
					],
				}),
			],
		},
	},
}

/**
 * O MESMO estado, numa conversa que fala inglês — o verbo do spinner sai do pool inglês do deck
 * (`@codm/contracts/cues`), não de uma tradução do português. A distinção que esta story existe para
 * mostrar é que o idioma é o da SALA, resolvido pelo daemon, e não o locale do console: as duas
 * stories rodam sob o mesmo i18n e mostram palavras de línguas diferentes.
 */
export const PensandoEmIngles: Story = {
	parameters: {
		msw: {
			handlers: [
				mockQuery(getNeedsYouPanelQueryOptions(THREAD), { stops: [] }),
				mockQuery(listArtifactsQueryOptions(THREAD), { artifacts: [] }),
				mockQuery(getSessionChatQueryOptions(THREAD), {
					thread: { status: 'RUNNING', language: 'en-US' },
					composerMode: 'DIRECT',
					activeStops: [],
					transcript: [
						{
							entryId: '019e4d24-6524-7041-9e1c-8108180cdd03',
							kind: 'CONTACT',
							text: 'can you ship the deploy?',
							at: '2026-08-06T10:00:00.000Z',
						},
					],
				}),
			],
		},
	},
}

/**
 * Um artefato ENTREGUE ao contato pelo canal ("envio de artefatos pelo canal" design, decisões
 * 4/8) — a entry SYSTEM que `DeliverChannelAttachment` grava, com `artifactId`/`mediaPath`, chega
 * aqui já joinada (`GetSessionChat`) e renderiza como bolha de artefato do lado do agente: uma
 * IMAGE com legenda, um FILE sem legenda.
 */
export const ArtefatoEnviado: Story = {
	parameters: {
		msw: {
			handlers: [
				mockQuery(getNeedsYouPanelQueryOptions(THREAD), { stops: [] }),
				mockQuery(listArtifactsQueryOptions(THREAD), { artifacts: [] }),
				mockQuery(getSessionChatQueryOptions(THREAD), {
					thread: { status: 'IDLE' },
					composerMode: 'DIRECT',
					activeStops: [],
					transcript: [
						{ entryId: '019e4d24-6524-7041-9e1c-8108180cdd04', kind: 'CONTACT', text: 'manda o preview?', at: '2026-08-06T10:00:00.000Z' },
						{
							entryId: '019e4d24-6524-7041-9e1c-8108180cdd05',
							kind: 'SYSTEM',
							text: 'Segue o print do preview.',
							at: '2026-08-06T10:01:00.000Z',
							artifact: {
								artifactId: '019e4d24-6524-7041-9e1c-8108180cdd06',
								kind: 'IMAGE',
								name: 'preview.png',
								ref: '/tmp/preview.png',
								meta: '',
								recordedAt: '2026-08-06T10:00:30.000Z',
							},
						},
						{
							entryId: '019e4d24-6524-7041-9e1c-8108180cdd07',
							kind: 'SYSTEM',
							text: '',
							at: '2026-08-06T10:02:00.000Z',
							artifact: {
								artifactId: '019e4d24-6524-7041-9e1c-8108180cdd08',
								kind: 'FILE',
								name: 'relatorio.pdf',
								ref: '/tmp/relatorio.pdf',
								meta: '',
								recordedAt: '2026-08-06T10:01:30.000Z',
							},
						},
					],
				}),
			],
		},
	},
}
