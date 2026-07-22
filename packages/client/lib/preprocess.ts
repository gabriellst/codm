/**
 * Preprocess spec — validates against COMPLIANCE.md and drops SSE operations.
 * No transformation of nullable forms: that responsibility lies with the
 * upstream emitter (per R-05).
 */
import { readFile } from 'node:fs/promises'

export interface ComplianceError extends Error {
	rule: string
}

function fail(rule: string, message: string): never {
	const err = new Error(`COMPLIANCE.md ${rule}: ${message}`) as ComplianceError
	err.rule = rule
	throw err
}

const ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export interface PreprocessedSpec {
	spec: Record<string, unknown>
	skippedSse: number
}

export async function preprocessSpec(specPath: string): Promise<PreprocessedSpec> {
	const raw = await readFile(specPath, 'utf-8')
	const spec = JSON.parse(raw) as Record<string, unknown>

	// R-01
	const version = spec.openapi
	if (typeof version !== 'string' || !version.startsWith('3.0')) {
		fail('R-01', `openapi must start with "3.0", got ${JSON.stringify(version)} in ${specPath}`)
	}

	// R-03 (shallow check; deep walk would catch lazy refs but is expensive)
	const checkRefs = (node: unknown, path: string): void => {
		if (!node || typeof node !== 'object') return
		if (Array.isArray(node)) {
			node.forEach((c, i) => {
				checkRefs(c, `${path}[${i}]`)
			})
			return
		}
		const obj = node as Record<string, unknown>
		if (typeof obj.$ref === 'string' && !obj.$ref.startsWith('#/')) {
			fail('R-03', `external $ref not allowed (${obj.$ref}) at ${path}`)
		}
		for (const [k, v] of Object.entries(obj)) checkRefs(v, path ? `${path}.${k}` : k)
	}
	checkRefs(spec, '')

	// R-02, R-04, R-05, R-10
	const paths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>
	let skippedSse = 0

	for (const [pathKey, pathItem] of Object.entries(paths)) {
		if (!pathItem || typeof pathItem !== 'object') continue
		for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const) {
			const op = pathItem[method] as Record<string, unknown> | undefined
			if (!op) continue

			// R-10: drop SSE ops
			if (op['x-tpl-sse'] === true) {
				delete pathItem[method]
				skippedSse++
				continue
			}

			// R-02
			const operationId = op.operationId
			if (typeof operationId !== 'string' || !ID_RE.test(operationId)) {
				fail('R-02', `operation ${method.toUpperCase()} ${pathKey} missing valid operationId (got ${JSON.stringify(operationId)})`)
			}

			// R-04 (request)
			const rb = op.requestBody as Record<string, unknown> | undefined
			if (rb?.content && typeof rb.content === 'object') {
				const types = Object.keys(rb.content as object)
				for (const ct of types) {
					if (ct !== 'application/json') {
						fail('R-04', `${method.toUpperCase()} ${pathKey} requestBody content-type ${ct} not allowed`)
					}
				}
			}

			// R-04 (responses)
			const responses = (op.responses ?? {}) as Record<string, Record<string, unknown>>
			for (const [status, resp] of Object.entries(responses)) {
				if (status === '204') continue
				const content = (resp.content ?? {}) as Record<string, unknown>
				for (const ct of Object.keys(content)) {
					if (ct !== 'application/json' && ct !== 'text/event-stream') {
						fail('R-04', `${method.toUpperCase()} ${pathKey} response ${status} content-type ${ct} not allowed`)
					}
				}
			}
		}
		if (Object.keys(pathItem).length === 0) delete paths[pathKey]
	}

	// R-05 — reject 3.1 nullable forms anywhere in spec
	const checkNullable = (node: unknown, path: string): void => {
		if (!node || typeof node !== 'object') return
		if (Array.isArray(node)) {
			node.forEach((c, i) => {
				checkNullable(c, `${path}[${i}]`)
			})
			return
		}
		const obj = node as Record<string, unknown>
		if (Array.isArray(obj.type) && (obj.type as unknown[]).includes('null')) {
			fail('R-05', `type-array nullable form at ${path}; use { nullable: true }`)
		}
		if (Array.isArray(obj.anyOf)) {
			const hasNull = (obj.anyOf as Record<string, unknown>[]).some(s => s.type === 'null')
			if (hasNull) fail('R-05', `anyOf with type:"null" at ${path}; use { nullable: true }`)
		}
		for (const [k, v] of Object.entries(obj)) checkNullable(v, path ? `${path}.${k}` : k)
	}
	checkNullable(spec, '')

	return { spec, skippedSse }
}
