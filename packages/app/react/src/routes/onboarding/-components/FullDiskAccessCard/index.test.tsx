import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/lib/i18n'
import { type Bindings, Container, ServicesProvider } from '@/services'
import testBindings, { FakePreconditionsService } from '@/services/registry/test'
import { PreconditionsToken } from '@/services/tokens'
import { FullDiskAccessCard } from './index'

/**
 * AC-6 tem DUAS metades e este arquivo cobre as duas: o botão realmente PEDE o reparo (asseverado
 * pelo que o fake registrou — um teste não pode rodar `tccutil`), e a UI DECLARA as duas coisas que
 * vão acontecer ANTES de o operador clicar. A segunda metade é asseverada no DOM porque é onde ela
 * existe: um texto que só está no arquivo de locale não é uma promessa feita ao operador.
 *
 * A ORDEM dos dois passos não é asseverada aqui de propósito — ela pertence ao host e já é provada
 * em `preconditions/full_disk_access.rs`. Reasseverá-la aqui seria testar o dublê.
 */
describe('FullDiskAccessCard', () => {
	let root: Root | null = null
	let host: HTMLDivElement

	beforeEach(async () => {
		// Os textos são a asserção de metade dos casos daqui — sem fixar o idioma, `t()` devolveria a
		// própria chave e "a UI declara os dois passos" passaria vazia de significado.
		await i18n.changeLanguage('pt')
		host = document.createElement('div')
		document.body.appendChild(host)
	})

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host.remove()
	})

	function mount() {
		const container = new Container()
		container.load(testBindings)
		container.load([[PreconditionsToken, FakePreconditionsService]] as unknown as Bindings)
		const fake = container.resolve(PreconditionsToken) as FakePreconditionsService

		act(() => {
			root = createRoot(host)
			root.render(
				<ServicesProvider container={container}>
					<FullDiskAccessCard />
				</ServicesProvider>,
			)
		})
		return fake
	}

	it('AC-6: o clique pede o reparo da pré-condição de Acesso Total ao Disco', async () => {
		const fake = mount()
		const button = host.querySelector('button')
		expect(button).not.toBeNull()

		await act(async () => {
			button?.click()
			await Promise.resolve()
		})

		expect(fake.repaired).toEqual(['FULL_DISK_ACCESS'])
	})

	it('AC-6: a UI declara os dois passos antes do clique', () => {
		mount()
		const text = host.textContent ?? ''

		// A ordem embutida na ação tem que estar dita: limpar a negação, depois abrir os Ajustes.
		expect(text).toContain('apaga a negação')
		expect(text).toContain('Acesso Total ao Disco')
	})
})
