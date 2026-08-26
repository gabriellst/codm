import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { CONTEXTS } from '@generated/contexts.generated'

/**
 * O CICLO DE VIDA É DO CONTEXTO, NÃO DA RAIZ (T1.5) — e este arquivo guarda as duas metades disso.
 *
 * O `server.ts` carregava dois `if (mounted.includes('agent'))` e um `step()` que era um
 * `shutdownAll` reimplementado à mão. O guard é o defeito que o founder apontou primeiro: a raiz de
 * composição sabendo o NOME de um contexto para decidir se mexe nele — a mesma decisão que a
 * composição já tinha tomado, escrita uma segunda vez com um literal.
 *
 * ── e um rail que guarda contra MIM ──────────────────────────────────────────────────────────────
 * LIF-02 existe por um motivo específico e desconfortável: a DC0 acrescentou `startAll`/`shutdownAll`
 * ao kernel e, até a T1.5, NINGUÉM em produção os chamava. Capacidade de kernel sem chamador é
 * exatamente a vacuidade que esta casa caça — e ela tinha sido introduzida por este mesmo trabalho.
 * O rail impede que volte a acontecer em silêncio.
 */

const SRC = join(import.meta.dir, '../../src')
/** Os derivados sairam de `src/` no passo 5 — `src/` volta a ser index.ts, context.ts e os contextos. */
const GENERATED = join(import.meta.dir, '../../generated')
/** `server.ts` saiu de `src/` no passo 6 — a raiz de composicao virou diretorio proprio. */
const COMPOSITION = join(import.meta.dir, '../../composition')
const SERVER = readFileSync(join(COMPOSITION, 'server.ts'), 'utf8')

/** O corpo do arquivo sem comentários — os docblocks CITAM o guard removido, de propósito. */
const semComentarios = (source: string): string =>
	source
		.split('\n')
		.filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
		.join('\n')

describe('o ciclo de vida mora no contexto, e a raiz não sabe nomes (T1.5)', () => {
	it('LIF-01: `server.ts` NÃO decide nada por nome de contexto', () => {
		// A varredura (a) da condição 2 do goal, como rail em vez de grep manual. Olha o CÓDIGO, não o
		// arquivo: os comentários citam `mounted.includes('agent')` para registrar o que foi apagado, e
		// uma asserção sobre o texto inteiro mediria a prosa que explica a ausência — a mesma lição de
		// CTX-04 e DIA-07.
		const codigo = semComentarios(SERVER)

		expect(codigo, 'a raiz de composição não pode perguntar se um contexto específico montou').not.toContain('mounted.includes(')

		const literais = Object.keys(CONTEXTS).filter(id => codigo.includes(`'${id}'`))
		expect(literais, `o \`server.ts\` cita contextos por literal: ${literais.join(', ')}`).toEqual([])
	})

	it('LIF-02: a raiz CHAMA o `startAll`/`shutdownAll` do kernel — a DC0 não pode ficar vacuosa', () => {
		const codigo = semComentarios(SERVER)

		expect(codigo, 'sem esta chamada os `start` declarados pelos contextos nunca rodam').toContain('BoundedContext.startAll(')
		expect(codigo, 'sem esta chamada os recursos dos contextos vazam no encerramento').toContain('BoundedContext.shutdownAll(')
	})

	it('LIF-03: todo `<ctx>/lifecycle.ts` está de fato LIGADO na composição — sem ciclo órfão', () => {
		// A DC2 inverteu o que este rail podia perguntar, e para melhor. Antes ele cobrava que quem
		// declarasse `start:`/`shutdown:` no barril tivesse um `lifecycle.ts` — uma pergunta sobre
		// FORMA, que virou vacuosa quando o gerador passou a descobrir o ciclo pelo próprio arquivo:
		// declarar inline deixou de ser possível.
		//
		// A pergunta que sobrou é a de LIVENESS, e essa é a cara: um `lifecycle.ts` que existe e que
		// ninguém compõe é código morto que PARECE vivo — alguém escreveu um `shutdown`, ele nunca roda,
		// e o recurso vaza em todo encerramento sem uma linha de aviso.
		const composicao = readFileSync(join(GENERATED, 'composition.generated.ts'), 'utf8')

		const orfaos = readdirSync(SRC, { withFileTypes: true })
			.filter(entry => entry.isDirectory() && existsSync(join(SRC, entry.name, 'lifecycle.ts')))
			.filter(entry => !composicao.includes(`from '@${entry.name}/lifecycle'`))
			.map(entry => entry.name)

		const comCiclo = readdirSync(SRC, { withFileTypes: true }).filter(
			entry => entry.isDirectory() && existsSync(join(SRC, entry.name, 'lifecycle.ts')),
		).length

		expect(comCiclo, 'sem nenhum contexto com ciclo de vida este teste não estaria medindo nada').toBeGreaterThan(0)
		expect(
			orfaos,
			`estes contextos têm \`lifecycle.ts\` que a composição NÃO importa: ${orfaos.join(', ')}. Um shutdown que ` +
				`nunca roda é pior que nenhum — ele parece que devolve o recurso.`,
		).toEqual([])
	})

	it('LIF-05: e o inverso — a composição não inventa ciclo para contexto que não tem arquivo', () => {
		// A contraprova de LIF-03. Sem ela, um gerador que emitisse `start:` para todo mundo satisfaria
		// o rail acima perfeitamente.
		const composicao = readFileSync(join(GENERATED, 'composition.generated.ts'), 'utf8')

		const inventados = [...composicao.matchAll(/from '@(\w+)\/lifecycle'/g)]
			.map(match => match[1] ?? '')
			.filter(id => !existsSync(join(SRC, id, 'lifecycle.ts')))

		expect(inventados, `a composição importa ciclo de vida de contexto sem arquivo: ${inventados.join(', ')}`).toEqual([])
	})

	it('LIF-04: nenhum `lifecycle.ts` fecha o banco — pool é recurso de PROCESSO', () => {
		// O contrato do `shutdown` no kernel diz isso com todas as letras, e a razão é operacional: um
		// contexto fechando o pool derrubaria os outros que ainda estão drenando. O banco é o último
		// passo, e é da raiz.
		const infratores = readdirSync(SRC, { withFileTypes: true })
			.filter(entry => entry.isDirectory() && existsSync(join(SRC, entry.name, 'lifecycle.ts')))
			.filter(entry =>
				/DatabaseDriver\b[^\n]*\.close\(|\.close\(\)/.test(semComentarios(readFileSync(join(SRC, entry.name, 'lifecycle.ts'), 'utf8'))),
			)
			.map(entry => entry.name)

		expect(infratores, `estes ciclos de vida fecham recurso de processo: ${infratores.join(', ')}`).toEqual([])
	})
})
