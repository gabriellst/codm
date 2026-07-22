// Drizzle schema extractor — reads packages/contracts/db/schema/*.ts and
// emits db-table nodes plus fk-references edges.
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
		// Only top-level *.ts files inside the schema dir (skip index/barrel files).
		const tail = repoPath.slice(DRIZZLE_SCHEMA_DIR.length + 1)
		if (tail.includes('/') || !tail.endsWith('.ts')) continue
		const schemaName = tail.replace(/\.ts$/, '')
		if (schemaName === 'index') continue
		tablesExtracted += extractTablesFromFile(graph, file, schemaName, repoPath)
	}

	return { tablesExtracted }
}

function extractTablesFromFile(graph: Graph, file: SourceFile, schemaName: string, repoPath: string): number {
	let count = 0
	// Pattern A: `export const TABLE = pgTable('table_name', { ... })`
	// Pattern B: `export const TABLE = someSchema.table('table_name', { ... })`

	for (const variable of file.getVariableDeclarations()) {
		const init = variable.getInitializer()
		if (!init || !Node.isCallExpression(init)) continue
		const callExpr = init.getExpression()
		const calleeText = callExpr.getText()
		const isPgTable = calleeText === 'pgTable' || calleeText.endsWith('.table')
		if (!isPgTable) continue

		const args = init.getArguments()
		const tableNameArg = args[0]
		if (!tableNameArg) continue
		const tableNameLiteral =
			Node.isStringLiteral(tableNameArg) || Node.isNoSubstitutionTemplateLiteral(tableNameArg) ? tableNameArg.getLiteralValue() : null
		if (!tableNameLiteral) continue

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
