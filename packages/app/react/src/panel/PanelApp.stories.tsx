import { useEffect, useState } from 'react'
import type { Decorator, Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
	getPanelBoardQueryOptions,
	getPanelIdentityQueryOptions,
	getPanelIssueQueryOptions,
	listPanelMembersQueryOptions,
	type GetPanelIdentityQueryResponse,
} from '@codm/client-typescript/typescript-cloud'
import { mockQuery } from '@/storybook'
import { useDialogStore } from '@/stores/useDialogStore'
import { IdentifyDialog } from './IdentifyDialog'
import { PanelApp } from './PanelApp'
import {
	ISSUE_APP12,
	PANEL_BOARD,
	PANEL_ISSUE_APP12,
	PANEL_ME_NOBODY,
	PANEL_ME_RELEASER,
	PANEL_MEMBERS,
	PANEL_TOKEN,
} from './panelFixtures'

/**
 * The cloud panel, for visual review against the pen (`design/proposals/2026-11-24-tarefa-e-painel/` — N6, N7,
 * N5, N2, N4). SÓ-VISUAL: MSW answers the panel's endpoints in the Storybook browser (it does not intercept under
 * bun); the behaviour is proven by `PanelApp.test.tsx`. Phone stories are meant to be seen at 390 px wide — the
 * layout follows the iframe's width (`md` is the cut).
 */

interface PanelParameters {
	/** What the address names when the story opens (`APP-12`, `L-31`) — empty for the board. */
	hash?: string
	/** Opens "Identificar-me" on mount. */
	identify?: boolean
}

/** No app chrome: a fresh cache per story, the hash the story names, and an empty dialog host. */
const withPanel: Decorator = (Story, context) => {
	const panel = (context.parameters.panel ?? {}) as PanelParameters
	const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
	const hash = panel.hash ? `#${panel.hash}` : ''
	if (window.location.hash !== hash)
		window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${hash}`)
	useEffect(() => {
		const { show, hide } = useDialogStore.getState()
		if (panel.identify) show(<IdentifyDialog />)
		return () => hide()
	}, [panel.identify])
	return (
		<QueryClientProvider client={client}>
			<div className="h-dvh bg-background text-foreground">
				<Story />
			</div>
		</QueryClientProvider>
	)
}

const handlers = (me: GetPanelIdentityQueryResponse) => [
	mockQuery(getPanelBoardQueryOptions(PANEL_TOKEN), PANEL_BOARD),
	mockQuery(getPanelIssueQueryOptions(PANEL_TOKEN, ISSUE_APP12), PANEL_ISSUE_APP12),
	mockQuery(getPanelIdentityQueryOptions(PANEL_TOKEN), me),
	mockQuery(listPanelMembersQueryOptions(PANEL_TOKEN), PANEL_MEMBERS),
]

const meta = {
	title: 'Panel/PanelApp',
	component: PanelApp,
	args: { token: PANEL_TOKEN },
	decorators: [withPanel],
	parameters: { layout: 'fullscreen', msw: { handlers: handlers(PANEL_ME_RELEASER) } },
} satisfies Meta<typeof PanelApp>
export default meta

type Story = StoryObj<typeof meta>

/** N6 — the kanban on a wide screen: six columns, "Precisa de você" emphasized, health and batch in the header. */
export const BoardWide: Story = {}

/** N7 — the same board on a phone (390 px): column tabs over a snap strip. */
export const BoardPhone: Story = {
	globals: { viewport: { value: 'mobile2', isRotated: false } },
}

/** N5 — one task on a wide screen: the task list, the conversation with the open decision, artifacts and details. */
export const TaskWide: Story = {
	parameters: { panel: { hash: 'APP-12' } satisfies PanelParameters },
}

/** N2 — the task on a phone: header, Conversa / Artefatos tabs, the decision card, the steer field. */
export const TaskPhone: Story = {
	parameters: { panel: { hash: 'APP-12' } satisfies PanelParameters },
	globals: { viewport: { value: 'mobile2', isRotated: false } },
}

/** N4 — "Identificar-me", for a device nobody identified on yet. */
export const Identify: Story = {
	parameters: { panel: { identify: true } satisfies PanelParameters, msw: { handlers: handlers(PANEL_ME_NOBODY) } },
	globals: { viewport: { value: 'mobile2', isRotated: false } },
}
