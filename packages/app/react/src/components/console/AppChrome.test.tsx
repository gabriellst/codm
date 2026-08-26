import { afterEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { type Bindings, Container, ServicesProvider, type WindowChrome } from '@/services'
import testBindings, { FakeWindowService } from '@/services/registry/test'
import { WindowToken } from '@/services/tokens'
import { AppChrome } from './AppChrome'

/**
 * A barra de título integrada reserva a faixa dos semáforos pelo que o HOST REPORTA — nunca pelo
 * nome da plataforma (desktop-shell bp-02). Cada caso roda com ZERO host presente: o Container vem
 * de `registry/test` com um `FakeWindowService` semeado, exatamente como UpdateReadyPill.test.tsx
 * faz com `FakeUpdateService`. Se esta suíte precisasse do tauri para rodar, a costura estaria
 * quebrada.
 *
 * happy-dom não mede layout (storybook canon, regra 5): o que se afirma aqui é a CLASSE que cada
 * espaçador recebe e o atributo que a barra publica, não pixels.
 */

function containerWith(chrome: WindowChrome): Container {
	class Seeded extends FakeWindowService {
		constructor() {
			super(chrome)
		}
	}
	const container = new Container()
	container.load(testBindings)
	const overrides: Bindings = [[WindowToken, Seeded]]
	container.load(overrides)
	return container
}

describe('AppChrome', () => {
	let root: Root | null = null
	let host: HTMLElement | null = null

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host = null
	})

	function render(container: Container): HTMLElement {
		host = document.createElement('div')
		document.body.appendChild(host)
		root = createRoot(host)
		act(() => {
			root!.render(
				<ServicesProvider container={container}>
					<AppChrome />
				</ServicesProvider>,
			)
		})
		return host
	}

	function spacers(el: HTMLElement): [Element, Element] {
		const header = el.querySelector('header')
		if (!header) throw new Error('AppChrome não renderizou o <header>')
		const { children } = header
		return [children[0]!, children[children.length - 1]!]
	}

	/** macOS: os semáforos ficam SOBRE o webview — a barra abre a faixa dos dois lados. */
	it('host que sobrepõe os semáforos → faixa de 78px espelhada', async () => {
		const el = render(containerWith({ titleBar: 'overlay' }))
		await act(async () => {})

		expect(el.querySelector('header')?.getAttribute('data-title-bar')).toBe('overlay')
		const [left, right] = spacers(el)
		expect(left.className).toBe('w-[78px]')
		expect(right.className).toBe('w-[78px]')
	})

	/** Windows/Linux (barra nativa acima do webview) e uma aba de browser: nada a reservar. */
	it('host com barra de título nativa → só a calha de 12px, também espelhada', async () => {
		const el = render(containerWith({ titleBar: 'native' }))
		await act(async () => {})

		expect(el.querySelector('header')?.getAttribute('data-title-bar')).toBe('native')
		const [left, right] = spacers(el)
		expect(left.className).toBe('w-3')
		expect(right.className).toBe('w-3')
	})

	/** A superfície de arraste é o que torna a janela arrastável numa barra Overlay — o atributo
	 *  não é herdado, então a barra E cada espaçador precisam dele, em qualquer host. */
	it('a barra e os espaçadores seguem sendo região de arraste', async () => {
		const el = render(containerWith({ titleBar: 'overlay' }))
		await act(async () => {})

		expect(el.querySelector('header')?.hasAttribute('data-tauri-drag-region')).toBe(true)
		const [left, right] = spacers(el)
		expect(left.hasAttribute('data-tauri-drag-region')).toBe(true)
		expect(right.hasAttribute('data-tauri-drag-region')).toBe(true)
	})

	/** O default do Container de teste (fake sem seed) é `native` — a mesma resposta do browser. */
	it('sem seed, o fake reporta native (a resposta honesta de uma aba)', async () => {
		const container = new Container()
		container.load(testBindings)
		const el = render(container)
		await act(async () => {})

		expect(el.querySelector('header')?.getAttribute('data-title-bar')).toBe('native')
	})
})
