import type { AuditEntry, AuditReport } from './graph'

export class AuditCollector {
	private entries: AuditEntry[] = []

	add(entry: AuditEntry): void {
		this.entries.push(entry)
	}

	unresolvedImport(file: string, importPath: string, line?: number): void {
		this.add({
			file,
			...(line !== undefined ? { line } : {}),
			severity: 'warning',
			code: 'UNRESOLVED_IMPORT',
			message: `Import "${importPath}" did not resolve to a known graph node`,
			hint: 'Add an extractor or check that the target file is being scanned',
		})
	}

	missingSdkArtifact(operationId: string, expectedKind: string, expectedPath: string): void {
		this.add({
			file: expectedPath,
			severity: 'warning',
			code: 'MISSING_SDK_ARTIFACT',
			message: `OpenAPI operation "${operationId}" expects ${expectedKind} at ${expectedPath} but file is missing`,
			hint: 'Run `bun sdk` to regenerate the SDK',
		})
	}

	orphan(nodeId: string, file?: string): void {
		this.add({
			file: file ?? '',
			severity: 'info',
			code: 'ORPHAN',
			message: `Node "${nodeId}" has no incoming or outgoing edges`,
		})
	}

	drift(file: string, message: string, hint?: string): void {
		this.add({
			file,
			severity: 'error',
			code: 'DRIFT',
			...(hint ? { hint } : {}),
			message,
		})
	}

	finish(stats: { extracted: number; inferred: number; unresolved: number }): AuditReport {
		return {
			version: '1',
			generatedAt: new Date().toISOString(),
			entries: this.entries,
			stats,
		}
	}

	get all(): AuditEntry[] {
		return this.entries
	}
}
