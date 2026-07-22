import { describe, expect, it } from 'bun:test'
import { BaseError } from '@template/core-typescript'
import { FcmRegistrationToken } from './FcmRegistrationToken'
import { FcmPlatform } from '@template/contracts-typescript/wire/enums'

describe('FcmRegistrationToken aggregate', () => {
	it('creates with userId + token + platform + initial lastSeenAt', () => {
		const before = Date.now()
		const t = FcmRegistrationToken.create({
			userId: 'u1',
			token: 'abc',
			platform: FcmPlatform.IOS,
		})
		const after = Date.now()

		expect(t.userId.value).toBe('u1')
		expect(t.token).toBe('abc')
		expect(t.platform).toBe(FcmPlatform.IOS)
		expect(t.lastSeenAt).toBeInstanceOf(Date)
		expect(t.lastSeenAt.getTime()).toBeGreaterThanOrEqual(before)
		expect(t.lastSeenAt.getTime()).toBeLessThanOrEqual(after)
	})

	it('rejects empty token via Zod min(1)', () => {
		expect(() => FcmRegistrationToken.create({ userId: 'u1', token: '', platform: FcmPlatform.ANDROID })).toThrow(BaseError)
	})

	it('touch() advances lastSeenAt', async () => {
		const t = FcmRegistrationToken.create({
			userId: 'u1',
			token: 'abc',
			platform: FcmPlatform.ANDROID,
		})
		const before = t.lastSeenAt.getTime()
		await new Promise(r => setTimeout(r, 5))
		t.touch()
		expect(t.lastSeenAt.getTime()).toBeGreaterThan(before)
	})

	it('accepts each FcmPlatform variant (IOS / ANDROID / WEB)', () => {
		const ios = FcmRegistrationToken.create({ userId: 'u1', token: 't1', platform: FcmPlatform.IOS })
		const android = FcmRegistrationToken.create({
			userId: 'u1',
			token: 't2',
			platform: FcmPlatform.ANDROID,
		})
		const web = FcmRegistrationToken.create({ userId: 'u1', token: 't3', platform: FcmPlatform.WEB })
		expect(ios.platform).toBe(FcmPlatform.IOS)
		expect(android.platform).toBe(FcmPlatform.ANDROID)
		expect(web.platform).toBe(FcmPlatform.WEB)
	})
})
