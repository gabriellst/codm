import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenWorkspace } from '@test/support'
import { BaseError, DomainEventRepository } from '@codm/core-typescript'
import { ProviderKind, ContactKind } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
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
		expect(thread?.canInvoke({ senderExternalId: 'stranger', text: '@berzerk-club fix it' })).toBe(true)
		expect(thread?.canInvoke({ senderExternalId: 'stranger', text: 'fix it' })).toBe(false)
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

	it('dedupes an already-attached contact (THREAD_ALREADY_ATTACHED)', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const useCase = testBed.resolve(AttachThread)
		await useCase.execute({ ownerId: OPERATOR_ID, contactRef, workspaceId: workspace.id.value, providers: [ProviderKind.CLAUDE_CODE] })
		await expect(
			useCase.execute({ ownerId: OPERATOR_ID, contactRef, workspaceId: workspace.id.value, providers: [ProviderKind.CLAUDE_CODE] }),
		).rejects.toThrow(BaseError)
	})
})
