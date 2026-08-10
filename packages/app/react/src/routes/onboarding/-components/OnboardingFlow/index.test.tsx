// packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.test.tsx
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root as ReactRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRouterState } from '@tanstack/react-router'
import i18n from '@/lib/i18n'
import { OnboardingGate, resetOnboardingGateForTests } from '@/components/console/OnboardingGate'
import { type Bindings, Container, ServicesProvider } from '@/services'
import testBindings from '@/services/registry/test'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'
import { composeStories } from '../../../../../tests/support/storybook'
import { mountRouter, type MountedRouter } from '../../../../../tests/support/mountRouter'
import { useIntegrationBackend, type IntegrationBackend } from '../../../../../tests/support/integration-harness'
import { useOnboardingSetupStore } from '../../-stores/useOnboardingSetupStore'
import { useOnboardingStore } from '../../-stores/useOnboardingStore'
import { onboardingSteps } from '../steps'
import { OnboardingFlow } from './index'
import * as stories from './index.stories'

/**
 * A STORY É A FIXTURE; O BLOCO `'OnboardingFlow — stories'` LOGO ABAIXO SÓ A EXECUTA sob `bun test`
 * (mesmo padrão de `ArtifactPreview`/`FullDiskAccessCard`, T9-T11) — monta cada story composta e
 * invoca seu `play`; `bun:test`'s `it()` propaga qualquer `expect` que falhar lá dentro. O resto do
 * arquivo (o describe seguinte) é o harness de integração, para o que `play` NÃO pode provar (rede
 * real) — ver o docblock dele para o que sobreviveu à varredura por falseamento.
 */

/**
 * REESCRITO CONTRA O BACKEND REAL (T11, onda B). O que o `.test.tsx` antigo (stub manual de
 * `globalThis.fetch`) provava se dividiu em três lugares, pela varredura por falseamento:
 *
 * - "nunca oferece um link de saída" — DESCARTADO. O componente nunca renderizou um `<a>` na sua
 *   vida (o "Pular" morreu na Decision 13, antes deste front nascer); não há implementação para
 *   quebrar que torne este caso RED. Prova ausência de código que não existe, não comportamento.
 * - Composição PURA (`onboardingSteps`/`firstUnvanquishedStep`) já mora em `../steps.test.ts` — não
 *   repetida aqui.
 * - "com/sem pendência, FULL_DISK_ACCESS entra/sai da composição" e AC-14 (as 5 peças reais montam) —
 *   a REGRESSÃO abaixo já atravessa toda a composição (todos os passos, na ordem) para chegar ao
 *   fim; a asserção específica de conteúdo por passo não sobreviveu à varredura como caso
 *   independente (mesma trilha, sem invariante própria que a regressão não cubra).
 * - AC-10 ("abre DIRETO em FULL_DISK_ACCESS com completedAt gravado") é IMPRODUZÍVEL pelo harness:
 *   precisa dos três `*Done`, e `channelDone` esbarra no mesmo gap de `SetupChecklist`/`UserProfile`
 *   (tabelas do gateway Go, sem given exposto em `@codm/api-typescript/testing`) — foi para
 *   `index.stories.tsx` (`WithFullDiskAccessPending`), SÓ-VISUAL.
 *
 * O que sobra: a abertura no primeiro passo quando a leitura de onboarding É produzível (o caso
 * "nada começou" — `backend.reset()` sozinho já basta, mesmo fato que `OnboardingGate.test.tsx`
 * usa), e a REGRESSÃO CORONA — "concluir duas vezes" — como comportamento ponta a ponta:
 * `OnboardingFlow` (em `/onboarding`) seguido do MESMO `OnboardingGate` que decide `/dashboard`
 * (`(app)/route.tsx`), os dois no mesmo `QueryClient` — a única forma de flagrar o cache velho que
 * causava o bounce.
 *
 * `ServicesProvider`/`Container` (mesmo `testBindings` de `FullDiskAccessCard`) porque
 * `OnboardingWorkspaceStep` monta `AddWorkspaceForm`, que pede `useFilePicker()` do Container
 * incondicionalmente — sem ele, o passo WORKSPACE (que a regressão atravessa a caminho do fim)
 * lançaria "useService usado fora do ServicesProvider" no mount, não um erro de rede.
 *
 * `/go` (canal) não tem gateway real por trás do harness — `useIntegrationBackend()` aponta `go`
 * para a MESMA origem `typescript` (sem o prefixo `/v1/external/channel` da produção), então o passo
 * CHANNEL bate em rotas que não existem e erra RÁPIDO (404, sem timeout) — seguro para atravessar
 * sem esperar assentar.
 */

const NEXT = () => i18n.t('onboarding.next')
const GET_STARTED = () => i18n.t('onboarding.getStarted')

const composed = composeStories(stories)

/** RODA PRIMEIRO, de propósito: as stories não conhecem o harness (nem deveriam — `play` não pode
 *  asseverar rede, ver o docblock acima), mas ainda assim disparam a leitura de onboarding da SDK
 *  de verdade. Rodar este bloco ANTES do describe de baixo evita que ele bata contra a PORTA JÁ
 *  PARADA do harness (o `afterAll` de baixo derruba o servidor) — a falha de rede vira `isError`
 *  silencioso de qualquer jeito (nunca derruba o teste), mas a ordem elimina o ruído. */
describe('OnboardingFlow — stories', () => {
	for (const [name, Story] of Object.entries(composed)) {
		it(name, async () => {
			const host = document.createElement('div')
			document.body.appendChild(host)
			let root: ReactRoot | null = null
			await act(async () => {
				root = createRoot(host)
				root.render(<Story />)
			})
			await act(async () => {
				await Promise.resolve()
			})
			await act(async () => {
				await Story.play?.({ canvasElement: host })
			})
			act(() => root?.unmount())
			host.remove()
		})
	}
})

describe('OnboardingFlow — contra o backend real', () => {
	let backend: IntegrationBackend
	let mounted: MountedRouter | null = null

	beforeAll(async () => {
		backend = await useIntegrationBackend()
	})

	afterAll(async () => {
		await backend.stop()
	})

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		await backend.reset()
		useOnboardingStore.getState().reset()
		useOnboardingSetupStore.getState().reset()
		useSystemPreconditionsStore.getState().reset()
		resetOnboardingGateForTests()
	})

	afterEach(() => {
		mounted?.unmount()
		mounted = null
	})

	/** O MESMO par de rotas que `(app)/route.tsx` compõe em produção: `/onboarding` monta o wizard
	 *  puro; `/dashboard` monta o `OnboardingGate` de verdade ao redor de um console de mentira — é
	 *  ele quem decide se fica ou devolve. `mountRouter` renderiza uma árvore FIXA independente do
	 *  path (não troca de componente sozinho); este `Root` é quem lê `useRouterState` e faz a troca —
	 *  a mesma técnica de `OnboardingGate.test.tsx`, uma camada acima. */
	function Root() {
		const pathname = useRouterState({ select: s => s.location.pathname })
		if (pathname === '/dashboard') {
			return (
				<OnboardingGate>
					<div data-testid="dashboard">dashboard</div>
				</OnboardingGate>
			)
		}
		return <OnboardingFlow />
	}

	async function mount(queryClient: QueryClient): Promise<MountedRouter> {
		const container = new Container()
		container.load(testBindings as unknown as Bindings)

		mounted = await mountRouter(
			<QueryClientProvider client={queryClient}>
				<ServicesProvider container={container}>
					<Root />
				</ServicesProvider>
			</QueryClientProvider>,
			{ path: '/onboarding' },
		)
		return mounted
	}

	function clickButton(text: string): void {
		const button = [...mounted!.host.querySelectorAll('button')].find(b => b.textContent?.includes(text))
		if (!button) throw new Error(`button "${text}" not found`)
		act(() => button.click())
	}

	/**
	 * O índice do store começa pré-semeado num valor QUE NÃO é o que a leitura fresca produziria — se
	 * a asserção fosse só "abre em 0", quebrar a guarda de semeadura (`if (seededRef.current ||
	 * !onboarding) return` → `if (true) return`, nunca semeia) passaria DE GRAÇA, porque 0 também é o
	 * initial state do `useOnboardingStore`. Pré-semear com um índice DIFERENTE de 0 é o que torna
	 * este caso um FALSEADOR de verdade: só a leitura REAL de onboarding chegando e o `useEffect`
	 * rodando sobre ela reposiciona o índice — medido quebrando a guarda acima, que vira RED (o
	 * wizard fica preso no passo 5 em vez de voltar a 0), restaurado byte a byte, GREEN de novo.
	 */
	it('sem progresso nenhum, a leitura real chega e REPOSICIONA o wizard no primeiro passo (VALUE)', async () => {
		useOnboardingStore.getState().setCurrentSlide(5)
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		await mount(queryClient)

		await mounted!.settled(() => (mounted!.host.textContent ?? '').includes(i18n.t('onboarding.slide1Title')), 'o slide 1 aparecer')
		expect(useOnboardingStore.getState().currentSlide).toBe(0)
	})

	describe('concluir', () => {
		/**
		 * A REGRESSÃO DE 09/08 ("cliquei em concluir duas vezes, a primeira não pegou"), como
		 * comportamento ponta a ponta contra o backend real: conclui UMA VEZ, navega para `/dashboard`,
		 * e o `OnboardingGate` que monta lá NÃO devolve — porque a invalidação (`await
		 * queryClient.invalidateQueries(...)` em `index.tsx`, antes do `navigate`) já deixou o cache com
		 * o `completedAt` fresco antes do gate ler.
		 *
		 * O testid do dashboard só aparece se o gate deixar passar: `OnboardingGate` retorna
		 * `<Navigate to="/onboarding" replace/>` SEM renderizar `children` quando `completedAt` está
		 * ausente — então, sob o bug, o testid nunca chega a montar (não é uma corrida "monta e depois
		 * some"), e o `settled` abaixo estoura por timeout nomeando a condição. Esse é o RED esperado.
		 */
		it('REGRESSÃO 09/08: uma "Concluir" só, e a navegação para /dashboard FICA — o gate não devolve', async () => {
			const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
			await mount(queryClient)

			const steps = onboardingSteps([])
			for (let i = 0; i < steps.length - 1; i++) clickButton(NEXT())

			await mounted!.settled(() => {
				const button = [...mounted!.host.querySelectorAll('button')].find(b => b.textContent?.includes(GET_STARTED()))
				return !!button
			}, 'o botão Concluir aparecer')

			clickButton(GET_STARTED())

			await mounted!.settled(
				() => mounted!.router.state.location.pathname === '/dashboard' && mounted!.host.querySelector('[data-testid="dashboard"]') !== null,
				'chegar ao /dashboard e o gate deixar o console montar',
			)

			expect(mounted!.router.state.location.pathname).toBe('/dashboard')
			expect(mounted!.host.querySelector('[data-testid="dashboard"]')).not.toBeNull()
		})
	})
})
