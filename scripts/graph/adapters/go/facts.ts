// Loads Go AST facts by invoking the small Go binary at
// `scripts/graph/adapters/go/extractor` and parsing its JSON output.
//
// The extractor walks Go source files with go/parser + go/ast and emits a
// structured, type-safe view of each file (declarations, calls, imports,
// constructor params, controller metadata, etc.) — the TS adapter consumes
// those facts to build graph nodes/edges, replacing the previous regex-based
// extraction.

import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { ROOT } from '../../core/paths'
import { goWorkspaceRoots } from './classify'

export interface ImportRef {
	alias?: string
	path: string
}

export interface FieldDecl {
	name?: string
	pkg?: string
	type: string
	pointer?: boolean
}

export interface TypeDecl {
	name: string
	kind: 'struct' | 'interface' | 'alias'
	underlying?: string
	line: number
	fields?: FieldDecl[]
}

export interface ConstMember {
	name: string
	value?: string
	line: number
}

export interface ConstBlock {
	typed?: string
	members: ConstMember[]
}

export interface ErrorCodeDecl {
	name: string
	wire: string
	line: number
}

export interface StringConst {
	name: string
	value: string
	line: number
}

export interface FuncDecl {
	name: string
	line: number
	params: FieldDecl[]
}

export interface MethodDecl {
	name: string
	recvType: string
	recvPtr?: boolean
	line: number
	endLine: number
	returnRef?: string
}

export interface CallRef {
	callee: string
	pkg?: string
	fn: string
	typeArgs?: string[]
	firstArgCall?: string
	line: number
	recvType?: string
}

export interface PascalRef {
	pkg: string
	symbol: string
	line: number
}

export interface ControllerMeta {
	path?: string
	method?: string
	description?: string
	context?: string
	errorCodes?: string[]
	line: number
}

export interface FileFacts {
	rel: string
	package: string
	imports: ImportRef[]
	types: TypeDecl[]
	constBlocks: ConstBlock[]
	errorCodes: ErrorCodeDecl[]
	stringConsts: StringConst[]
	funcs: FuncDecl[]
	methods: MethodDecl[]
	calls: CallRef[]
	pascalRefs: PascalRef[]
	controllerMeta?: ControllerMeta
}

interface ExtractorOutput {
	files: FileFacts[]
}

let cached: Map<string, FileFacts> | null = null

export function loadGoFacts(roots: string[] = goWorkspaceRoots()): Map<string, FileFacts> {
	if (cached) return cached
	const absRoots = roots.map(r => join(ROOT, r))
	const extractorDir = join(ROOT, 'scripts/graph/adapters/go/extractor')
	const result = spawnSync('go', ['run', '.', ROOT, ...absRoots], {
		cwd: extractorDir,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
	if (result.status !== 0) {
		throw new Error(`Go extractor failed (exit ${result.status}): ${result.stderr}`)
	}
	const parsed = JSON.parse(result.stdout) as ExtractorOutput
	const map = new Map<string, FileFacts>()
	for (const f of parsed.files) map.set(f.rel, f)
	cached = map
	return map
}

export function resetGoFactsCache(): void {
	cached = null
}
