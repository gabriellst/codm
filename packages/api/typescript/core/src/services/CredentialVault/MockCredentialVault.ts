import { CredentialVault, type SealedCredential } from './CredentialVault'

/**
 * In-memory vault for tests that don't need real cryptography. Sealing JSON-
 * encodes the plain text and stuffs it into the `ct` field (base64 for shape
 * fidelity); opening reverses. Tamper detection is opt-in (set
 * `simulateTamperFailure=true` to make the next open throw).
 *
 * Use AesCredentialVault for tests that need to validate real AEAD behavior.
 */
export class MockCredentialVault extends CredentialVault {
	simulateTamperFailure = false

	async seal<T extends Record<string, unknown>>(plain: T): Promise<SealedCredential> {
		return {
			encryptionAlgorithm: 'aes-256-gcm-v1',
			encryptedPayload: {
				iv: Buffer.from('mock-iv-12bytes!').toString('base64'),
				ct: Buffer.from(JSON.stringify(plain), 'utf8').toString('base64'),
				tag: Buffer.from('mock-tag-16-byte').toString('base64'),
			},
		}
	}

	async open<T extends Record<string, unknown>>(sealed: SealedCredential): Promise<T> {
		if (this.simulateTamperFailure) {
			throw new Error('MockCredentialVault: simulated tamper failure')
		}
		const decoded = Buffer.from(sealed.encryptedPayload.ct, 'base64').toString('utf8')
		return JSON.parse(decoded) as T
	}
}
