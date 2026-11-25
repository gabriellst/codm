import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChatBubble, ChatEvent, chatBubbleRowVariants, chatBubbleVariants, chatEventDotVariants } from './chat-bubble'

/**
 * CHAT BUBBLE — três vozes, um formato.
 *
 * O que este arquivo prende é o que distingue as vozes num relance: a pessoa é o pastel verde, o
 * agente é o verde cheio, a orientação é a bolha branca com contorno e corpo em itálico (é a voz
 * privada do operador — se ela pintar igual à do agente, o operador perde a pista do que o grupo vê).
 * E o lado decide só o alinhamento, com o avatar do lado de fora.
 */

describe('ChatBubble — vozes', () => {
	it('cada voz tem seu preenchimento', () => {
		expect(chatBubbleVariants({ look: 'person' })).toContain('bg-secondary')
		expect(chatBubbleVariants({ look: 'agent' })).toContain('bg-primary')
		expect(chatBubbleVariants({ look: 'steer' })).toContain('border-input')
		expect(chatBubbleVariants({ look: 'steer' })).toContain('bg-background')
	})

	it('o lado decide o alinhamento', () => {
		expect(chatBubbleRowVariants({ side: 'in' })).toContain('justify-start')
		expect(chatBubbleRowVariants({ side: 'out' })).toContain('justify-end')
	})

	it('a orientação tem corpo em itálico e as outras vozes não', () => {
		const steer = renderToStaticMarkup(
			<ChatBubble side="out" look="steer" author="Orientação · Bruno">
				só no mobile
			</ChatBubble>,
		)
		const agent = renderToStaticMarkup(
			<ChatBubble side="out" look="agent">
				subo uma prévia
			</ChatBubble>,
		)
		expect(steer).toContain('italic')
		expect(agent).not.toContain('italic')
	})

	it('o avatar fica do lado de fora da bolha', () => {
		const avatar = <span data-testid="av">AN</span>
		const incoming = renderToStaticMarkup(
			<ChatBubble side="in" look="person" avatar={avatar}>
				oi
			</ChatBubble>,
		)
		const outgoing = renderToStaticMarkup(
			<ChatBubble side="out" look="agent" avatar={avatar}>
				oi
			</ChatBubble>,
		)
		expect(incoming.indexOf('data-testid="av"')).toBeLessThan(incoming.indexOf('data-slot="chat-bubble-body"'))
		expect(outgoing.indexOf('data-testid="av"')).toBeGreaterThan(outgoing.indexOf('data-slot="chat-bubble-body"'))
	})

	it('sem autor/hora/rodapé, nada vazio é desenhado', () => {
		const html = renderToStaticMarkup(
			<ChatBubble side="out" look="agent">
				oi
			</ChatBubble>,
		)
		expect(html).not.toContain('chat-bubble-author')
		expect(html).not.toContain('chat-bubble-footer')
	})
})

describe('ChatEvent — tons do ponto', () => {
	it('cada tom tem um ponto distinto', () => {
		const dots = (['default', 'muted', 'attention'] as const).map(tone => chatEventDotVariants({ tone }))
		expect(new Set(dots).size).toBe(3)
	})

	it('é texto mono com o ponto decorativo', () => {
		const html = renderToStaticMarkup(<ChatEvent>tarefa criada</ChatEvent>)
		expect(html).toContain('font-mono')
		expect(html).toContain('aria-hidden="true"')
	})
})
