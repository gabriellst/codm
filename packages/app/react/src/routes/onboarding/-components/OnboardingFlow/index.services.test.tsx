// packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.services.test.tsx
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRouterState } from '@tanstack/react-router'
import { givenChannel, givenRemote, givenWorkspace } from '@codm/api-typescript/testing'
import { ContactKindEnum, getOnboarding, ProviderKindEnum, saveOnboardingStep } from '@codm/client-typescript/typescript'
import i18n from '@/lib/i18n'
import { OnboardingGate, resetOnboardingGateForTests } from '@/components/console/OnboardingGate'
import { type Bindings, Container, ServicesProvider } from '@/services'
import testBindings from '@/services/registry/test'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'
import { mountRouter, type MountedRouter } from '../../../../../tests/support/mountRouter'
import { useIntegrationBackend, type IntegrationBackend } from '../../../../../tests/support/integration-harness'
import { useOnboardingSetupStore } from '../../-stores/useOnboardingSetupStore'
import { useOnboardingStore } from '../../-stores/useOnboardingStore'
import { onboardingSteps, type StepId } from '../steps'
import { OnboardingFlow } from './index'

/**
 * `.services.test.tsx` (import-direction#R5) — split out of `index.test.tsx` (2026-08-26,
 * draft/atomic-commit rewrite) the moment `givenSetupFactsSatisfied` started seeding a REAL server
 * draft: `CompleteOnboarding` now materializes from `Onboarding.state`, not from anything a fake
 * local `useOnboardingSetupStore` seed can fabricate, so proving "Concluir" (and any resume/PATCH
 * behavior that depends on real DB facts — a connected channel, a registered workspace, a real
 * contact) needs `@codm/api-typescript/testing`'s `given*` helpers — a backend workspace import the
 * app itself never makes (CLAUDE.md), sanctioned here by the SAME naming convention
 * `AttachThreadWizard/index.services.test.tsx` and `SetupChecklist/index.services.test.tsx` already
 * use. `index.test.tsx` keeps everything provable with PURE local-store seeds (no backend package
 * import): the "sem progresso nenhum" case and the CAN_CONTINUE gate's own live-toggle assertions.
 *
 * See `index.test.tsx`'s own docblock for the full history (T11 rewrite against the real backend,
 * the 09/08 "concluir duas vezes" regression, the 2026-08-26 CAN_CONTINUE gate). This file only adds
 * the NEW draft/atomic-commit coverage that needs real DB facts:
 *   - REGRESSÃO 09/08, end-to-end, now against a REAL `CompleteOnboarding` commit (workspace +
 *     thread actually materialize).
 *   - FULL_DISK_ACCESS blocking "Próximo" unconditionally, reached via the same real-draft path.
 *   - RESUME: a rascunho + `currentStep` saved server-side survives a fresh mount.
 *   - Each step's PATCH landing on the server draft the instant a real row/tile is clicked.
 */
const NEXT = () => i18n.t('onboarding.next')
const GET_STARTED = () => i18n.t('onboarding.getStarted')

describe('OnboardingFlow — contra o backend real (rascunho/commit atômico)', () => {
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

	/** O MESMO par de rotas que `(app)/route.tsx` compõe em produção — ver `index.test.tsx`'s `Root`. */
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

	/** `clickButton` only ever queries real `<button>` elements — `AgentsStep`'s own row is a plain
	 *  `div[role="button"]` (a real `<button>` cannot nest its row's interactive `Select`, per that
	 *  component's own docblock), so a click-a-real-selection helper needs to look at BOTH. */
	function clickRowWithText(text: string): void {
		const el = [...mounted!.host.querySelectorAll('button, [role="button"]')].find(e => e.textContent?.includes(text))
		if (!el) throw new Error(`row "${text}" not found`)
		act(() => (el as HTMLElement).click())
	}

	/** `MountedRouter.settled`'s predicate is SYNCHRONOUS (`() => boolean`) — a background PATCH's
	 *  success has no DOM signal to poll for (these mutations render no inline feedback), so waiting
	 *  for one needs its OWN loop against a fresh `getOnboarding()` read each attempt, never the
	 *  cache. Same shape as `settled` (bounded attempts, `act()`-wrapped sleep so React updates keep
	 *  flushing), just over a network read instead of the DOM. */
	async function waitForDraft(check: (state: Awaited<ReturnType<typeof getOnboarding>>['state']) => boolean, label: string): Promise<void> {
		for (let attempt = 0; attempt < 200; attempt++) {
			const draft = await getOnboarding()
			if (check(draft.state)) return
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10))
			})
		}
		throw new Error(`waitForDraft: ${label} nunca aconteceu`)
	}

	/**
	 * Semeia, DIRETO no store, o fato por trás de WORKSPACE/CONTACT/AGENTS/REVIEW — ver o docblock da
	 * regressão CORONA abaixo para por que é seed e não SDK mockada/UI real.
	 *
	 * NÃO inclui `channelConnected` — CHANNEL é diferente (ver `clickThroughStep` abaixo): a MONTAGEM
	 * de `ConnectChannelForm` dispara seu próprio efeito (`onConnectedChange(isConnected)`) com
	 * `isConnected` começando `false`, o que sobrescreveria um seed feito ANTES dela montar.
	 *
	 * 2026-08-26 — draft/atomic-commit rewrite: seed no store SOZINHO deixou de bastar. `REVIEW` não
	 * chama mais `AttachThread` por si — só "Concluir" (`CompleteOnboarding`) materializa, e ele lê o
	 * RASCUNHO DO SERVIDOR (`Onboarding.state`), não este store local. Por isso este helper agora
	 * TAMBÉM faz o PATCH real (`saveOnboardingStep`, direto pela SDK — o mesmo canon `given*` do
	 * backend, "criam estado direto via repositórios", aplicado aqui a um fato de fio porque não há
	 * `OnboardingRepository` alcançável deste lado): uma `givenChannel` real CONECTADA (para
	 * `AttachThread`'s `ChannelConnectivity` gate) + `CLAUDE_CODE` (o `MockProviderDetector` do env
	 * `integration` reporta DETECTED por padrão) + um path absoluto novo (para `AddWorkspace` criar de
	 * verdade). `contactRef`/`providers` semeados no STORE usam os MESMOS valores do PATCH — não é
	 * cosmético: é o que faz a REGRESSÃO CORONA (que clica "Concluir" de verdade) achar o rascunho
	 * completo no servidor quando chegar lá.
	 *
	 * WORKSPACE é a ÚNICA exceção deliberada — o store recebe um `workspaceId` FAKE (`crypto.
	 * randomUUID()`), NUNCA o `workspacePath` real do PATCH. Semear `workspacePath` faria
	 * `OnboardingWorkspaceStep` ler esse valor pro campo `path` do form (`pendingPath` não-vazio), o
	 * que registra um `confirmStep` de verdade — e "Próximo" nesse passo passaria a esperar uma
	 * mutation de rede (`saveOnboardingStep`) antes de avançar, quebrando exatamente a garantia que a
	 * REGRESSÃO CORONA documenta ("clica Próximo em todo passo sem `await` entre os cliques"). Um
	 * `workspaceId` fake mantém `pendingPath` vazio (`OnboardingWorkspaceStep`'s form só usa
	 * `workspacePath` quando `workspaceId` está ausente) — `confirmStep` fica `undefined`, "Próximo"
	 * continua síncrono, e `hasSelection` (`!!workspaceId`) já é suficiente pro gate local. O rascunho
	 * REAL do servidor (o que `CompleteOnboarding` de fato lê) veio do PATCH acima, com o path de
	 * verdade — os dois nunca precisam concordar, um é fato de UI, o outro é fato de fio.
	 */
	async function givenSetupFactsSatisfied(): Promise<void> {
		const { channelId } = await givenChannel(backend.asTestBed())
		const contactRef = { channelId, externalId: 'test-contact', displayName: 'Test Contact', kind: ContactKindEnum.USER }
		const providers = [ProviderKindEnum.CLAUDE_CODE]
		const workspacePath = '/tmp/onboarding-flow-test-workspace'
		await saveOnboardingStep({ state: { contactRef, workspace: { path: workspacePath }, providers } })
		act(() => {
			useOnboardingSetupStore.getState().setContactRef(contactRef)
			useOnboardingSetupStore.getState().setProviders(providers)
			useOnboardingSetupStore.getState().setWorkspaceId(crypto.randomUUID())
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

	describe('concluir', () => {
		/**
		 * A REGRESSÃO DE 09/08 ("cliquei em concluir duas vezes, a primeira não pegou"), como
		 * comportamento ponta a ponta contra o backend real: conclui UMA VEZ, navega para `/dashboard`,
		 * e o `OnboardingGate` que monta lá NÃO devolve — porque a invalidação (`await
		 * queryClient.invalidateQueries(...)` em `index.tsx`, antes do `navigate`) já deixou o cache com
		 * o `completedAt` fresco antes do gate ler. Desde o draft/atomic-commit rewrite, "Concluir"
		 * também materializa workspace + thread DE VERDADE (`CompleteOnboarding`) — o rascunho que
		 * `givenSetupFactsSatisfied` grava no servidor é o que o torna possível.
		 *
		 * O testid do dashboard só aparece se o gate deixar passar: `OnboardingGate` retorna
		 * `<Navigate to="/onboarding" replace/>` SEM renderizar `children` quando `completedAt` está
		 * ausente — então, sob o bug, o testid nunca chega a montar (não é uma corrida "monta e depois
		 * some"), e o `settled` abaixo estoura por timeout nomeando a condição. Esse é o RED esperado.
		 */
		it('REGRESSÃO 09/08: uma "Concluir" só, e a navegação para /dashboard FICA — o gate não devolve', async () => {
			const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
			await mount(queryClient)
			await givenSetupFactsSatisfied()

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
		})
	})

	/**
	 * FULL_DISK_ACCESS não tem gesto de "confirmar" — o passo só EXISTE em `steps` ENQUANTO a
	 * pré-condição está pendente (`onboardingSteps` compõe a partir de `pending`, `../steps.ts`),
	 * então estar nele JÁ é estar insatisfeito. `CAN_CONTINUE.FULL_DISK_ACCESS` é `false`
	 * incondicional — só o host resolvendo a permissão (fora do escopo deste teste; reprovado no
	 * foco da janela) tira o passo da lista e destrava o wizard sozinho. `index.test.tsx` cobre o
	 * resto do gate `CAN_CONTINUE` com seeds puramente locais; este caso precisa do backend real
	 * porque atravessa `givenSetupFactsSatisfied` a caminho da pré-condição.
	 */
	describe('gate do "Próximo" — CAN_CONTINUE (FULL_DISK_ACCESS)', () => {
		it('FULL_DISK_ACCESS bloqueia "Próximo" incondicionalmente enquanto pendente', async () => {
			useSystemPreconditionsStore.getState().apply([{ id: 'FULL_DISK_ACCESS', satisfied: false, repair: 'AVAILABLE' }])
			const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
			await mount(queryClient)
			await mounted!.settled(() => (mounted!.host.textContent ?? '').includes(i18n.t('onboarding.slide1Title')), 'o slide 1 aparecer')
			await givenSetupFactsSatisfied()

			const steps = onboardingSteps(['FULL_DISK_ACCESS'])
			const fullDiskAccessIndex = steps.indexOf('FULL_DISK_ACCESS')
			for (let i = 0; i < fullDiskAccessIndex; i++) clickThroughStep(steps[i])

			expect(nextButton().disabled).toBe(true)
		})
	})

	/**
	 * O BUG ORIGINAL desta feature (2026-08-25, founder): um reboot no meio do onboarding perdia a
	 * thread reatachada e o workspace escolhido — porque `currentStep` nunca era salvo (o console nunca
	 * chamava `SaveOnboardingStep`) e contato/providers/workspace só existiam num Zustand sem
	 * `persist`. Este teste prova o fix ponta a ponta: um rascunho salvo DIRETO no servidor (sem passar
	 * pela UI — o `given*` desta suíte, mesmo canon do backend) com `currentStep` no meio do fluxo é
	 * exatamente o que uma nova entrada em `/onboarding` (um reboot) encontra.
	 */
	describe('resume — o rascunho sobrevive a um reboot', () => {
		it('RESUME: currentStep=AGENTS + state cheio reabrem o wizard em AGENTS, com o store hidratado e "Próximo" liberado', async () => {
			const { channelId } = await givenChannel(backend.asTestBed())
			const contactRef = { channelId, externalId: 'resume-contact', displayName: 'Resume Contact', kind: ContactKindEnum.USER }
			const providers = [ProviderKindEnum.CLAUDE_CODE]
			const workspacePath = '/tmp/onboarding-resume-test-workspace'
			await saveOnboardingStep({ currentStep: 'AGENTS', state: { contactRef, workspace: { path: workspacePath }, providers } })

			const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
			await mount(queryClient)

			await mounted!.settled(
				() => (mounted!.host.textContent ?? '').includes(i18n.t('attach.stepAgentsTitle')),
				'o wizard reabrir direto em AGENTS',
			)

			// O store foi HIDRATADO a partir do rascunho do servidor — não é a UI de AGENTS que preenche
			// isto (ela só LÊ `providers` do store para marcar a linha selecionada); CONTACT/WORKSPACE
			// nem chegaram a montar nesta visita.
			expect(useOnboardingSetupStore.getState().contactRef).toEqual(contactRef)
			expect(useOnboardingSetupStore.getState().providers).toEqual(providers)
			expect(useOnboardingSetupStore.getState().workspacePath).toBe(workspacePath)
			expect(useOnboardingSetupStore.getState().workspaceId).toBeUndefined()

			// AGENTS já chega com seu próprio fato satisfeito (providers hidratados) — "Próximo" libera
			// sem precisar escolher de novo.
			expect(nextButton().disabled).toBe(false)
		})
	})

	/**
	 * O CONTRATO NOVO, provado passo a passo: WORKSPACE/CONTACT/AGENTS param de materializar na hora
	 * (`AddWorkspace`/`AttachThread`) e passam a `PATCH /ui/onboarding/step` com o grupo do `state` que
	 * cada um possui — o que faz `givenSetupFactsSatisfied`'s seed direto no servidor (usado pelas
	 * outras suítes acima) ser fiel ao que a UI real produz. Contra o backend de integração de verdade
	 * — cada seleção lida de volta via `getOnboarding()`, uma leitura fresca, nunca o cache do React
	 * Query.
	 */
	describe('cada passo persiste seu grupo via PATCH', () => {
		it('WORKSPACE (existingWorkspaceId), CONTACT e AGENTS chegam ao rascunho do servidor assim que selecionados', async () => {
			const { channelId } = await givenChannel(backend.asTestBed())
			const workspace = await givenWorkspace(backend.asTestBed(), { path: '/tmp/onboarding-flow-patch-test-workspace' })
			await givenRemote(backend.asTestBed(), { channelId, remoteId: '5511999990002@s.whatsapp.net', name: 'Grace Hopper' })

			const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
			await mount(queryClient)
			await mounted!.settled(() => (mounted!.host.textContent ?? '').includes(i18n.t('onboarding.slide1Title')), 'o slide 1 aparecer')
			// A leitura inicial de onboarding TEM que assentar ANTES do primeiro clique — este teste,
			// diferente dos outros da suíte, semeia `channelDone`/`workspaceDone` REAIS (`givenChannel`/
			// `givenWorkspace`) ANTES do mount. O efeito de semeadura de `OnboardingFlow` (que reposiciona
			// `currentSlide` via `firstUnvanquishedStep` assim que a leitura chega) é one-shot — se ele
			// disparar DEPOIS de já termos navegado manualmente (a leitura ainda em voo quando o slide 1
			// aparece não é garantia de leitura RESOLVIDA), ele reescreve a posição por cima da navegação
			// manual. `queryClient.isFetching() === 0` (mesma técnica de `OnboardingGate.test.tsx`) é o
			// sinal real de "a leitura concluiu"; `slide1Title` sozinho só prova o DEFAULT render.
			let attempts = 0
			await mounted!.settled(() => {
				attempts++
				return attempts > 1 && queryClient.isFetching() === 0
			}, 'a leitura inicial de onboarding assentar')

			// VALUE → HOW → CONTROL → CHANNEL: `channelDone` já é `true` (o `givenChannel` acima é uma
			// CONEXÃO real), então "Próximo" já libera em CHANNEL sem precisar fingir `channelConnected`.
			clickButton(NEXT())
			clickButton(NEXT())
			clickButton(NEXT())
			await mounted!.settled(() => !nextButton().disabled, 'CHANNEL liberar (channelDone real)')
			clickButton(NEXT())

			// WORKSPACE — clica a tile JÁ REGISTRADA (não o fluxo de path novo, coberto pelo mecanismo
			// compartilhado com `/attach`'s `WorkspaceStep` — ver `add-folder.test.tsx`).
			await mounted!.settled(() => (mounted!.host.textContent ?? '').includes('onboarding-flow-patch-test-workspace'), 'a tile aparecer')
			clickRowWithText('onboarding-flow-patch-test-workspace')
			await waitForDraft(
				state => state.workspace?.existingWorkspaceId === workspace.id.value,
				'o PATCH de WORKSPACE (existingWorkspaceId) chegar ao servidor',
			)
			clickButton(NEXT())

			// CONTACT — clica a linha do contato semeado.
			await mounted!.settled(() => (mounted!.host.textContent ?? '').includes('Grace Hopper'), 'o contato semeado aparecer')
			clickRowWithText('Grace Hopper')
			await waitForDraft(state => state.contactRef?.displayName === 'Grace Hopper', 'o PATCH de CONTACT (contactRef) chegar ao servidor')
			clickButton(NEXT())

			// AGENTS — clica a linha do provider (um `div[role="button"]`, não um `<button>`).
			await mounted!.settled(() => (mounted!.host.textContent ?? '').includes('Claude Code'), 'a linha do provider aparecer')
			clickRowWithText('Claude Code')
			await waitForDraft(
				state => (state.providers ?? []).includes(ProviderKindEnum.CLAUDE_CODE),
				'o PATCH de AGENTS (providers) chegar ao servidor',
			)

			const draft = await getOnboarding()
			expect(draft.state.workspace).toEqual({ existingWorkspaceId: workspace.id.value })
			expect(draft.state.contactRef?.displayName).toBe('Grace Hopper')
			expect(draft.state.providers).toEqual([ProviderKindEnum.CLAUDE_CODE])
		})
	})
})
