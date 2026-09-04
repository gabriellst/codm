// packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.test.tsx
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root as ReactRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRouterState } from '@tanstack/react-router'
import { configureClient } from '@codm/client-typescript/http'
import { ContactKindEnum, type GetOnboardingQueryResponse, ProviderKindEnum } from '@codm/client-typescript/typescript'
import i18n from '@/lib/i18n'
import { OnboardingGate, resetOnboardingGateForTests } from '@/components/console/OnboardingGate'
import { type Bindings, Container, ServicesProvider } from '@/services'
import testBindings from '@/services/registry/test'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'
import { composeStories } from '../../../../../tests/support/storybook'
import { mountRouter, type MountedRouter } from '../../../../../tests/support/mountRouter'
import {
	useIntegrationBackend,
	type IntegrationBackend,
	INTEGRATION_BOOT_TIMEOUT_MS,
} from '../../../../../tests/support/integration-harness'
import { fetchStub } from '../../../../../tests/support/fetchStub'
import { useOnboardingSetupStore } from '../../-stores/useOnboardingSetupStore'
import { useOnboardingStore } from '../../-stores/useOnboardingStore'
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
 *   coberto por `index.services.test.tsx` (que atravessa toda a composição a caminho do fim).
 * - AC-10 ("abre DIRETO em FULL_DISK_ACCESS com completedAt gravado") é IMPRODUZÍVEL pelo harness:
 *   precisa dos três `*Done`, e `channelDone` esbarra no mesmo gap de `SetupChecklist`/`UserProfile`
 *   (tabelas do gateway Go, sem given exposto em `@codm/api-typescript/testing`) — foi para
 *   `index.stories.tsx` (`WithFullDiskAccessPending`), SÓ-VISUAL.
 *
 * O que sobra AQUI (sem importar nenhum pacote de backend — `import-direction#R5`): a abertura no
 * primeiro passo quando a leitura de onboarding É produzível (o caso "nada começou" —
 * `backend.reset()` sozinho já basta), e o gate `CAN_CONTINUE` provado com seeds PURAMENTE locais no
 * `useOnboardingSetupStore`. A REGRESSÃO CORONA ("concluir duas vezes"), o caso `FULL_DISK_ACCESS`
 * do mesmo gate, o RESUME e o "cada passo persiste via PATCH" — todos precisam de fatos REAIS de
 * banco (`givenChannel`/`givenWorkspace`/`givenRemote`) para o `CompleteOnboarding` atômico ler um
 * rascunho de verdade — moveram para `index.services.test.tsx` (ver o docblock daquele arquivo).
 *
 * 2026-08-26 — SEGUNDO bug do founder: "Próximo" avançava sem canal conectado, sem contato/provider
 * escolhido, sem workspace escolhido e sem revisão completa. `OnboardingFlow` ganhou um gate real
 * (`CAN_CONTINUE`, um `Record<StepId, boolean>` lido do estado AO VIVO — ver o docblock daquele
 * arquivo). A satisfação é por SEED DIRETO no `useOnboardingSetupStore`
 * (`useOnboardingSetupStore.getState().setX(...)`), não pela SDK mockada nem pela UI real de
 * CHANNEL/CONTACT/AGENTS — por dois motivos medidos, não por atalho:
 *   1. MSW é SÓ-VISUAL sob `bun test` (ruling do founder, `tests/support/storybook.ts`) — mockar a
 *      SDK via `@/storybook` não intercepta NADA aqui, só no Storybook real. A única rede que
 *      funciona neste arquivo é o backend de integração de verdade.
 *   2. O FATO por trás de CHANNEL/CONTACT/AGENTS — um device WhatsApp pareado, contatos reais, um
 *      provider CLI detectado — vem do gateway Go (`services: ['apiGo']`, opt-in, não usado aqui) e
 *      de binários instalados no host de CI (não-determinístico). `AttachThread` (a mutation real de
 *      REVIEW, hoje só dentro de `CompleteOnboarding`) valida os dois de verdade
 *      (`ChannelConnectivity.isConnected`, `ProviderDetector.resolve`) e rejeitaria qualquer canal/
 *      provider forjado — não é possível produzir esses fatos "de verdade" neste harness.
 * Seed direto no store é o MESMO canon dos `given` helpers do backend (root `CLAUDE.md`: "criam
 * estado direto via repositórios — nunca via use case") aplicado no cliente: não existe repositório
 * para alcançar daqui, então o store (a fonte que `CAN_CONTINUE` lê) faz esse papel. `WORKSPACE` é a
 * ÚNICA peça cuja seleção sobrevive intacta ao seed: `setWorkspaceId` sozinho já basta porque
 * `OnboardingWorkspaceStep` deriva `hasSelection` (e o `workspaceHasSelection` que sobe ao store) do
 * PRÓPRIO `workspaceId` ao montar — nenhum atalho adicional precisa existir para esse passo.
 *
 * `ServicesProvider`/`Container` (mesmo `testBindings` de `FullDiskAccessCard`) porque
 * `OnboardingWorkspaceStep` monta `AddWorkspaceForm`, que pede `useFilePicker()` do Container
 * incondicionalmente — sem ele, o passo WORKSPACE lançaria "useService usado fora do
 * ServicesProvider" no mount, não um erro de rede.
 *
 * `/go` (canal) não tem gateway real por trás do harness — `useIntegrationBackend()` aponta `go`
 * para a MESMA origem `typescript` (sem o prefixo `/external/channel` da produção), então o passo
 * CHANNEL bate em rotas que não existem e erra RÁPIDO (404, sem timeout) — seguro para atravessar
 * sem esperar assentar.
 */

const NEXT = () => i18n.t('onboarding.next')

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
	}, INTEGRATION_BOOT_TIMEOUT_MS)

	afterAll(async () => {
		await backend.stop()
	}, INTEGRATION_BOOT_TIMEOUT_MS)

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
	 *  a mesma técnica de `OnboardingGate.services.test.tsx`, uma camada acima. */
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

	function nextButton(): HTMLButtonElement {
		const button = [...mounted!.host.querySelectorAll('button')].find(b => b.textContent?.includes(NEXT()))
		if (!button) throw new Error(`button "${NEXT()}" not found`)
		return button as HTMLButtonElement
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

	/**
	 * O BUG relatado pelo founder em 2026-08-26, provado passo a passo: sem o fato de cada passo,
	 * "Próximo" fica desabilitado; assim que o fato é semeado (a MESMA fonte que a UI real grava —
	 * `useOnboardingSetupStore`), o botão libera. `CHANNEL`/`CONTACT`/`AGENTS`/`REVIEW` são REQUIRED
	 * (bloqueiam "Concluir" também, ver `steps.test.ts`); `WORKSPACE` é DEFERRABLE mas ainda assim
	 * gated aqui — o relato do founder incluía ele ("o mesmo vale para... workspace"). O caso
	 * `FULL_DISK_ACCESS` deste mesmo gate mora em `index.services.test.tsx` (precisa de
	 * `givenSetupFactsSatisfied`, que hoje também grava o rascunho REAL no servidor).
	 */
	describe('gate do "Próximo" — CAN_CONTINUE', () => {
		it('CHANNEL/WORKSPACE/CONTACT/AGENTS/REVIEW bloqueiam "Próximo" sem seu fato, e liberam com ele', async () => {
			const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
			await mount(queryClient)
			await mounted!.settled(() => (mounted!.host.textContent ?? '').includes(i18n.t('onboarding.slide1Title')), 'o slide 1 aparecer')

			// VALUE → HOW → CONTROL → CHANNEL — os três passos de intro são sempre INFORMATIVE, nunca
			// bloqueiam "Próximo".
			clickButton(NEXT())
			clickButton(NEXT())
			clickButton(NEXT())

			// CHANNEL
			expect(nextButton().disabled).toBe(true)
			act(() => useOnboardingSetupStore.getState().setChannelConnected(true))
			expect(nextButton().disabled).toBe(false)
			clickButton(NEXT())

			// WORKSPACE — `setWorkspaceId` sozinho basta: `OnboardingWorkspaceStep` deriva `hasSelection`
			// (e o `workspaceHasSelection` que sobe ao store) do PRÓPRIO `workspaceId` ao (re)renderizar.
			expect(nextButton().disabled).toBe(true)
			act(() => useOnboardingSetupStore.getState().setWorkspaceId(crypto.randomUUID()))
			expect(nextButton().disabled).toBe(false)
			clickButton(NEXT())

			// CONTACT
			expect(nextButton().disabled).toBe(true)
			act(() =>
				useOnboardingSetupStore.getState().setContactRef({
					channelId: crypto.randomUUID(),
					externalId: 'test-contact',
					displayName: 'Test Contact',
					kind: ContactKindEnum.USER,
				}),
			)
			expect(nextButton().disabled).toBe(false)
			clickButton(NEXT())

			// AGENTS
			expect(nextButton().disabled).toBe(true)
			act(() => useOnboardingSetupStore.getState().setProviders([ProviderKindEnum.CLAUDE_CODE]))
			expect(nextButton().disabled).toBe(false)
			clickButton(NEXT())

			// REVIEW — chega JÁ satisfeito (contactRef/workspaceId/providers semeados acima, pelos
			// próprios passos anteriores): prova o bloqueio esvaziando UM campo (`providers: []` — o
			// setter é tipado sem `undefined`, um array vazio é o valor "nada escolhido" válido) e
			// restaurando, em vez de reconstruir o fluxo do zero para um passo cujo gate é o MESMO
			// schema em todos os campos.
			expect(nextButton().disabled).toBe(false)
			act(() => useOnboardingSetupStore.getState().setProviders([]))
			expect(nextButton().disabled).toBe(true)
			act(() => useOnboardingSetupStore.getState().setProviders([ProviderKindEnum.CLAUDE_CODE]))
			expect(nextButton().disabled).toBe(false)
		})
	})
})

/**
 * 2026-08-27 fix — `manualNavRef` em `OnboardingFlow` (ver o docblock do efeito de semeadura). O bug:
 * a leitura de `useGetOnboarding()` chega ASSINCRONAMENTE, e nada garantia que ela resolvesse ANTES
 * do primeiro clique do operador — quando chegava DEPOIS, o efeito de semeadura reexecutava e chamava
 * `setCurrentSlide` de volta ao passo semeado, perdendo o clique. Medido em
 * `index.services.test.tsx` ("chegam ao rascunho do servidor…"): ~30% das vezes, rodando sozinho, o
 * PATCH de `currentStep` saía DUPLICADO porque o wizard voltou ao índice 0 entre o 1º e o 2º avanço.
 *
 * Este caso PROVA a ordem em vez de esperar por ela: `fetchStub` segura a resposta de `/ui/onboarding`
 * atrás de uma promise controlada à mão (`held`), o teste clica "Próximo" ENQUANTO ela ainda está
 * pendurada, e só DEPOIS a libera — reproduzindo deterministicamente o "clique antes da leitura
 * chegar" sem depender de uma corrida real contra um backend de verdade (por isso este describe NÃO
 * usa `useIntegrationBackend()` — o resto do arquivo usa o backend real justamente porque MSW não
 * intercepta sob `bun test`, mas aqui o que importa é a ORDEM dos dois eventos, não o conteúdo da
 * resposta, e `spyOn(globalThis, 'fetch')` dá controle total sobre ela; mesmo seam de
 * `SessionChatSection/index.test.tsx`).
 */
describe('OnboardingFlow — a leitura de onboarding não pisa em navegação manual', () => {
	let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>
	let mounted: MountedRouter | null = null

	beforeAll(() => {
		// URL absoluta qualquer — nunca alcançada de verdade, `fetchSpy` abaixo intercepta tudo antes
		// que qualquer coisa saia para a rede.
		configureClient({ typescript: 'http://127.0.0.1:65535' })
	})

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		useOnboardingStore.getState().reset()
		useOnboardingSetupStore.getState().reset()
		useSystemPreconditionsStore.getState().reset()
	})

	afterEach(() => {
		mounted?.unmount()
		mounted = null
		fetchSpy?.mockRestore()
	})

	function json(body: unknown): Response {
		return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
	}

	it('operador avança para HOW antes da leitura de onboarding chegar — o wizard CONTINUA em HOW quando ela chega', async () => {
		let releaseOnboarding: (() => void) | undefined
		const held = new Promise<void>(resolve => {
			releaseOnboarding = resolve
		})

		fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
			fetchStub(async input => {
				const url = String(input instanceof Request ? input.url : input)
				if (url.includes('/ui/onboarding')) {
					// Segura a resposta até o teste liberar explicitamente — é o que garante que o clique
					// abaixo aconteça ENQUANTO a leitura ainda está em voo.
					await held
					const fresh: GetOnboardingQueryResponse = {
						currentStep: 'VALUE',
						completedAt: null,
						state: {},
						channelDone: false,
						workspaceDone: false,
						threadDone: false,
					}
					return json(fresh)
				}
				throw new Error(`unexpected request: ${url}`)
			}),
		)

		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		mounted = await mountRouter(
			<QueryClientProvider client={queryClient}>
				<OnboardingFlow />
			</QueryClientProvider>,
			{ path: '/onboarding' },
		)

		expect(mounted.host.textContent ?? '').toContain(i18n.t('onboarding.slide1Title'))

		// Navegação MANUAL — a leitura de onboarding acima ainda está pendurada em `held`.
		const nextButton = [...mounted.host.querySelectorAll('button')].find(b => b.textContent?.includes(NEXT()))
		if (!nextButton) throw new Error(`button "${NEXT()}" not found`)
		act(() => nextButton.click())
		expect(mounted.host.textContent ?? '').toContain(i18n.t('onboarding.slide2Title'))

		// SÓ AGORA a leitura resolve — é exatamente o instante que costumava repor o índice em 0.
		releaseOnboarding?.()
		await mounted.settled(() => queryClient.isFetching() === 0, 'a leitura de onboarding resolver')

		expect(useOnboardingStore.getState().currentSlide).toBe(1)
		expect(mounted.host.textContent ?? '').toContain(i18n.t('onboarding.slide2Title'))
	})
})
