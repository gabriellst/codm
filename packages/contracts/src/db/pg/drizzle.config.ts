/**
 * O drizzle-kit config da família **pg** (o deployment de nuvem). O gêmeo, para a família `libsql`,
 * é `src/db/sqlite/drizzle.config.ts`, e as duas doutrinas de aplicação são DIFERENTES DE PROPÓSITO —
 * ADR 0005, "o aplicador é propriedade da família".
 *
 * AUTORAR — de packages/contracts/:
 *   bun run drizzle:generate:cloud       # === `bun migrate:create:cloud` da raiz
 *
 * APLICAR — e aqui está a diferença que justifica o segundo arquivo:
 *   bun run drizzle:migrate:cloud        # passo de DEPLOY, manual, fora de banda
 *
 * ── por que aqui existe um comando de aplicar, e no gêmeo não ─────────────────────────────────────
 * O gêmeo proíbe `drizzle:migrate` com todas as letras, e a razão dele está uma linha acima da
 * proibição: *"Two processes share one file"*. O daemon TS e o gateway Go abrem o MESMO arquivo no
 * disco de uma máquina que ninguém opera — sem janela de deploy, sem operador, sem ordem de subida
 * garantida. Naquele substrato, aplicar fora do boot é aplicar talvez-nunca, e um segundo ledger é a
 * garantia de que os dois migradores discordem em silêncio.
 *
 * Nenhuma dessas premissas se instancia aqui. Postgres gerenciado, um deployment, uma janela, um
 * operador. Aplicar no boot seria o defeito simétrico: um migrador por RÉPLICA de um serviço que
 * escala horizontalmente, todas correndo sobre o mesmo schema ao mesmo tempo.
 *
 * O `__drizzle_migrations` que o `drizzle-kit migrate` escreve — que era O DEFEITO no caso SQLite,
 * porque criava um segundo ledger sobre o mesmo arquivo — aqui é simplesmente o ledger deste banco.
 * São dois bancos diferentes, não duas visões do mesmo arquivo.
 *
 * ── "manual" não descreve quem VERIFICA ──────────────────────────────────────────────────────────
 * Ninguém aplica no boot, mas o boot CONFERE: o driver da família pg recusa subir sobre um schema
 * atrasado (ADR 0005, decisão 1, corolário). Um serviço que sobe alegremente sobre schema velho
 * troca um erro de deploy — barulhento, imediato, com rollback — por corrupção silenciosa de dado.
 */
import { defineConfig } from 'drizzle-kit'

/**
 * A URL, ou uma recusa que DIZ O QUE FAZER.
 *
 * Sem isto o drizzle-kit falha com `Please provide required params for Postgres driver: url: ''` —
 * verdadeiro e inútil: não nomeia a variável, não diz onde declará-la, e não distingue "esqueci de
 * setar" de "o `.env` não foi carregado". Foram exatamente esses dois casos que apareceram: o
 * script fazia `cd packages/contracts` e o Bun carrega `.env` do CWD, **sem subir diretórios** —
 * então o `.env` da raiz nunca chegava aqui. Os scripts passaram a usar `--env-file=../../.env`, e
 * esta mensagem cobre o resto.
 */
function requireCloudDatabaseUrl(): string {
	const url = process.env.CLOUD_DATABASE_URL
	if (url !== undefined && url.trim() !== '') return url
	throw new Error(
		'CLOUD_DATABASE_URL não está no ambiente. Declare-a no `.env` da RAIZ do repo (veja `.env.example`) — ' +
			'ex.: CLOUD_DATABASE_URL=postgres://postgres:postgres@localhost:5432/codm_cloud. ' +
			'Se ela JÁ está lá, o `.env` não foi carregado: os scripts de nuvem passam `--env-file=../../.env` ' +
			'porque o Bun lê `.env` do diretório corrente e não sobe até a raiz.',
	)
}

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/db/pg/schema/index.ts',
	out: './src/db/pg/migrations',
	dbCredentials: {
		// Sem fallback embutido. Um default do tipo `postgres://localhost/codm` faria um
		// `drizzle:migrate:cloud` sem env apontar para um banco QUALQUER que exista na máquina de
		// quem rodou — que é a forma mais barata de migrar o banco errado.
		url: requireCloudDatabaseUrl(),
	},
	verbose: true,
	strict: true,
})
