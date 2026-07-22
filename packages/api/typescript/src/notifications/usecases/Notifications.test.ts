import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId } from '@test/support'
import { DomainEventRepository } from '@template/core-typescript'
import { NotificationCategory } from '@template/contracts-typescript/wire/enums'
import { SendNotification } from './SendNotification'
import { MarkNotificationRead } from './MarkNotificationRead'
import { NotificationRepository } from '../repositories/NotificationRepository'
import { NotificationDeliveryRepository } from '../repositories/NotificationDeliveryRepository'
import { NotificationDeliveryReadEvent, NotificationSentEvent } from '../events'

const STORE = testId('store', '1')
const USER_SENDER = testId('user', 'sender')
const USER_A = testId('user', 'a')
const USER_B = testId('user', 'b')

describe('Notifications (C53/C55)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let send: SendNotification
	let markRead: MarkNotificationRead
	let notifRepo: NotificationRepository
	let deliveryRepo: NotificationDeliveryRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		send = testBed.resolve(SendNotification)
		markRead = testBed.resolve(MarkNotificationRead)
		notifRepo = testBed.resolve(NotificationRepository)
		deliveryRepo = testBed.resolve(NotificationDeliveryRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function readSentEvents() {
		return testBed.resolve(DomainEventRepository).findByType(NotificationSentEvent)
	}
	async function readReadEvents() {
		return testBed.resolve(DomainEventRepository).findByType(NotificationDeliveryReadEvent)
	}

	describe('SendNotification (C53)', () => {
		it('creates one notification + one delivery per (target × enabled channel) + emits Sent', async () => {
			const r = await send.execute({
				userId: USER_SENDER,
				ownerId: STORE,
				targetUserIds: [USER_A, USER_B],
				title: 'Hello',
				content: 'World',
				category: NotificationCategory.OTHER,
				important: false,
				pushEnabled: true,
				emailEnabled: true,
				contentType: 'text/plain',
			})
			// 2 targets × 2 channels = 4 deliveries
			expect(r.deliveriesCreated).toBe(4)

			const emitted = await readSentEvents()
			expect(emitted).toHaveLength(1)
			expect(emitted[0]!.payload.recipientCount).toBe(2)
			expect(emitted[0]!.payload.deliveriesCreated).toBe(4)
		})

		it('throws EMPTY_RECIPIENTS when targetUserIds is empty', async () => {
			await expect(
				send.execute({
					userId: USER_SENDER,
					ownerId: STORE,
					targetUserIds: [],
					title: 'x',
					content: 'y',
					category: NotificationCategory.OTHER,
					important: false,
					pushEnabled: true,
					emailEnabled: false,
					contentType: 'text/plain',
				}),
			).rejects.toMatchObject({ name: 'EMPTY_RECIPIENTS' })
		})

		it('throws NO_CHANNEL_ENABLED when both pushEnabled and emailEnabled are false', async () => {
			await expect(
				send.execute({
					userId: USER_SENDER,
					ownerId: STORE,
					targetUserIds: [USER_A],
					title: 'x',
					content: 'y',
					category: NotificationCategory.OTHER,
					important: false,
					pushEnabled: false,
					emailEnabled: false,
					contentType: 'text/plain',
				}),
			).rejects.toMatchObject({ name: 'NO_CHANNEL_ENABLED' })
		})
	})

	describe('MarkNotificationRead (C55)', () => {
		it('marks a delivery read + emits + is idempotent on second call', async () => {
			await send.execute({
				userId: USER_SENDER,
				ownerId: STORE,
				targetUserIds: [USER_A],
				title: 't',
				content: 'c',
				category: NotificationCategory.OTHER,
				important: false,
				pushEnabled: true,
				emailEnabled: false,
				contentType: 'text/plain',
			})
			const inboxResult = await deliveryRepo.inbox({ userId: USER_A, unreadOnly: false, page: 1, limit: 20 })
			const deliveryId = inboxResult.items[0]!.delivery.id.toString()

			await markRead.execute({ userId: USER_A, notificationDeliveryIds: [deliveryId] })

			const afterInbox = await deliveryRepo.inbox({ userId: USER_A, unreadOnly: true, page: 1, limit: 20 })
			expect(afterInbox.total).toBe(0) // no longer unread
			expect(await readReadEvents()).toHaveLength(1)

			// idempotent: second call does nothing + emits no new event
			await markRead.execute({ userId: USER_A, notificationDeliveryIds: [deliveryId] })
			expect(await readReadEvents()).toHaveLength(1)
		})

		it('marks multiple deliveries read in one call + emits one event per delivery', async () => {
			await send.execute({
				userId: USER_SENDER,
				ownerId: STORE,
				targetUserIds: [USER_A],
				title: 't',
				content: 'c',
				category: NotificationCategory.OTHER,
				important: false,
				pushEnabled: true,
				emailEnabled: true,
				contentType: 'text/plain',
			})
			const inboxResult = await deliveryRepo.inbox({ userId: USER_A, unreadOnly: false, page: 1, limit: 20 })
			const ids = inboxResult.items.map(i => i.delivery.id.toString())
			expect(ids.length).toBe(2)

			await markRead.execute({ userId: USER_A, notificationDeliveryIds: ids })

			const afterInbox = await deliveryRepo.inbox({ userId: USER_A, unreadOnly: true, page: 1, limit: 20 })
			expect(afterInbox.total).toBe(0)
			expect(await readReadEvents()).toHaveLength(2)
		})

		it('throws DELIVERY_NOT_OWNED_BY_USER when the calling user is not the recipient', async () => {
			await send.execute({
				userId: USER_SENDER,
				ownerId: STORE,
				targetUserIds: [USER_A],
				title: 't',
				content: 'c',
				category: NotificationCategory.OTHER,
				important: false,
				pushEnabled: true,
				emailEnabled: false,
				contentType: 'text/plain',
			})
			const inboxResult = await deliveryRepo.inbox({ userId: USER_A, unreadOnly: false, page: 1, limit: 20 })

			await expect(
				markRead.execute({ userId: USER_B, notificationDeliveryIds: [inboxResult.items[0]!.delivery.id.toString()] }),
			).rejects.toMatchObject({
				name: 'DELIVERY_NOT_OWNED_BY_USER',
			})
		})

		it('throws NOTIFICATION_DELIVERY_NOT_FOUND on missing id', async () => {
			await expect(markRead.execute({ userId: USER_A, notificationDeliveryIds: [testId()] })).rejects.toMatchObject({
				name: 'NOTIFICATION_DELIVERY_NOT_FOUND',
			})
		})
	})
})
