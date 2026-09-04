import { Glob } from 'bun'
import { sep } from 'node:path'

/**
 * A varredura que TODA rail usa — e a única que devolve caminhos comparáveis com as constantes que
 * as rails escrevem.
 *
 * ── O DEFEITO QUE ISTO FECHA ────────────────────────────────────────────────────────────────────
 * `Bun.Glob(...).scan()` devolve o caminho no separador do SO: `routes/__root.tsx` no mac e no
 * Linux, `routes\__root.tsx` no Windows. Toda rail deste diretório compara o resultado com um
 * literal escrito com `/` — `entry === DEFINITION`, `entry.startsWith('routes/styleguide/')`,
 * `toContain('routes/__root.tsx')`, as CHAVES das whitelists. No Windows nenhuma dessas comparações
 * casa, e o efeito não é "a rail falha": é a rail MENTIR nos dois sentidos ao mesmo tempo —
 *
 *   - o que a rail deveria ISENTAR vira infrator (a whitelist inteira, o arquivo de definição);
 *   - o que a rail deveria ENCONTRAR some (`toContain` do arquivo esperado falha);
 *   - e o caso que existe justamente para provar que a varredura não está vazia passa a acusar
 *     o contrário do que aconteceu.
 *
 * Medido em 2026-09-03: quatro rails vermelhas neste host por este motivo e nada mais, e a
 * `form-field` reportando as cinco isenções como órfãs. Duas outras (`fetch-stub`, `router-load`)
 * passam HOJE só porque o inventário delas está vazio — elas quebrariam na primeira entrada.
 *
 * ── POR QUE UM HELPER E NÃO UM `.replace` EM CADA RAIL ──────────────────────────────────────────
 * Porque a próxima rail vai ser escrita com `Bun.Glob` direto, como estas seis foram, e vai nascer
 * com o mesmo defeito. O separador é uma propriedade do PRODUTOR da lista; corrigir no consumidor é
 * combinar seis vezes o que só precisa ser verdade uma. As rails passam a falar POSIX sempre, que é
 * o vocabulário em que elas já escreviam suas constantes.
 */
export async function scanPosix(pattern: string, cwd: string): Promise<string[]> {
	const out: string[] = []
	for await (const entry of new Glob(pattern).scan({ cwd, onlyFiles: true })) out.push(toPosix(entry))
	return out
}

/** A variante síncrona, para as rails que varrem dentro de um `it` sem `await`. */
export function scanPosixSync(pattern: string, cwd: string): string[] {
	return [...new Glob(pattern).scanSync({ cwd })].map(toPosix)
}

/**
 * O separador do SO vira `/`. No mac e no Linux `sep` JA e `/`, entao isto e literalmente um
 * `split('/').join('/')` — inerte, e nao um ramo por plataforma. Lido de `node:path` em vez de
 * escrito como literal exatamente para nao existir um lugar onde alguem precise saber qual SO e.
 */
export function toPosix(path: string): string {
	return path.split(sep).join('/')
}
