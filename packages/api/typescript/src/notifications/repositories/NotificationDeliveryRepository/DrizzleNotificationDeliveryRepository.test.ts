import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId } from '@test/support'
import { NotificationCategory, NotificationChannel, NotificationOrigin } from '@template/contracts-typescript/wire/enums'
import { Notification } from '../../entities/Notification'
import { NotificationDelivery } from '../../entities/NotificationDelivery'
import { NotificationRepository } from '../NotificationRepository'
import { NotificationDeliveryRepository } from './NotificationDeliveryRepository'

const STORE_A = testId('store', 'a')
const USER_A = 'user-a'
const USER_B = 'user-b'

describe('DrizzleNotificationDeliveryRepository', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let repo: NotificationDeliveryRepository
	let notifRepo: NotificationRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		repo = testBed.resolve(NotificationDeliveryRepository)
		notifRepo = testBed.resolve(NotificationRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function seedNotification(
		opts: { title?: string; category?: NotificationCategory; important?: boolean } = {},
	): Promise<Notification> {
		const n = Notification.create({
			title: opts.title ?? 'Test notification',
			content: 'body',
			category: opts.category ?? NotificationCategory.OTHER,
			origin: NotificationOrigin.SYSTEM,
			important: opts.important,
			ownerId: STORE_A,
		})
		await notifRepo.save(n)
		return n
	}

	function buildDelivery(opts: {
		notificationId: string
		userId: string
		channel?: NotificationChannel
		deliveredAt?: string
	}): NotificationDelivery {
		return NotificationDelivery.create({
			notificationId: opts.notificationId,
			userId: opts.userId,
			channel: opts.channel ?? NotificationChannel.IN_APP,
			deliveredAt: opts.deliveredAt !== undefined ? new Date(opts.deliveredAt) : undefined,
		})
	}

	describe('save + findById', () => {
		it('round-trips through Drizzle (FK chain works against real notifications row)', async () => {
			const n = await seedNotification({})
			const d = buildDelivery({ notificationId: n.id.value, userId: USER_A })
			await repo.save(d)

			const fetched = await repo.findById(d.id.value)
			expect(fetched?.notificationId.value).toBe(n.id.value)
			expect(fetched?.userId.value).toBe(USER_A)
			expect(fetched?.channel).toBe(NotificationChannel.IN_APP)
			expect(fetched?.readAt).toBeNull()
		})

		it('UPSERT persists markRead — readAt set + version bumped', async () => {
			const n = await seedNotification({})
			const d = buildDelivery({ notificationId: n.id.value, userId: USER_A })
			await repo.save(d)

			d.markRead(USER_A, new Date('2026-05-15T12:00:00.000Z'))
			await repo.save(d)

			const fetched = await repo.findById(d.id.value)
			expect(fetched?.readAt).toEqual(new Date('2026-05-15T12:00:00.000Z'))
			expect(fetched?.version).toBeGreaterThan(1)
		})
	})

	describe('inbox', () => {
		it('returns empty result when user has no deliveries', async () => {
			const r = await repo.inbox({ userId: USER_A, unreadOnly: false, page: 1, limit: 10 })
			expect(r.total).toBe(0)
			expect(r.unreadCount).toBe(0)
			expect(r.items).toEqual([])
		})

		it('JOINs deliveries to notifications + projects nested payload', async () => {
			const n = await seedNotification({ title: 'Inbox test', important: true, category: NotificationCategory.OTHER })
			await repo.save(buildDelivery({ notificationId: n.id.value, userId: USER_A }))

			const r = await repo.inbox({ userId: USER_A, unreadOnly: false, page: 1, limit: 10 })
			expect(r.total).toBe(1)
			expect(r.items[0]?.notification.title).toBe('Inbox test')
			expect(r.items[0]?.notification.important).toBe(true)
			expect(r.items[0]?.notification.category).toBe(NotificationCategory.OTHER)
			expect(r.items[0]?.delivery.userId.value).toBe(USER_A)
		})

		it('isolates by userId (cross-recipient leak protection)', async () => {
			const n = await seedNotification({})
			await repo.save(buildDelivery({ notificationId: n.id.value, userId: USER_A }))
			await repo.save(buildDelivery({ notificationId: n.id.value, userId: USER_B }))

			const a = await repo.inbox({ userId: USER_A, unreadOnly: false, page: 1, limit: 10 })
			expect(a.total).toBe(1)
			expect(a.items[0]?.delivery.userId.value).toBe(USER_A)
		})

		it('unreadOnly filters out deliveries with readAt set', async () => {
			const n = await seedNotification({})
			const read = buildDelivery({ notificationId: n.id.value, userId: USER_A })
			read.markRead(USER_A)
			await repo.save(read)

			const unread = buildDelivery({ notificationId: n.id.value, userId: USER_A, channel: NotificationChannel.EMAIL })
			await repo.save(unread)

			const all = await repo.inbox({ userId: USER_A, unreadOnly: false, page: 1, limit: 10 })
			const justUnread = await repo.inbox({ userId: USER_A, unreadOnly: true, page: 1, limit: 10 })

			expect(all.total).toBe(2)
			expect(justUnread.total).toBe(1)
			expect(justUnread.items[0]?.delivery.channel).toBe(NotificationChannel.EMAIL)
		})

		it('unreadCount counts unread regardless of unreadOnly filter', async () => {
			const n = await seedNotification({})
			const read = buildDelivery({ notificationId: n.id.value, userId: USER_A })
			read.markRead(USER_A)
			await repo.save(read)
			await repo.save(buildDelivery({ notificationId: n.id.value, userId: USER_A, channel: NotificationChannel.EMAIL }))

			const r = await repo.inbox({ userId: USER_A, unreadOnly: false, page: 1, limit: 10 })
			expect(r.total).toBe(2)
			expect(r.unreadCount).toBe(1) // computed before the unreadOnly filter — drives the unread-badge
		})

		it('filters by category[] when supplied', async () => {
			const n1 = await seedNotification({ title: 'order', category: NotificationCategory.ORDER_RECEIVED })
			const n2 = await seedNotification({ title: 'other', category: NotificationCategory.OTHER })
			await repo.save(buildDelivery({ notificationId: n1.id.value, userId: USER_A }))
			await repo.save(buildDelivery({ notificationId: n2.id.value, userId: USER_A }))

			const r = await repo.inbox({
				userId: USER_A,
				unreadOnly: false,
				categories: [NotificationCategory.ORDER_RECEIVED],
				page: 1,
				limit: 10,
			})
			expect(r.total).toBe(1)
			expect(r.items[0]?.notification.title).toBe('order')
		})

		it('paginates newest-first by deliveredAt', async () => {
			const n = await seedNotification({})
			await repo.save(
				buildDelivery({
					notificationId: n.id.value,
					userId: USER_A,
					channel: NotificationChannel.IN_APP,
					deliveredAt: '2026-05-01T00:00:00.000Z',
				}),
			)
			await repo.save(
				buildDelivery({
					notificationId: n.id.value,
					userId: USER_A,
					channel: NotificationChannel.EMAIL,
					deliveredAt: '2026-05-15T00:00:00.000Z',
				}),
			)
			await repo.save(
				buildDelivery({
					notificationId: n.id.value,
					userId: USER_A,
					channel: NotificationChannel.PUSH,
					deliveredAt: '2026-05-10T00:00:00.000Z',
				}),
			)

			const r = await repo.inbox({ userId: USER_A, unreadOnly: false, page: 1, limit: 10 })
			expect(r.items.map(i => i.delivery.deliveredAt)).toEqual([
				new Date('2026-05-15T00:00:00.000Z'),
				new Date('2026-05-10T00:00:00.000Z'),
				new Date('2026-05-01T00:00:00.000Z'),
			])
		})
	})

	describe('delete', () => {
		it('removes the delivery row + subsequent findById returns undefined', async () => {
			const n = await seedNotification({})
			const d = buildDelivery({ notificationId: n.id.value, userId: USER_A })
			await repo.save(d)

			await repo.delete(d.id.value)
			expect(await repo.findById(d.id.value)).toBeUndefined()
		})
	})
})
