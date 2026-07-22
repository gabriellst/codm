import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId } from '@test/support'
import { NotificationCategory, NotificationOrigin } from '@template/contracts-typescript/wire/enums'
import { Notification } from '../../entities/Notification'
import { NotificationRepository } from './NotificationRepository'

const STORE_A = testId('store', 'A')

describe('DrizzleNotificationRepository', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let repo: NotificationRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		repo = testBed.resolve(NotificationRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	function build(opts: {
		title?: string
		content?: string
		important?: boolean
		category?: NotificationCategory
		ownerId?: string | null
		payload?: Record<string, unknown>
	}): Notification {
		return Notification.create({
			title: opts.title ?? 'Hello',
			content: opts.content ?? 'World',
			category: opts.category ?? NotificationCategory.OTHER,
			origin: NotificationOrigin.SYSTEM,
			important: opts.important,
			payload: opts.payload,
			ownerId: 'ownerId' in opts ? opts.ownerId : STORE_A,
		})
	}

	describe('save + findById', () => {
		it('round-trips a Notification through Drizzle', async () => {
			const entity = build({ title: 'Order received', content: 'You have a new order' })
			await repo.save(entity)

			const fetched = await repo.findById(entity.id.value)
			expect(fetched?.title).toBe('Order received')
			expect(fetched?.content).toBe('You have a new order')
			expect(fetched?.category).toBe(NotificationCategory.OTHER)
			expect(fetched?.origin).toBe(NotificationOrigin.SYSTEM)
			expect(fetched?.important).toBe(false) // default
			expect(fetched?.contentType).toBe('text/plain') // default
			expect(fetched?.payload).toEqual({})
			expect(fetched?.ownerId?.value).toBe(STORE_A)
		})

		it('returns undefined when no row matches', async () => {
			const r = await repo.findById(testId())
			expect(r).toBeUndefined()
		})

		it('round-trips important flag + payload jsonb verbatim', async () => {
			const entity = build({
				important: true,
				payload: { orderId: 'ord-42', amountCents: 5000, tags: ['urgent'] },
			})
			await repo.save(entity)

			const fetched = await repo.findById(entity.id.value)
			expect(fetched?.important).toBe(true)
			expect(fetched?.payload).toEqual({ orderId: 'ord-42', amountCents: 5000, tags: ['urgent'] })
		})

		it('round-trips nullable ownerId (system-wide notification)', async () => {
			const entity = build({ ownerId: null })
			await repo.save(entity)

			const fetched = await repo.findById(entity.id.value)
			expect(fetched?.ownerId).toBeNull()
		})

		it('UPSERT bumps version', async () => {
			const entity = build({})
			await repo.save(entity)
			await repo.save(entity)

			const fetched = await repo.findById(entity.id.value)
			expect(fetched?.version).toBeGreaterThan(1)
		})
	})

	describe('delete', () => {
		it('removes the row + subsequent findById returns undefined', async () => {
			const entity = build({})
			await repo.save(entity)
			await repo.delete(entity.id.value)
			expect(await repo.findById(entity.id.value)).toBeUndefined()
		})
	})
})
