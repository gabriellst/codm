// packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.test.tsx
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root as ReactRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRouterState } from '@tanstack/react-router'
import { ContactKindEnum, ProviderKindEnum } from '@codm/client-typescript/typescript'
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
import { onboardingSteps, type StepId } from '../steps'
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
 * 2026-08-26 — SEGUNDO bug do founder: "Próximo" avançava sem canal conectado, sem contato/provider
 * escolhido, sem workspace escolhido e sem revisão completa. `OnboardingFlow` ganhou um gate real
 * (`CAN_CONTINUE`, um `Record<StepId, boolean>` lido do estado AO VIVO — ver o docblock daquele
 * arquivo), então a REGRESSÃO CORONA abaixo — que clicava "Próximo" por TODOS os passos sem nunca
 * selecionar nada — pararia de chegar a "Concluir". A correção NÃO relaxa o gate para o teste passar:
 * ela SATISFAZ cada passo antes de clicar, exatamente como o operador precisaria fazer.
 *
 * A satisfação é por SEED DIRETO no `useOnboardingSetupStore` (`useOnboardingSetupStore.getState().
 * setX(...)`), não pela SDK mockada nem pela UI real de CHANNEL/CONTACT/AGENTS — por dois motivos
 * medidos, não por atalho:
 *   1. MSW é SÓ-VISUAL sob `bun test` (ruling do founder, `tests/support/storybook.ts`) — mockar a
 *      SDK via `@/storybook` não intercepta NADA aqui, só no Storybook real. A única rede que
 *      funciona neste arquivo é o backend de integração de verdade.
 *   2. O FATO por trás de CHANNEL/CONTACT/AGENTS — um device WhatsApp pareado, contatos reais, um
 *      provider CLI detectado — vem do gateway Go (`services: ['apiGo']`, opt-in, não usado aqui) e
 *      de binários instalados no host de CI (não-determinístico) — o MESMO gap documentado acima
 *      para `channelDone`/AC-10. `AttachThread` (a mutation real de REVIEW) valida os dois de verdade
 *      (`ChannelConnectivity.isConnected`, `ProviderDetector.resolve`) e rejeitaria qualquer canal/
 *      provider forjado — não é possível produzir esses fatos "de verdade" neste harness.
 * Seed direto no store é o MESMO canon dos `given` helpers do backend (root `CLAUDE.md`: "criam
 * estado direto via repositórios — nunca via use case") aplicado no cliente: não existe repositório
 * para alcançar daqui, então o store (a fonte que `CAN_CONTINUE` lê) faz esse papel. `threadAttached`
 * é semeado JUNTO para que `OnboardingReviewStep` NUNCA registre um `confirmStep` real (seu próprio
 * efeito: `canFinish && !threadAttached`) — sem isso "Próximo" em REVIEW tentaria a mutation
 * `AttachThread` de verdade contra canal/provider forjados e rejeitaria. `WORKSPACE` é a ÚNICA peça
 * cuja seleção sobrevive intacta ao seed: `setWorkspaceId` sozinho já basta porque
 * `OnboardingWorkspaceStep` deriva `hasSelection` (e o `workspaceHasSelection` que sobe ao store)
 * do PRÓPRIO `workspaceId` ao montar — nenhum atalho adicional precisa existir para esse passo.
 *
 * `ServicesProvider`/`Container` (mesmo `testBindings` de `FullDiskAccessCard`) porque
 * `OnboardingWorkspaceStep` monta `AddWorkspaceForm`, que pede `useFilePicker()` do Container
 * incondicionalmente — sem ele, o passo WORKSPACE (que a regressão atravessa a caminho do fim)
 * lançaria "useService usado fora do ServicesProvider" no mount, não um erro de rede.
 *
 * `/go` (canal) não tem gateway real por trás do harness — `useIntegrationBackend()` aponta `go`
 * para a MESMA origem `typescript` (sem o prefixo `/external/channel` da produção), então o passo
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

	function nextButton(): HTMLButtonElement {
		const button = [...mounted!.host.querySelectorAll('button')].find(b => b.textContent?.includes(NEXT()))
		if (!button) throw new Error(`button "${NEXT()}" not found`)
		return button as HTMLButtonElement
	}

	/**
	 * Semeia, DIRETO no store, o fato por trás de WORKSPACE/CONTACT/AGENTS/REVIEW — ver o docblock da
	 * regressão CORONA abaixo para por que é seed e não SDK mockada/UI real. `threadAttached: true` é
	 * o que impede `OnboardingReviewStep` de tentar a mutation `AttachThread` de verdade contra um
	 * canal/provider forjados. SAFE de chamar ANTES de qualquer um desses passos montar: nenhum dos
	 * quatro componentes reescreve estes campos ao montar, só DERIVA valores a partir deles.
	 *
	 * NÃO inclui `channelConnected` — CHANNEL é diferente (ver `clickThroughStep` abaixo): a MONTAGEM
	 * de `ConnectChannelForm` dispara seu próprio efeito (`onConnectedChange(isConnected)`) com
	 * `isConnected` começando `false`, o que sobrescreveria um seed feito ANTES dela montar.
	 */
	function givenSetupFactsSatisfied(): void {
		act(() => {
			useOnboardingSetupStore.getState().setWorkspaceId(crypto.randomUUID())
			useOnboardingSetupStore.getState().setContactRef({
				channelId: crypto.randomUUID(),
				externalId: 'test-contact',
				displayName: 'Test Contact',
				kind: ContactKindEnum.USER,
			})
			useOnboardingSetupStore.getState().setProviders([ProviderKindEnum.CLAUDE_CODE])
			useOnboardingSetupStore.getState().setThreadAttached(true)
		})
	}

	/**
	 * Clica "Próximo" a partir do passo `id` (que já deve estar montado/visível), semeando o fato de
	 * CHANNEL bem ali — DEPOIS de `ConnectChannelForm` montar, nunca antes. Essa forma real conecta a
	 * gateway Go (ausente por padrão neste harness — `useIntegrationBackend`'s próprio docblock), então
	 * `isConnected` nunca resolve `true` sozinho: o próprio mount da forma dispara `onConnectedChange(false)`
	 * (seu efeito, com o valor inicial), que sobrescreveria um `channelConnected` semeado ANTES dela
	 * existir. Semear DEPOIS é o que sobrevive.
	 */
	function clickThroughStep(id: StepId): void {
		if (id === 'CHANNEL') act(() => useOnboardingSetupStore.getState().setChannelConnected(true))
		clickButton(NEXT())
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
			givenSetupFactsSatisfied()

			const steps = onboardingSteps([])
			for (let i = 0; i < steps.length - 1; i++) clickThroughStep(steps[i])

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
			// NO EXPLICIT TIMEOUT HERE, and that is the conclusion of a measurement rather than an
			// omission. This case used to fail by 2-4ms against bun:test's 5000ms default (measured at
			// 5002.44ms and 5003.87ms), and the obvious reading — "it boots a real backend, give it a
			// bigger budget" — was WRONG. The real cause was `NODE_ENV`: nx is launched from the repo
			// root, inherits `NODE_ENV=development` from the root `.env`, and React/Storybook/msw then
			// resolve a dev-mode module graph. Under `NODE_ENV=test` these 5 cases run in 1219ms TOTAL;
			// under `development` this one alone took 5604ms. A 4.6x difference is not a tight budget.
			//
			// So the budget stayed at the default and the environment got pinned instead
			// (`project.json` target env + the assertion in `tests/setup.ts`). Raising the timeout here
			// would have hidden the cause and left the other two failures unexplained.
		})
	})

	/**
	 * O BUG relatado pelo founder em 2026-08-26, provado passo a passo: sem o fato de cada passo,
	 * "Próximo" fica desabilitado; assim que o fato é semeado (a MESMA fonte que a UI real grava —
	 * `useOnboardingSetupStore`), o botão libera. `CHANNEL`/`CONTACT`/`AGENTS`/`REVIEW` são REQUIRED
	 * (bloqueiam "Concluir" também, ver `steps.test.ts`); `WORKSPACE` é DEFERRABLE mas ainda assim
	 * gated aqui — o relato do founder incluía ele ("o mesmo vale para... workspace").
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

		/**
		 * FULL_DISK_ACCESS não tem gesto de "confirmar" — o passo só EXISTE em `steps` ENQUANTO a
		 * pré-condição está pendente (`onboardingSteps` compõe a partir de `pending`, `../steps.ts`),
		 * então estar nele JÁ é estar insatisfeito. `CAN_CONTINUE.FULL_DISK_ACCESS` é `false`
		 * incondicional — só o host resolvendo a permissão (fora do escopo deste teste; reprovado no
		 * foco da janela) tira o passo da lista e destrava o wizard sozinho.
		 */
		it('FULL_DISK_ACCESS bloqueia "Próximo" incondicionalmente enquanto pendente', async () => {
			useSystemPreconditionsStore.getState().apply([{ id: 'FULL_DISK_ACCESS', satisfied: false, repair: 'AVAILABLE' }])
			const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
			await mount(queryClient)
			await mounted!.settled(() => (mounted!.host.textContent ?? '').includes(i18n.t('onboarding.slide1Title')), 'o slide 1 aparecer')
			givenSetupFactsSatisfied()

			const steps = onboardingSteps(['FULL_DISK_ACCESS'])
			const fullDiskAccessIndex = steps.indexOf('FULL_DISK_ACCESS')
			for (let i = 0; i < fullDiskAccessIndex; i++) clickThroughStep(steps[i])

			expect(nextButton().disabled).toBe(true)
		})
	})
})
