import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { type Bindings, Container, ServicesProvider, type WindowChrome } from '@/services'
import testBindings, { FakeWindowService } from '@/services/registry/test'
import { WindowToken } from '@/services/tokens'
import { AppChrome } from './AppChrome'

/**
 * `AppChrome` é CONECTADO a uma porta (`useWindowChrome()`), não a SDK/rota — por isso não usa
 * `connected({ route })`: a fiação genérica de `@/storybook` só cobre route/SDK/Zustand, não o
 * Container de serviços. Cada story monta o PRÓPRIO `ServicesProvider` com um `FakeWindowService`
 * semeado (mesmo padrão de `OnboardingFlow/index.stories.tsx` `withServices`), provando as duas
 * respostas que o host pode dar: os semáforos sobrepostos (macOS) e a barra nativa (Windows/Linux,
 * browser). Os semáforos NÃO são desenhados aqui — no app real quem os desenha é o SO; a barra só
 * RESERVA a faixa (ver `storybook/AppScreenFrame.tsx` para a reprodução estática de fidelity).
 */
function withWindow(chrome: WindowChrome) {
	return function Harness() {
		const [container] = useState(() => {
			class Seeded extends FakeWindowService {
				constructor() {
					super(chrome)
				}
			}
			const c = new Container()
			c.load(testBindings)
			const overrides: Bindings = [[WindowToken, Seeded]]
			c.load(overrides)
			return c
		})
		return (
			<ServicesProvider container={container}>
				<div className="w-[960px] overflow-hidden rounded-asymmetric-xl border border-border bg-route-background">
					<AppChrome />
				</div>
			</ServicesProvider>
		)
	}
}

const meta = {
	title: 'Console/AppChrome',
	component: AppChrome,
} satisfies Meta<typeof AppChrome>
export default meta

type Story = StoryObj<typeof meta>

/** macOS: os semáforos do SO ficam SOBRE o webview — a barra abre 78px dos dois lados. */
export const OverlayTitleBar: Story = {
	render: withWindow({ titleBar: 'overlay' }),
}

/** Windows/Linux (barra de título nativa acima) e browser: só a calha de 12px. */
export const NativeTitleBar: Story = {
	render: withWindow({ titleBar: 'native' }),
}
