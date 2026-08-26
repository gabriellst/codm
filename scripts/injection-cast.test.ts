import { describe, it, expect } from 'bun:test'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative, resolve as resolvePath } from 'node:path'
import { sourceViews } from './lib/strip-comments'
import { REPO } from '../template.config'

/**
 * UM lugar na árvore pode converter um token de DI. Todos os outros pedem ao `core/injection`.
 *
 * ── O QUE ISTO GUARDA ─────────────────────────────────────────────────────────────────────────────
 * O tsyringe-neo tipa `InjectionToken<T>` como `new (...args) => T`, e uma classe ABSTRATA não é
 * atribuível a isso — *"Cannot assign an abstract constructor type to a non-abstract constructor
 * type"*. Como o padrão desta casa é resolver e registrar pela ABSTRAÇÃO (o token é
 * `abstract class HttpRouter`; o registry liga `FastifyHttpRouter`), toda chamada precisava de um
 * `as any` na entrada e um `as X` na saída. Eram 19 sítios, medidos em 2026-08-10.
 *
 * `core/src/injection` passou a ser o dono dessa conversão — uma vez, com o docblock que explica
 * qual limite da biblioteca ela compensa. Este rail é o que impede a dívida de voltar a se espalhar:
 * depois da migração ela é ZERO fora do módulo, e é por ser zero que a tolerância pode ser zero.
 *
 * ── POR QUE NÃO É UMA REGRA DE LINT ───────────────────────────────────────────────────────────────
 * Porque a pergunta é sobre um CAMINHO ("qual arquivo tem licença para isto"), não sobre a forma de
 * uma expressão. Uma regra eslint precisaria carregar a lista de arquivos permitidos como
 * configuração, que é a mesma lista daqui com mais cerimônia.
 *
 * ── MASK-AWARE (L5-5, MW-8, 2026-08-12) ───────────────────────────────────────────────────────────
 * `findTokenCasts` varria linhas do texto CRU — nem comentário era filtrado. Uma nota de migração
 * documentando a forma antiga (o idioma que este próprio arquivo usa acima: "toda chamada precisava
 * de um `as any`…") citaria o padrão banido e seria contada como ofensor — falso-vermelho. Agora o
 * regex roda sobre `sourceViews(source).mask` (comentário E string mascarados); o `text` reportado
 * ainda vem da linha ORIGINAL (mask só decide SE a linha conta, nunca o que é exibido).
 */

const ROOT = process.env.ROOT_OVERRIDE ? resolvePath(process.env.ROOT_OVERRIDE) : resolvePath(import.meta.dirname, '..')

// Roots via the manifest, not restated literals. `core/src` has no workspace of its own — it is a
// fixed sub-path of apiTs's PACKAGE root (mirrors the src root, one level up). A stamp without a TS
// backend leaves ambos `undefined`; `walk()` já no-opa num diretório que não existe, então
// SCANNED/OWNER vazios degradam para "nada a guardar", a mesma resposta inócua de hoje.
//
// FORMA DE MÓDULO, adaptada: o template lê isto de um helper `LAYOUT` (`LAYOUT.pkgRoot('apiTs')`)
// que NÃO existe nesta árvore — aqui o manifesto expõe `REPO.workspaceRoots`/`REPO.packageRoots`
// direto. Redigitar os caminhos como literal seria a segunda cópia que o próprio comentário acima
// recusa; ler do manifesto daqui mantém a propriedade e troca só o acessor.
const API_TS_SRC: string | undefined = REPO.workspaceRoots.apiTs
const API_TS_ROOT: string | undefined = REPO.packageRoots.apiTs

/** As árvores que falam tsyringe. Fora daqui, `resolve(... as any)` não é sobre DI. */
const SCANNED = API_TS_ROOT && API_TS_SRC ? [API_TS_SRC, `${API_TS_ROOT}/core/src`] : []

/** O dono da conversão. Único, por desenho — a lista existir com dois nomes já seria o defeito. */
const OWNER = API_TS_ROOT ? `${API_TS_ROOT}/core/src/injection` : ''

/** `container.resolve(X as any)`, `this.di.resolve(X as any)`, `c.resolve(X as any)`… */
const CAST_AT_RESOLVE = /\.resolve\(\s*\w+\s+as\s+any\s*\)/

/** `container.register*(X as any, …)` — o mesmo defeito, do lado da escrita. */
const CAST_AT_REGISTER = /\.register\w*\(\s*\w+\s+as\s+any\s*[,)]/

export interface CastSite {
	file: string
	line: number
	text: string
}

function walk(dir: string, out: string[] = []): string[] {
	if (!existsSync(dir)) return out
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules') continue
			walk(full, out)
		} else if (/\.tsx?$/.test(entry.name)) {
			out.push(full)
		}
	}
	return out
}

export function findTokenCasts(root: string, scanned: readonly string[] = SCANNED, owner: string = OWNER): CastSite[] {
	const sites: CastSite[] = []
	for (const tree of scanned) {
		for (const file of walk(join(root, tree))) {
			const rel = relative(root, file)
			if (rel.startsWith(owner)) continue
			const source = readFileSync(file, 'utf-8')
			const originalLines = source.split('\n')
			// `mask` preserves every newline (comment/string interiors become spaces, never removed), so
			// splitting it by '\n' lines up 1:1 with `originalLines` — the presence check runs on mask,
			// the reported `text` always comes from the ORIGINAL line.
			sourceViews(source)
				.mask.split('\n')
				.forEach((maskLine, index) => {
					if (CAST_AT_RESOLVE.test(maskLine) || CAST_AT_REGISTER.test(maskLine))
						sites.push({ file: rel, line: index + 1, text: (originalLines[index] ?? '').trim() })
				})
		}
	}
	return sites
}

describe('injection-cast — só `core/injection` converte um token de DI', () => {
	it('nenhum `as any` em resolve/register fora do módulo dono', () => {
		const sites = findTokenCasts(ROOT)
		expect(
			sites.map(site => `${site.file}:${site.line} — ${site.text}`),
			'Cast de token de DI fora de `core/src/injection`. Use `resolve(container, Token)` (leitura) ou ' +
				'`asInjectionToken(token)` (escrita) — os dois vêm de `@template/core-typescript`, preservam o tipo, e ' +
				'dispensam tanto o `as any` da entrada quanto o `as X` da saída.',
		).toEqual([])
	})

	/**
	 * FALSEADOR. Sem isto o teste acima passaria com um detector que não detecta nada — e um rail
	 * assim é pior do que nenhum, porque parece cobertura.
	 */
	it('detecta as duas formas numa árvore sintética, e respeita a isenção do dono', () => {
		const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = require('node:fs') as typeof import('node:fs')
		const { tmpdir } = require('node:os') as typeof import('node:os')
		const fake = mkdtempSync(join(tmpdir(), 'injection-cast-'))
		try {
			const tree = 'pkg/src'
			const owner = 'pkg/src/injection'
			mkdirSync(join(fake, owner), { recursive: true })

			writeFileSync(join(fake, tree, 'a.ts'), 'const x = container.resolve(HttpRouter as any) as HttpRouter\n')
			writeFileSync(join(fake, tree, 'b.ts'), 'container.registerSingleton(HttpRouter as any, Fastify)\n')
			writeFileSync(join(fake, tree, 'c.ts'), 'const ok = resolve(container, HttpRouter)\n')
			// Nota de migração em COMENTÁRIO, no idioma que este próprio repo usa (ver o docblock do topo) —
			// cita a forma antiga para explicar a mudança, e NÃO é um ofensor (L5-5, MW-8).
			writeFileSync(
				join(fake, tree, 'd.ts'),
				'// migração 2026-08-10: antes disto o código fazia `container.resolve(HttpRouter as any) as HttpRouter`\nconst ok2 = resolve(container, HttpRouter)\n',
			)
			// O dono TEM licença — é o ponto inteiro do módulo existir.
			writeFileSync(join(fake, owner, 'index.ts'), 'return container.resolve(token as any)\n')

			const found = findTokenCasts(fake, [tree], owner)
			expect(found.map(s => s.file).sort()).toEqual(['pkg/src/a.ts', 'pkg/src/b.ts'])
		} finally {
			rmSync(fake, { recursive: true, force: true })
		}
	})
})
