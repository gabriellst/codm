// packages/app/react/tests/support/storybook.spike.test.tsx — arquivo final COMPLETO
import { describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import i18n from '@/lib/i18n'
import { composeStories } from '../support/storybook'
// A story real mais conectada que já existe — usa os mocks tipados + msw:
import * as stories from '../../src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.stories.tsx'

/**
 * A SEGUNDA APOSTA DA SPEC (Risks): o `play` composto roda no processo do bun, onde MSW precisa
 * dos interceptors node — mecanismo DIFERENTE do service worker do Storybook. Este spike compõe
 * uma story real com handlers msw e a monta.
 *
 * VEREDITO MEDIDO (as duas tentativas da spec, as duas descartadas — ver o comentário completo em
 * `tests/support/storybook.ts`): nem `msw-storybook-addon` (Service Worker de navegador inexistente
 * sob bun/happy-dom) nem o fallback `setupServer` de `msw/node` (o `ClientRequestInterceptor` de
 * `@mswjs/interceptors` não intercepta `node:http` sob bun — reproduzido isoladamente com uma sonda
 * `http.request()` pura, sem nenhuma story no meio, e com a base URL corrigida via `configureClient`
 * para descartar a hipótese de "URL relativa") interceptam a rede sob bun. `composeStories`
 * portanto NÃO tenta nenhum dos dois fallbacks — o segundo, além de não funcionar, dispara chamadas
 * de REDE REAL (`ECONNREFUSED`) como efeito colateral, pior que não tentar nada.
 *
 * Este teste prova o estado REAL, não um sucesso fabricado: a story COMPÕE e MONTA (o Dialog e seu
 * chrome estático renderizam — a prova de que `composeStories` + o preview real funcionam sob
 * bun), mas o conteúdo alimentado pelos handlers `parameters.msw` (os participantes mockados) NUNCA
 * chega — a prova de que a rede mockada não responde. Vira canário: se um dia msw interceptar sob
 * bun, este teste some daqui e passa a acusar (o `toBe(false)` quebra), sinalizando que o fallback
 * pode ser revisitado.
 */
describe('composeStories + msw sob bun — spike', () => {
	it('uma story conectada real monta, mas os dados mockados via msw NÃO chegam (medido)', async () => {
		const composed = composeStories(stories)
		const [name, Story] = Object.entries(composed)[0]!
		const host = document.createElement('div')
		document.body.appendChild(host)
		const root = createRoot(host)
		await act(async () => {
			root.render(<Story />)
		})
		// Dialog (Base UI) portala seu conteúdo para `document.body`, não para `host` — a checagem
		// que importa é no body, não no container local. Poll até o chrome estático aparecer (sob o
		// PTY do Nx/pre-push, 50ms fixos estouravam em falso); a ausência dos dados msw é asserida
		// DEPOIS do chrome montar, então a margem extra não fabrica um falso "chegou".
		for (let attempt = 0; attempt < 200; attempt++) {
			if ((document.body.textContent ?? '').includes('Configurações da conversa')) break
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10))
			})
		}
		const rendered = document.body.textContent ?? ''
		const mswDataArrived = rendered.includes('Ada Lovelace') // um dos participantes mockados via mockQuery
		console.log(
			`[spike] msw/node sob bun: ${mswDataArrived ? 'OK — dados mockados chegaram' : 'NÃO INTERCEPTA (medido) — ver tests/support/storybook.ts'} (story: ${name})`,
		)
		expect(rendered).toContain(i18n.t('session.settingsTitle')) // a story compôs e montou (chrome estático do Dialog)
		expect(mswDataArrived).toBe(false) // documenta o estado real: msw não intercepta a rede sob bun
		act(() => root.unmount())
		host.remove()
	})
})
