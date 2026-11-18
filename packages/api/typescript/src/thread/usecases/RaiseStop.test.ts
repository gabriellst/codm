import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { Id } from '@codm/core-typescript'
import { TestBed, givenIssue, givenThread } from '@test/support'
import {
	AskAnswerKind,
	AskEffect,
	GroupOutputMode,
	IssueSignalLevel,
	Language,
	OutputRouting,
	PermissionPosture,
	StopKind,
	StopResolution,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import type { StopAsk } from '@shared/objects'
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
		// O dublê FALHA se chamado. `LEVEL_OF_STOP[HUMAN_REQUESTED]` é null e o título já vem
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
 * FASE 3 — o stop de uma ISSUE fala pela política de saída: o formato do nível, o código da pergunta, o modo
 * do grupo e um aviso por causa. Os stops são levantados direto pelo `RaiseStop` com `ask` (as ferramentas da
 * issue chegam no S5a).
 */
describe('RaiseStop — a política de saída (fase 3)', () => {
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

	const yesNo = [
		{ id: 'yes', label: 'Publica' },
		{ id: 'no', label: 'Espera' },
	]
	const decision: StopAsk = { question: 'Posso publicar a prévia?', options: yesNo, effects: [AskEffect.PUBLISH] }
	const question: StopAsk = {
		question: 'Uso o tema claro?',
		options: [
			{ id: 'light', label: 'Tema claro' },
			{ id: 'dark', label: 'Tema escuro' },
		],
		default: { kind: AskAnswerKind.OPTION, optionId: 'light' },
		effects: [],
	}

	const issueOn = async (threadId: string, key = 'APP-12') =>
		givenIssue(testBed, {
			ownerId: (await testBed.resolve(ThreadRepository).findById(threadId))!.ownerId,
			threadId,
			key,
			title: 'Página nova',
		})

	const groupEntries = async (threadId: string) =>
		(await testBed.resolve(ThreadRepository).listEntries(threadId)).filter(e => e.kind === TranscriptKind.SYSTEM)

	it('uma decisão sai no grupo com o código, as opções, e a entrada e o stop apontam um para o outro', async () => {
		const { thread } = await givenThreadReadyForStops(testBed, Language.PT_BR)
		const issue = await issueOn(thread.id.value)
		const stopId = uuidv7()

		await testBed.resolve(RaiseStop).execute({
			stopId,
			threadId: thread.id.value,
			issueId: issue.id.value,
			kind: StopKind.DECISION_REQUESTED,
			detail: 'prévia pronta',
			ask: decision,
		})

		const [entry] = await groupEntries(thread.id.value)
		expect(entry?.text).toContain('APP-12 · D1 — Posso publicar a prévia?')
		expect(entry?.text).toContain('1) Publica')
		expect(entry).toMatchObject({ issueId: issue.id.value, level: IssueSignalLevel.DECISION, routing: OutputRouting.GROUP, stopId })
		const stop = await testBed.resolve(ThreadRepository).findStop(stopId)
		expect(stop).toMatchObject({ kind: StopKind.DECISION_REQUESTED, seq: 1, askEntryId: entry?.entryId })
		expect(await enqueuedDeliveries(testBed)).toBe(1)
	})

	it('uma pergunta diz com o que segue em 15 min; a segunda da issue é D2', async () => {
		const { thread } = await givenThreadReadyForStops(testBed, Language.PT_BR)
		const issue = await issueOn(thread.id.value)

		for (const stopId of [uuidv7(), uuidv7()]) {
			await testBed.resolve(RaiseStop).execute({
				stopId,
				threadId: thread.id.value,
				issueId: issue.id.value,
				kind: StopKind.QUESTION_ASKED,
				detail: '',
				ask: question,
			})
		}

		const texts = (await groupEntries(thread.id.value)).map(e => e.text)
		expect(texts[0]).toContain('APP-12 · D1 — Uso o tema claro?')
		expect(texts[0]).toContain('Sigo com Tema claro se ninguém disser o contrário em 15 min.')
		expect(texts[1]).toContain('APP-12 · D2')
		// Sem resumo ainda (S5b): a pergunta sai sozinha e a entrada registra o que de fato aconteceu.
		expect((await groupEntries(thread.id.value))[0]?.routing).toBe(OutputRouting.GROUP)
		expect(await enqueuedDeliveries(testBed)).toBe(2)
	})

	it('uma pergunta com efeito declarado vira decisão — sem padrão, sem prazo', async () => {
		const { thread } = await givenThreadReadyForStops(testBed, Language.PT_BR)
		const issue = await issueOn(thread.id.value)
		const stopId = uuidv7()

		await testBed.resolve(RaiseStop).execute({
			stopId,
			threadId: thread.id.value,
			issueId: issue.id.value,
			kind: StopKind.QUESTION_ASKED,
			detail: '',
			ask: { ...question, effects: [AskEffect.CLIENT_DATA] },
		})

		expect((await testBed.resolve(ThreadRepository).findStop(stopId))?.kind).toBe(StopKind.DECISION_REQUESTED)
		const [entry] = await groupEntries(thread.id.value)
		expect(entry?.level).toBe(IssueSignalLevel.DECISION)
		expect(entry?.text).not.toContain('15 min')
	})

	it('FALSEADOR — um kind de pergunta sem `ask`, ou um `ask` num kind que não pergunta, é recusado', async () => {
		const { thread } = await givenThreadReadyForStops(testBed, Language.PT_BR)
		const issue = await issueOn(thread.id.value)
		const raise = (kind: StopKind, ask?: StopAsk) =>
			testBed
				.resolve(RaiseStop)
				.execute({ stopId: uuidv7(), threadId: thread.id.value, issueId: issue.id.value, kind, detail: 'x', ask })
				.then(
					() => undefined,
					(error: Error) => error.name,
				)

		expect(await raise(StopKind.DECISION_REQUESTED)).toBe('INVALID_REQUEST')
		expect(await raise(StopKind.SERVER_ERROR, decision)).toBe('INVALID_REQUEST')
		expect(await testBed.resolve(ThreadRepository).openStops(thread.id.value)).toHaveLength(0)
	})

	it('um aviso por causa: o segundo SERVER_ERROR com o primeiro aberto fica só no painel; fechada a causa, reabre', async () => {
		const { thread } = await givenThreadReadyForStops(testBed, Language.PT_BR)
		const first = await issueOn(thread.id.value, 'APP-12')
		const second = await issueOn(thread.id.value, 'APP-15')
		const third = await issueOn(thread.id.value, 'APP-18')
		const serverError = (issueId: string) =>
			testBed
				.resolve(RaiseStop)
				.execute({ stopId: uuidv7(), threadId: thread.id.value, issueId, kind: StopKind.SERVER_ERROR, detail: 'upstream 503' })

		await serverError(first.id.value)
		await serverError(second.id.value)

		let entries = await groupEntries(thread.id.value)
		expect(entries.map(e => e.routing)).toEqual([OutputRouting.GROUP, OutputRouting.PANEL])
		expect(entries[0]?.text).toContain('⚠️ APP-12')
		expect(await enqueuedDeliveries(testBed)).toBe(1)

		// Both stops of the cause resolved ⇒ the cause is closed, and the next one is told again.
		for (const stop of await testBed.resolve(ThreadRepository).openStops(thread.id.value)) {
			const loaded = (await testBed.resolve(ThreadRepository).findById(thread.id.value))!
			loaded.resolveStop(stop, StopResolution.RETRY, PermissionPosture.AUTO)
			await testBed.resolve(ThreadRepository).save(loaded)
		}
		await serverError(third.id.value)

		entries = await groupEntries(thread.id.value)
		expect(entries.at(-1)?.routing).toBe(OutputRouting.GROUP)
		expect(await enqueuedDeliveries(testBed)).toBe(2)
	})

	it('STALLED não agrupa: duas tarefas paradas sem dizer nada aparecem as duas no grupo', async () => {
		const { thread } = await givenThreadReadyForStops(testBed, Language.PT_BR)
		for (const key of ['APP-12', 'APP-15']) {
			const issue = await issueOn(thread.id.value, key)
			await testBed
				.resolve(RaiseStop)
				.execute({ stopId: uuidv7(), threadId: thread.id.value, issueId: issue.id.value, kind: StopKind.STALLED, detail: 'parou' })
		}

		const entries = await groupEntries(thread.id.value)
		expect(entries.map(e => e.routing)).toEqual([OutputRouting.GROUP, OutputRouting.GROUP])
		expect(entries[0]?.text).toContain('Uma tarefa parou sem dizer o que falta')
		expect(await enqueuedDeliveries(testBed)).toBe(2)
	})

	it('um aviso sem detalhe não repete o título; uma decisão sem pergunta pergunta o título', async () => {
		const { thread } = await givenThreadReadyForStops(testBed, Language.PT_BR)
		const stalled = await issueOn(thread.id.value, 'APP-12')
		const denied = await issueOn(thread.id.value, 'APP-15')
		for (const [issueId, kind] of [
			[stalled.id.value, StopKind.STALLED],
			[denied.id.value, StopKind.PERMISSION_DENIED],
		] as const) {
			await testBed.resolve(RaiseStop).execute({ stopId: uuidv7(), threadId: thread.id.value, issueId, kind, detail: '' })
		}

		const [notice, decisionEntry] = (await groupEntries(thread.id.value)).map(e => e.text)
		const stalledTitle = THREAD_MESSAGES.stopTitle(Language.PT_BR, { kind: StopKind.STALLED })
		expect(notice?.split(stalledTitle)).toHaveLength(2)
		expect(decisionEntry).toContain(`❓ APP-15 — ${THREAD_MESSAGES.stopTitle(Language.PT_BR, { kind: StopKind.PERMISSION_DENIED })}`)
	})

	it('o stop da CONVERSA (sem issue) mantém o aviso de hoje, sem nível nem código', async () => {
		const { thread } = await givenThreadReadyForStops(testBed, Language.PT_BR)

		await testBed
			.resolve(RaiseStop)
			.execute({ stopId: uuidv7(), threadId: thread.id.value, kind: StopKind.SERVER_ERROR, detail: 'upstream 503' })

		const [entry] = await groupEntries(thread.id.value)
		expect(entry?.text).toBe(THREAD_MESSAGES.stopChannelNotice(Language.PT_BR, { kind: StopKind.SERVER_ERROR, detail: 'upstream 503' }))
		expect(entry?.level).toBeUndefined()
		expect(entry?.issueId).toBeUndefined()
	})

	it('o modo do grupo vale: em DECISIONS_ONLY a decisão ainda sai no grupo', async () => {
		const { thread } = await givenThreadReadyForStops(testBed, Language.PT_BR)
		const loaded = (await testBed.resolve(ThreadRepository).findById(thread.id.value))!
		loaded.configureOutputMode(GroupOutputMode.DECISIONS_ONLY)
		await testBed.resolve(ThreadRepository).save(loaded)
		const issue = await issueOn(thread.id.value)

		await testBed.resolve(RaiseStop).execute({
			stopId: uuidv7(),
			threadId: thread.id.value,
			issueId: issue.id.value,
			kind: StopKind.DECISION_REQUESTED,
			detail: '',
			ask: decision,
		})

		expect((await groupEntries(thread.id.value))[0]?.routing).toBe(OutputRouting.GROUP)
		expect(await enqueuedDeliveries(testBed)).toBe(1)
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
