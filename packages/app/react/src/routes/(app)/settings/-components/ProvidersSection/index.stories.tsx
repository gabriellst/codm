import type { Meta, StoryObj } from '@storybook/react'
import { detectProvidersQueryOptions } from '@codm/client-typescript/typescript'
import type { DetectProvidersQueryResponse } from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { connected, loadingQuery, mockQuery } from '@/storybook'
import { ProvidersSection } from '.'

/**
 * Migrado de `index.test.tsx` (T9, onda B). `ProvidersSection` é CONECTADO
 * (`useDetectProviders`) — `Default`/`Loading` abaixo são SÓ-VISUAIS (MSW não intercepta sob bun).
 * O comportamento real (o catálogo determinístico do `MockProviderDetector` sob `integration`, o
 * estado de carregando do botão, a invalidação do catálogo do wizard) mora no `index.test.tsx`
 * reduzido, via `useIntegrationBackend()` — aqui NENHUM given é necessário: o detector é
 * determinístico sob `integration` (CLAUDE_CODE DETECTED, o resto NOT_INSTALLED), sem depender de
 * `channels`/`remotes`.
 */
const CATALOG: DeepPartial<DetectProvidersQueryResponse> = {
	providers: [
		{ name: 'CLAUDE_CODE', status: 'DETECTED', binaryPath: '/usr/local/bin/claude', version: '1.0.0', comingSoon: false },
		{ name: 'CODEX', status: 'NOT_INSTALLED', comingSoon: true },
		{ name: 'OPENCODE', status: 'NOT_INSTALLED', comingSoon: true },
	],
}

const opts = detectProvidersQueryOptions()

const meta = {
	title: 'Settings/ProvidersSection',
	component: ProvidersSection,
	parameters: connected({ route: { id: '/(app)/settings/' } }),
} satisfies Meta<typeof ProvidersSection>
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
	parameters: { msw: { handlers: [mockQuery(opts, CATALOG)] } },
}

export const Loading: Story = {
	parameters: { msw: { handlers: [loadingQuery(opts)] } },
}
