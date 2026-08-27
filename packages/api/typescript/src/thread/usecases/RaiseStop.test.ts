import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { Id } from '@codm/core-typescript'
import { TestBed, givenThread } from '@test/support'
import { Language, StopKind, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import {
	CloudSession,
	MockCloudSession,
	MOCK_CLOUD_OWNER_ID,
	MOCK_CLOUD_USER_ID,
	MOCK_CLOUD_SESSION_ID,
} from '@shared/services/CloudSession'
import { SessionSchema } from '@shared/schemas'
import { DEFAULT_LANGUAGE } from '@shared/i18n/messages'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { THREAD_MESSAGES } from '../i18n/messages'
import { RaiseStop } from './RaiseStop'

/**
 * A propriedade central: um stop que o ORQUESTRADOR não conseguiria ter contado vira mensagem no
 * canal — e a entrega não passa por agent runner nenhum.
 */
describe('RaiseStop — o aviso no canal', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('um SERVER_ERROR grava entrada SYSTEM e enfileira a entrega', async () => {
		const { thread } = await givenThreadReadyForStops(testBed, Language.PT_BR)

		await testBed.resolve(RaiseStop).execute({
			stopId: '019e4d24-6524-7041-9e1c-8108180cdd01',
			threadId: thread.id.value,
			kind: StopKind.SERVER_ERROR,
			detail: "You've hit your session limit · resets 10:30pm",
		})

		const entries = await testBed.resolve(ThreadRepository).listEntries(thread.id.value)
		const notice = entries.find(e => e.kind === TranscriptKind.SYSTEM)
		expect(notice).toBeDefined()
		expect(notice?.text).toContain('Erro do provedor')
		// O detalhe do provider vai junto, sem tradução — é onde está o horário do reset.
		expect(notice?.text).toContain("You've hit your session limit")

		expect(await enqueuedDeliveries(testBed)).toBe(1)
	})

	it('respeita o idioma do operador', async () => {
		const { thread } = await givenThreadReadyForStops(testBed, Language.EN_US)

		await testBed.resolve(RaiseStop).execute({
			stopId: '019e4d24-6524-7041-9e1c-8108180cdd02',
			threadId: thread.id.value,
			kind: StopKind.SERVER_ERROR,
			detail: 'boom',
		})

		const entries = await testBed.resolve(ThreadRepository).listEntries(thread.id.value)
		expect(entries.find(e => e.kind === TranscriptKind.SYSTEM)?.text).toContain('Server error')
	})

	it('NÃO avisa nos kinds que o agente contou pela própria voz', async () => {
		const { thread } = await givenThreadReadyForStops(testBed, Language.PT_BR)

		for (const [i, kind] of [StopKind.HUMAN_REQUESTED, StopKind.APPROVAL_NEEDED].entries()) {
			await testBed.resolve(RaiseStop).execute({
				stopId: `019e4d24-6524-7041-9e1c-8108180cdd1${i}`,
				threadId: thread.id.value,
				kind,
				detail: 'o agente perguntou algo',
			})
		}

		// O stop existe (o card do Needs-you aparece), mas nada foi para o canal: uma notificação
		// mecânica aqui duplicaria uma fala que já aconteceu.
		expect(await enqueuedDeliveries(testBed)).toBe(0)
	})

	it('avisa nos três kinds em que não houve voz', async () => {
		const kinds = [StopKind.SERVER_ERROR, StopKind.AUTH_REQUIRED, StopKind.BLOCKED_BY_CLASSIFICATION]

		for (const [i, kind] of kinds.entries()) {
			const { thread } = await givenThreadReadyForStops(testBed, Language.PT_BR)
			await testBed.resolve(RaiseStop).execute({
				stopId: `019e4d24-6524-7041-9e1c-8108180cdd2${i}`,
				threadId: thread.id.value,
				kind,
				detail: 'x',
			})
		}

		expect(await enqueuedDeliveries(testBed)).toBe(kinds.length)
	})

	it('AC-1/AC-3: grava um stop HUMAN_REQUESTED sem o contexto `owner` montado', async () => {
		// A condição EXATA do desktop: `owner` é cloud-only, então `OwnerDirectory` não tem binding.
		// Antes desta mudança o tsyringe construía a classe abstrata e `RaiseStop` estourava
		// `TypeError: this.owners.getOwner is not a function` — silenciosamente, porque o handler
		// relança e o outbox dead-letta depois de cinco tentativas.
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const stopId = uuidv7()

		await testBed.resolve(RaiseStop).execute({
			stopId,
			threadId: thread.id.value,
			kind: StopKind.HUMAN_REQUESTED,
			title: 'o agente pediu ajuda',
			detail: 'o agente pediu ajuda',
		})

		const stop = await testBed.resolve(ThreadRepository).findStop(stopId)
		expect(stop?.stopId).toBe(stopId)
		expect(stop?.title).toBe('o agente pediu ajuda')
	})

	it('AC-2: um stop HUMAN_REQUESTED não resolve idioma nenhum', async () => {
		// O dublê FALHA se chamado. `NOTIFIES_ON_CHANNEL[HUMAN_REQUESTED]` é false e o título já vem
		// pronto, então nem `stopChannelNotice` nem `stopTitle` rodam — e o idioma que alimentaria os
		// dois não tem por que ser buscado.
		const cloud = testBed.resolve(CloudSession) as MockCloudSession
		cloud.setFailure(new Error('identity() não deveria ser chamado para HUMAN_REQUESTED'))

		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const stopId = uuidv7()

		await testBed.resolve(RaiseStop).execute({
			stopId,
			threadId: thread.id.value,
			kind: StopKind.HUMAN_REQUESTED,
			title: 'pergunta do agente',
			detail: 'pergunta do agente',
		})

		expect((await testBed.resolve(ThreadRepository).findStop(stopId))?.stopId).toBe(stopId)
		cloud.setFailure(undefined)
	})

	it('AC-4: um kind que notifica o canal usa o idioma da sessão', async () => {
		const cloud = testBed.resolve(CloudSession) as MockCloudSession
		cloud.setIdentity({
			user: {
				id: MOCK_CLOUD_USER_ID,
				email: 'operator@example.test',
				name: 'Test Operator',
				emailVerified: true,
				language: Language.EN_US,
			},
			session: {
				id: MOCK_CLOUD_SESSION_ID,
				userId: MOCK_CLOUD_USER_ID,
				expiresAt: new Date('2999-12-31T00:00:00.000Z'),
				ownerId: MOCK_CLOUD_OWNER_ID,
			},
		})

		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const stopId = uuidv7()

		await testBed.resolve(RaiseStop).execute({
			stopId,
			threadId: thread.id.value,
			kind: StopKind.SERVER_ERROR,
			detail: 'upstream 503',
		})

		const stop = await testBed.resolve(ThreadRepository).findStop(stopId)
		expect(stop?.title).toBe(THREAD_MESSAGES.stopTitle(Language.EN_US, { kind: StopKind.SERVER_ERROR }))
	})

	it('AC-5: sem identidade, o stop é gravado e o texto cai em DEFAULT_LANGUAGE', async () => {
		const cloud = testBed.resolve(CloudSession) as MockCloudSession
		cloud.setIdentity(null)

		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const stopId = uuidv7()

		await testBed.resolve(RaiseStop).execute({
			stopId,
			threadId: thread.id.value,
			kind: StopKind.SERVER_ERROR,
			detail: 'upstream 503',
		})

		const stop = await testBed.resolve(ThreadRepository).findStop(stopId)
		expect(stop?.stopId).toBe(stopId)
		expect(stop?.title).toBe(THREAD_MESSAGES.stopTitle(DEFAULT_LANGUAGE, { kind: StopKind.SERVER_ERROR }))
	})

	it('AC-6: uma sessão sem `language` faz parse e o campo fica ausente', () => {
		const parsed = SessionSchema.parse({
			user: { id: MOCK_CLOUD_USER_ID, email: 'operator@example.test', name: null, emailVerified: true },
			session: {
				id: MOCK_CLOUD_SESSION_ID,
				userId: MOCK_CLOUD_USER_ID,
				expiresAt: new Date('2999-12-31T00:00:00.000Z'),
				ownerId: MOCK_CLOUD_OWNER_ID,
			},
		})
		expect(parsed.user.language).toBeUndefined()

		const withLanguage = SessionSchema.parse({
			user: { id: MOCK_CLOUD_USER_ID, email: 'operator@example.test', name: null, emailVerified: true, language: Language.EN_US },
			session: {
				id: MOCK_CLOUD_SESSION_ID,
				userId: MOCK_CLOUD_USER_ID,
				expiresAt: new Date('2999-12-31T00:00:00.000Z'),
				ownerId: MOCK_CLOUD_OWNER_ID,
			},
		})
		expect(withLanguage.user.language).toBe(Language.EN_US)
	})
})

/**
 * Cria thread e devolve `{ thread }`, com a IDENTIDADE da sessão (`CloudSession`) configurada no
 * idioma pedido — a fonte que `RaiseStop` agora consulta para o título genérico e para o aviso no
 * canal (Decisão 2 da spec: a fonte deixou de ser `OwnerDirectory`).
 *
 * Um `MockCloudSession` FRESH por chamada, trocado via `testBed.override` — o único seam sancionado
 * para substituir um binding em teste (`TestBed.override`). A `StopPolicyConfigRepository` não
 * precisa de seed: sem linha para o owner ela devolve `DEFAULT_STOP_POLICY`, que já habilita todos os
 * critérios.
 */
async function givenThreadReadyForStops(testBed: TestBed, language: Language) {
	const ownerId = Id.value()
	const cloud = new MockCloudSession()
	cloud.setIdentity({
		user: { id: MOCK_CLOUD_USER_ID, email: 'operator@example.test', name: 'Test Operator', emailVerified: true, language },
		session: { id: MOCK_CLOUD_SESSION_ID, userId: MOCK_CLOUD_USER_ID, expiresAt: new Date('2999-12-31T00:00:00.000Z'), ownerId },
	})
	testBed.override(CloudSession, cloud)

	const thread = await givenThread(testBed, { ownerId })
	return { thread }
}

/** Conta os comandos `deliver_channel_message` pendentes na fila durável (`scheduled_commands`). */
async function enqueuedDeliveries(testBed: TestBed): Promise<number> {
	return testBed.probe().count('scheduledCommands', { name: 'deliver_channel_message' })
}
