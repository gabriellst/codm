import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread, givenWorkspace } from '@test/support'
import { BaseError, DomainEventRepository } from '@codm/core-typescript'
import { ProviderKind, ContactKind, ProviderStatus } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { ProviderDetector } from '@agent/services/ProviderDetector'
import { MockProviderDetector } from '@agent/services/ProviderDetector/MockProviderDetector'
import { AgentRunnerFactory } from '@agent/services/AgentRunnerFactory/AgentRunnerFactory'
import { AttachThread } from './AttachThread'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ChannelConnectivity } from '../services/ChannelConnectivity'
import { ThreadAttachedEvent } from '../events'

const channelId = '00000000-0000-4000-8000-0000000000aa'

describe('AttachThread use case', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
		// Default: the channel is connected (no gateway.channels row is seeded in these tests). The
		// CHANNEL_NOT_CONNECTED case re-overrides to false below.
		testBed.override(ChannelConnectivity, { isConnected: async () => true, anyConnected: async () => true } as ChannelConnectivity)
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const contactRef = { channelId, externalId: 'c1', displayName: 'Acme Team', kind: ContactKind.GROUP }

	it('happy path: binds a thread + emits thread.attached', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const useCase = testBed.resolve(AttachThread)

		const out = await useCase.execute({
			ownerId: OPERATOR_ID,
			contactRef,
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})
		expect(out.threadId).toBeDefined()

		const thread = await testBed.resolve(ThreadRepository).findById(out.threadId)
		expect(thread?.workspaceId).toBe(workspace.id.value)
		expect(thread?.participants.some(p => p.canInvoke)).toBe(true)

		const events = await testBed.resolve(DomainEventRepository).findByType(ThreadAttachedEvent)
		expect(events).toHaveLength(1)
	})

	it('MINTS the citation tag from the linked workspace folder and gates the thread on it', async () => {
		// The headline behaviour of #16, asserted at the place the founder named — the workspace-LINK
		// flow. Without this, wiring `mintMentionTag` to the wrong argument (or dropping the line) leaves
		// every unit and flow suite green, because they all seed threads through `givenThread`'s own
		// constant instead of going through this use case.
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID, path: '/Users/dev/Berzerk Club' })
		const useCase = testBed.resolve(AttachThread)

		const out = await useCase.execute({
			ownerId: OPERATOR_ID,
			contactRef: { ...contactRef, externalId: 'c-mint' },
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})

		const thread = await testBed.resolve(ThreadRepository).findById(out.threadId)
		// Slugged from the basename: lowercased, spaces collapsed to a dash. The gate is ON from birth —
		// nobody has to call ConfigureMentionGate for the product to have its default behaviour.
		expect(thread?.mentionGate).toEqual({ enabled: true, tag: '@berzerk-club' })
		// `addressedToAgent`, not `canInvoke`: what is under test is the MINTED TAG, and `canInvoke` would
		// drag the freshness window into an assertion that has nothing to do with when a message arrived.
		expect(thread?.addressedToAgent({ senderExternalId: 'stranger', text: '@berzerk-club fix it' })).toBe(true)
		expect(thread?.addressedToAgent({ senderExternalId: 'stranger', text: 'fix it' })).toBe(false)
	})

	it('rejects when the channel is not connected (CHANNEL_NOT_CONNECTED)', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		testBed.override(ChannelConnectivity, { isConnected: async () => false, anyConnected: async () => false } as ChannelConnectivity)
		const useCase = testBed.resolve(AttachThread)
		await expect(
			useCase.execute({ ownerId: OPERATOR_ID, contactRef, workspaceId: workspace.id.value, providers: [ProviderKind.CLAUDE_CODE] }),
		).rejects.toThrow(BaseError)
	})

	it('rejects an unknown workspace (WORKSPACE_NOT_FOUND)', async () => {
		const useCase = testBed.resolve(AttachThread)
		await expect(
			useCase.execute({
				ownerId: OPERATOR_ID,
				contactRef,
				workspaceId: '00000000-0000-4000-8000-0000000000cc',
				providers: [ProviderKind.CLAUDE_CODE],
			}),
		).rejects.toThrow(BaseError)
	})

	/**
	 * THE MACHINE THAT HAS THE BINARY — the state that made the hole reachable.
	 *
	 * The default mock catalog reports codex NOT_INSTALLED, which means the pre-existing
	 * `PROVIDER_NOT_DETECTED` check would reject a CODEX attach for the WRONG reason and a guard test
	 * built on the default would pass with the guard deleted. Overriding detection to DETECTED is what
	 * puts the drivability check on the only path that can reach it — a developer with the codex CLI on
	 * PATH, which is the machine the founder was sitting at.
	 */
	const codexOnPath = () =>
		testBed.override(
			ProviderDetector,
			MockProviderDetector.with({
				[ProviderKind.CODEX]: {
					name: ProviderKind.CODEX,
					status: ProviderStatus.DETECTED,
					binaryPath: '/usr/local/bin/codex',
					version: '0.1.0 (mock)',
				},
			}),
		)

	/**
	 * THE HOLE, CLOSED. Installed is not drivable, and the write is where that has to be said — the
	 * wizard's `comingSoon` (8721a9b8) only stops the button from being offered, while this endpoint
	 * takes a `providers` array from any caller and a stale screen still posts one.
	 *
	 * Both halves matter: the named refusal AND the absence of a row. Before this, the attach SUCCEEDED
	 * and the lie only surfaced on the first turn, inside a conversation the operator had already made.
	 */
	it('rejects a provider the engine has no runner for, even with the binary installed (PROVIDER_COMING_SOON)', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		codexOnPath()
		const useCase = testBed.resolve(AttachThread)

		await expect(
			useCase.execute({ ownerId: OPERATOR_ID, contactRef, workspaceId: workspace.id.value, providers: [ProviderKind.CODEX] }),
		).rejects.toThrow(expect.objectContaining({ name: 'PROVIDER_COMING_SOON' }))

		// NOTHING was written — the guard runs before the transaction, so there is no thread to find and
		// no `thread.attached` for BC5 to have indexed.
		const existing = await testBed.resolve(ThreadRepository).findByChannelContact(channelId, contactRef.externalId)
		expect(existing).toBeUndefined()
		expect(await testBed.resolve(DomainEventRepository).findByType(ThreadAttachedEvent)).toHaveLength(0)
	})

	/** A drivable provider does NOT launder an undrivable one riding along in the same array. */
	it('rejects a MIXED array on its undrivable member', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		codexOnPath()
		const useCase = testBed.resolve(AttachThread)

		await expect(
			useCase.execute({
				ownerId: OPERATOR_ID,
				contactRef,
				workspaceId: workspace.id.value,
				providers: [ProviderKind.CLAUDE_CODE, ProviderKind.CODEX],
			}),
		).rejects.toThrow(expect.objectContaining({ name: 'PROVIDER_COMING_SOON' }))
	})

	/**
	 * THE SECOND WRITE PATH. `AttachThread` is the only use case that writes `threads.providers`, but it
	 * writes them TWICE — `Thread.create` for a new contact and `Thread.revive` for a re-attach
	 * (thread-deletion decision 4). A guard placed inside the create branch would leave re-attach as a
	 * door back to exactly the state this closes.
	 */
	it('guards the REVIVE path too — re-attaching a deleted thread cannot bind an undrivable provider', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const repo = testBed.resolve(ThreadRepository)
		const thread = await givenThread(testBed, {
			ownerId: OPERATOR_ID,
			workspaceId: workspace.id.value,
			channelId,
			contactExternalId: 'revive-me',
		})
		const loaded = (await repo.findById(thread.id.value))!
		loaded.delete()
		await repo.save(loaded)

		codexOnPath()
		await expect(
			testBed.resolve(AttachThread).execute({
				ownerId: OPERATOR_ID,
				contactRef: { channelId, externalId: 'revive-me', displayName: 'Contact', kind: ContactKind.USER },
				workspaceId: workspace.id.value,
				providers: [ProviderKind.CODEX],
			}),
		).rejects.toThrow(expect.objectContaining({ name: 'PROVIDER_COMING_SOON' }))

		// Still deleted: the refusal left the corpse exactly as it was, rather than half-reviving it.
		expect((await repo.findById(thread.id.value))?.deletedAt).toBeDefined()
	})

	/**
	 * THE PREMISE, PINNED. Everything above is only meaningful while CODEX is genuinely outside the
	 * bound factory's reach and CLAUDE_CODE is inside it — and both facts come from the SAME
	 * `supported` the use case reads. Asserting them here means widening the factory turns this line
	 * red beside the guard tests, so the inversion reads as "the wiring changed", not "the guard broke".
	 */
	it('the drivable set under test IS the bound factory’s — not a literal in this suite', () => {
		const supported = testBed.resolve(AgentRunnerFactory).supported
		expect(supported).toContain(ProviderKind.CLAUDE_CODE)
		expect(supported).not.toContain(ProviderKind.CODEX)
	})

	it('dedupes an already-attached contact (THREAD_ALREADY_ATTACHED)', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const useCase = testBed.resolve(AttachThread)
		await useCase.execute({ ownerId: OPERATOR_ID, contactRef, workspaceId: workspace.id.value, providers: [ProviderKind.CLAUDE_CODE] })
		await expect(
			useCase.execute({ ownerId: OPERATOR_ID, contactRef, workspaceId: workspace.id.value, providers: [ProviderKind.CLAUDE_CODE] }),
		).rejects.toThrow(BaseError)
	})
})
