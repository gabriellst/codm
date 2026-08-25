import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * O QUE O BUNDLE PRECISA CARREGAR JUNTO — um rail estático sobre `scripts/build.ts`.
 *
 * ── POR QUE ELE EXISTE ────────────────────────────────────────────────────────────────────────────
 * O `bun build --outfile` reescreve `import.meta.url` para o arquivo de SAÍDA. Todo módulo que deriva
 * um caminho de disco a partir dele passa, dentro do bundle, a apontar para um vizinho de
 * `dist/server.js` — e se o build não estagiar aquele vizinho, o processo morre com `ENOENT` no boot,
 * ANTES de escutar. Não é degradação: é o daemon não subir.
 *
 * Havia dois desses módulos e o build estagiava UM. `db/migrations.ts` (tronco SQLite) era estagiado;
 * `db/cloud/migrations.ts` (tronco Postgres) não — e o `PgDriver.runMigrations()` lê esse diretório no
 * boot para CONFERIR o ledger (ADR 0005: a nuvem não aplica migração, ela recusa subir com pendência).
 * Como o `cloud.Dockerfile` builda com este mesmo `build.ts`, embarca o `dist/` inteiro e roda
 * `CMD ["./server.js"]`, a consequência era direta: **a imagem de nuvem não conseguia bootar**, com
 * `ENOENT: dist/migrations/meta/_journal.json`.
 *
 * ── POR QUE UM RAIL ESTÁTICO, E NÃO UM BOOT ───────────────────────────────────────────────────────
 * A prova mais forte seria subir o bundle sob `CODM_PROFILE=cloud` no e2e. Medimos o preço: sob coluna
 * de teste a família `pg` resolve para o `PGliteDriver`, que é Postgres em WASM e exige `pglite.data`
 * + `pglite.wasm` (13MB) estagiados — sobre um `dist/` de 20MB, +65% em toda imagem de produção, por
 * um driver que produção NUNCA constrói (lá é `PgDriver`). O e2e passou a rodar o daemon de nuvem da
 * FONTE, e esta checagem cobre a classe do defeito sem pagar aquele preço.
 *
 * ── O QUE ELE CHECA ───────────────────────────────────────────────────────────────────────────────
 * Que todo módulo do contrato que deriva caminho de `import.meta.url` tenha seu destino estagiado.
 * A lista é DERIVADA da fonte, não redigitada: lemos os sufixos dos próprios módulos. Um terceiro
 * tronco criado amanhã e esquecido no build reprova aqui, sem ninguém lembrar de atualizar um array.
 */
describe('a saída do build carrega o que o bundle não consegue inlinar', () => {
	const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
	const contractsDb = resolve(pkgRoot, '../../contracts/src/db')
	const buildScript = readFileSync(join(pkgRoot, 'scripts/build.ts'), 'utf8')

	/**
	 * Os módulos do contrato que derivam diretório de `import.meta.url`, e o sufixo que cada um usa.
	 * Lido da FONTE deles — é o sufixo que decide para onde o fallback aponta dentro do bundle, então
	 * é ele que o build tem de espelhar. Redigitá-lo aqui seria a terceira cópia do mesmo fato.
	 */
	const DERIVED_DIR_MODULES = [
		{ label: 'tronco SQLite', file: join(contractsDb, 'migrations.ts') },
		{ label: 'tronco cloud', file: join(contractsDb, 'pg/migrations.ts') },
	] as const

	/**
	 * `join(dirname(fileURLToPath(import.meta.url)), 'a', 'b')` → `a/b`.
	 *
	 * LANÇA em vez de assertar: um `expect()` aqui dentro seria uma asserção fora de `test()`, e o
	 * biome reprova com razão (`noMisplacedAssertion`) — a asserção só se comporta como asserção no
	 * corpo do teste. Lançar dá a mesma mensagem no mesmo lugar, sem depender de onde o helper é
	 * chamado.
	 */
	function suffixOf(source: string): string {
		const call = source.match(/join\(\s*dirname\(fileURLToPath\(import\.meta\.url\)\)\s*,([^)]*)\)/)
		if (call === null) {
			throw new Error('o módulo deixou de derivar o diretório de import.meta.url — reveja este rail')
		}
		return (call[1] ?? '')
			.split(',')
			.map(part => part.trim().replace(/^['"]|['"]$/g, ''))
			.filter(Boolean)
			.join('/')
	}

	for (const { label, file } of DERIVED_DIR_MODULES) {
		test(`o build estagia o destino do ${label}`, () => {
			const suffix = suffixOf(readFileSync(file, 'utf8'))
			expect(suffix.length).toBeGreaterThan(0)

			// O build tem de nomear ESTE sufixo num destino sob `distDir`. Casamos pelo sufixo em vez do
			// nome da variável para que renomear a constante não deixe o rail cego.
			expect(
				buildScript.includes(`join(distDir, '${suffix}')`),
				`scripts/build.ts não estagia o ${label}: nenhum destino \`join(distDir, '${suffix}')\`. ` +
					`Dentro do bundle, \`import.meta.url\` resolve para dist/, então o fallback procura dist/${suffix} — ` +
					'e um diretório ausente aí mata o boot com ENOENT antes de o servidor escutar.',
			).toBe(true)
		})
	}

	test('todo destino estagiado é de fato copiado', () => {
		// Nomear o destino não basta — o `cp` tem de existir. Sem isto, uma constante declarada e nunca
		// usada passaria pelo teste acima.
		for (const { label, file } of DERIVED_DIR_MODULES) {
			const suffix = suffixOf(readFileSync(file, 'utf8'))
			const constant = buildScript.match(new RegExp(`const (\\w+) = join\\(distDir, '${suffix.replace('/', '\\/')}'\\)`))?.[1]
			expect(constant, `${label}: destino declarado sem nome de constante`).toBeDefined()
			expect(
				buildScript.includes(`await cp(`) && buildScript.includes(`, ${constant}, { recursive: true })`),
				`scripts/build.ts declara \`${constant}\` mas nunca o copia — o destino existe só no papel (${label}).`,
			).toBe(true)
		}
	})
})
