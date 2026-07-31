import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/lib/i18n'
import { StepHeading } from '.'

/**
 * O VOLTAR MORA NO CABEÇALHO, E QUEM DECIDE SE ELE EXISTE É O `onBack`.
 *
 * Pedido do founder: "coloque apenas voltar ao lado do titulo quando for possível voltar, continuar é
 * inferido pelo clique". O `StepHeading` já é o dono do cabeçalho de TODO passo, então é o único lugar
 * onde a regra é escrita uma vez em vez de quatro.
 *
 * O predicado é a PRESENÇA do `onBack`, nunca uma contagem de passo: o wizard passa `onBack` a partir
 * do segundo passo e não passa no primeiro, então "dá para voltar?" já está codificado no contrato do
 * passo. Um `currentStepIndex > 0` espalhado pelos passos seria a mesma pergunta respondida de novo,
 * num lugar que não sabe a resposta.
 *
 * O terceiro caso é o que protege o LAYOUT. O cabeçalho é centrado (`items-center` + `text-center`) e
 * o título não pode sair do centro por causa de um botão que às vezes está lá. O botão é posicionado
 * FORA DO FLUXO (`absolute`), então o bloco centrado é literalmente o mesmo com e sem ele — é isso que
 * o caso mede, comparando o HTML do bloco nos dois cenários. A alternativa em fluxo (grid de três
 * colunas com um espaçador do lado direito para equilibrar) centraliza igual HOJE, mas amarra o centro
 * à largura de um espaçador que alguém precisa lembrar de mexer no dia em que o botão mudar de tamanho
 * — e esse caso ficaria verde enquanto o título andasse para o lado.
 */
describe('StepHeading — o Voltar fica junto ao título', () => {
	let root: Root | null = null
	let host: HTMLDivElement | null = null
	let backs = 0

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		backs = 0
	})

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host?.remove()
		host = null
	})

	function mount(props: { onBack?: () => void; backDisabled?: boolean } = {}): void {
		host = document.createElement('div')
		document.body.appendChild(host)
		const element = host
		act(() => {
			root = createRoot(element)
			root.render(<StepHeading title="Escolha um espaço de trabalho" subtitle="A pasta em que seus agentes vão trabalhar." {...props} />)
		})
	}

	/** O botão do cabeçalho — achado pela sua CASA (o bloco do título), não pelo texto. */
	function backButton(): HTMLButtonElement | null {
		return host?.querySelector('[data-slot="step-heading"] button') ?? null
	}

	/** O bloco centrado que carrega título + subtítulo: o pai do `h1`. */
	function centeredBlock(): HTMLElement {
		const block = host?.querySelector('h1')?.parentElement
		if (!block) throw new Error('bloco do título não renderizado')
		return block
	}

	/**
	 * Os filhos do cabeçalho que OCUPAM ESPAÇO nele — os que não foram tirados do fluxo.
	 *
	 * É por aqui que "o botão não desalinha o título" vira uma asserção verificável sem motor de layout:
	 * um elemento `absolute` não empurra ninguém, um irmão em fluxo empurra. happy-dom não calcula
	 * geometria, então a pergunta é feita à estrutura em vez do pixel.
	 */
	function inFlowChildren(): Element[] {
		const root = host?.querySelector('[data-slot="step-heading"]')
		return [...(root?.children ?? [])].filter(child => !child.className.includes('absolute'))
	}

	it('FALSEADOR — com `onBack`, o Voltar é renderizado junto ao título e leva de volta ao clicar', () => {
		mount({ onBack: () => (backs += 1) })

		const button = backButton()
		expect(button).not.toBeNull()
		// Ícone sozinho: o rótulo acessível é a única voz do botão, então ele é obrigatório — e sai da
		// MESMA chave que o rodapé usava (`attach.back`), que por isso não fica órfã.
		expect(button?.getAttribute('aria-label')).toBe(i18n.t('attach.back'))

		act(() => button?.click())
		expect(backs).toBe(1)
	})

	it('sem `onBack` não há Voltar — o primeiro passo não oferece uma volta que não existe', () => {
		mount()

		expect(backButton()).toBeNull()
	})

	it('FALSEADOR — o título fica no MESMO lugar com e sem o Voltar: o botão está fora do fluxo', () => {
		mount({ onBack: () => {} })
		const withBack = centeredBlock().outerHTML
		// O bloco centrado é o ÚNICO filho em fluxo do cabeçalho, com botão ou sem: ele ocupa a largura
		// inteira nos dois casos, então o centro dele é o centro do passo. Um Voltar em fluxo (uma linha
		// flex com o botão ao lado, ou um grid com espaçador) daria DOIS filhos aqui — e o título
		// passaria a ser centrado num pedaço da largura, não nela.
		expect(inFlowChildren()).toHaveLength(1)
		expect(host?.querySelector('[data-slot="step-heading"] button')?.className).toContain('absolute')

		act(() => root?.unmount())
		host?.remove()
		mount()
		const withoutBack = centeredBlock().outerHTML

		// E o bloco não muda de forma conforme o predicado — nada de padding condicional ou espaçador.
		expect(inFlowChildren()).toHaveLength(1)
		expect(withBack).toBe(withoutBack)
	})

	it('`backDisabled` trava a volta sem escondê-la — o passo que está COMMITANDO não recua', () => {
		mount({ onBack: () => (backs += 1), backDisabled: true })

		const button = backButton()
		expect(button?.disabled).toBe(true)

		act(() => button?.click())
		expect(backs).toBe(0)
	})
})
