import { describe, expect, it } from 'bun:test'
import en from './en.json'
import pt from './pt.json'

/**
 * O GATE QUE ESTE REPO NÃO TINHA.
 *
 * A validação de chaves por tipo está DESLIGADA aqui: `src/@types/i18next.d.ts` derruba a
 * augmentação `typeof pt` porque o catálogo passou de ~600 chaves e estourou a profundidade de
 * instanciação do TypeScript (o arquivo documenta o trade-off e o TODO de fatiar em namespaces).
 * Consequência: `t(chave.que.nao.existe)` compila (aspas omitidas de propósito: o rail de coerência i18n do backend varre chamadas literais de t com aspas, inclusive em comentários), e uma chave presente num idioma e ausente no
 * outro passa por `tsc`, por `lint` e pela suíte inteira sem ninguém notar — até um operador ver a
 * própria chave crua na tela.
 *
 * Enquanto os namespaces não chegam, a paridade é verificável de forma barata: os dois catálogos
 * são JSON estático, e comparar o conjunto de caminhos folha é O(n) sem tocar em i18next.
 *
 * Compara CAMINHOS, não valores: traduções divergem por definição; o que não pode divergir é quais
 * chaves existem.
 */

type Catalog = Record<string, unknown>

/** Todos os caminhos folha, em notação de ponto — `enums.ChannelKind.WHATSAPP`. */
function leafPaths(catalog: Catalog, prefix = ''): Set<string> {
	const paths = new Set<string>()
	for (const [key, value] of Object.entries(catalog)) {
		const path = prefix ? `${prefix}.${key}` : key
		if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
			for (const nested of leafPaths(value as Catalog, path)) paths.add(nested)
		} else {
			paths.add(path)
		}
	}
	return paths
}

describe('paridade dos catálogos de tradução', () => {
	const ptPaths = leafPaths(pt as Catalog)
	const enPaths = leafPaths(en as Catalog)

	it('toda chave de pt existe em en', () => {
		const missing = [...ptPaths].filter(path => !enPaths.has(path)).sort()
		expect(missing).toEqual([])
	})

	it('toda chave de en existe em pt', () => {
		const missing = [...enPaths].filter(path => !ptPaths.has(path)).sort()
		expect(missing).toEqual([])
	})

	/**
	 * Uma chave cujo valor é a string vazia é pior que uma ausente: i18next devolve `''` sem avisar,
	 * e a tela mostra um espaço em branco em vez do fallback que uma chave faltando dispararia.
	 */
	it('nenhuma tradução é a string vazia', () => {
		const empty = [...ptPaths, ...enPaths].filter(path => {
			const read = (catalog: Catalog) => path.split('.').reduce<unknown>((node, key) => (node as Catalog)?.[key], catalog)
			return read(pt as Catalog) === '' || read(en as Catalog) === ''
		})
		expect(empty.sort()).toEqual([])
	})
})
