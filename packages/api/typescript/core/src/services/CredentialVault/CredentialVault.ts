/**
 * Algorithm-versioned credential envelope. Stored as-is on
 * `store_integration_credentials.encryption_algorithm` + `.encrypted_payload`
 * (the schema's jsonb column). Future algorithms add new framing types without
 * a migration.
 */
export interface EncryptedPayloadAesGcmV1 {
	/** base64 12-byte IV */
	iv: string
	/** base64 ciphertext */
	ct: string
	/** base64 16-byte GCM auth tag */
	tag: string
}

export interface SealedCredential {
	encryptionAlgorithm: 'aes-256-gcm-v1'
	encryptedPayload: EncryptedPayloadAesGcmV1
}

/**
 * Symmetric vault for external integration credential payloads (OAuth tokens,
 * API keys, endpoint URLs). Sealing produces a versioned envelope; opening
 * decrypts and returns the plain JSON object.
 *
 * Implementations rotate keys via versioned algorithm framing — today only
 * `aes-256-gcm-v1` exists; envelope encryption / rotation can land later.
 */
export abstract class CredentialVault {
	abstract seal<T extends Record<string, unknown>>(plain: T): Promise<SealedCredential>

	abstract open<T extends Record<string, unknown>>(sealed: SealedCredential): Promise<T>
}
