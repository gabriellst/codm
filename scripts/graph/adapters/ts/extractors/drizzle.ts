// Drizzle schema extractor — reads packages/contracts/src/db/sqlite/*.ts and
// emits db-table nodes plus fk-references edges.
//
// Dialect note (Phase 0 — the daemon/gateway share one SQLite file): the contracts schema is a
// single FLAT dialect, so the owning namespace is NOT the file name — it is the prefix of the
// `sqliteTable()` literal (`terminal_terminal_llm_sessions` → `terminal`). Keeping the file name
// would attribute `authentication_users` to a context called `auth` and `shared_events` to one
// called `infrastructure`: file names, not namespaces.
//
// (Phase 2: still lives under the TS adapter for convenience. Phase 4 will
//  promote this to a dedicated contracts adapter alongside wire enums/events.)

import { Project, ScriptTarget, Node, type SourceFile } from 'ts-morph'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { addEdge, addNode, dbTableId, edgeId, type Graph } from '../../../core/graph'
import type { AuditCollector } from '../../../core/audit'
import { ROOT, repoRelative } from '../../../core/paths'
import { DRIZZLE_SCHEMA_DIR, IGNORE_TS } from '../../../core/config'

export function runDrizzleExtraction(graph: Graph, _audit: AuditCollector): { tablesExtracted: number } {
	const schemaDirAbs = join(ROOT, DRIZZLE_SCHEMA_DIR)
	if (!existsSync(schemaDirAbs)) return { tablesExtracted: 0 }

	const project = new Project({
		skipAddingFilesFromTsConfig: true,
		skipFileDependencyResolution: true,
		skipLoadingLibFiles: true,
		compilerOptions: { target: ScriptTarget.ES2022, allowJs: false, declaration: false, noEmit: true },
	})
	project.addSourceFilesAtPaths([join(schemaDirAbs, '*.ts'), ...IGNORE_TS.map(p => `!${p}`)])

	let tablesExtracted = 0
	for (const file of project.getSourceFiles()) {
		const repoPath = repoRelative(file.getFilePath())
		// Only top-level *.ts files inside the schema dir (skip the barrel, the enumCheck helper and
		// the drizzle-kit config — none of them declares a table).
		const tail = repoPath.slice(DRIZZLE_SCHEMA_DIR.length + 1)
		if (tail.includes('/') || !tail.endsWith('.ts')) continue
		if (NON_TABLE_FILES.has(tail)) continue
		tablesExtracted += extractTablesFromFile(graph, file, tail.replace(/\.ts$/, ''), repoPath)
	}

	return { tablesExtracted }
}

const NON_TABLE_FILES = new Set(['index.ts', '_enum.ts', 'drizzle.config.ts'])

/**
 * Owning namespace of a table declaration.
 *
 * `sqliteTable('<namespace>_<table>')` — flat dialect, namespace is the run before the FIRST `_`
 * (no pgSchema name in this repo contains `_`, so the split is deterministic). `pgTable` /
 * `<schema>.table(` keep the historical file-name fallback.
 */
function namespaceOf(calleeText: string, tableName: string, fileFallback: string): string {
	if (calleeText !== 'sqliteTable') return fileFallback
	const prefix = tableName.slice(0, tableName.indexOf('_'))
	return prefix === '' ? fileFallback : prefix
}

function extractTablesFromFile(graph: Graph, file: SourceFile, fileName: string, repoPath: string): number {
	let count = 0
	// Pattern A: `export const TABLE = pgTable('table_name', { ... })`
	// Pattern B: `export const TABLE = someSchema.table('table_name', { ... })`
	// Pattern C: `export const TABLE = sqliteTable('<namespace>_table_name', { ... })`

	for (const variable of file.getVariableDeclarations()) {
		const init = variable.getInitializer()
		if (!init || !Node.isCallExpression(init)) continue
		const callExpr = init.getExpression()
		const calleeText = callExpr.getText()
		const isTable = calleeText === 'pgTable' || calleeText === 'sqliteTable' || calleeText.endsWith('.table')
		if (!isTable) continue

		const args = init.getArguments()
		const tableNameArg = args[0]
		if (!tableNameArg) continue
		const tableNameLiteral =
			Node.isStringLiteral(tableNameArg) || Node.isNoSubstitutionTemplateLiteral(tableNameArg) ? tableNameArg.getLiteralValue() : null
		if (!tableNameLiteral) continue

		const schemaName = namespaceOf(calleeText, tableNameLiteral, fileName)

		const symbolName = variable.getName()
		const id = dbTableId(schemaName, symbolName)
		addNode(graph, {
			id,
			kind: 'db-table',
			name: symbolName,
			service: 'db',
			context: schemaName,
			workspace: 'contracts',
			location: { file: repoPath, line: variable.getStartLineNumber() },
			metadata: {
				tableName: tableNameLiteral,
				dbSchema: schemaName,
				symbolName,
			},
		})
		count++

		// FK references via `.references(() => otherTable.id)`
		const columnsArg = args[1]
		if (columnsArg && Node.isObjectLiteralExpression(columnsArg)) {
			columnsArg.forEachDescendant(child => {
				if (!Node.isCallExpression(child)) return
				const calleeName = (() => {
					const ce = child.getExpression()
					if (Node.isPropertyAccessExpression(ce)) return ce.getName()
					return null
				})()
				if (calleeName !== 'references') return
				const arrowArg = child.getArguments()[0]
				if (!arrowArg) return
				const body = arrowArg.getText()
				const m = body.match(/=>\s*([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)/)
				if (!m) return
				const targetSymbol = m[1]!
				const targetCol = m[2]!
				const targetId = dbTableId(schemaName, targetSymbol)
				addEdge(graph, {
					id: edgeId(id, 'fk-references', targetId),
					from: id,
					to: targetId,
					kind: 'fk-references',
					audit: 'EXTRACTED',
					metadata: { column: targetCol },
				})
			})
		}
	}

	return count
}
