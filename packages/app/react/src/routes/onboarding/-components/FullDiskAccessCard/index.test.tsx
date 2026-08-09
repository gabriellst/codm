import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/lib/i18n'
import { type Bindings, Container, ServicesProvider } from '@/services'
import testBindings, { FakeSystemPreconditionsService } from '@/services/registry/test'
import { SystemPreconditionsToken } from '@/services/tokens'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'
import { FullDiskAccessCard } from './index'

/**
 * AC-6 tem DUAS metades e este arquivo cobre as duas: o botão realmente PEDE o reparo (asseverado
 * pelo que o fake registrou — um teste não pode rodar `tccutil`), e a UI DECLARA as duas coisas que
 * vão acontecer ANTES de o operador clicar. A segunda metade é asseverada no DOM porque é onde ela
 * existe: um texto que só está no arquivo de locale não é uma promessa feita ao operador.
 *
 * A ORDEM dos dois passos não é asseverada aqui de propósito — ela pertence ao host e já é provada
 * em `system_preconditions/full_disk_access.rs`. Reasseverá-la aqui seria testar o dublê.
 *
 * AC-12 é o terceiro caso: num host sem identidade atribuível (`tauri dev`), o reparo não tem
 * efeito, então o cartão não pode oferecer o botão — teria que afirmar consertar sem consertar. A
 * disponibilidade vem do `useSystemPreconditionsStore` (o que o `SystemPreconditionsGate` já aplicou), não de
 * um novo pull direto à porta — por isso o teste semeia o STORE, não o fake.
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
		useSystemPreconditionsStore.getState().reset()
	})

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host.remove()
	})

	function mount() {
		const container = new Container()
		container.load(testBindings)
		container.load([[SystemPreconditionsToken, FakeSystemPreconditionsService]] as unknown as Bindings)
		const fake = container.resolve(SystemPreconditionsToken) as FakeSystemPreconditionsService

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

	it('AC-12: sem identidade atribuível, não há botão de reparo — só a orientação sobre o terminal', () => {
		useSystemPreconditionsStore.getState().apply([{ id: 'FULL_DISK_ACCESS', satisfied: false, repair: 'NO_APP_IDENTITY' }])
		mount()

		expect(host.querySelector('button')).toBeNull()
		expect(host.textContent).toContain('identidade própria')
	})
})
