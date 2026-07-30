import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * RAIL A — todo dialog de rota é conteúdo puro dirigido por `useDialogStore`.
 *
 * A regra já existe como doutrina (component react bp-24, e o "Dialogs — useDialogStore only" do
 * CLAUDE.md deste pacote). O que faltava era ela FALHAR: três dos cinco dialogs do app carregavam o
 * próprio `useState` de `open` e ninguém ficou vermelho. Esta rail é a metade mecânica.
 *
 * O predicado tem três metades porque cada uma sozinha é contornável:
 *   1. o arquivo REFERENCIA `useDialogStore`         — sem isso não há store nenhuma
 *   2. o arquivo NÃO tem `onOpenChange`               — a prop é o sintoma do wrapper <Dialog> local
 *   3. o arquivo NÃO declara `const [open|isOpen, …]` — importar a store e manter o useState é o
 *      caminho mais provável de regressão
 *
 * Escopo: qualquer `.tsx` sob `-components/` cujo CAMINHO contenha "Dialog" — a pasta conta tanto
 * quanto o basename, porque o padrão do repo é `<Name>Dialog/index.tsx`. `routes/styleguide/` fica
 * fora da varredura (decisão da spec: é vitrine, não app).
 */

const REACT_SRC = resolve(import.meta.dirname, '../../src')

/** Ficheiros isentos, cada um com o PORQUÊ. Vazia é o estado correto — uma entrada aqui é dívida. */
const WHITELIST: Record<string, string> = {
	// (vazia — nenhum dialog de rota tem motivo para ser dono do próprio `open`)
}

async function dialogFiles(): Promise<string[]> {
	const out: string[] = []
	for await (const entry of new Bun.Glob('routes/**/-components/**/*.tsx').scan({ cwd: REACT_SRC, onlyFiles: true })) {
		if (entry.startsWith('routes/styleguide/')) continue
		if (/\.(test|stories)\.tsx$/.test(entry)) continue
		if (!entry.includes('Dialog')) continue
		out.push(entry)
	}
	return out.sort()
}

describe('rail A — dialog de rota é dirigido por useDialogStore (component bp-24)', () => {
	it('todo *Dialog* em -components/ referencia useDialogStore', async () => {
		const offenders = (await dialogFiles()).filter(f => {
			if (WHITELIST[f]) return false
			return !readFileSync(join(REACT_SRC, f), 'utf8').includes('useDialogStore')
		})
		expect(offenders).toEqual([])
	})

	it('nenhum dialog de rota declara open/onOpenChange local — a store é a dona do aberto', async () => {
		const offenders: string[] = []
		for (const f of await dialogFiles()) {
			if (WHITELIST[f]) continue
			const source = readFileSync(join(REACT_SRC, f), 'utf8')
			if (/\bonOpenChange\b/.test(source)) offenders.push(`${f} (onOpenChange)`)
			if (/const\s*\[\s*(open|isOpen)\s*,/.test(source)) offenders.push(`${f} (useState de open)`)
		}
		expect(offenders).toEqual([])
	})

	it('a varredura vê os dialogs que existem — a rail não pode passar por não achar nada', async () => {
		const files = await dialogFiles()
		expect(files.length).toBeGreaterThanOrEqual(4)
		expect(files.some(f => f.includes('ChangePasswordDialog'))).toBe(true)
	})
})
