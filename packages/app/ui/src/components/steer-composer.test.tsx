import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SteerComposer } from './steer-composer'

/**
 * STEER COMPOSER — quando enviar é permitido.
 *
 * O componente é controlado (o chamador guarda o texto e decide o que enviar faz); a única decisão
 * que mora aqui é a de QUANDO: nunca em branco, nunca com um envio em voo. E as duas portas de envio
 * (botão e Enter) obedecem à mesma regra — Shift+Enter não envia. Montado de verdade (happy-dom, o
 * preload do pacote) porque o que se afirma é comportamento de evento, não string de classe.
 */

let host: HTMLDivElement
let root: Root

beforeEach(() => {
	host = document.createElement('div')
	document.body.appendChild(host)
	root = createRoot(host)
})

afterEach(() => {
	act(() => root.unmount())
	host.remove()
})

function mount(props: { value: string; pending?: boolean }) {
	const sent: number[] = []
	act(() => {
		root.render(
			<SteerComposer
				value={props.value}
				pending={props.pending}
				onValueChange={() => {}}
				onSubmit={() => sent.push(1)}
				placeholder="Oriente esta tarefa..."
				hint="Chega só ao agente"
				sendLabel="Enviar orientação"
			/>,
		)
	})
	const button = host.querySelector('button') as HTMLButtonElement
	const input = host.querySelector('input') as HTMLInputElement
	return { button, input, sent }
}

const press = (input: HTMLInputElement, init: KeyboardEventInit) =>
	act(() => {
		input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
	})

describe('SteerComposer — quando enviar', () => {
	it('o botão é um <button type="button"> com nome acessível', () => {
		const { button, input } = mount({ value: '' })
		expect(button.getAttribute('type')).toBe('button')
		expect(button.getAttribute('aria-label')).toBe('Enviar orientação')
		expect(input.getAttribute('aria-label')).toBe('Oriente esta tarefa...')
		expect(input.getAttribute('aria-describedby')).toBeTruthy()
	})

	it('em branco: botão desabilitado e Enter não envia', () => {
		const { button, input, sent } = mount({ value: '   ' })
		expect(button.disabled).toBe(true)
		press(input, { key: 'Enter' })
		expect(sent.length).toBe(0)
	})

	it('com texto: clique e Enter enviam', () => {
		const { button, input, sent } = mount({ value: 'só no mobile' })
		expect(button.disabled).toBe(false)
		act(() => button.click())
		press(input, { key: 'Enter' })
		expect(sent.length).toBe(2)
	})

	it('Shift+Enter não envia', () => {
		const { input, sent } = mount({ value: 'só no mobile' })
		press(input, { key: 'Enter', shiftKey: true })
		expect(sent.length).toBe(0)
	})

	it('em voo (pending): nada envia e o composer fica aria-busy', () => {
		const { button, input, sent } = mount({ value: 'só no mobile', pending: true })
		expect(button.disabled).toBe(true)
		press(input, { key: 'Enter' })
		expect(sent.length).toBe(0)
		expect(host.querySelector('[data-slot="steer-composer"]')?.getAttribute('aria-busy')).toBe('true')
	})
})
