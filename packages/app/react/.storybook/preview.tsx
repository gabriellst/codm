// packages/app/react/.storybook/preview.tsx — COMPLETE final file.
import React from 'react'
import type { Preview } from '@storybook/react'
import { configureClient } from '@codm/client-typescript/http'
import { initialize, mswLoader } from 'msw-storybook-addon'
import i18n from '../src/lib/i18n'
import { serviceBaseUrls } from '../src/lib/config'
import { withConnected } from '../src/storybook'
import '../src/index.css'

// Live mode: point the SDK client at a real backend, but ONLY when VITE_API_URL is set. The story
// harness never runs the app's router.tsx (where configureClient normally happens), so without this
// the client is unconfigured and resolveURL returns paths relative to the Storybook origin (:6006) —
// which is the correct default for mock-driven stories. Mocked stories still intercept regardless.
const apiUrl = import.meta.env.VITE_API_URL
if (apiUrl) configureClient(serviceBaseUrls)

// MSW é SÓ-VISUAL (decisão do founder pós-spike da consolidação de teste frontend): inicializa
// SOMENTE onde existe Service Worker de verdade — o browser do Storybook. Sob bun/happy-dom
// `navigator.serviceWorker` não existe (medido: `'serviceWorker' in navigator` é `false` ali,
// `true` em qualquer browser real que o Storybook roda) — e o addon, quando forçado a subir lá
// mesmo assim, não serve mock ALGUM e ainda ENGOLE requisições reais (medido em 10/08: um teste
// que batia no backend real recebia corpo vazio — `SyntaxError: Unexpected EOF`). O guard evita as
// duas consequências: nenhuma story sob bun tenta instalar o interceptor quebrado.
const canUseMsw = typeof navigator !== 'undefined' && 'serviceWorker' in navigator

// Start the MSW worker once for all stories. Unhandled requests pass through so non-mocked
// stories are unaffected; stories opt into network mocking via `parameters.msw.handlers`.
if (canUseMsw) initialize({ onUnhandledRequest: 'bypass' })

const preview: Preview = {
	// Theme + locale toggles in toolbar
	globalTypes: {
		theme: {
			description: 'Global theme for components',
			toolbar: {
				title: 'Theme',
				icon: 'circlehollow',
				items: [
					{ value: 'light', icon: 'sun', title: 'Light' },
					{ value: 'dark', icon: 'moon', title: 'Dark' },
				],
				dynamicTitle: true,
			},
		},
		locale: {
			description: 'Active language (i18n)',
			toolbar: {
				title: 'Locale',
				icon: 'globe',
				items: [
					{ value: 'pt', title: 'Português' },
					{ value: 'en', title: 'English' },
				],
				dynamicTitle: true,
			},
		},
		dataSource: {
			description: 'Mocked responses (default) vs the real backend (needs VITE_API_URL + bun dev:api + auth)',
			toolbar: {
				title: 'Data',
				icon: 'database',
				items: [
					{ value: 'mock', title: 'Mock' },
					{ value: 'live', title: 'Live' },
				],
				dynamicTitle: true,
			},
		},
	},

	initialGlobals: {
		theme: 'dark',
		locale: 'pt',
		dataSource: 'mock',
	},

	// Global wrappers for all stories. Order matters: theme/i18n is outermost; withConnected is
	// innermost so a connected story renders inside the theme div AND its synthesized router.
	decorators: [
		(Story, context) => {
			const theme = context.globals.theme
			const locale = context.globals.locale as string
			React.useEffect(() => {
				if (locale && i18n.language !== locale) i18n.changeLanguage(locale)
			}, [locale])
			return (
				<div className={theme === 'dark' ? 'dark' : ''}>
					<div className="bg-background min-h-screen p-6">
						<Story />
					</div>
				</div>
			)
		},
		withConnected,
	],

	loaders: canUseMsw ? [mswLoader] : [],

	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
		backgrounds: { disable: true },
	},
}

export default preview
