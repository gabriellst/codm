// packages/app/react/src/routes/onboarding/onboarding.stories.tsx — F3 Wave A (A6), área "Onboarding,
// Login & Attach". Slugs cobertos aqui: onboarding-1-boas-vindas-wrapper, onboarding-2-como-funciona-
// wrapper, onboarding-3-controle-wrapper, permissao-wrapper, tudo-pronto-wrapper — as cinco telas do
// `OnboardingFlow` que vivem sob `/onboarding` (full-bleed, sem Rail/sidebar — ver `AppScreenFrame`
// `sidebar={false}` abaixo, confirmado pelos cinco specs: nenhum declara um nó "Rail").
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { getOnboardingQueryOptions } from '@codm/client-typescript/typescript'
import type { GetOnboardingQueryResponse } from '@codm/client-typescript/typescript'
import type { SystemPreconditionStatus } from '@/services'
import { AppScreenFrame, connected, mockQuery } from '@/storybook'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'
import { useOnboardingStore } from './-stores/useOnboardingStore'
import { OnboardingFlow } from './-components/OnboardingFlow'

const opts = getOnboardingQueryOptions()

/**
 * `OnboardingFlow` seeds its own slide index from `useGetOnboarding()` (`firstUnvanquishedStep`,
 * `-components/OnboardingFlow/index.tsx`) — unlike `/attach`'s wizard, no manual store-poking is
 * needed to land a fidelity screenshot on a given slide: mocking `currentStep`/`*Done` per story is
 * enough. This harness only resets the two stores between stories (module-level Zustand singletons
 * persist across a page's story navigations otherwise) and, for the permission screen, seeds the
 * pending `SystemPrecondition` the design's slide renders.
 */
function withOnboardingState(pending?: SystemPreconditionStatus[]) {
	return function Harness() {
		useState(() => {
			useOnboardingStore.getState().reset()
			useSystemPreconditionsStore.getState().reset()
			if (pending) useSystemPreconditionsStore.getState().apply(pending)
			return true
		})
		return (
			// `titleBarVariant="plain"` — os cinco specs desta família ("Title Bar",
			// design/system/pen/screens/{onboarding-1,onboarding-2,onboarding-3,permissao,tudo-pronto}-
			// wrapper.json) não declaram `fill`/`stroke` no nó, ao contrário do grupo `bg-card` que o
			// default de `AppScreenFrame` reproduz. Pixel amostrado no alvo confirma: (255,255,255) —
			// branco puro, não o (247,247,247) de `$card`. Mesmo padrão do `login-wrapper.json`
			// (congelada, fora de escopo do B2).
			<AppScreenFrame sidebar={false} titleBarVariant="plain">
				<OnboardingFlow />
			</AppScreenFrame>
		)
	}
}

const meta = {
	title: 'Onboarding/Screens',
	component: OnboardingFlow,
	parameters: connected({ route: { id: '/onboarding/' } }),
} satisfies Meta<typeof OnboardingFlow>
export default meta

type Story = StoryObj<typeof meta>

/**
 * Layout REPRODUCED from `design/fidelity/targets/screens/onboarding-1-boas-vindas-wrapper.png` —
 * title "Converse com seu código", footer "Pular" (left) / "Próximo" (right), matching `ValueSlide`
 * + `OnboardingFlow`'s own footer verbatim.
 *
 * Body copy INTENTIONALLY DIVERGES from the frozen target PNG (2026-08-25 founder decision):
 * marketing moved to WhatsApp-only, Instagram/Telegram are surfaced elsewhere as "coming soon"
 * only (see `ChannelsSection`/`COMING_SOON_CHANNELS`), so `onboarding.slide1Body` dropped the
 * "Instagram e Telegram" mention: "O CODM conecta o WhatsApp a agentes de código rodando neste
 * Mac — converse com seu código como em qualquer plataforma de mensagens. Mais canais em breve.
 * Código aberto, sem conta, tudo permanece local." Title/skip/next keys still match the design
 * text 1:1 (`onboarding.slide1Title`/`skip`/`next`) — only `slide1Body` is a deliberate content
 * gap against the target image, not a rendering defect.
 * `VALUE` is the store's own default slide, so no seeding beyond a fresh mount is needed.
 */
export const OnboardingBoasVindas: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'onboarding-1-boas-vindas-wrapper', kind: 'screens', viewport: { width: 1440, height: 900 } },
		...connected({
			route: { id: '/onboarding/' },
			msw: {
				handlers: [
					mockQuery(opts, {
						currentStep: 'VALUE',
						completedAt: null,
						state: {},
						channelDone: false,
						workspaceDone: false,
						threadDone: false,
					} satisfies GetOnboardingQueryResponse),
				],
			},
		}),
	},
	render: withOnboardingState(),
}

/**
 * Content REPRODUCED from `design/fidelity/targets/screens/onboarding-2-como-funciona-wrapper.png` +
 * spec: title "Como funciona", the 4-card diagram mensagem → issue → sessão de terminal → resposta,
 * footer "Voltar" / "Próximo" — matches `HowItWorksSlide` verbatim (i18n `onboarding.slide2Title`/
 * `diagramMessage`/`diagramIssue`/`diagramTerminal`/`diagramReply` all match, no gap). Landed here via
 * a mocked `currentStep: 'HOW'`: `firstUnvanquishedStep` marks every intro slide BEFORE `currentStep`
 * in `CONTENT_STEPS` as vanquished (spec Decision 12), so `VALUE` (index 0 < 1) is skipped and `HOW`
 * (index 1, not < 1) is exactly where the wizard opens.
 */
export const OnboardingComoFunciona: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'onboarding-2-como-funciona-wrapper', kind: 'screens', viewport: { width: 1440, height: 900 } },
		...connected({
			route: { id: '/onboarding/' },
			msw: {
				handlers: [
					mockQuery(opts, {
						currentStep: 'HOW',
						completedAt: null,
						state: {},
						channelDone: false,
						workspaceDone: false,
						threadDone: false,
					} satisfies GetOnboardingQueryResponse),
				],
			},
		}),
	},
	render: withOnboardingState(),
}

/**
 * Content REPRODUCED from `design/fidelity/targets/screens/onboarding-3-controle-wrapper.png` + spec:
 * title "Você mantém o controle", body "Os agentes pausam em erros de servidor, respostas bloqueadas
 * ou quando alguém pede um humano. Você revisa, orienta com um sussurro ou assume o controle — nada é
 * enviado sem a sua palavra.", footer "Voltar" / "Começar" — matches `ControlSlide` verbatim (i18n
 * `onboarding.slide3Title`/`slide3Body` match; the design's footer CTA reads "Começar" because `CONTROL`
 * is the design's own last intro slide, while the live app's `onboardingSteps()` inserts the five SETUP
 * steps — CHANNEL/WORKSPACE/CONTACT/AGENTS/REVIEW — between the intro slides and `FINAL`, so the real
 * footer here reads "Próximo" (`index < lastIndex`), not "Começar". Reproduced as the app actually
 * renders it — not forced to match the design's CTA label — per the ruler's "measure honestly" canon;
 * GAP not fixed here (out of this file's scope: it is `onboardingSteps`'s composition, not a CSS/copy
 * fix). `currentStep: 'CONTROL'` lands the wizard directly on this slide (index 2, not < 2 in
 * `CONTENT_STEPS`), same mechanism as `OnboardingComoFunciona` above.
 */
export const OnboardingControle: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'onboarding-3-controle-wrapper', kind: 'screens', viewport: { width: 1440, height: 900 } },
		...connected({
			route: { id: '/onboarding/' },
			msw: {
				handlers: [
					mockQuery(opts, {
						currentStep: 'CONTROL',
						completedAt: null,
						state: {},
						channelDone: false,
						workspaceDone: false,
						threadDone: false,
					} satisfies GetOnboardingQueryResponse),
				],
			},
		}),
	},
	render: withOnboardingState(),
}

/**
 * Content REPRODUCED from `design/fidelity/targets/screens/permissao-wrapper.png` + spec: title "Falta
 * uma permissão", body "O CODM precisa disto antes de conseguir trabalhar neste computador.", card "Acesso
 * Total ao Disco" / "Os agentes leem suas pastas de projeto através do CODM — para o macOS, quem lê é
 * o app. Sem esta permissão o sistema bloqueia a leitura e as tarefas param sem explicação.", button
 * "Liberar Acesso Total ao Disco", hint "Dois passos, nesta ordem: o CODM apaga a negação já registrada
 * e depois abre Privacidade e Segurança › Acesso Total ao Disco, onde você liga o CODM.", caption "Volte
 * para esta janela depois de conceder — a verificação roda de novo sozinha." — matches `FullDiskAccessCard`
 * verbatim (all `systemPreconditions.*` i18n keys match, no gap). Mocks `currentStep: 'FINAL'` +
 * every `*Done` flag true so all intro/setup steps in `firstUnvanquishedStep` are vanquished, and seeds
 * `useSystemPreconditionsStore` with a pending, repairable `FULL_DISK_ACCESS` — the ONLY remaining
 * unvanquished step, landing the wizard on this slide (the `AVAILABLE` `repairAvailability` branch,
 * matching the design's button-present state).
 */
export const Permissao: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'permissao-wrapper', kind: 'screens', viewport: { width: 1440, height: 900 } },
		...connected({
			route: { id: '/onboarding/' },
			msw: {
				handlers: [
					mockQuery(opts, {
						currentStep: 'FINAL',
						completedAt: null,
						state: {},
						channelDone: true,
						workspaceDone: true,
						threadDone: true,
					} satisfies GetOnboardingQueryResponse),
				],
			},
		}),
	},
	render: withOnboardingState([{ id: 'FULL_DISK_ACCESS', satisfied: false, repair: 'AVAILABLE' }]),
}

/**
 * Content REPRODUCED from `design/fidelity/targets/screens/tudo-pronto-wrapper.png` + spec: seal card
 * "Tudo pronto" / "Você concluiu a configuração inicial do CODM.", footer CTA "Começar" — matches
 * `OnboardingFinalStep` + `OnboardingFlow`'s own footer verbatim (`onboarding.finalTitle`/`finalBody`/
 * `getStarted` all match, no content gap). `OnboardingFinalStep`'s own docblock documents a REGISTERED
 * divergence this story inherits rather than re-litigates: the design wraps the seal/title/body AND the
 * "Começar" button inside ONE white card with no dots, while the live app keeps the dots slot (empty
 * here — `FINAL` isn't in `INFO_STEPS_WITH_BLOB`, so no dots render, matching) and renders "Começar" in
 * the SHARED footer below the card rather than inside it — same position class as every other step's
 * CTA, not the card-embedded button the design draws. Mocks `currentStep: 'FINAL'` + every `*Done` flag
 * true, no pending `SystemPrecondition` — `FINAL` is the only unvanquished step left in
 * `firstUnvanquishedStep`'s fallback (spec Decision 12), landing the wizard here directly.
 */
export const TudoPronto: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'tudo-pronto-wrapper', kind: 'screens', viewport: { width: 1440, height: 900 } },
		...connected({
			route: { id: '/onboarding/' },
			msw: {
				handlers: [
					mockQuery(opts, {
						currentStep: 'FINAL',
						completedAt: null,
						state: {},
						channelDone: true,
						workspaceDone: true,
						threadDone: true,
					} satisfies GetOnboardingQueryResponse),
				],
			},
		}),
	},
	render: withOnboardingState(),
}
