import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { getOnboardingQueryOptions } from '@codm/client-typescript/typescript'
import type { GetOnboardingQueryResponse } from '@codm/client-typescript/typescript'
import i18n from '@/lib/i18n'
import { type Bindings, Container, ServicesProvider } from '@/services'
import testBindings, { FakeSystemPreconditionsService } from '@/services/registry/test'
import { SystemPreconditionsToken } from '@/services/tokens'
import type { SystemPreconditionStatus } from '@/services'
import { connected, mockQuery } from '@/storybook'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'
import { useOnboardingSetupStore } from '../../-stores/useOnboardingSetupStore'
import { useOnboardingStore } from '../../-stores/useOnboardingStore'
import { OnboardingFlow } from '.'

/**
 * Migrado de `index.test.tsx` (T11, onda B). `OnboardingFlow` é CONECTADO (`useGetOnboarding` +
 * `useCompleteOnboarding` internos, e `useNavigate()` — precisa de um router de verdade) — daí
 * `connected({ route: { id: '/onboarding/' } })`, o mesmo framework de `ThreadSettingsDialog`/
 * `SetupChecklist`. MSW não intercepta sob bun (medido, `tests/support/storybook.ts`): a leitura de
 * onboarding nunca resolve dentro do `bun test`, então o `useEffect` que SEMEIA `currentSlide` a
 * partir de `useGetOnboarding()` nunca dispara ali — cada story abre no slide 0 (o default do
 * store), que é exatamente por que `StepWalking` só precisa exercitar os passos de INTRO
 * (VALUE/HOW/CONTROL — sem SDK, sem services) para provar a navegação: `play` bate no MECANISMO do
 * wizard (Avançar/Voltar, os pontinhos de progresso), nunca numa resposta de rede.
 *
 * Como `FullDiskAccessCard` (uma entrada de `STEP_COMPONENTS`), `OnboardingFlow` NÃO é conectado só
 * via SDK — ele lê `useSystemPreconditionsStore` e, quando o passo atual é `FULL_DISK_ACCESS`,
 * monta `FullDiskAccessCard`, que por sua vez pede `useSystemPreconditions()` do Container. Por isso
 * `withServices` (mesmo padrão de `FullDiskAccessCard/index.stories.tsx`) monta seu PRÓPRIO
 * `ServicesProvider` — a fiação genérica de `@/storybook` só cobre route/SDK/Zustand, não o
 * Container de serviços.
 */

const opts = getOnboardingQueryOptions()

const FRESH: GetOnboardingQueryResponse = {
	currentStep: 'VALUE',
	completedAt: null,
	state: {},
	channelDone: false,
	workspaceDone: false,
	threadDone: false,
}

/**
 * O estado da AC-10 (abrir DIRETO no FULL_DISK_ACCESS pendente) — IMPRODUZÍVEL pelo harness de
 * integração pelo MESMO gap documentado em `SetupChecklist`/`UserProfile` (T11): `channelDone` só
 * fica `true` via `channels`/`remotes`, tabelas do gateway Go sem given exposto em
 * `@codm/api-typescript/testing`. Sem os TRÊS `*Done`, `firstUnvanquishedStep` nunca chega à
 * pré-condição — fica SÓ-VISUAL aqui, como o resto da família.
 */
const READY_WITH_PENDING_PRECONDITION: GetOnboardingQueryResponse = {
	currentStep: 'FINAL',
	completedAt: '2026-08-09T00:00:00.000Z',
	state: {},
	channelDone: true,
	workspaceDone: true,
	threadDone: true,
}

function withServices(seed?: SystemPreconditionStatus[]) {
	return function Harness() {
		const [container] = useState(() => {
			const c = new Container()
			c.load(testBindings)
			c.load([[SystemPreconditionsToken, FakeSystemPreconditionsService]] as unknown as Bindings)
			useOnboardingStore.getState().reset()
			useOnboardingSetupStore.getState().reset()
			useSystemPreconditionsStore.getState().reset()
			if (seed) useSystemPreconditionsStore.getState().apply(seed)
			return c
		})
		return (
			<ServicesProvider container={container}>
				<OnboardingFlow />
			</ServicesProvider>
		)
	}
}

const meta = {
	title: 'Onboarding/OnboardingFlow',
	component: OnboardingFlow,
	parameters: connected({ route: { id: '/onboarding/' }, msw: { handlers: [mockQuery(opts, FRESH)] } }),
} satisfies Meta<typeof OnboardingFlow>
export default meta

type Story = StoryObj<typeof meta>

/** Abre no slide 0 (VALUE) — o default do `useOnboardingStore`, já que a leitura de onboarding (que
 *  reposicionaria o índice) nunca resolve sob bun. */
export const Default: Story = {
	render: withServices(),
}

/**
 * O MECANISMO de navegação do wizard — Avançar/Voltar e os pontinhos de progresso — provado sem
 * nenhuma dependência de rede: os três passos de INTRO (`ValueSlide`/`HowItWorksSlide`/
 * `ControlSlide`) não leem SDK nem services, então `play` pode atravessá-los de ponta a ponta dentro
 * do `bun test`. Os passos de SETUP (CHANNEL/WORKSPACE/CONTACT/AGENTS/REVIEW, todos ligados a SDK
 * real) e o clique em "Concluir" (que precisa do backend real invalidando a leitura) ficam para o
 * harness de integração em `index.test.tsx` — exatamente a fronteira que a skill documenta.
 */
export const StepWalking: Story = {
	render: withServices(),
	play: async ({ canvasElement }) => {
		await i18n.changeLanguage('pt')
		const canvas = within(canvasElement)

		await waitFor(() => expect(canvas.getByText(i18n.t('onboarding.slide1Title'))).toBeTruthy())
		// Sem "Voltar" no primeiro passo — nada para onde voltar.
		expect(canvas.queryByText(i18n.t('onboarding.back'))).toBeNull()

		await userEvent.click(canvas.getByText(i18n.t('onboarding.next')))
		await waitFor(() => expect(canvas.getByText(i18n.t('onboarding.slide2Title'))).toBeTruthy())
		expect(canvas.getByText(i18n.t('onboarding.back'))).toBeTruthy()

		await userEvent.click(canvas.getByText(i18n.t('onboarding.next')))
		await waitFor(() => expect(canvas.getByText(i18n.t('onboarding.slide3Title'))).toBeTruthy())

		// Voltar desfaz um passo — prova a direção reversa, não só o avanço.
		await userEvent.click(canvas.getByText(i18n.t('onboarding.back')))
		await waitFor(() => expect(canvas.getByText(i18n.t('onboarding.slide2Title'))).toBeTruthy())
	},
}

/** SÓ-VISUAL por necessidade (o gap de `channelDone` — ver o docblock acima): a composição inclui
 *  `FULL_DISK_ACCESS` e, se a leitura resolvesse (só acontece num browser real), o wizard abriria
 *  direto nele (AC-10). Sob bun a leitura nunca chega, então esta story só prova que a árvore monta
 *  com o `ServicesProvider`/pendência semeados sem quebrar. */
export const WithFullDiskAccessPending: Story = {
	render: withServices([{ id: 'FULL_DISK_ACCESS', satisfied: false, repair: 'AVAILABLE' }]),
	parameters: { msw: { handlers: [mockQuery(opts, READY_WITH_PENDING_PRECONDITION)] } },
}
