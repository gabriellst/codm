import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * RAIL B — um campo de dado sob `-components/` vive dentro de um `form.Field`.
 *
 * O que a rail protege não é estilo: um `<Input>` fora do form é um campo sem validação, sem
 * `handleBlur`, sem erro renderizado e sem o schema da SDK por trás — a sincronização manual que o
 * TanStack Form existe para matar. Quatro sítios NÃO são campos de dado e estão na whitelist com o
 * porquê; qualquer quinto é defeito até prova em contrário.
 *
 * O predicado de "dentro de form.Field" é contagem de aberturas menos fechamentos antes do índice do
 * match — o mesmo raciocínio de um parser, sem parser. É suficiente porque `form.Field` no repo é
 * sempre render-prop com abertura e fechamento explícitos.
 */

const REACT_SRC = resolve(import.meta.dirname, '../../src')
const FIELD_TAGS = /<(Input|Textarea|Select|Combobox|CurrencyInput)\b/g

/**
 * Sítios isentos — cada um com o motivo pelo qual NÃO é um campo de formulário.
 * Uma entrada nova aqui precisa de uma frase que sobreviva à pergunta "então por que não é um form?".
 */
const WHITELIST: Record<string, string> = {
	'routes/(app)/threads/$threadId/-components/Composer/index.tsx':
		'bloco `composer` da CLI — rascunho de mensagem: sem submit, sem validação, Enter envia e o texto morre no sucesso.',
	'routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx':
		'bloco `composer` da CLI (IssueSteerComposer) — mesmo shape, escopado à issue.',
	// Também isento na rail A, por outro motivo (lá é o import de useDialogStore; aqui é o submit que
	// não existe). Os dois motivos são o mesmo fato visto de dois ângulos: a tela salva sozinha.
	'routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx':
		'recipe `live-settings` — o input da tag salva no onBlur; não existe submit para um form.Field pendurar.',
	'routes/(app)/attach/-components/ContactStep/index.tsx':
		'busca: filtra uma lista já carregada dentro de um passo de wizard (STATE-LOCAL-FILTER). Busca nunca é form — form react.',
}

async function componentFiles(): Promise<string[]> {
	const out: string[] = []
	for await (const entry of new Bun.Glob('routes/**/-components/**/*.tsx').scan({ cwd: REACT_SRC, onlyFiles: true })) {
		if (entry.startsWith('routes/styleguide/')) continue
		if (/\.(test|stories)\.tsx$/.test(entry)) continue
		out.push(entry)
	}
	return out.sort()
}

/** Aberturas de `<form.Field` menos `</form.Field>` antes de `index` — >0 significa "dentro". */
function insideFormField(source: string, index: number): boolean {
	const before = source.slice(0, index)
	const opens = before.split('<form.Field').length - 1
	const closes = before.split('</form.Field>').length - 1
	return opens > closes
}

describe('rail B — campo de dado sob -components/ vive dentro de form.Field', () => {
	it('nenhum Input/Textarea/Select fora de form.Field, exceto a whitelist', async () => {
		const offenders: string[] = []
		for (const file of await componentFiles()) {
			if (WHITELIST[file]) continue
			const source = readFileSync(join(REACT_SRC, file), 'utf8')
			for (const match of source.matchAll(FIELD_TAGS)) {
				if (insideFormField(source, match.index ?? 0)) continue
				offenders.push(`${file}:${source.slice(0, match.index).split('\n').length} <${match[1]}>`)
			}
		}
		expect(offenders).toEqual([])
	})

	it('a varredura vê os campos que existem — e os do ChangePasswordDialog passam por estarem no form', async () => {
		let seen = 0
		for (const file of await componentFiles()) seen += [...readFileSync(join(REACT_SRC, file), 'utf8').matchAll(FIELD_TAGS)].length
		expect(seen).toBeGreaterThanOrEqual(8)
	})

	it('toda entrada de whitelist ainda existe — uma isenção órfã é dívida invisível', async () => {
		const files = new Set(await componentFiles())
		expect(Object.keys(WHITELIST).filter(f => !files.has(f))).toEqual([])
	})
})
