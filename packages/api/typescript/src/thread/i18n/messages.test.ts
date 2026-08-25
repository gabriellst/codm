import { describe, expect, it } from 'bun:test'
import { Language, StopKind } from '@codm/contracts-typescript/wire/enums'
import { THREAD_MESSAGES } from './messages'

describe('THREAD_MESSAGES — o vocabulário que sai no canal', () => {
	it('fala português por padrão quando o operador não escolheu idioma', () => {
		expect(THREAD_MESSAGES.stopTitle(undefined, { kind: StopKind.SERVER_ERROR })).toBe(
			'Erro do provedor — o agente esbarrou num limite ou numa indisponibilidade',
		)
	})

	it('fala inglês quando o operador escolheu inglês', () => {
		expect(THREAD_MESSAGES.stopTitle(Language.EN_US, { kind: StopKind.SERVER_ERROR })).toBe(
			'Server error — the agent hit an API limit or outage',
		)
	})

	it('colapsa um idioma que nenhum catálogo ship de volta para o padrão', () => {
		// `fr-CH` é BCP-47 válido e não é membro de `Language` — `resolveLanguage` resolve isso em um
		// lugar só, então nenhum chamador precisa ramificar.
		expect(THREAD_MESSAGES.stopTitle('fr-CH' as Language, { kind: StopKind.AUTH_REQUIRED })).toBe(
			THREAD_MESSAGES.stopTitle(Language.PT_BR, { kind: StopKind.AUTH_REQUIRED }),
		)
	})

	it('o aviso de canal carrega a nossa frase E o detalhe do provider sem tradução', () => {
		const providerDetail = "You've hit your session limit · resets 10:30pm (America/Fortaleza)"

		const notice = THREAD_MESSAGES.stopChannelNotice(Language.PT_BR, { kind: StopKind.SERVER_ERROR, detail: providerDetail })

		// A nossa metade traduz…
		expect(notice).toContain('Erro do provedor')
		// …e a do provider vai verbatim, porque é onde está a informação acionável (o horário do reset).
		expect(notice).toContain(providerDetail)
	})

	it('omite o bloco de detalhe quando o provider não mandou nenhum', () => {
		const notice = THREAD_MESSAGES.stopChannelNotice(Language.PT_BR, { kind: StopKind.AUTH_REQUIRED, detail: '' })

		expect(notice.trim().endsWith('.')).toBe(true)
	})

	it('tem título para TODOS os kinds, nos dois idiomas', () => {
		for (const kind of Object.values(StopKind)) {
			for (const language of [Language.PT_BR, Language.EN_US]) {
				expect(THREAD_MESSAGES.stopTitle(language, { kind }).length).toBeGreaterThan(0)
			}
		}
	})
})
