import { describe, expect, it } from 'bun:test'
import { AesCredentialVault } from './AesCredentialVault'

// 32 bytes of 'a' → 44-char base64 ('YWFh...AQ=='). Real prod key uses
// `openssl rand -base64 32`; this is fine for tests.
const KEY = Buffer.from('a'.repeat(32)).toString('base64')

describe('AesCredentialVault', () => {
	const vault = new AesCredentialVault({ keyBase64: KEY })

	it('round-trips a credential payload', async () => {
		const plain = { accessToken: 'sk_live_abc', shopDomain: 'foo.myshopify.com' }
		const sealed = await vault.seal(plain)
		expect(sealed.encryptionAlgorithm).toBe('aes-256-gcm-v1')
		const out = await vault.open<typeof plain>(sealed)
		expect(out).toEqual(plain)
	})

	it('detects tampered ciphertext (AEAD)', async () => {
		const sealed = await vault.seal({ x: 1 })
		sealed.encryptedPayload.ct = `${sealed.encryptedPayload.ct.slice(0, -2)}AA`
		let caught: unknown = null
		try {
			await vault.open(sealed)
		} catch (e) {
			caught = e
		}
		expect(caught).not.toBeNull()
		expect((caught as Error & { name: string }).name).toBe('CREDENTIAL_DECRYPT_FAILED')
	})

	it('detects tampered IV', async () => {
		const sealed = await vault.seal({ x: 1 })
		sealed.encryptedPayload.iv = `${sealed.encryptedPayload.iv.slice(0, -2)}AA`
		let caught: unknown = null
		try {
			await vault.open(sealed)
		} catch (e) {
			caught = e
		}
		expect((caught as Error & { name: string }).name).toBe('CREDENTIAL_DECRYPT_FAILED')
	})

	it('detects tampered tag', async () => {
		const sealed = await vault.seal({ x: 1 })
		sealed.encryptedPayload.tag = `${sealed.encryptedPayload.tag.slice(0, -2)}AA`
		let caught: unknown = null
		try {
			await vault.open(sealed)
		} catch (e) {
			caught = e
		}
		expect((caught as Error & { name: string }).name).toBe('CREDENTIAL_DECRYPT_FAILED')
	})

	it('produces different ciphertexts on each seal (IV uniqueness)', async () => {
		const a = await vault.seal({ a: 1 })
		const b = await vault.seal({ a: 1 })
		expect(a.encryptedPayload.iv).not.toBe(b.encryptedPayload.iv)
		expect(a.encryptedPayload.ct).not.toBe(b.encryptedPayload.ct)
	})

	it('fails to open with a different key (key isolation)', async () => {
		const sealed = await vault.seal({ secret: 'topsecret' })
		const otherVault = new AesCredentialVault({
			keyBase64: Buffer.from('b'.repeat(32)).toString('base64'),
		})
		let caught: unknown = null
		try {
			await otherVault.open(sealed)
		} catch (e) {
			caught = e
		}
		expect((caught as Error & { name: string }).name).toBe('CREDENTIAL_DECRYPT_FAILED')
	})

	it('rejects unknown encryption algorithm version', async () => {
		let caught: unknown = null
		try {
			await vault.open({
				encryptionAlgorithm: 'aes-256-gcm-v999' as any,
				encryptedPayload: { iv: 'aa', ct: 'bb', tag: 'cc' },
			})
		} catch (e) {
			caught = e
		}
		expect((caught as Error & { name: string }).name).toBe('CREDENTIAL_DECRYPT_FAILED')
	})

	it('throws MISSING_ENVIRONMENT_VARIABLE on wrong key length', () => {
		let caught: unknown = null
		try {
			new AesCredentialVault({
				keyBase64: Buffer.from('shortkey').toString('base64'),
			})
		} catch (e) {
			caught = e
		}
		expect((caught as Error & { name: string }).name).toBe('MISSING_ENVIRONMENT_VARIABLE')
	})
})
