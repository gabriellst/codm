import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { REPO } from '../../../../../template.config'

/**
 * A GRAFIA DA MARCA É UMA SÓ — e este rail existe porque ela JÁ tinha divergido.
 *
 * ── O DEFEITO MEDIDO ─────────────────────────────────────────────────────────────────────────────
 * `brandDisplay` é o wordmark que o humano lê ("CoDM"), distinto do `brand` que o mecanismo usa
 * ("codm", que alimenta nome de pacote, chave de env e caminho). Ninguém deriva um do outro — nem
 * `toUpperCase()` nem capitalização acertariam "CoDM" —, então eram duas declarações, e a segunda
 * vivia redigitada em três lugares.
 *
 * Em 2026-08-17 esses três já não concordavam: `tauri/config/window.ts:58` dizia `'CODM — boot
 * failed'` enquanto `tauri/config/app.ts:17` dizia `'CoDM'`. Mesma marca, mesma pasta, grafias
 * diferentes — herança do rebrand de julho que o redesign de agosto corrigiu pela metade. Ninguém
 * percebeu porque nada comparava as duas.
 *
 * ── POR QUE UM RAIL, JÁ QUE AGORA HÁ UMA FONTE ───────────────────────────────────────────────────
 * Porque a fonte única resolve quem LÊ, e não impede quem REDIGITA. Um literal novo colado amanhã
 * num quarto lugar não quebra nada — some no meio do JSX e diverge sozinho, exatamente como estes
 * três divergiram. O rail cobra a ausência do literal, que é a forma observável de "há uma fonte".
 *
 * A exceção nomeada é a PROSA: docblocks e comentários citam a grafia ao explicar o próprio defeito
 * (este arquivo faz isso três vezes). Uma varredura que não distinguisse comentário de código
 * proibiria explicar o problema — e um rail que impede a documentação da própria razão é um rail que
 * será removido no primeiro incômodo.
 */
describe('a grafia da marca vem do manifesto, não de literais espalhados', () => {
	const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')

	/** Os arquivos que CONSOMEM a grafia — os três que a redigitavam, mais o irmão que divergiu. */
	const CONSUMERS = [
		'packages/app/tauri/config/app.ts',
		'packages/app/tauri/config/window.ts',
		'scripts/eslint-rules/component-quality.ts',
		'scripts/og/generate.ts',
	] as const

	/** Remove comentários de bloco e de linha — prosa pode citar a grafia; código, não. */
	function codeOnly(source: string): string {
		return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
	}

	test('BRD-01: nenhum consumidor redigita a grafia — todos leem do manifesto', () => {
		// A grafia EM QUALQUER POSIÇÃO do código, não só como literal inteiro.
		//
		// A primeira versão deste caso procurava `'CoDM'` exato — e o falsificador provou que ela não
		// pegava o defeito real: a divergência medida era `'CODM — boot failed'`, com a grafia EMBUTIDA
		// numa string maior. Um rail que só vê o literal isolado é cego justamente à forma em que a
		// marca costuma aparecer, que é dentro de uma frase.
		const offenders: string[] = []
		for (const file of CONSUMERS) {
			const code = codeOnly(readFileSync(join(repoRoot, file), 'utf8'))
			if (code.includes(REPO.brandDisplay)) offenders.push(file)
		}
		expect(offenders, 'estes carregam a grafia escrita à mão em vez de `REPO.brandDisplay`').toEqual([])
	})

	test('BRD-02: `brandDisplay` e `brand` são declarações DIFERENTES — uma não deriva da outra', () => {
		// Se alguém "simplificar" derivando um do outro, o wordmark quebra em silêncio: nenhuma regra
		// de capitalização produz "CoDM" a partir de "codm".
		expect(REPO.brandDisplay.toLowerCase()).toBe(REPO.brand)
		expect(REPO.brandDisplay).not.toBe(REPO.brand)
		expect(REPO.brandDisplay).not.toBe(REPO.brand.toUpperCase())
		expect(REPO.brandDisplay).not.toBe(REPO.brand.charAt(0).toUpperCase() + REPO.brand.slice(1))
	})
})
