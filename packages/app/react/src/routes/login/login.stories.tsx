// packages/app/react/src/routes/login/login.stories.tsx — F3 Wave A (A6), área "Onboarding, Login &
// Attach". Slug coberto: login-wrapper. `/login` é full-bleed (sem Rail/sidebar — o spec não declara
// nenhum nó "Rail", mesma família das telas de onboarding) — `AppScreenFrame sidebar={false}` abaixo.
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { AppScreenFrame, connected } from '@/storybook'
import { useCloudSessionStore } from '@/stores'
import { LoginSection } from './-components/LoginSection'

/** Fresh `useCloudSessionStore` per story — the store is a module-level singleton that would
 *  otherwise carry state across a page's story navigations. `unauthenticated` (not the store's own
 *  `checking` default) so the screenshot reflects the settled state the design's static mock shows,
 *  never mid-flight — `LoginSection`'s own `useEffect` only redirects away on `authenticated`, so this
 *  doesn't change what renders, just removes ambiguity about which status produced it. */
function LoginHarness() {
	useState(() => {
		useCloudSessionStore.getState().setUnauthenticated()
		return true
	})
	// Route's own composition (`routes/login/index.tsx`'s `RouteComponent`) reproduced here, not
	// mounting the route file itself — the harness composes `AppScreenFrame` around it, same as every
	// other F3 fidelity `screens` story.
	return (
		<AppScreenFrame sidebar={false}>
			<main className="flex h-full flex-col">
				<LoginSection className="flex-1" />
			</main>
		</AppScreenFrame>
	)
}

const meta = {
	title: 'Login/Screen',
	component: LoginSection,
	parameters: connected({ route: { id: '/login/' } }),
} satisfies Meta<typeof LoginSection>
export default meta

type Story = StoryObj<typeof meta>

/**
 * Content REPRODUCED from `design/fidelity/targets/screens/login-wrapper.png` +
 * `design/system/pen/screens/login-wrapper.json`: the white bordered seal card, title "Entre para
 * continuar", subtitle "Faça login com sua conta para liberar os agentes", "Continuar com Google"
 * (first) then "Continuar com GitHub" (second), footer caption "Código aberto · roda localmente" —
 * matches `LoginSection` verbatim (`cloudAuth.login.title`/`subtitle`/`google`/`github` and
 * `console.footerLocal` all match the design text 1:1, provider order already Google-then-GitHub per
 * that component's own D3 docblock — no content gap on this screen).
 */
export const Login: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'login-wrapper', kind: 'screens', viewport: { width: 1440, height: 900 } },
		...connected({ route: { id: '/login/' } }),
	},
	render: () => <LoginHarness />,
}
