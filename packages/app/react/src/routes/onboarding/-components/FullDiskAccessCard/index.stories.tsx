import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, within } from 'storybook/test'
import i18n from '@/lib/i18n'
import { type Bindings, Container, ServicesProvider } from '@/services'
import testBindings, { FakeSystemPreconditionsService } from '@/services/registry/test'
import { SystemPreconditionsToken } from '@/services/tokens'
import type { SystemPreconditionStatus } from '@/services'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'
import { FullDiskAccessCard } from '.'

/**
 * Migrado de `index.test.tsx` (T11, onda B). `FullDiskAccessCard` não é conectado via SDK — ele lê
 * um Container de serviços (`useSystemPreconditions`) que a fiação genérica de stories
 * (`@/storybook`/`withConnected`) não conhece (ela só cobre route/SDK/Zustand — ver `StoresParam`
 * vazio em `src/storybook/types.ts`). Por isso cada story monta seu PRÓPRIO `ServicesProvider` com um
 * `Container` fresco via `useState` lazy-init (mesmo idioma de `withConnected`: roda uma vez, não a
 * cada render). `harnessFake` é module-level, reatribuído no `render()` de CADA story antes do `play`
 * ler — seguro porque as stories montam sequencialmente (smoke e o runner local nunca as compõem em
 * paralelo).
 */

let harnessFake: FakeSystemPreconditionsService | null = null

function withServices(seed?: SystemPreconditionStatus[]) {
	return function Harness() {
		const [container] = useState(() => {
			const c = new Container()
			c.load(testBindings)
			c.load([[SystemPreconditionsToken, FakeSystemPreconditionsService]] as unknown as Bindings)
			harnessFake = c.resolve(SystemPreconditionsToken) as FakeSystemPreconditionsService
			useSystemPreconditionsStore.getState().reset()
			if (seed) useSystemPreconditionsStore.getState().apply(seed)
			return c
		})
		return (
			<ServicesProvider container={container}>
				<FullDiskAccessCard />
			</ServicesProvider>
		)
	}
}

const meta = {
	title: 'Onboarding/FullDiskAccessCard',
	component: FullDiskAccessCard,
} satisfies Meta<typeof FullDiskAccessCard>
export default meta

type Story = StoryObj<typeof meta>

/** AC-6, metade 1: o clique pede o reparo da pré-condição — asseverado no que o fake registrou. */
export const AvailableRepairAsksHost: Story = {
	render: withServices(),
	play: async ({ canvasElement }) => {
		await i18n.changeLanguage('pt')
		const canvas = within(canvasElement)
		const button = canvas.getByRole('button')

		await userEvent.click(button)

		await expect(harnessFake?.repaired).toEqual(['FULL_DISK_ACCESS'])
	},
}

/** AC-6, metade 2: a UI declara os dois passos (limpar a negação, depois abrir os Ajustes) ANTES do clique. */
export const AvailableDeclaresTwoStepsBeforeClick: Story = {
	render: withServices(),
	play: async ({ canvasElement }) => {
		await i18n.changeLanguage('pt')
		await expect(canvasElement.textContent).toContain('apaga a negação')
		await expect(canvasElement.textContent).toContain('Acesso Total ao Disco')
	},
}

/** AC-12: sem identidade atribuível (tauri dev), não há botão de reparo — só a orientação. */
export const NoAppIdentityHidesButton: Story = {
	render: withServices([{ id: 'FULL_DISK_ACCESS', satisfied: false, repair: 'NO_APP_IDENTITY' }]),
	play: async ({ canvasElement }) => {
		await i18n.changeLanguage('pt')
		await expect(canvasElement.querySelector('button')).toBeNull()
		await expect(canvasElement.textContent).toContain('identidade própria')
	},
}
