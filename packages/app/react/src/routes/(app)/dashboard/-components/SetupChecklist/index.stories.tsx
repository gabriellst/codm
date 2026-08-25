import type { Meta, StoryObj } from '@storybook/react'
import { getOnboardingQueryOptions } from '@codm/client-typescript/typescript'
import type { GetOnboardingQueryResponse } from '@codm/client-typescript/typescript'
import { connected, mockQuery } from '@/storybook'
import { SetupChecklist } from '.'

/**
 * Migrado de `index.test.tsx` (T11, onda B). `SetupChecklist` é CONECTADO (`useGetOnboarding`
 * interno) — MSW não intercepta sob bun (medido, `tests/support/storybook.ts`), então esta story é
 * SÓ-VISUAL (sem `play`).
 *
 * O comportamento real (um passo satisfeito some da lista) mora no `index.test.tsx` reduzido, via
 * `useIntegrationBackend()` — `workspaceDone`/`threadDone` são PRODUZÍVEIS pelo harness real
 * (`addWorkspace` real sob `MockWorkspaceDetector` determinístico; `givenThread`). `channelDone`
 * ISOLADO também é, desde a frente eixo-ambiente-go (T9/T12): `index.services.test.tsx`
 * (`services: ['apiGo']`) semeia um canal REAL via `givenConnectedGatewayChannel` e prova a linha do
 * canal sumindo. O que continua IMPRODUZÍVEL pelo harness — e fica só aqui, visual — é o caso "tudo
 * feito" (os TRÊS ao mesmo tempo): nenhum arquivo hoje combina canal conectado + workspace + thread na
 * mesma seed.
 */
const opts = getOnboardingQueryOptions()

const ALL_PENDING: GetOnboardingQueryResponse = {
	currentStep: 'VALUE',
	completedAt: null,
	channelDone: false,
	workspaceDone: false,
	threadDone: false,
}

const ALL_DONE: GetOnboardingQueryResponse = {
	currentStep: 'FINAL',
	completedAt: '2026-08-09T00:00:00.000Z',
	channelDone: true,
	workspaceDone: true,
	threadDone: true,
}

const meta = {
	title: 'Dashboard/SetupChecklist',
	component: SetupChecklist,
	parameters: connected({ route: { id: '/(app)/dashboard/' } }),
} satisfies Meta<typeof SetupChecklist>
export default meta

type Story = StoryObj<typeof meta>

export const AllPending: Story = {
	parameters: { msw: { handlers: [mockQuery(opts, ALL_PENDING)] } },
}

/** SÓ-VISUAL por necessidade (não só por ruling): `channelDone: true` é improduzível pelo harness — ver o docblock acima. */
export const AllDone: Story = {
	parameters: { msw: { handlers: [mockQuery(opts, ALL_DONE)] } },
}
