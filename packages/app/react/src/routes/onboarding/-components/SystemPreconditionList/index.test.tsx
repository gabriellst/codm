import { describe, expect, it } from 'bun:test'
import { renderToString } from 'react-dom/server'
import { SystemPreconditionList, type SystemPreconditionModule } from './index'

/**
 * AC-8 — "somar uma pré-condição ao registro a faz aparecer no fluxo sem editar módulo existente".
 *
 * A prova É este caso: um id INVENTADO, um módulo inventado, e o mesmo componente de lista que o
 * slide usa. Se a lista tivesse conhecimento embutido de quais pré-condições existem (uma cadeia de
 * `if`, um `switch`, um import direto do card), este teste não teria como passar sem alterá-la — e
 * é justamente essa impossibilidade que ele existe para detectar.
 */
describe('SystemPreconditionList', () => {
	it('AC-8: renderiza o componente de uma pré-condição que a lista nunca viu antes', () => {
		type FakeId = 'PRECONDICAO_DE_MENTIRA'
		const modules: Record<FakeId, SystemPreconditionModule<FakeId>> = {
			PRECONDICAO_DE_MENTIRA: {
				id: 'PRECONDICAO_DE_MENTIRA',
				Component: () => <p>cartão inventado no teste</p>,
			},
		}

		const html = renderToString(<SystemPreconditionList pending={['PRECONDICAO_DE_MENTIRA']} modules={modules} />)

		expect(html).toContain('cartão inventado no teste')
	})

	it('não renderiza o que não está pendente', () => {
		type FakeId = 'A' | 'B'
		const modules: Record<FakeId, SystemPreconditionModule<FakeId>> = {
			A: { id: 'A', Component: () => <p>cartão A</p> },
			B: { id: 'B', Component: () => <p>cartão B</p> },
		}

		const html = renderToString(<SystemPreconditionList pending={['A']} modules={modules} />)

		expect(html).toContain('cartão A')
		expect(html).not.toContain('cartão B')
	})
})
