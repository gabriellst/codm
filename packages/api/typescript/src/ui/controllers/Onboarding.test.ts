import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { ContactKind, OnboardingStep, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { TestBed } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ChannelConnectivity } from '@thread/services/ChannelConnectivity'
import { GetOnboardingController } from './GetOnboarding'
import { SaveOnboardingStepController } from './SaveOnboardingStep'
import { CompleteOnboardingController } from './CompleteOnboarding'

const OWNER = MOCK_CLOUD_OWNER_ID

/**
 * A PORTA HTTP do commit atômico (spec 2026-08-26) — prova que os três controllers já falam o novo
 * body (`{ currentStep?, state? }` no PATCH) e que `POST /ui/onboarding/complete` de fato materializa
 * os agregados via o rascunho salvo, não só via a camada de use case testada em isolamento.
 */
describe('Onboarding controllers — PATCH incremental + commit atômico', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
	})
	beforeEach(async () => {
		await testBed.reset()
		testBed.override(ChannelConnectivity, { isConnected: async () => true, anyConnected: async () => true } as ChannelConnectivity)
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('GET devolve o rascunho vazio para quem nunca começou', async () => {
		const response = await testBed.resolve(GetOnboardingController).execute({ ctx: { ownerId: OWNER } })

		expect(response.data?.currentStep).toBe(OnboardingStep.VALUE)
		expect(response.data?.state).toEqual({})
	})

	it('PATCH com currentStep + state salva os dois, e GET devolve o rascunho salvo', async () => {
		const contactRef = { channelId: uuidv7(), externalId: `contact-${uuidv7()}`, displayName: 'Ada', kind: ContactKind.USER }

		const patchResponse = await testBed.resolve(SaveOnboardingStepController).execute({
			ctx: { ownerId: OWNER },
			body: { currentStep: OnboardingStep.CONTACT, state: { contactRef } },
		})
		expect(patchResponse.status).toBe(204)

		const getResponse = await testBed.resolve(GetOnboardingController).execute({ ctx: { ownerId: OWNER } })
		expect(getResponse.data?.currentStep).toBe(OnboardingStep.CONTACT)
		expect(getResponse.data?.state).toEqual({ contactRef })
	})

	it('POST complete materializa o rascunho salvo via PATCH, carimba completedAt e devolve o threadId', async () => {
		const contactRef = { channelId: uuidv7(), externalId: `contact-${uuidv7()}`, displayName: 'Ada', kind: ContactKind.USER }
		await testBed.resolve(SaveOnboardingStepController).execute({
			ctx: { ownerId: OWNER },
			body: {
				currentStep: OnboardingStep.REVIEW,
				state: { contactRef, workspace: { path: '/Users/dev/acme-api' }, providers: [ProviderKind.CLAUDE_CODE] },
			},
		})

		const completeResponse = await testBed.resolve(CompleteOnboardingController).execute({ ctx: { ownerId: OWNER } })
		expect(completeResponse.status).toBe(200)
		expect(completeResponse.data?.threadId).toEqual(expect.any(String))

		const getResponse = await testBed.resolve(GetOnboardingController).execute({ ctx: { ownerId: OWNER } })
		expect(getResponse.data?.completedAt).not.toBeNull()
		expect(getResponse.data?.currentStep).toBe(OnboardingStep.FINAL)
	})

	it('POST complete chamado de novo (idempotente) devolve o MESMO threadId da primeira conclusão', async () => {
		const contactRef = { channelId: uuidv7(), externalId: `contact-${uuidv7()}`, displayName: 'Ada', kind: ContactKind.USER }
		await testBed.resolve(SaveOnboardingStepController).execute({
			ctx: { ownerId: OWNER },
			body: {
				currentStep: OnboardingStep.REVIEW,
				state: { contactRef, workspace: { path: '/Users/dev/acme-api' }, providers: [ProviderKind.CLAUDE_CODE] },
			},
		})

		const first = await testBed.resolve(CompleteOnboardingController).execute({ ctx: { ownerId: OWNER } })
		const second = await testBed.resolve(CompleteOnboardingController).execute({ ctx: { ownerId: OWNER } })

		expect(second.status).toBe(200)
		expect(second.data?.threadId).toBe(first.data?.threadId)
	})

	it('POST complete com rascunho incompleto responde ONBOARDING_DRAFT_INCOMPLETE', async () => {
		await testBed.resolve(SaveOnboardingStepController).execute({
			ctx: { ownerId: OWNER },
			body: { state: { workspace: { path: '/Users/dev/acme-api' } } },
		})

		await expect(testBed.resolve(CompleteOnboardingController).execute({ ctx: { ownerId: OWNER } })).rejects.toMatchObject({
			name: 'ONBOARDING_DRAFT_INCOMPLETE',
		})
	})
})
