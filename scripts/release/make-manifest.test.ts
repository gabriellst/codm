import { describe, expect, it } from 'bun:test'
import { buildManifest } from './make-manifest'

describe('make-manifest (SP1 AC-4)', () => {
	const base = {
		version: '0.1.0-beta.42',
		url: 'https://github.com/gabriellst/codm/releases/download/beta/codm-aarch64.app.tar.gz',
		signature: 'dW50cnVzdGVk…assinatura-minisign…\n',
		pubDate: '2026-08-06T07:00:00.000Z',
	}

	it('emite a forma exata que o plugin consome, com a assinatura aparada', () => {
		const m = buildManifest({ ...base, notes: 'beta abc123' })
		expect(m).toEqual({
			version: '0.1.0-beta.42',
			pub_date: '2026-08-06T07:00:00.000Z',
			notes: 'beta abc123',
			platforms: { 'darwin-aarch64': { url: base.url, signature: 'dW50cnVzdGVk…assinatura-minisign…' } },
		})
	})

	it('aceita semver estável e com pré-release; recusa o resto', () => {
		expect(() => buildManifest({ ...base, version: '1.2.3' })).not.toThrow()
		// O falsificador de AC-4: uma tag mal formada tem de morrer AQUI, no CI, nunca no cliente —
		// um manifest com versão não-semver faria o updater instalado falhar em silêncio para sempre.
		for (const bad of ['v1.2.3', '1.2', 'beta.42', '1.2.3-', '']) {
			expect(() => buildManifest({ ...base, version: bad })).toThrow('versão inválida')
		}
	})

	it('recusa URL não-https e assinatura vazia — as duas metades que o cliente não pode validar sozinho', () => {
		expect(() => buildManifest({ ...base, url: 'http://inseguro/x.tar.gz' })).toThrow('https')
		expect(() => buildManifest({ ...base, signature: '  \n' })).toThrow('assinatura vazia')
	})
})
