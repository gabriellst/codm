import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * RAIL B — um campo de dado sob `-components/` vive dentro de um `form.Field`.
 *
 * O que a rail protege não é estilo: um `<Input>` fora do form é um campo sem validação, sem
 * `handleBlur`, sem erro renderizado e sem o schema da SDK por trás — a sincronização manual que o
 * TanStack Form existe para matar. Cinco sítios NÃO são campos de dado e estão na whitelist com o
 * porquê; qualquer sexto é defeito até prova em contrário.
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
	// A MESMA receita `live-settings` do ThreadSettingsDialog, dois blocos acima: a linha do servidor
	// e a linha da ferramenta nao tem submit nenhum — trocar a politica JA E a escrita
	// (`updateServer.mutate` no `onValueChange`). Nao ha valor pendente para um form guardar, nem
	// botao para um `canSubmit` habilitar; pendurar um `form.Field` aqui seria um formulario de um
	// campo que se submete sozinho. O cadastro, esse SIM e formulario, e vive em
	// `-forms/McpServerForm` com `validators` por campo vindos do schema da SDK.
	'routes/(app)/settings/-components/McpServersSection/index.tsx':
		'receita `live-settings` — a politica do servidor e a da ferramenta salvam no proprio onValueChange; nao existe submit para um form.Field pendurar.',
	'routes/(app)/attach/-components/AgentsStep/index.tsx':
		'select de modelo (D3, ZbVfW) é estado LOCAL ao passo, nunca submetido: `attachThreadMutationRequestSchema` (o que este passo grava) não carrega modelo nenhum, e o único lugar da SDK que modela "modelo por provider" (`session.models`) só existe DEPOIS que a thread é criada. Sem campo de contrato para pousar, não há form.Field para pendurar.',
}

async function componentFiles(): Promise<string[]> {
	const out: string[] = []
	for await (const entry of new Bun.Glob('routes/**/-components/**/*.tsx').scan({ cwd: REACT_SRC, onlyFiles: true })) {
		// SEPARADOR NORMALIZADO, e nao por gosto: no Windows o `scan` devolve caminhos com barra
		// enquanto o padrao do glob, os prefixos testados aqui e as CHAVES DA WHITELIST usam `/`.
		// Sem esta linha a rail nao apenas falha — ela falha ao contrario: nenhuma isencao casa, todo
		// arquivo isento vira infrator, e o terceiro caso reporta as cinco isencoes como orfas. Uma
		// rail que so e verdadeira num SO nao e uma rail; e por isso que a normalizacao mora no
		// PRODUTOR da lista, e nao espalhada por cada comparacao.
		const normalized = entry.replace(/\\/g, '/')
		if (normalized.startsWith('routes/styleguide/')) continue
		if (/\.(test|stories)\.tsx$/.test(normalized)) continue
		out.push(normalized)
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
