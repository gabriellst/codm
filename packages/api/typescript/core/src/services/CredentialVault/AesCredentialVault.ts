import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { BaseError } from '../../types/BaseError'
import type { BaseInfrastructureErrors } from '../../errors/codes'
import { CredentialVault, type SealedCredential } from './CredentialVault'

/**
 * AES-256-GCM impl of CredentialVault. Authenticated encryption — opening
 * verifies the tag; any tampered byte in iv/ct/tag bubbles as
 * `CREDENTIAL_DECRYPT_FAILED`.
 *
 * Key is 32 bytes (256 bits), base64-encoded at construction (matches
 * `openssl rand -base64 32` output: 44 chars). Tests construct directly
 * with a stable test key; production wiring uses
 * `Config.env.CREDENTIAL_VAULT_KEY` via a useFactory binding.
 */
export class AesCredentialVault extends CredentialVault {
	private readonly key: Buffer

	constructor({ keyBase64 }: { keyBase64: string }) {
		super()
		const key = Buffer.from(keyBase64, 'base64')
		if (key.length !== 32) {
			throw new BaseError<BaseInfrastructureErrors>(
				'MISSING_ENVIRONMENT_VARIABLE',
				`AesCredentialVault key must decode to 32 bytes (got ${key.length}). Generate via \`openssl rand -base64 32\`.`,
			)
		}
		this.key = key
	}

	async seal<T extends Record<string, unknown>>(plain: T): Promise<SealedCredential> {
		const iv = randomBytes(12) // GCM canonical 96-bit nonce
		const cipher = createCipheriv('aes-256-gcm', this.key, iv)
		const ct = Buffer.concat([cipher.update(JSON.stringify(plain), 'utf8'), cipher.final()])
		const tag = cipher.getAuthTag()

		return {
			encryptionAlgorithm: 'aes-256-gcm-v1',
			encryptedPayload: {
				iv: iv.toString('base64'),
				ct: ct.toString('base64'),
				tag: tag.toString('base64'),
			},
		}
	}

	async open<T extends Record<string, unknown>>(sealed: SealedCredential): Promise<T> {
		if (sealed.encryptionAlgorithm !== 'aes-256-gcm-v1') {
			throw new BaseError<BaseInfrastructureErrors>('CREDENTIAL_DECRYPT_FAILED')
		}

		try {
			const iv = Buffer.from(sealed.encryptedPayload.iv, 'base64')
			const ct = Buffer.from(sealed.encryptedPayload.ct, 'base64')
			const tag = Buffer.from(sealed.encryptedPayload.tag, 'base64')

			const decipher = createDecipheriv('aes-256-gcm', this.key, iv)
			decipher.setAuthTag(tag)
			const plain = Buffer.concat([decipher.update(ct), decipher.final()])

			return JSON.parse(plain.toString('utf8')) as T
		} catch {
			// Any failure (bad tag, wrong key, malformed base64, garbled JSON)
			// surfaces as the same opaque error — never leak which check failed.
			throw new BaseError<BaseInfrastructureErrors>('CREDENTIAL_DECRYPT_FAILED')
		}
	}
}
