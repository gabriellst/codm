import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenUser } from '@test/support'
import { ExchangeDeviceCode } from './ExchangeDeviceCode'
import { IssueDeviceCode } from './IssueDeviceCode'
import { GetEntitlement } from './GetEntitlement'
import { RevokeDevice } from './RevokeDevice'
import { DeviceTokenRepository } from '../repositories/DeviceTokenRepository'
import { DeviceToken } from '../entities/DeviceToken'

describe('ExchangeDeviceCode use case (T2, AC-2)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let issueDeviceCode: IssueDeviceCode
	let exchangeDeviceCode: ExchangeDeviceCode
	let getEntitlement: GetEntitlement
	let revokeDevice: RevokeDevice
	let deviceTokens: DeviceTokenRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		issueDeviceCode = testBed.resolve(IssueDeviceCode)
		exchangeDeviceCode = testBed.resolve(ExchangeDeviceCode)
		getEntitlement = testBed.resolve(GetEntitlement)
		revokeDevice = testBed.resolve(RevokeDevice)
		deviceTokens = testBed.resolve(DeviceTokenRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('trades a one-time code for a device token exactly once — hash persisted, never plaintext', async () => {
		const user = await givenUser(testBed)
		const { code } = await issueDeviceCode.execute({ userId: user.id.value })

		const { token } = await exchangeDeviceCode.execute({ code })
		expect(token).toBeString()
		expect(token.length).toBeGreaterThan(0)

		const persisted = await deviceTokens.findByHash(DeviceToken.hashOf(token))
		expect(persisted).toBeDefined()
		expect(persisted!.tokenHash).not.toBe(token)
		expect(persisted!.userId.value).toBe(user.id.value)

		// The falsifier for AC-2: a SECOND exchange of the SAME code must not silently reuse it —
		// check-then-act would let this pass.
		await expect(exchangeDeviceCode.execute({ code })).rejects.toMatchObject({ name: 'DEVICE_CODE_INVALID' })
	})

	it('rejects an unknown code', async () => {
		await expect(exchangeDeviceCode.execute({ code: crypto.randomUUID() })).rejects.toMatchObject({
			name: 'DEVICE_CODE_INVALID',
		})
	})

	it('rejects an expired code', async () => {
		const user = await givenUser(testBed)
		const code = crypto.randomUUID()
		// Constructed directly via the repository (given-style, never via the use case) — IssueDeviceCode
		// hardcodes its 2-minute TTL, so an expired row can only be produced by going around it.
		await deviceTokens.issueCode(code, user.id.value, new Date(Date.now() - 1000))

		await expect(exchangeDeviceCode.execute({ code })).rejects.toMatchObject({ name: 'DEVICE_CODE_INVALID' })
	})

	it('an issued token validates against GetEntitlement — plan is the free-pivot literal', async () => {
		const user = await givenUser(testBed)
		const { code } = await issueDeviceCode.execute({ userId: user.id.value })
		const { token } = await exchangeDeviceCode.execute({ code })

		const entitlement = await getEntitlement.execute({ token })
		expect(entitlement).toEqual({ active: true, plan: 'free', userId: user.id.value })
	})

	it('rejects a Bearer that resolves to no token at all', async () => {
		await expect(getEntitlement.execute({ token: 'not-a-real-token' })).rejects.toMatchObject({
			name: 'DEVICE_TOKEN_INVALID',
		})
	})

	it('after RevokeDevice, the same token fails GetEntitlement — and a second revoke also fails', async () => {
		const user = await givenUser(testBed)
		const { code } = await issueDeviceCode.execute({ userId: user.id.value })
		const { token } = await exchangeDeviceCode.execute({ code })

		await revokeDevice.execute({ token })

		await expect(getEntitlement.execute({ token })).rejects.toMatchObject({ name: 'DEVICE_TOKEN_INVALID' })
		// Idempotent-REFUSE (entity invariant), not a silent no-op.
		await expect(revokeDevice.execute({ token })).rejects.toMatchObject({ name: 'DEVICE_TOKEN_INVALID' })
	})
})
