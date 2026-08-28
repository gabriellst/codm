#!/usr/bin/env bun
/**
 * Deriva os DOIS schemas que os dois configs de sqlc consomem, a partir do transcrito único.
 *
 * PORQUÊ ISTO EXISTE. O sqlc gera `models.go` para **todo o schema que recebe** — não há como
 * excluir tabela. Então "o core tem sqlc só do que é dele" exige que o core receba um schema
 * contendo só as tabelas dele. Isso cria um SEGUNDO artefato derivado, e o codm já tem um
 * artefato derivado nascendo de ritual manual (`schema.sql`, transcrito com `tr`+`sed` à mão,
 * documentado no `sqlc.yaml`). Dois rituais manuais seria o dobro do problema.
 *
 * Aqui a derivação é script determinístico e idempotente, e ganha gate (`--check`).
 *
 * A REGRA DO CORTE, e por que ela é segura. Uma tabela pertence ao CORE se o nome começa com
 * `shared_`; todo o resto é produto. Isso não é convenção frouxa — é o prefixo de namespace que o
 * `packages/contracts/src/db/sqlite/` já usa, e foi MEDIDO em 2026-08-14 que o corte é limpo dos dois
 * lados:
 *   · nenhuma FK do schema toca uma tabela `shared_*` (as 6 FKs são todas produto→produto);
 *   · nenhuma das 7 queries de produto toca uma tabela `shared_*`, e as 2 do core
 *     (`events.sql`, `outbox.sql`) tocam SÓ tabelas `shared_*`.
 * Se algum dia uma FK ou uma query cruzar a fronteira, este script REPROVA em vez de emitir um
 * schema quebrado — ver `assertNoCrossReference`.
 *
 * Uso:
 *   bun scripts/db/split-sqlite-schema.ts            # escreve os dois schemas
 *   bun scripts/db/split-sqlite-schema.ts --check    # exit 1 se o commitado divergir do derivado
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = process.env.ROOT_OVERRIDE ? resolve(process.env.ROOT_OVERRIDE) : resolve(SCRIPT_DIR, '../..')

const SOURCE = join(ROOT, 'packages/api/go/core/db/sqlite/schema.sql')
const CORE_OUT = join(ROOT, 'packages/api/go/core/db/sqlite/schema.core.sql')
const APP_OUT = join(ROOT, 'packages/api/go/internal/shared/db/sqlite/schema.app.sql')

/** O prefixo que marca uma tabela como do kernel. Única declaração — ninguém redigita `shared_`. */
const CORE_PREFIX = 'shared_'

export interface Statement {
	/** O texto integral do statement, incluindo o `;` final. */
	text: string
	/** A tabela que ele cria/indexa, em minúsculas, ou null quando não é table/index. */
	table: string | null
}

/**
 * Fatia o SQL em statements por `;` no fim de linha. Suficiente e deliberado: a fonte é a saída
 * NORMALIZADA do drizzle-kit (um statement por bloco, sem `;` dentro de literal), não SQL arbitrário.
 * Um parser completo aqui seria camada nova para um problema que a fonte não tem.
 */
export function splitStatements(sql: string): Statement[] {
	return sql
		.split(/;\s*\n/)
		.map(chunk => chunk.trim())
		.filter(chunk => chunk.length > 0)
		.map(chunk => {
			const text = `${chunk};`
			const created = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z0-9_]+)"?/i.exec(chunk)
			const indexed = /CREATE\s+(?:UNIQUE\s+)?INDEX[^;]*?\bON\s+"?([a-z0-9_]+)"?/i.exec(chunk)
			const table = (created?.[1] ?? indexed?.[1] ?? null)?.toLowerCase() ?? null
			return { text, table }
		})
}

const isCore = (table: string): boolean => table.startsWith(CORE_PREFIX)

/**
 * O guard que torna a regra do corte falseável em vez de esperançosa: se um statement de um lado
 * referenciar (`REFERENCES`) uma tabela do outro, o schema derivado seria inválido — e é melhor
 * reprovar aqui, com o nome dos dois lados, do que emitir SQL que o sqlc rejeita depois.
 */
export function assertNoCrossReference(statements: Statement[]): void {
	for (const { text, table } of statements) {
		if (!table) continue
		for (const ref of text.matchAll(/REFERENCES\s+"?([a-z0-9_]+)"?/gi)) {
			const target = ref[1].toLowerCase()
			if (isCore(table) !== isCore(target)) {
				throw new Error(
					`corte inválido: "${table}" referencia "${target}", e eles caem em lados opostos da fronteira ` +
						`core/produto. A regra do prefixo "${CORE_PREFIX}" deixou de descrever este schema — ` +
						`redesenhe o corte em vez de contorná-lo.`,
				)
			}
		}
	}
}

const HEADER = (side: string) =>
	[
		`-- DERIVADO — não edite à mão. Gerado por scripts/db/split-sqlite-schema.ts a partir de`,
		`-- packages/api/go/core/db/sqlite/schema.sql, mantendo só as tabelas do lado "${side}".`,
		`-- Regenerar: bun scripts/db/split-sqlite-schema.ts   ·   Conferir: … --check`,
		'',
	].join('\n')

export function derive(sql: string): { core: string; app: string } {
	const statements = splitStatements(sql)
	assertNoCrossReference(statements)
	const side = (wantCore: boolean) =>
		HEADER(wantCore ? 'core' : 'app') +
		statements
			.filter(s => s.table !== null && isCore(s.table) === wantCore)
			.map(s => s.text)
			.join('\n') +
		'\n'
	return { core: side(true), app: side(false) }
}

if (import.meta.main) {
	const check = process.argv.includes('--check')
	const { core, app } = derive(readFileSync(SOURCE, 'utf-8'))

	if (!check) {
		writeFileSync(CORE_OUT, core)
		writeFileSync(APP_OUT, app)
		console.log(`schema derivado → ${relative(ROOT, CORE_OUT)} · ${relative(ROOT, APP_OUT)}`)
		process.exit(0)
	}

	const stale: string[] = []
	for (const [path, expected] of [
		[CORE_OUT, core],
		[APP_OUT, app],
	] as const) {
		let actual: string
		try {
			actual = readFileSync(path, 'utf-8')
		} catch {
			stale.push(`${relative(ROOT, path)} — ausente`)
			continue
		}
		if (actual !== expected) stale.push(`${relative(ROOT, path)} — divergiu do derivado`)
	}

	if (stale.length > 0) {
		console.error(`schema derivado desatualizado:\n  ${stale.join('\n  ')}`)
		console.error(`\nRode: bun scripts/db/split-sqlite-schema.ts`)
		process.exit(1)
	}
	console.log('schema derivado: em dia')
}
