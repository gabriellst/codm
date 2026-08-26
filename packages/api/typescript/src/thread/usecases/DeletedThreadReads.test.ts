import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenChannel, givenIssue, givenRemote, givenThread, givenWorkspace } from '@test/support'
import { ContactKind, IssueStatus, StopKind, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { GetIssuesOverview } from '@issue/usecases/GetIssuesOverview'
import { GetAttachThreadWizard } from '@ui/usecases/GetAttachThreadWizard'
import { GetHomeDashboard } from '@ui/usecases/GetHomeDashboard'
import { GetOnboarding } from '@ui/usecases/GetOnboarding'
import { ListWorkspaces } from '@workspace/usecases/ListWorkspaces'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ThreadStatusDeriver } from '../services/ThreadStatusDeriver'
import { GetNeedsYouPanel } from './GetNeedsYouPanel'
import { GetSessionChat } from './GetSessionChat'
import { GetThreadSettings } from './GetThreadSettings'

/**
 * AC-3 — THE READ SWEEP (thread-deletion spec, decision 5): "toda leitura filtra".
 *
 * One suite for the whole inventory, deliberately, because the property under test is not a property
 * of any single read — it is the CLOSURE. A conversation the operator apagou must be gone from every
 * surface at once; a filter added to four of five reads leaves the fifth as the one place the deleted
 * thread still exists, and nothing about the four passing tests would say so.
 *
 * Each `it` names the read it defends, so a red line points straight at the query that lost its
 * filter — which is exactly what FALSEADOR AC-8b exercises.
 *
 * The WRITE-SIDE reads (`ThreadRepository.findById` / `findByChannelContact`) are the justified
 * whitelist and are asserted here in the POSITIVE: they must keep seeing the deleted row, because
 * refusing a double delete and reviving on re-attach both depend on loading it.
 */
describe('AC-3 — a deleted thread is absent from every console read', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	/** A thread with a transcript line and an issue, then apagada — the state every read below sees. */
	async function deletedThread(overrides: { contactExternalId?: string; channelId?: string; workspaceId?: string } = {}) {
		const workspaceId = overrides.workspaceId ?? (await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })).id.value
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId, ...overrides })
		const repo = testBed.resolve(ThreadRepository)

		const loaded = (await repo.findById(thread.id.value))!
		loaded.recordEntry({ kind: TranscriptKind.CONTACT, text: 'segredo da conversa apagada', senderExternalId: 'c1' })
		await repo.save(loaded)
		await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, status: IssueStatus.COMPLETED })

		const toDelete = (await repo.findById(thread.id.value))!
		toDelete.delete()
		await repo.save(toDelete)
		return { thread, workspaceId }
	}

	it('GetSessionChat — the chat of a deleted thread is THREAD_NOT_FOUND', async () => {
		const { thread } = await deletedThread()

		await expect(testBed.resolve(GetSessionChat).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })).rejects.toThrow(
			expect.objectContaining({ name: 'THREAD_NOT_FOUND' }),
		)
	})

	it('GetThreadSettings — the settings of a deleted thread are THREAD_NOT_FOUND', async () => {
		const { thread } = await deletedThread()

		await expect(testBed.resolve(GetThreadSettings).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })).rejects.toThrow(
			expect.objectContaining({ name: 'THREAD_NOT_FOUND' }),
		)
	})

	it('GetHomeDashboard — absent from threads AND activeSessions', async () => {
		const { thread } = await deletedThread()

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: MOCK_CLOUD_OWNER_ID })

		expect(dashboard.threads.map(t => t.threadId)).not.toContain(thread.id.value)
		expect(dashboard.activeSessions.map(t => t.threadId)).not.toContain(thread.id.value)
	})

	/**
	 * The one the spec calls out by name (decision 5): `latestActivity` reads the TRANSCRIPT, not the
	 * thread table, so it is the read a per-table sweep forgets. Without the join it prints the words of
	 * a conversation the operator believes they deleted, on the home screen.
	 */
	it('GetHomeDashboard — latestActivity leaks no transcript line of a deleted thread', async () => {
		const { thread } = await deletedThread()

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: MOCK_CLOUD_OWNER_ID })

		expect(dashboard.latestActivity.map(a => a.threadId)).not.toContain(thread.id.value)
		expect(dashboard.latestActivity.map(a => a.subtitle)).not.toContain('segredo da conversa apagada')
	})

	it('GetNeedsYouPanel — a deleted thread surfaces no stops', async () => {
		const { thread } = await deletedThread()
		// Raised AFTER the delete, deliberately: the guard (decision 2) makes an OPEN stop unreachable at
		// delete time, so this is the only way the panel could ever be asked about an apagada thread.
		const repo = testBed.resolve(ThreadRepository)
		const loaded = (await repo.findById(thread.id.value))!
		loaded.raiseStop({ kind: StopKind.HUMAN_REQUESTED, title: 'stale', detail: '' })
		await repo.save(loaded)

		const panel = await testBed.resolve(GetNeedsYouPanel).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })

		expect(panel.stops).toHaveLength(0)
	})

	it('GetOnboarding — deleting the only thread un-ticks threadDone', async () => {
		await deletedThread()

		const onboarding = await testBed.resolve(GetOnboarding).execute({ ownerId: MOCK_CLOUD_OWNER_ID })

		expect(onboarding.threadDone).toBe(false)
	})

	/**
	 * AC-5's precondition, and the read whose omission would be silently fatal: the wizard marks a contact
	 * `alreadyAttached` from the thread table. Counting a DELETED thread there would make re-attach
	 * unreachable from the UI — the operator would see "já anexado" for a conversation that no longer
	 * exists anywhere else in the console.
	 */
	it('GetAttachThreadWizard — a deleted thread stops marking its contact as alreadyAttached', async () => {
		const channelId = '00000000-0000-4000-8000-0000000000aa'
		const contactExternalId = 'wizard-contact'
		// The wizard lists remotes of the owner's OWN channels, so the channel row is what puts the contact
		// on the page at all — without it the assertions below would pass vacuously on `undefined`.
		await givenChannel(testBed, { channelId, ownerId: MOCK_CLOUD_OWNER_ID })
		await givenRemote(testBed, { channelId, remoteId: contactExternalId, name: 'Ada', type: ContactKind.USER })

		// BOTH STATES, in order — a flag that is constantly `false` would satisfy the post-delete assertion
		// alone, and this read's whole job is to change its answer when the thread goes away.
		const workspaceId = (await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })).id.value
		const live = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId, channelId, contactExternalId })
		const flagFor = async () =>
			(await testBed.resolve(GetAttachThreadWizard).execute({ ownerId: MOCK_CLOUD_OWNER_ID })).contacts.find(
				c => c.externalId === contactExternalId,
			)?.alreadyAttached

		expect(await flagFor()).toBe(true)

		const repo = testBed.resolve(ThreadRepository)
		const toDelete = (await repo.findById(live.id.value))!
		toDelete.delete()
		await repo.save(toDelete)

		expect(await flagFor()).toBe(false)
	})

	it('GetIssuesOverview — the issues of a deleted thread are not listed', async () => {
		const { thread } = await deletedThread()

		// `includeArchived` carries a schema default, and the parsed input the use case executes against
		// is the post-default shape — so the flag is spelled out here at the value the default gives it.
		const overview = await testBed.resolve(GetIssuesOverview).execute({ ownerId: MOCK_CLOUD_OWNER_ID, includeArchived: false })

		const listed = [...overview.groups.flatMap(g => g.items), ...overview.archived]
		expect(listed.map(i => i.threadId)).not.toContain(thread.id.value)
	})

	it('ListWorkspaces — a deleted thread stops counting toward threadCount', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await deletedThread({ workspaceId: workspace.id.value })

		const out = await testBed.resolve(ListWorkspaces).execute({ ownerId: MOCK_CLOUD_OWNER_ID })

		expect(out.workspaces.find(w => w.workspaceId === workspace.id.value)?.threadCount).toBe(0)
	})

	it('ThreadStatusDeriver.forOwner — a deleted thread has no derived status', async () => {
		const { thread } = await deletedThread()

		const statuses = await testBed.resolve(ThreadStatusDeriver).forOwner(MOCK_CLOUD_OWNER_ID)

		expect(statuses.has(thread.id.value)).toBe(false)
	})

	/**
	 * THE WHITELIST, asserted rather than merely documented. These two reads MUST keep seeing the row:
	 * `findById` is what lets `Thread.delete()` refuse a second call (AC-1), and `findByChannelContact`
	 * is what lets `AttachThread` find the corpse to revive (AC-5). A blanket `deleted_at IS NULL` in the
	 * repository would pass every test above and break both.
	 */
	it('WHITELIST — the write-side repository reads still see the deleted row', async () => {
		const { thread } = await deletedThread()
		const repo = testBed.resolve(ThreadRepository)

		expect((await repo.findById(thread.id.value))?.deletedAt).toBeInstanceOf(Date)
		expect((await repo.findByChannelContact(thread.channelId, thread.contactRef.externalId))?.deletedAt).toBeInstanceOf(Date)
	})

	/** Decision 1, stated as a test: nothing is removed. The transcript is still there to be revived onto. */
	it('WHITELIST — the transcript of a deleted thread is still in the database', async () => {
		const { thread } = await deletedThread()

		const entries = await testBed.resolve(ThreadRepository).listEntries(thread.id.value)

		expect(entries.map(e => e.text)).toContain('segredo da conversa apagada')
	})
})
