import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { Id } from '@codm/core-typescript'
import { TestBed, givenThread } from '@test/support'
import { Language, OwnerKind, StopKind, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { MockOwnerDirectory, OwnerDirectory } from '@shared/services/OwnerDirectory'
import { ThreadRepository } from '../repositories/ThreadRepository'
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
})

/**
 * Cria owner (só a tenancy — via `MockOwnerDirectory`, `override`d na porta do kernel), thread e
 * devolve `{ thread }`. A `StopPolicyConfigRepository` não precisa de seed: sem linha para o owner ela
 * devolve `DEFAULT_STOP_POLICY`, que já habilita todos os critérios.
 *
 * O idioma é seedado num `MockOwnerDirectory` FRESH por chamada e trocado via `testBed.override` — o
 * único seam sancionado para substituir um binding em teste (`TestBed.override`). Em modo `integration`
 * o token `OwnerDirectory` resolve para `LibSqlOwnerDirectory` (que lê Owner + UserProfile reais); essa
 * leitura já está coberta por `LibSqlOwnerDirectory.test.ts` (T1). Aqui o que se testa é `RaiseStop`
 * reagindo ao idioma que a porta devolve — então o double é o ponto certo, não um Owner real.
 */
async function givenThreadReadyForStops(testBed: TestBed, language: Language) {
	const ownerId = Id.value()
	const owners = new MockOwnerDirectory()
	owners.seed(ownerId, { kind: OwnerKind.ORGANIZATION, responsibleUserId: Id.value(), language })
	testBed.override(OwnerDirectory, owners)

	const thread = await givenThread(testBed, { ownerId })
	return { thread }
}

/** Conta os comandos `deliver_channel_message` pendentes na fila durável (`scheduled_commands`). */
async function enqueuedDeliveries(testBed: TestBed): Promise<number> {
	return testBed.probe().count('scheduledCommands', { name: 'deliver_channel_message' })
}
