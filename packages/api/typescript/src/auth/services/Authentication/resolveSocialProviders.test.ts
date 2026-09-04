import { describe, expect, it } from 'bun:test'
import { BaseError, MockLoggingService } from '@codm/core-typescript'
import { resolveSocialProviders } from './BetterAuth'

/**
 * A DECISÃO DE QUAIS PROVEDORES EXISTEM — função pura, testada direto, como
 * `resolveMcpCallDisposition` ao lado.
 *
 * O que ela substitui era um literal que registrava `github` e `google` sempre, com o que viesse do
 * `.env`. Numa nuvem sem credenciais isso produzia dois sintomas que não apontam para a causa e nem
 * sequer combinam entre si (medido contra o perfil cloud rodando, 2026-09-03):
 *
 *   google → HTTP 500, sem uma palavra sobre credencial
 *   github → HTTP 200 e um authorize URL com `client_id=` vazio; o 404 vinha do GitHub
 *
 * Os casos abaixo cobrem as três situações que o `.env` pode estar: cheio, vazio, e pela metade.
 */
const CREDENTIALS = {
	githubClientId: 'gh-id',
	githubClientSecret: 'gh-secret',
	googleClientId: 'goog-id',
	googleClientSecret: 'goog-secret',
}

describe('resolveSocialProviders', () => {
	it('com as quatro chaves preenchidas, registra os dois provedores', () => {
		const logging = new MockLoggingService()
		expect(resolveSocialProviders(CREDENTIALS, logging)).toEqual({
			github: { clientId: 'gh-id', clientSecret: 'gh-secret' },
			google: { clientId: 'goog-id', clientSecret: 'goog-secret' },
		})
	})

	it('um provedor sem credencial é OMITIDO — não registrado com id vazio', () => {
		const logging = new MockLoggingService()
		const resolved = resolveSocialProviders({ ...CREDENTIALS, githubClientId: '', githubClientSecret: '' }, logging)

		// A asserção que importa é a AUSÊNCIA: era a presença com `clientId: ''` que produzia o
		// authorize URL quebrado que o GitHub respondia com 404.
		expect(resolved).toEqual({ google: { clientId: 'goog-id', clientSecret: 'goog-secret' } })
		expect('github' in (resolved ?? {})).toBe(false)
	})

	it('nenhuma credencial: nenhum provedor, e o boot NÃO cai — mas avisa dizendo o que preencher', () => {
		const logging = new MockLoggingService()
		const resolved = resolveSocialProviders(
			{ githubClientId: '', githubClientSecret: '', googleClientId: '', googleClientSecret: '' },
			logging,
		)
		const warned = logging.getLogsByLevel('warn')[0]?.args.content as Record<string, unknown> | undefined

		expect(resolved).toEqual({})
		// O aviso precisa nomear as chaves E o callback, que é a parte que ninguém adivinha. Vai
		// ESTRUTURADO (campos), não numa frase — é o que o `LoggingService` entrega ao Loki.
		expect(warned?.providers).toEqual(['github', 'google'])
		expect(warned?.envKeys).toContain('GITHUB_CLIENT_ID')
		expect(warned?.envKeys).toContain('GOOGLE_CLIENT_SECRET')
		expect(String(warned?.callback)).toContain('/auth/callback/')
	})

	it('MEIO configurado é falha DURA, e a mensagem nomeia a metade que falta', () => {
		const logging = new MockLoggingService()
		expect(() => resolveSocialProviders({ ...CREDENTIALS, googleClientSecret: '' }, logging)).toThrow(BaseError)

		try {
			resolveSocialProviders({ ...CREDENTIALS, googleClientSecret: '' }, logging)
			throw new Error('deveria ter lançado')
		} catch (error) {
			// O código vive em `.name` num BaseError — assertar `.code` casaria com qualquer erro.
			expect((error as BaseError<'MISSING_ENVIRONMENT_VARIABLE'>).name).toBe('MISSING_ENVIRONMENT_VARIABLE')
			expect(String((error as Error).message)).toContain('GOOGLE_CLIENT_SECRET')
		}
	})

	it('a metade que falta é nomeada dos DOIS lados — id sem secret e secret sem id', () => {
		const logging = new MockLoggingService()
		try {
			resolveSocialProviders({ ...CREDENTIALS, githubClientId: '' }, logging)
			throw new Error('deveria ter lançado')
		} catch (error) {
			expect(String((error as Error).message)).toContain('GITHUB_CLIENT_ID')
		}
	})

	it('espaço em branco não conta como credencial — senão um `.env` com "KEY= " passaria', () => {
		const logging = new MockLoggingService()
		const resolved = resolveSocialProviders({ ...CREDENTIALS, githubClientId: '   ', githubClientSecret: '  ' }, logging)
		expect('github' in (resolved ?? {})).toBe(false)
	})
})
