import { describe, expect, it } from 'bun:test'
import { container } from 'tsyringe-neo'
import { BaseError, asInjectionToken } from '@codm/core-typescript'
import { CloudSession, MockCloudSession, MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession'
import { CloudSessionMiddleware } from '@shared/middlewares'

/**
 * cloud-identity — a testemunha 2 do ADR 0001: **local sem token não monta**.
 *
 * O ADR diz, literalmente: *"numa instalação sem sessão, o daemon serve só a superfície de login.
 * Falseador: se qualquer endpoint local responder sem token, a fronteira vazou."*
 *
 * O DEFEITO QUE ISTO SUBSTITUI. Até 2026-08-14 o `OperatorMiddleware` carimbava `OPERATOR_ID` — uma
 * constante — em toda requisição, incondicionalmente. Nenhum teste pegava, e não podia pegar: um id
 * constante é perfeitamente consistente consigo mesmo, então toda asserção sobre "o dono do recurso"
 * passava comparando a constante com ela mesma. O buraco só aparece quando se pergunta DE ONDE o id
 * veio, que é a pergunta que este arquivo faz.
 *
 * Estas asserções são de UNIDADE sobre o middleware, de propósito. A testemunha de ponta a ponta
 * ("um endpoint local responde sem token") pede o daemon de pé e mora no e2e; esta aqui prova a
 * regra no ponto em que ela é decidida, e roda em 3ms no `bun test` de todo commit.
 */
describe('cloud-identity (ADR 0001 — identidade vem da nuvem)', () => {
	const middlewareWith = (session: CloudSession): CloudSessionMiddleware => {
		const child = container.createChildContainer()
		child.registerInstance(asInjectionToken(CloudSession), session)
		return child.resolve(CloudSessionMiddleware)
	}

	it('IDN-01: sem sessão, RECUSA — não carimba identidade de consolação', async () => {
		const session = new MockCloudSession()
		session.setIdentity(null)

		const request = { ctx: {} } as never
		let raised: unknown
		try {
			await middlewareWith(session).execute(request)
		} catch (error) {
			raised = error
		}

		expect(raised, 'sem sessão o middleware TEM de recusar — um operador padrão local seria a constante de volta').toBeInstanceOf(BaseError)
		// `BaseError` guarda o código em `name` (é uma `Error`), não num campo `code`.
		expect((raised as BaseError<'UNAUTHORIZED'>).name).toBe('UNAUTHORIZED')
		expect((request as { ctx: Record<string, unknown> }).ctx.ownerId, 'nada pode ter sido carimbado').toBeUndefined()
	})

	it('IDN-02: com sessão, o `ownerId` vem da SESSÃO — nunca de uma constante do módulo', async () => {
		const request = { ctx: {} } as never
		await middlewareWith(new MockCloudSession()).execute(request)

		const ctx = (request as { ctx: Record<string, unknown> }).ctx
		expect(ctx.ownerId).toBe(MOCK_CLOUD_OWNER_ID)
		expect(ctx.user).toBeDefined()
		expect(ctx.session).toBeDefined()
	})

	it('IDN-03: trocar a sessão troca o dono — a prova de que a fonte é a sessão', async () => {
		const session = new MockCloudSession()
		session.setIdentity({
			user: { id: 'other-user', email: 'other@example.test', name: 'Other', emailVerified: true },
			session: { id: 'other-session', userId: 'other-user', expiresAt: new Date('2999-12-31T00:00:00.000Z'), ownerId: 'other-owner' },
		})

		const request = { ctx: {} } as never
		await middlewareWith(session).execute(request)

		// A asserção que o desenho antigo NÃO podia fazer: com `OPERATOR_ID` constante, este valor
		// seria o mesmo dos outros dois testes, e "o dono veio da sessão" seria indistinguível de
		// "o dono é sempre o mesmo".
		expect((request as { ctx: Record<string, unknown> }).ctx.ownerId).toBe('other-owner')
		expect((request as { ctx: Record<string, unknown> }).ctx.ownerId).not.toBe(MOCK_CLOUD_OWNER_ID)
	})

	/**
	 * IDN-04 GUARDAVA A REGRA OPOSTA, e a troca é uma emenda ao ADR, não um descuido.
	 *
	 * Ele afirmava: *"`identity()` é SÍNCRONA — o ADR proíbe round-trip por request"*, citando a
	 * exigência de cache-first do ADR 0001. Aquela exigência comprava latência com uma SEGUNDA
	 * autoridade: um `ownerId` cacheado em disco, na máquina do operador, que podia discordar da
	 * nuvem por até uma hora. É a mesma classe de defeito que o ADR existe para apagar, um nível
	 * abaixo. A decisão do founder (2026-08-15) reverteu: sempre nuvem, nunca offline.
	 *
	 * O que este slot guarda agora é o que ficou fácil de perder num refactor: **uma falha da nuvem
	 * não pode virar 401**. É tentador embrulhar a chamada num `try/catch` que devolve `null` — o
	 * middleware fica "robusto", e o operador passa a ser deslogado toda vez que a internet pisca,
	 * mandado refazer um login que não conserta nada. Falsificador exato: envolver o
	 * `await this.cloudSession.identity()` num catch que devolve `null` deixa este caso vermelho.
	 */
	it('IDN-04: nuvem inalcançável vira CLOUD_UNREACHABLE (503) — nunca 401, nunca "erro desconhecido"', async () => {
		const session = new MockCloudSession()
		session.setFailure(Object.assign(new Error('ECONNREFUSED'), { status: undefined }))

		const request = { ctx: {} } as never
		let raised: unknown
		try {
			await middlewareWith(session).execute(request)
		} catch (error) {
			raised = error
		}

		// NÃO 401: mandaria o operador ao login, ele entraria de novo, e nada mudaria — o que falta
		// não é credencial. E NÃO um erro sem código: esse atravessa o mapper como UNKNOWN_ERROR/500
		// e a tela mostra "Erro desconhecido", que foi exatamente o sintoma medido em 2026-08-15.
		expect((raised as BaseError<'CLOUD_UNREACHABLE'>).name).toBe('CLOUD_UNREACHABLE')
		expect((raised as Error).message, 'a causa real tem de sobreviver ao embrulho').toContain('ECONNREFUSED')
	})
})
