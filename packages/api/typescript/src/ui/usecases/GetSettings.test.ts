import { describe, expect, it } from 'bun:test'
import pkg from '../../../package.json' with { type: 'json' }
import { resolveAppVersion } from './GetSettings'

/**
 * De onde vem o número que a linha "Sobre" mostra.
 *
 * A tela exibia `0.0.1` — a versão do package.json deste workspace — enquanto o app instalado era
 * `0.1.10`, porque versão é fato do BUNDLE e quem o conhece é o shell (que passa `CODM_APP_VERSION`
 * a cada sidecar). O fallback existe para o `bun dev`, onde não há bundle.
 *
 * O caso do VAZIO é o que quebrou o CI em 2026-08-07: a chave é declarada no registry com exemplo
 * vazio, todo `.env` gerado a define como `''`, e um `??` teria aceitado isso como versão válida —
 * publicando uma linha em branco. O falsificador é exato: troque `||` por `??` na implementação e
 * só este caso fica vermelho.
 */
describe('resolveAppVersion', () => {
	it('usa a versão que o shell injeta', () => {
		expect(resolveAppVersion({ CODM_APP_VERSION: '0.1.11' })).toBe('0.1.11')
	})

	it('cai no package.json quando ninguém injetou (bun dev)', () => {
		expect(resolveAppVersion({})).toBe(pkg.version)
	})

	it('trata vazio como ausente — o .env gerado define a chave em branco', () => {
		expect(resolveAppVersion({ CODM_APP_VERSION: '' })).toBe(pkg.version)
	})
})
