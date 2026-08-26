import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { ContactKind, OnboardingStep, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenWorkspace, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { WorkspaceRepository } from '@workspace/repositories/WorkspaceRepository'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { ChannelConnectivity } from '@thread/services/ChannelConnectivity'
import { OnboardingRepository } from '../repositories/OnboardingRepository'
import { CompleteOnboarding } from './CompleteOnboarding'
import { SaveOnboardingStep } from './SaveOnboardingStep'

// O plano cita `OWNER = 'integration-tenant'`, mas `ownerId` é `z.uuid()` na Onboarding entity — uma
// string não-UUID quebra `INVALID_ENTITY` ao salvar. Segue o mesmo padrão de GetOnboarding.test.ts:
// `MOCK_CLOUD_OWNER_ID`, que também é o default de todo `given*` helper.
const OWNER = MOCK_CLOUD_OWNER_ID

/**
 * PATCH INCREMENTAL + COMMIT ATÔMICO (spec 2026-08-26) — a substituição de "cada passo escreve na
 * hora". `SaveOnboardingStep` só acumula rascunho (`currentStep`/`state`), nunca materializa
 * `Workspace`/`Thread`; `CompleteOnboarding` é o ÚNICO lugar que faz isso, dentro de UMA transação.
 */
describe('CompleteOnboarding / SaveOnboardingStep', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let complete: CompleteOnboarding
	let saveStep: SaveOnboardingStep
	let repo: OnboardingRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
		repo = testBed.resolve(OnboardingRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
		// AttachThread's connectivity gate — mocked true by default, same as AttachThread.test.ts.
		// MUST override BEFORE resolving `complete`/`saveStep`: `CompleteOnboarding` composes
		// `AttachThread`, which injects `ChannelConnectivity` at CONSTRUCTION time — resolving once in
		// `beforeAll` would freeze the pre-override (real) implementation into every test.
		testBed.override(ChannelConnectivity, { isConnected: async () => true, anyConnected: async () => true } as ChannelConnectivity)
		complete = testBed.resolve(CompleteOnboarding)
		saveStep = testBed.resolve(SaveOnboardingStep)
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const fullDraftContactRef = () => ({
		channelId: uuidv7(),
		externalId: `contact-${uuidv7()}`,
		displayName: 'Ada',
		kind: ContactKind.USER,
	})

	describe('SaveOnboardingStep — o PATCH incremental', () => {
		it('cria a linha na primeira vez e atualiza currentStep depois', async () => {
			await saveStep.execute({ ownerId: OWNER, currentStep: OnboardingStep.CHANNEL })
			expect((await repo.findByOwnerId(OWNER))?.currentStep).toBe(OnboardingStep.CHANNEL)

			await saveStep.execute({ ownerId: OWNER, currentStep: OnboardingStep.AGENTS })
			expect((await repo.findByOwnerId(OWNER))?.currentStep).toBe(OnboardingStep.AGENTS)
		})

		/**
		 * O PONTO DO RASCUNHO: cada passo manda só o grupo que possui, e os grupos anteriores
		 * sobrevivem — é isso que sobrevive a um reboot em vez de ficar só na memória do console.
		 */
		it('acumula o rascunho por PATCH — contactRef de um passo sobrevive ao providers de outro', async () => {
			const contactRef = fullDraftContactRef()

			await saveStep.execute({ ownerId: OWNER, currentStep: OnboardingStep.CONTACT, state: { contactRef } })
			await saveStep.execute({
				ownerId: OWNER,
				currentStep: OnboardingStep.WORKSPACE,
				state: { workspace: { path: '/Users/dev/acme-api' } },
			})
			await saveStep.execute({ ownerId: OWNER, currentStep: OnboardingStep.AGENTS, state: { providers: [ProviderKind.CLAUDE_CODE] } })

			const onboarding = await repo.findByOwnerId(OWNER)
			expect(onboarding?.currentStep).toBe(OnboardingStep.AGENTS)
			expect(onboarding?.state).toEqual({
				contactRef,
				workspace: { path: '/Users/dev/acme-api' },
				providers: [ProviderKind.CLAUDE_CODE],
			})
		})

		it('currentStep e state são independentes — um PATCH pode mandar só um dos dois', async () => {
			await saveStep.execute({ ownerId: OWNER, state: { providers: [ProviderKind.CLAUDE_CODE] } })

			const onboarding = await repo.findByOwnerId(OWNER)
			expect(onboarding?.currentStep).toBe(OnboardingStep.VALUE)
			expect(onboarding?.state).toEqual({ providers: [ProviderKind.CLAUDE_CODE] })
		})
	})

	describe('CompleteOnboarding — o commit atômico', () => {
		it('materializa workspace + thread a partir do rascunho e carimba completedAt', async () => {
			const contactRef = fullDraftContactRef()
			await saveStep.execute({
				ownerId: OWNER,
				currentStep: OnboardingStep.REVIEW,
				state: { contactRef, workspace: { path: '/Users/dev/acme-api' }, providers: [ProviderKind.CLAUDE_CODE] },
			})

			const result = await complete.execute({ ownerId: OWNER })

			const onboarding = await repo.findByOwnerId(OWNER)
			expect(onboarding?.isCompleted()).toBe(true)
			expect(onboarding?.currentStep).toBe(OnboardingStep.FINAL)

			const workspaces = await testBed.resolve(WorkspaceRepository).listByOwner(OWNER)
			expect(workspaces).toHaveLength(1)
			expect(workspaces[0]?.path).toBe('/Users/dev/acme-api')

			const thread = await testBed.resolve(ThreadRepository).findByChannelContact(contactRef.channelId, contactRef.externalId)
			expect(thread).toBeDefined()
			expect(thread?.workspaceId).toBe(workspaces[0]?.id.value)
			expect(thread?.providers).toEqual([ProviderKind.CLAUDE_CODE])
			// A thread recém-materializada é devolvida ao chamador (spec 2026-08-26 follow-up) — o
			// console usa isto para o CTA "mencione o agente" da tela FINAL.
			expect(result.threadId).toBe(thread?.id.value ?? null)
		})

		it('usa existingWorkspaceId em vez de criar um novo workspace', async () => {
			const workspace = await givenWorkspace(testBed, { ownerId: OWNER })
			const contactRef = fullDraftContactRef()
			await saveStep.execute({
				ownerId: OWNER,
				state: { contactRef, workspace: { existingWorkspaceId: workspace.id.value }, providers: [ProviderKind.CLAUDE_CODE] },
			})

			const result = await complete.execute({ ownerId: OWNER })

			const workspaces = await testBed.resolve(WorkspaceRepository).listByOwner(OWNER)
			expect(workspaces).toHaveLength(1)
			const thread = await testBed.resolve(ThreadRepository).findByChannelContact(contactRef.channelId, contactRef.externalId)
			expect(thread?.workspaceId).toBe(workspace.id.value)
			expect(result.threadId).toBe(thread?.id.value ?? null)
		})

		/**
		 * O RASCUNHO INCOMPLETO É RECUSADO, e a recusa é ATÔMICA: nem workspace, nem thread, nem
		 * `completedAt` — a prova de que a transação de fato dá rollback, não só "não confirma o passo
		 * final".
		 */
		it('rascunho incompleto (sem contactRef) recusa com ONBOARDING_DRAFT_INCOMPLETE e nada persiste', async () => {
			await saveStep.execute({
				ownerId: OWNER,
				state: { workspace: { path: '/Users/dev/acme-api' }, providers: [ProviderKind.CLAUDE_CODE] },
			})

			await expect(complete.execute({ ownerId: OWNER })).rejects.toMatchObject({ name: 'ONBOARDING_DRAFT_INCOMPLETE' })

			expect(await testBed.resolve(WorkspaceRepository).listByOwner(OWNER)).toHaveLength(0)
			const onboarding = await repo.findByOwnerId(OWNER)
			expect(onboarding?.isCompleted()).toBe(false)
			expect(onboarding?.completedAt).toBeUndefined()
		})

		it('rascunho sem workspace (nem path nem existingWorkspaceId) recusa com ONBOARDING_DRAFT_INCOMPLETE', async () => {
			await saveStep.execute({
				ownerId: OWNER,
				state: { contactRef: fullDraftContactRef(), providers: [ProviderKind.CLAUDE_CODE] },
			})

			await expect(complete.execute({ ownerId: OWNER })).rejects.toMatchObject({ name: 'ONBOARDING_DRAFT_INCOMPLETE' })
		})

		it('concluir sem NUNCA ter salvo um passo (rascunho vazio) também recusa', async () => {
			await expect(complete.execute({ ownerId: OWNER })).rejects.toMatchObject({ name: 'ONBOARDING_DRAFT_INCOMPLETE' })
		})

		/**
		 * IDEMPOTÊNCIA — a metade da spec que o rollback sozinho não prova. Um reboot depois de um
		 * commit PARCIAL (workspace/thread já materializados, `complete()` nunca chamado) não pode
		 * fazer o retry colidir com `WORKSPACE_ALREADY_REGISTERED`/`THREAD_ALREADY_ATTACHED` — tem que
		 * REAPROVEITAR o que já existe.
		 */
		it('retry depois de um commit parcial reaproveita o workspace e a thread já materializados', async () => {
			const contactRef = fullDraftContactRef()
			const preexisting = await givenWorkspace(testBed, { ownerId: OWNER, path: '/Users/dev/acme-api' })
			await givenThread(testBed, {
				ownerId: OWNER,
				channelId: contactRef.channelId,
				contactExternalId: contactRef.externalId,
				contactDisplayName: contactRef.displayName,
				contactKind: contactRef.kind,
				workspaceId: preexisting.id.value,
				providers: [ProviderKind.CLAUDE_CODE],
			})
			await saveStep.execute({
				ownerId: OWNER,
				state: { contactRef, workspace: { path: '/Users/dev/acme-api' }, providers: [ProviderKind.CLAUDE_CODE] },
			})

			const result = await complete.execute({ ownerId: OWNER })

			expect((await repo.findByOwnerId(OWNER))?.isCompleted()).toBe(true)
			expect(await testBed.resolve(WorkspaceRepository).listByOwner(OWNER)).toHaveLength(1)
			const threads = await testBed.resolve(ThreadRepository).findByChannelContact(contactRef.channelId, contactRef.externalId)
			expect(threads?.id.value).toBeDefined()
			// Idempotência do LADO da thread: a linha pré-existente é REAPROVEITADA, nunca recriada, e
			// o id devolvido é o dela, não um novo.
			expect(result.threadId).toBe(threads?.id.value ?? null)
		})

		/** AC-2/AC-8 (legado) sobrevivem como "concluir duas vezes não repete o commit nem remarca a data". */
		it('concluir duas vezes não remarca a data nem revalida um rascunho já esvaziado — e devolve o MESMO threadId', async () => {
			const contactRef = fullDraftContactRef()
			await saveStep.execute({
				ownerId: OWNER,
				state: { contactRef, workspace: { path: '/Users/dev/acme-api' }, providers: [ProviderKind.CLAUDE_CODE] },
			})
			const first = await complete.execute({ ownerId: OWNER })
			const firstCompletedAt = (await repo.findByOwnerId(OWNER))?.completedAt

			const second = await complete.execute({ ownerId: OWNER })

			expect((await repo.findByOwnerId(OWNER))?.completedAt).toEqual(firstCompletedAt)
			expect(second.threadId).toBe(first.threadId)
		})

		/**
		 * O CAMINHO "já concluído" NÃO revalida o rascunho (regra de ouro do método) — mas ainda tenta
		 * resolver o `threadId` original a partir do que sobrar de `contactRef` em `state`, sem exigir
		 * `workspace`/`providers` completos. Simula outra sessão tendo reescrito o rascunho DEPOIS da
		 * conclusão via um PATCH normal (`SaveOnboardingStep`) que explicita `workspace`/`providers`
		 * como `undefined` — `setState` faz merge RASO (`Onboarding.setState`'s own docblock), então um
		 * valor explicitamente `undefined` no PATCH realmente sobrescreve o grupo anterior.
		 */
		it('concluir de novo depois do state ter sido reduzido a só contactRef ainda resolve o threadId', async () => {
			const contactRef = fullDraftContactRef()
			await saveStep.execute({
				ownerId: OWNER,
				state: { contactRef, workspace: { path: '/Users/dev/acme-api' }, providers: [ProviderKind.CLAUDE_CODE] },
			})
			const first = await complete.execute({ ownerId: OWNER })

			await saveStep.execute({ ownerId: OWNER, state: { contactRef, workspace: undefined, providers: undefined } })

			const second = await complete.execute({ ownerId: OWNER })

			expect(second.threadId).toBe(first.threadId)
		})

		/**
		 * Sem `contactRef` nenhum sobrevivendo no rascunho pós-conclusão, não há como resolver a thread
		 * original de forma determinística — o contrato modela isso como `null`, nunca uma falha nem um
		 * id inventado.
		 */
		it('concluir de novo com o rascunho totalmente esvaziado (sem contactRef) devolve threadId null', async () => {
			await saveStep.execute({
				ownerId: OWNER,
				state: { contactRef: fullDraftContactRef(), workspace: { path: '/Users/dev/acme-api' }, providers: [ProviderKind.CLAUDE_CODE] },
			})
			await complete.execute({ ownerId: OWNER })

			await saveStep.execute({ ownerId: OWNER, state: { contactRef: undefined, workspace: undefined, providers: undefined } })

			const second = await complete.execute({ ownerId: OWNER })

			expect(second.threadId).toBeNull()
		})
	})
})
