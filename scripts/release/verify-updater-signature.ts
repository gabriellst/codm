/**
 * Verifica a assinatura do updater (formato minisign, como o `tauri signer` gera) de um artefato contra a
 * pubkey publicada no `tauri.conf.json` — SEM depender do binário `minisign`, que o Ubuntu 22.04 do runner
 * não tem (medido em 27/11/2026: `E: Unable to locate package minisign`).
 *
 * Formato (minisign):
 * - pubkey: texto `untrusted comment: …\n<base64(alg[2] ‖ keyId[8] ‖ ed25519_pk[32])>`.
 * - assinatura: texto `untrusted comment: …\n<base64(alg[2] ‖ keyId[8] ‖ sig[64])>\ntrusted comment: <t>\n
 *   <base64(globalSig[64])>`. `alg` = `Ed` assina o arquivo; `ED` assina o BLAKE2b-512 do arquivo
 *   (prehash). A global assina `sig ‖ t`.
 * O `tauri.conf.json` e o `.sig` do Tauri guardam esses TEXTOS em base64 (uma camada a mais).
 *
 * Uso: bun scripts/release/verify-updater-signature.ts <arquivo> <arquivo.sig> <tauri.conf.json>
 */
import { verify } from 'node:crypto'
import { readFileSync } from 'node:fs'

/** SPKI DER de uma chave Ed25519 crua — o prefixo fixo do algoritmo + os 32 bytes. */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

export type VerifyResult = { ok: true } | { ok: false; reason: string }

function lines(text: string): string[] {
	return text.split(/\r?\n/u).filter(line => line.length > 0)
}

function ed25519Verify(publicKey: Buffer, message: Buffer, signature: Buffer): boolean {
	return verify(null, message, { key: Buffer.concat([ED25519_SPKI_PREFIX, publicKey]), format: 'der', type: 'spki' }, signature)
}

/** `pubkeyText` e `signatureText` são os textos minisign (já fora do base64 externo do Tauri). */
export function verifyMinisign(file: Buffer, signatureText: string, pubkeyText: string): VerifyResult {
	const [, pubB64] = lines(pubkeyText)
	if (!pubB64) return { ok: false, reason: 'pubkey sem a linha da chave' }
	const pub = Buffer.from(pubB64, 'base64')
	if (pub.length !== 42) return { ok: false, reason: `pubkey com ${pub.length} bytes (esperava 42)` }
	const pubKeyId = pub.subarray(2, 10)
	const pk = pub.subarray(10)

	const [, sigB64, trustedLine, globalB64] = lines(signatureText)
	if (!sigB64 || !trustedLine || !globalB64) return { ok: false, reason: 'assinatura incompleta (esperava 4 linhas)' }
	const sig = Buffer.from(sigB64, 'base64')
	if (sig.length !== 74) return { ok: false, reason: `assinatura com ${sig.length} bytes (esperava 74)` }
	const alg = sig.subarray(0, 2).toString('latin1')
	if (!sig.subarray(2, 10).equals(pubKeyId)) return { ok: false, reason: 'key id da assinatura não é o da pubkey' }

	const message = alg === 'ED' ? Buffer.from(new Bun.CryptoHasher('blake2b512').update(file).digest()) : alg === 'Ed' ? file : undefined
	if (!message) return { ok: false, reason: `algoritmo desconhecido: ${alg}` }
	if (!ed25519Verify(pk, message, sig.subarray(10))) return { ok: false, reason: 'assinatura não confere com o arquivo' }

	const prefix = 'trusted comment: '
	if (!trustedLine.startsWith(prefix)) return { ok: false, reason: 'linha do comentário confiável ausente' }
	const trusted = Buffer.from(trustedLine.slice(prefix.length), 'utf8')
	if (!ed25519Verify(pk, Buffer.concat([sig.subarray(10), trusted]), Buffer.from(globalB64, 'base64')))
		return { ok: false, reason: 'assinatura global (comentário confiável) não confere' }
	return { ok: true }
}

if (import.meta.main) {
	const [filePath, sigPath, confPath] = process.argv.slice(2)
	if (!filePath || !sigPath || !confPath) {
		console.error('uso: verify-updater-signature.ts <arquivo> <arquivo.sig> <tauri.conf.json>')
		process.exit(2)
	}
	const conf = JSON.parse(readFileSync(confPath, 'utf8')) as { plugins?: { updater?: { pubkey?: string } } }
	const pubkeyB64 = conf.plugins?.updater?.pubkey
	if (!pubkeyB64) {
		console.error(`plugins.updater.pubkey ausente em ${confPath}`)
		process.exit(1)
	}
	const result = verifyMinisign(
		readFileSync(filePath),
		Buffer.from(readFileSync(sigPath, 'utf8').trim(), 'base64').toString('utf8'),
		Buffer.from(pubkeyB64, 'base64').toString('utf8'),
	)
	if (!result.ok) {
		console.error(`assinatura do updater INVÁLIDA para ${filePath}: ${result.reason}`)
		process.exit(1)
	}
	console.log(`assinatura do updater confere: ${filePath}`)
}
