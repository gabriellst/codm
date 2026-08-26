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
 * 2026-08-26 — `CHANNEL`/`CONTACT`/`AGENTS`/`REVIEW` viraram `REQUIRED` no `STEP_TAXONOMY` do wizard
 * (founder override) — `DEFERRABLE_SETUP_IDS` (`index.tsx`) deriva dessa mesma tabela, então
 * `WORKSPACE` é o ÚNICO `StepId` que ainda aparece como linha neste painel. `channelDone`/
 * `threadDone` nos fixtures abaixo não mudam mais o que renderiza (não há linha de canal/thread para
 * reagir a eles) — mantidos só porque `GetOnboardingQueryResponse` exige os três campos; o
 * comportamento REAL que importa (workspace satisfeito → painel inteiro some) mora no
 * `index.test.tsx` reduzido, via `useIntegrationBackend()`.
 */
const opts = getOnboardingQueryOptions()

const ALL_PENDING: GetOnboardingQueryResponse = {
	currentStep: 'VALUE',
	completedAt: null,
	state: {},
	channelDone: false,
	workspaceDone: false,
	threadDone: false,
}

/** Um passo concluído (o canal) — a linha fica, com o `Marcador — Concluído` no lugar do CTA (screen 05). */
const CHANNEL_DONE: GetOnboardingQueryResponse = {
	currentStep: 'WORKSPACE',
	completedAt: null,
	state: {},
	channelDone: true,
	workspaceDone: false,
	threadDone: false,
}

const ALL_DONE: GetOnboardingQueryResponse = {
	currentStep: 'FINAL',
	completedAt: '2026-08-09T00:00:00.000Z',
	state: {},
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

export const ChannelDone: Story = {
	parameters: { msw: { handlers: [mockQuery(opts, CHANNEL_DONE)] } },
}

/** SÓ-VISUAL por necessidade (não só por ruling): `channelDone: true` é improduzível pelo harness — ver o docblock acima. */
export const AllDone: Story = {
	parameters: { msw: { handlers: [mockQuery(opts, ALL_DONE)] } },
}
