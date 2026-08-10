// packages/app/react/src/services/SystemPreconditionsService/BrowserSystemPreconditionsService.test.ts
import { describe, expect, it } from 'bun:test'
import { BrowserSystemPreconditionsService } from './BrowserSystemPreconditionsService'

/**
 * A DEGRADAÇÃO HONESTA AQUI NÃO É OTIMISMO — é a MESMA resposta que o lookup do host daria.
 * Nenhuma pré-condição declara o browser entre suas plataformas, então o conjunto aplicável é
 * vazio, e um conjunto vazio de pendências é o que ele é. Um `statuses()` que inventasse uma
 * pendência faria o console web exibir um slide pedindo uma permissão do macOS a quem está numa
 * aba — a versão de UI de "fingir uma capacidade de desktop" (desktop-shell DSK-03).
 */
describe('BrowserSystemPreconditionsService', () => {
	it('AC-7: não reporta pré-condição nenhuma — o conjunto aplicável a uma aba é vazio', async () => {
		const service = new BrowserSystemPreconditionsService()
		expect(await service.statuses()).toEqual([])
	})

	it('AC-7: repair é inerte — nada para reparar num host que não tem a pré-condição', async () => {
		const service = new BrowserSystemPreconditionsService()
		expect(await service.repair('FULL_DISK_ACCESS')).toBeUndefined()
	})
})
