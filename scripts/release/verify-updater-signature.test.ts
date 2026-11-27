import { describe, expect, it } from 'bun:test'
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { verifyMinisign } from './verify-updater-signature'

/**
 * Monta pubkey e assinatura no formato minisign (o mesmo do `tauri signer`) com uma chave gerada na hora,
 * para provar que o verificador aceita o que é válido e recusa arquivo adulterado, chave errada e comentário
 * confiável trocado. Falsificador: troque `verify` por `true` e os três casos de recusa falham.
 */
function keyPair() {
	const { publicKey, privateKey } = generateKeyPairSync('ed25519')
	const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)
	const keyId = randomBytes(8)
	const pubText = `untrusted comment: minisign public key\n${Buffer.concat([Buffer.from('Ed'), keyId, raw]).toString('base64')}\n`
	return { privateKey, keyId, pubText }
}

function signText(file: Buffer, k: ReturnType<typeof keyPair>, trusted = 'timestamp:1\tfile:app.AppImage'): string {
	const digest = Buffer.from(new Bun.CryptoHasher('blake2b512').update(file).digest())
	const sig = sign(null, digest, k.privateKey)
	const global = sign(null, Buffer.concat([sig, Buffer.from(trusted)]), k.privateKey)
	return [
		'untrusted comment: signature from tauri secret key',
		Buffer.concat([Buffer.from('ED'), k.keyId, sig]).toString('base64'),
		`trusted comment: ${trusted}`,
		global.toString('base64'),
		'',
	].join('\n')
}

describe('verifyMinisign', () => {
	const file = Buffer.from('conteúdo do AppImage')

	it('aceita a assinatura prehashed (ED) do próprio arquivo', () => {
		const k = keyPair()
		expect(verifyMinisign(file, signText(file, k), k.pubText)).toEqual({ ok: true })
	})

	it('recusa o arquivo adulterado', () => {
		const k = keyPair()
		const result = verifyMinisign(Buffer.from('outro conteúdo'), signText(file, k), k.pubText)
		expect(result.ok).toBe(false)
	})

	it('recusa a chave errada', () => {
		const result = verifyMinisign(file, signText(file, keyPair()), keyPair().pubText)
		expect(result.ok).toBe(false)
	})

	it('recusa o comentário confiável trocado', () => {
		const k = keyPair()
		const tampered = signText(file, k).replace('file:app.AppImage', 'file:outro.AppImage')
		const result = verifyMinisign(file, tampered, k.pubText)
		expect(result).toEqual({ ok: false, reason: 'assinatura global (comentário confiável) não confere' })
	})
})
