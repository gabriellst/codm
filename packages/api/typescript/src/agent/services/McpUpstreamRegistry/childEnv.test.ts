// packages/api/typescript/src/agent/services/McpUpstreamRegistry/childEnv.test.ts — arquivo final COMPLETO
import { describe, expect, it } from 'bun:test'
import { getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { childEnv } from './DefaultMcpUpstreamRegistry'

/**
 * O QUE UM PACOTE DE TERCEIRO CONSEGUE LER — e por que a herança total era o defeito.
 *
 * O caminho feliz do produto é o dono cadastrar `npx <pacote-mcp>`: um processo que NÓS spawnamos,
 * com código que não é nosso, escolhido por quem não audita a árvore de dependências dele. O SDK
 * trata isso com uma allowlist deliberada — `getDefaultEnvironment()`, com o comentário
 * *"list inspired by the default env inheritance of sudo"*. Copiar `process.env` inteiro por cima
 * dessa allowlist entrega ao pacote o `JWT_SECRET`, o `BETTER_AUTH_SECRET`, o
 * `INTERNAL_SERVICE_KEY`, a URL do Postgres com senha e as credenciais de OAuth — os mesmos
 * segredos que a decisão 14 do spec gasta uma página cercando pelo lado do prompt.
 *
 * Um `JSON.stringify(process.env)` na telemetria de um pacote comprometido é tudo que separa isso
 * de um vazamento; o teste abaixo é a fronteira.
 */
describe('childEnv', () => {
	it('NÃO entrega os segredos do daemon a um servidor de terceiro', () => {
		const env = childEnv()

		for (const secret of [
			'JWT_SECRET',
			'BETTER_AUTH_SECRET',
			'INTERNAL_SERVICE_KEY',
			'OPERATOR_API_KEY',
			'CLOUD_DATABASE_URL',
			'GITHUB_CLIENT_SECRET',
			'GOOGLE_CLIENT_SECRET',
		]) {
			expect(env[secret]).toBeUndefined()
		}
	})

	it('entrega o que o SDK considera seguro herdar — senão o servidor nem acha o binário', () => {
		const env = childEnv()
		const safe = getDefaultEnvironment()

		// PATH é o caso que dói: sem ele, `npx` não resolve. A asserção é sobre a allowlist inteira,
		// não sobre uma chave escolhida a dedo, para que uma mudança do SDK apareça aqui.
		expect(Object.keys(env).sort()).toEqual(Object.keys(safe).sort())
	})

	it('o env DECLARADO pelo dono passa, e vence a allowlist quando colide', () => {
		const env = childEnv({ OPENAI_API_KEY: 'sk-do-dono', PATH: '/rota/escolhida' })

		// É a única porta: o que o dono digitou no cadastro chega ao servidor. O resto não.
		expect(env.OPENAI_API_KEY).toBe('sk-do-dono')
		expect(env.PATH).toBe('/rota/escolhida')
	})
})
