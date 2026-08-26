import { describe, expect, it } from 'bun:test'
import { container as rootContainer } from 'tsyringe-neo'
import { BoundedContext } from './BoundedContext'
import type { InstanceRegistry } from './Registry'

/**
 * AS DUAS FASES DA COMPOSIÇÃO (ADR 0007) — e a prova do mecanismo que elas eliminam.
 *
 * A classe de defeito é *"retrato tirado cedo demais"*: um valor lido na CONSTRUÇÃO que descreve
 * algo cuja existência muda depois. A ocorrência que custou um 500 em produção foi um hook do
 * better-auth injetando por construtor um port de OUTRO contexto, resolvido enquanto o primeiro
 * contexto montava — antes de o registry do segundo existir.
 *
 * Três coisas conspiram para o silêncio, e este arquivo prova a primeira, que é a raiz:
 *
 *   1. o tsyringe CONSTRÓI a classe abstrata quando não há binding — objeto sem método nenhum;
 *   2. o `Router.registerControllers` engole a falha com `console.warn`;
 *   3. o sintoma só aparece na primeira CHAMADA, não no boot.
 *
 * PHS-01 é a testemunha do mecanismo (a doença), PHS-02 é a da cura, e PHS-03 fecha a porta que
 * permitia a doença voltar — `create` não pode registrar nada.
 */

/**
 * Um PORT: abstrato, sem `@injectable()`, sem parâmetro de construtor.
 *
 * Essa forma exata é o que torna o defeito silencioso. Um abstrato com parâmetros declarados faria o
 * tsyringe reclamar (`TypeInfo not known`); sem parâmetros, ele simplesmente constrói — e como os
 * métodos são abstratos, o protótipo está vazio. O objeto existe, responde a `typeof === 'object'`,
 * e estoura só quando alguém chama o método.
 */
abstract class DirectoryPort {
	abstract lookup(id: string): string
}

class RealDirectory extends DirectoryPort {
	lookup(id: string): string {
		return `real:${id}`
	}
}

/**
 * Um port POR TESTE, e não é preciosismo: `clearInstances()` limpa instâncias, não REGISTROS, e o
 * container raiz do tsyringe é global ao processo. Reaproveitar o token faria a pré-condição de um
 * teste depender do que o anterior registrou — e a primeira escrita deste arquivo falhou exatamente
 * assim, com PHS-03 acusando um binding que PHS-02 tinha deixado para trás.
 */
abstract class OutroPort {
	abstract lookup(id: string): string
}

class OutraImpl extends OutroPort {
	lookup(id: string): string {
		return `outro:${id}`
	}
}

const registryFor = (token: unknown, impl: unknown): InstanceRegistry => {
	const entry = [{ token, useClass: impl }] as unknown as InstanceRegistry['real']
	return { mock: entry, integration: entry, real: entry, e2e: entry }
}

describe('composição em duas fases — nada se resolve antes de a composição terminar (ADR 0007)', () => {
	it('PHS-01: TESTEMUNHA DA DOENÇA — sem binding, o tsyringe constrói o ABSTRATO em silêncio', () => {
		// Sem esta linha o ADR é uma afirmação sobre o tsyringe que ninguém verificou. É ela que
		// justifica as duas fases: o modo de falha não é uma exceção que alguém veria no boot, é um
		// objeto plausível que só quebra quando um usuário chama a rota.
		const isolado = rootContainer.createChildContainer()

		const resolvido = isolado.resolve(DirectoryPort as never) as DirectoryPort

		expect(resolvido, 'o tsyringe DEVOLVE alguma coisa — é isso que faz o defeito ser silencioso').toBeDefined()
		expect(typeof (resolvido as { lookup?: unknown }).lookup, 'e essa coisa não tem o método: o protótipo do abstrato é vazio').toBe(
			'undefined',
		)
		// E é exatamente esta a mensagem que apareceu como 500 no callback do Google.
		expect(() => resolvido.lookup('x')).toThrow(/is not a function/)
	})

	it('PHS-02: A CURA — `bindAll` liga TODOS os registries antes de qualquer montagem', () => {
		const antes = rootContainer.isRegistered(DirectoryPort as never)
		expect(antes, 'pré-condição: o port não pode estar ligado por outro teste').toBe(false)

		// A fase A recebe os descritores de TODOS os contextos montados de uma vez. Depois dela, um
		// controller de qualquer contexto pode resolver um port de qualquer outro.
		BoundedContext.bindAll([
			{ name: 'primeiro', controllers: {} },
			{ name: 'segundo', controllers: {}, registry: registryFor(DirectoryPort, RealDirectory) },
		])

		const resolvido = rootContainer.resolve(DirectoryPort as never) as DirectoryPort

		expect(resolvido).toBeInstanceOf(RealDirectory)
		expect(resolvido.lookup('a'), 'e o colaborador é USÁVEL, não apenas construível').toBe('real:a')

		rootContainer.clearInstances()
	})

	it('PHS-03: `create` NÃO registra binding — é o que impede a doença de voltar', async () => {
		// A porta pela qual o defeito entrava. Enquanto `create` registrava, montar o contexto N
		// significava ligar N e resolver os controllers de N no mesmo fôlego — com N+1..10 ainda
		// inexistentes. Este teste falha no dia em que alguém devolver o `registerAll` para dentro do
		// `create`, e falha ANTES de o defeito precisar de um 500 para aparecer.
		const jaLigado = rootContainer.isRegistered(OutroPort as never)
		expect(jaLigado, 'pré-condição do teste').toBe(false)

		await BoundedContext.create({
			name: 'terceiro',
			controllers: {},
			registry: registryFor(OutroPort, OutraImpl),
		})

		expect(
			rootContainer.isRegistered(OutroPort as never),
			'`create` recebeu um registry e NÃO pode tê-lo aplicado — quem liga é o `bindAll` (fase A)',
		).toBe(false)
	})
})
