import type { Meta, StoryObj } from '@storybook/react'
import { getWorkspacePublishCommandQueryOptions } from '@codm/client-typescript/typescript'
import { connected, loadingQuery, mockQuery } from '@/storybook'
import { PublishCommandForm } from '.'

/**
 * `PublishCommandForm` é CONECTADO (`useGetWorkspacePublishCommand` + `useSetWorkspacePublishCommand`) —
 * as stories abaixo são SÓ-VISUAIS (MSW não intercepta sob bun). O comportamento (um campo por argumento,
 * argv literal no `PUT`, remover = `{ command: null }`, reabrir pré-preenchido) mora no `index.test.tsx`,
 * contra o backend real via `useIntegrationBackend()`.
 *
 * O form é renderizado FORA do `DialogContent` (que exige um `Dialog.Root`) — é o conteúdo do
 * `PublishCommandDialog`, sem o chrome.
 */
const WORKSPACE_ID = 'ws-1'
const opts = getWorkspacePublishCommandQueryOptions(WORKSPACE_ID)

const meta = {
	title: 'Workspaces/PublishCommandForm',
	component: PublishCommandForm,
	args: { workspaceId: WORKSPACE_ID, className: 'max-w-md p-6' },
	parameters: connected({ route: { id: '/(app)/workspaces/' } }),
} satisfies Meta<typeof PublishCommandForm>
export default meta

type Story = StoryObj<typeof meta>

/** A declared command: one field per argument, and "Remover comando" available. */
export const Declared: Story = {
	parameters: { msw: { handlers: [mockQuery(opts, { command: { argv: ['bun', 'run', 'deploy'] } })] } },
}

/** No command yet: one empty argument to fill; nothing to remove. */
export const Empty: Story = {
	parameters: { msw: { handlers: [mockQuery(opts, { command: null })] } },
}

export const Loading: Story = {
	parameters: { msw: { handlers: [loadingQuery(opts)] } },
}
