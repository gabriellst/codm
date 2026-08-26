import { describe, expect, it } from 'bun:test'
import { BrowserWindowService } from './BrowserWindowService'

/**
 * DEGRADAÇÃO HONESTA: uma aba de browser tem a barra do PRÓPRIO browser acima do documento — os
 * controles da janela nunca se sobrepõem ao console. `native` não é um default otimista, é a
 * descrição exata do host (desktop-shell DSK-03). Reportar `overlay` faria o console web reservar
 * 78px para semáforos que não existem.
 */
describe('BrowserWindowService', () => {
	it('reporta a barra de título como nativa — nada se sobrepõe ao documento numa aba', async () => {
		const service = new BrowserWindowService()
		expect(await service.chrome()).toEqual({ titleBar: 'native' })
	})
})
