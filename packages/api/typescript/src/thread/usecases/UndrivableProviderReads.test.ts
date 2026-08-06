import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread, givenWorkspace } from '@test/support'
import { ProviderKind, TranscriptKind, AgentModelId } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { AgentRunnerFactory } from '@agent/services/AgentRunnerFactory/AgentRunnerFactory'
import { GetHomeDashboard } from '@ui/usecases/GetHomeDashboard'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { GetSessionChat } from './GetSessionChat'
import { GetThreadSettings } from './GetThreadSettings'

/**
 * THE READ SIDE IS UNTOUCHED (founder ratification, 31-jul) — the guard closed the WRITE, and only the
 * write.
 *
 * A thread bound to CODEX exists on the founder's machine today: it was attached before
 * `AttachThread` asked whether the engine could drive the CLI it was being handed. The temptation when
 * closing that hole is to make the same check a precondition of loading, which would turn one stale
 * binding into a conversation that cannot be opened, listed, or fixed — the transcript, the roster and
 * the delete button all behind an error about a provider. So every console read must keep working on
 * exactly the row the write now refuses to create.
 *
 * The state is seeded through the REPOSITORY, never through `AttachThread` — doctrine, and here it is
 * load-bearing rather than ceremonial: the use case is the thing that now REFUSES this state, so a
 * given helper routed through it could not produce the fixture at all.
 *
 * One suite for all three reads because the property is the CLOSURE, the same reason
 * `DeletedThreadReads.test.ts` sweeps its inventory in one place: a guard leaking into one read is
 * invisible from the other two passing.
 */
describe('a thread bound to an undrivable provider still LOADS everywhere', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const CHANNEL = '019e4d24-0000-7041-9e1c-0000000000f1'

	/** The legacy row: attached back when nothing asked whether a runner existed for CODEX. */
	async function legacyCodexThread() {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, {
			ownerId: OPERATOR_ID,
			workspaceId: workspace.id.value,
			channelId: CHANNEL,
			contactExternalId: 'legacy-codex',
			providers: [ProviderKind.CODEX],
		})
		const repo = testBed.resolve(ThreadRepository)
		const loaded = (await repo.findById(thread.id.value))!
		loaded.recordEntry({ kind: TranscriptKind.CONTACT, text: 'histórico que não pode sumir', senderExternalId: 'legacy-codex' })
		await repo.save(loaded)
		return thread
	}

	it('GetSessionChat — the conversation opens, transcript and all', async () => {
		const thread = await legacyCodexThread()

		const chat = await testBed.resolve(GetSessionChat).execute({ ownerId: OPERATOR_ID, threadId: thread.id.value })

		expect(chat.thread.providers).toEqual([ProviderKind.CODEX])
		expect(chat.transcript.map(e => e.text)).toContain('histórico que não pode sumir')
	})

	it('GetHomeDashboard — the conversation is still listed in the sidebar', async () => {
		const thread = await legacyCodexThread()

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: OPERATOR_ID })

		expect(dashboard.threads.map(t => t.threadId)).toContain(thread.id.value)
	})

	it('GetThreadSettings — the settings dialog opens', async () => {
		const thread = await legacyCodexThread()

		const settings = await testBed.resolve(GetThreadSettings).execute({ ownerId: OPERATOR_ID, threadId: thread.id.value })

		expect(settings.invokerCount).toBeGreaterThan(0)
		expect(settings.participants.length).toBeGreaterThan(0)
	})

	/**
	 * VISIBLE, not merely tolerated (founder: "surface o provider morto na tela de settings da thread em
	 * vez de falhar a turn"). The dead binding is REPORTED by the one screen the operator opens per
	 * conversation, in the catalog's own word — `comingSoon`, the same field
	 * `DetectProviders`/`GetAttachThreadWizard`/`GetSettings` already carry, from the same
	 * `AgentRunnerFactory.supported`.
	 */
	it('GetThreadSettings — the dead provider is FLAGGED comingSoon rather than hidden', async () => {
		const thread = await legacyCodexThread()

		const settings = await testBed.resolve(GetThreadSettings).execute({ ownerId: OPERATOR_ID, threadId: thread.id.value })

		expect(settings.providers).toEqual([
			{
				provider: ProviderKind.CODEX,
				comingSoon: true,
				model: AgentModelId.DEFAULT,
				// EMPTY, and that is a SEPARATE declared fact from `comingSoon`: this build has never driven
				// the codex binary, so it does not know what to offer. The console reads the empty list as
				// "there is nothing to choose here" and renders no selector on this row.
				models: [],
			},
		])
	})

	/** The healthy binding is NOT flagged — a screen that marks everything marks nothing. */
	it('GetThreadSettings — a drivable provider is not flagged', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, {
			ownerId: OPERATOR_ID,
			workspaceId: workspace.id.value,
			channelId: CHANNEL,
			providers: [ProviderKind.CLAUDE_CODE],
		})

		const settings = await testBed.resolve(GetThreadSettings).execute({ ownerId: OPERATOR_ID, threadId: thread.id.value })

		expect(settings.providers).toEqual([
			{
				provider: ProviderKind.CLAUDE_CODE,
				comingSoon: false,
				// The EFFECTIVE model, never absent: a thread that chose nothing reads as `DEFAULT`, so the
				// console holds a `<Select>` with a value from the first render.
				model: AgentModelId.DEFAULT,
				models: [AgentModelId.DEFAULT, AgentModelId.OPUS, AgentModelId.SONNET, AgentModelId.HAIKU],
			},
		])
	})

	/** Same premise pin as the write suite: the flag is the FACTORY's answer, not this file's opinion. */
	it('the flag is derived from the bound factory’s supported set', () => {
		const supported = testBed.resolve(AgentRunnerFactory).supported
		expect(supported).toContain(ProviderKind.CLAUDE_CODE)
		expect(supported).not.toContain(ProviderKind.CODEX)
	})
})
