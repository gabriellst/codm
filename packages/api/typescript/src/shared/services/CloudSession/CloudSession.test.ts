import { describe, expect, it } from 'bun:test'
import type { Session } from '@shared/schemas'
import { FileCloudSession, type CachedState } from './FileCloudSession'

const CLOUD_SESSION: Session = {
	user: { id: 'cloud-user', email: 'operator@example.test', name: 'Operator', emailVerified: true },
	session: { id: 'cloud-session', userId: 'cloud-user', expiresAt: new Date('2999-12-31T00:00:00.000Z'), ownerId: 'cloud-owner' },
}

/**
 * Falseia TODO ponto que toca SO ou rede — `isCloudConfigured`, `fetchSession` e o trio de
 * leitura/escrita/remoção do cache — pela mesma técnica que os testes do `SystemProviderDetector`
 * usam nas sondas dele. Sem disco de verdade, sem socket, sem mexer em `process.env`: o que está
 * sob teste é a POLÍTICA de `FileCloudSession`, exatamente como escrita para produção.
 *
 * Os dobros de TIMER sumiram junto com os timers: não há mais revalidação de hora em hora a agendar,
 * porque não há mais cache de identidade cuja idade importe. Quem pergunta, pergunta à nuvem.
 */
class FakeCloudSession extends FileCloudSession {
	private cache: CachedState = { revoked: false }
	/** Todo token que chegou à "rede" — o que prova quantas vezes a janela deixou a chamada sair. */
	sessionCalls: string[] = []
	/** Lançado pela PRÓXIMA `fetchSession`; `undefined` significa que a nuvem responde ok. */
	nextError: (Error & { status?: number }) | undefined
	deleted = 0
	/** Deslocamento do relógio falso, em ms — ver `advance()`. */
	private clockOffset = 0
	/** O que foi efetivamente ESCRITO em disco — a asserção de que identidade não é persistida. */
	written: CachedState[] = []

	constructor(private readonly cloudConfigured: boolean) {
		super()
	}

	/**
	 * Semeia o cache direto, sem passar pelo `getState()` da classe — um teste que queira dirigir o
	 * `nextError` precisa preparar o estado ANTES da primeira leitura.
	 */
	seed(state: Partial<CachedState>): void {
		this.cache = { revoked: false, ...state }
	}

	debugCache(): CachedState {
		return { ...this.cache }
	}

	/** Atravessa uma janela de coalescência sem dormir. */
	advance(ms: number): void {
		this.clockOffset += ms
	}

	protected override now(): number {
		return Date.now() + this.clockOffset
	}

	protected override isCloudConfigured(): boolean {
		return this.cloudConfigured
	}

	protected override async fetchSession(token: string): Promise<Session> {
		this.sessionCalls.push(token)
		if (this.nextError) throw this.nextError
		return CLOUD_SESSION
	}

	protected override readCache(): CachedState {
		return { ...this.cache }
	}

	protected override writeCache(state: CachedState): void {
		this.cache = { ...state }
		this.written.push({ ...state })
	}

	protected override deleteCache(): void {
		this.deleted += 1
		this.cache = { revoked: false }
	}
}

function unauthorized(status: 401 | 403): Error & { status: number } {
	return Object.assign(new Error('unauthorized'), { status })
}

describe('FileCloudSession — a identidade vem da NUVEM, e o disco só guarda a credencial', () => {
	it('sem CODM_CLOUD_URL configurada, isEntitled() é sempre true — e NUNCA chama a rede', async () => {
		const session = new FakeCloudSession(false)

		expect(await session.isEntitled()).toBe(true)
		// A metade que o dev-compat existe para garantir: um install que precede o SP2 não pode ficar
		// dependente de uma nuvem que ele não tem.
		expect(session.sessionCalls).toHaveLength(0)
	})

	it('com a nuvem configurada e sem token nenhum, isEntitled() é false e nada sai da máquina', async () => {
		const session = new FakeCloudSession(true)

		expect(await session.isEntitled()).toBe(false)
		expect(session.sessionCalls).toHaveLength(0)
	})

	it('com token, isEntitled() PERGUNTA À NUVEM e é true quando ela reconhece a credencial', async () => {
		const session = new FakeCloudSession(true)
		session.seed({ token: 'tok' })

		expect(await session.isEntitled()).toBe(true)
		expect(session.sessionCalls).toEqual(['tok'])
	})

	it('identity() devolve o que a NUVEM disse — o `ownerId` não vem de lugar nenhum daqui', async () => {
		const session = new FakeCloudSession(true)
		session.seed({ token: 'tok' })

		const identity = await session.identity()

		expect(identity?.session.ownerId).toBe('cloud-owner')
		expect(session.sessionCalls).toEqual(['tok'])
	})

	it('sem token, identity() é null sem tocar a rede — nada a perguntar', async () => {
		const session = new FakeCloudSession(true)

		expect(await session.identity()).toBeNull()
		expect(session.sessionCalls).toHaveLength(0)
	})

	it('O QUE VAI PARA O DISCO É SÓ A CREDENCIAL — nunca quem ela é', async () => {
		// O trilho central do redesenho. O estado persistido carregava, ao lado do token, a sessão que
		// a nuvem tinha devolvido — e isso fazia do arquivo uma SEGUNDA autoridade sobre identidade,
		// num arquivo que quem tem o disco edita. É a mesma classe de defeito que o ADR 0001 existe
		// para apagar, um nível abaixo. Falsificador: reintroduzir `identity` no `CachedState` e
		// gravá-lo deixa este caso vermelho.
		const session = new FakeCloudSession(true)
		session.setToken('tok')
		await session.identity()

		expect(session.written).not.toHaveLength(0)
		for (const state of session.written) {
			expect(Object.keys(state).sort()).toEqual(['revoked', 'token'])
		}
	})

	it('401 revoga: o estado zera, o cache some, e a próxima pergunta nem sai da máquina', async () => {
		const session = new FakeCloudSession(true)
		session.seed({ token: 'tok' })
		session.nextError = unauthorized(401)

		expect(await session.identity()).toBeNull()
		expect(session.deleted).toBe(1)
		expect(await session.isEntitled()).toBe(false)
		// Uma só ida à rede: depois da revogação, `revoked` responde localmente.
		expect(session.sessionCalls).toEqual(['tok'])
	})

	it('403 também revoga — a política cobre os dois códigos de "credencial ruim"', async () => {
		const session = new FakeCloudSession(true)
		session.seed({ token: 'tok' })
		session.nextError = unauthorized(403)

		expect(await session.identity()).toBeNull()
		expect(session.deleted).toBe(1)
	})

	it('erro de REDE em identity() PROPAGA — não é 401 disfarçado', async () => {
		// A distinção que o desenho antigo não fazia: "a nuvem recusou você" e "não consegui falar com
		// a nuvem" levavam ao mesmo lugar. Tratar o segundo como o primeiro mandaria o operador refazer
		// login para resolver um problema de conectividade — e apagaria a credencial dele no caminho.
		const session = new FakeCloudSession(true)
		session.seed({ token: 'tok' })
		session.nextError = Object.assign(new Error('ECONNREFUSED'), { status: undefined })

		expect(session.identity()).rejects.toThrow()
		await session.identity().catch(() => undefined)
		expect(session.debugCache().token, 'uma falha de rede NÃO pode revogar').toBe('tok')
		expect(session.deleted).toBe(0)
	})

	it('erro de rede em isEntitled() NÃO derruba o trabalho de fundo — vale o último veredito', async () => {
		const session = new FakeCloudSession(true)
		session.seed({ token: 'tok' })

		expect(await session.isEntitled()).toBe(true)

		// Passada a janela, a rede cai. O gate não pode virar `false` por causa disso: turnos já
		// enfileirados morreriam por um soluço de conectividade.
		session.nextError = Object.assign(new Error('ECONNREFUSED'), { status: undefined })
		session.advance(2 * 60 * 1000)

		expect(await session.isEntitled()).toBe(true)
	})

	it('a janela COALESCE a rajada: N perguntas seguidas viram UMA ida à nuvem', async () => {
		// A forma real do tráfego: carregar uma tela dispara várias queries em paralelo, e cada uma
		// passa pelo middleware. Sem a janela, cada uma pagaria seu próprio round-trip para perguntar
		// a mesma coisa sobre o mesmo token.
		const session = new FakeCloudSession(true)
		session.seed({ token: 'tok' })

		await Promise.all([session.identity(), session.identity(), session.identity()])
		await session.identity()

		expect(session.sessionCalls).toEqual(['tok'])
	})

	it('um login NOVO fura a janela — a resposta sobre o token velho não vale para o novo', async () => {
		// O falsificador é exato: chavear a janela só pelo tempo (e não pelo token) faz este caso
		// devolver a identidade do token anterior, e o operador que acabou de entrar seria servido
		// como o anterior por cinco segundos.
		const session = new FakeCloudSession(true)
		session.seed({ token: 'velho' })
		await session.identity()

		session.setToken('novo')
		await session.identity()

		expect(session.sessionCalls).toEqual(['velho', 'novo'])
	})
})
