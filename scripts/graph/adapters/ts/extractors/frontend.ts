import { Node, type SourceFile } from 'ts-morph'
import { addEdge, addNode, edgeId, frontendRouteId, localeKeyId, nodeId, type Graph } from '../../../core/graph'
import type { AuditCollector } from '../../../core/audit'
import { repoRelative } from '../../../core/paths'
import { classify } from '../../../registry/classifier'
import { getFrontendProjects } from '../project'
import { findI18nKeyCalls, findRecordEnumDeclarations, getImports } from '../utils'
import { isExternalJsxModule, isSdkSpecifier, LOCALE_LANGS, parseSdkFlavor } from '../../../core/config'

interface ExtractCtx {
	graph: Graph
	audit: AuditCollector
	file: SourceFile
	repoPath: string
}

export function runFrontendExtraction(graph: Graph, audit: AuditCollector): { filesProcessed: number } {
	const projects = getFrontendProjects()
	let filesProcessed = 0

	// First pass: classify and extract; second pass: walk every frontend file for
	// i18n calls so we capture references made in unclassified or wrapper modules.
	for (const { project } of projects) {
		for (const file of project.getSourceFiles()) {
			const repoPath = repoRelative(file.getFilePath())
			const cls = classify(repoPath)
			if (!cls) {
				emitFreestandingI18nEdges(graph, file, repoPath)
				continue
			}
			filesProcessed++
			const ctx: ExtractCtx = { graph, audit, file, repoPath }

			switch (cls.kind) {
				case 'frontend-route':
					extractRoute(ctx)
					break
				case 'frontend-section':
					extractSection(ctx)
					break
				case 'frontend-component':
					extractComponent(ctx)
					break
				case 'frontend-dialog':
					extractDialog(ctx)
					break
				case 'frontend-form':
					extractForm(ctx)
					break
				case 'frontend-ui-primitive':
					extractUiPrimitive(ctx)
					break
				case 'frontend-store':
					extractStore(ctx)
					break
				case 'frontend-hook':
					extractHook(ctx)
					break
				case 'frontend-label-map':
					extractLabelMap(ctx)
					break
				case 'frontend-error-handler':
					extractErrorHandler(ctx)
					break
				default:
					break
			}
		}
	}

	return { filesProcessed }
}

function fileBaseName(repoPath: string): string {
	const last = repoPath.split('/').pop() ?? repoPath
	return last.replace(/\.tsx?$/, '')
}

function dirBaseName(repoPath: string): string {
	const parts = repoPath.split('/')
	if (parts[parts.length - 1] === 'index.tsx' || parts[parts.length - 1] === 'index.ts') {
		return parts[parts.length - 2] ?? 'unknown'
	}
	return parts[parts.length - 1]?.replace(/\.tsx?$/, '') ?? 'unknown'
}

// Walk SDK imports and emit consume-* edges from the current frontend node
function emitSdkConsumptionEdges(ctx: ExtractCtx, fromNodeId: string): void {
	for (const imp of getImports(ctx.file)) {
		if (!isSdkSpecifier(imp.moduleSpecifier)) continue
		const flavor = parseSdkFlavor(imp.moduleSpecifier)
		for (const symbol of imp.namedImports) {
			const kindGuess = guessSdkSymbolKind(symbol)
			if (!kindGuess) continue
			let toId: string
			let edgeKind: 'consumes-sdk-hook' | 'consumes-sdk-type' | 'consumes-sdk-zod' | 'consumes-sdk-enum'
			switch (kindGuess) {
				case 'sdk-hook':
					toId = `sdk:${flavor}:sdk-hook:${symbol}`
					edgeKind = 'consumes-sdk-hook'
					break
				case 'sdk-zod':
					toId = `sdk:${flavor}:sdk-zod:${symbol}`
					edgeKind = 'consumes-sdk-zod'
					break
				case 'sdk-enum': {
					// Strip `Enum` suffix to get the canonical enum name (e.g. AppointmentStatusEnum → AppointmentStatus)
					const enumBase = symbol.replace(/Enum$/, '')
					toId = `sdk:${flavor}:sdk-enum:${enumBase}`
					edgeKind = 'consumes-sdk-enum'
					break
				}
				default:
					toId = `sdk:${flavor}:sdk-type:${symbol}`
					edgeKind = 'consumes-sdk-type'
					break
			}
			addEdge(ctx.graph, {
				id: edgeId(fromNodeId, edgeKind, toId),
				from: fromNodeId,
				to: toId,
				kind: edgeKind,
				audit: 'INFERRED',
				metadata: { symbol, sdkFlavor: flavor, moduleSpecifier: imp.moduleSpecifier },
			})
		}
	}
}

type SdkSymbolKind = 'sdk-hook' | 'sdk-type' | 'sdk-zod' | 'sdk-enum'

function guessSdkSymbolKind(symbol: string): SdkSymbolKind | null {
	if (/^use[A-Z]/.test(symbol)) return 'sdk-hook'
	if (/Schema$/.test(symbol)) return 'sdk-zod'
	if (/Enum$/.test(symbol)) return 'sdk-enum'
	if (/^[A-Z]/.test(symbol)) return 'sdk-type'
	return null
}

function emitI18nKeyEdges(ctx: ExtractCtx, fromNodeId: string): void {
	for (const hit of findI18nKeyCalls(ctx.file)) {
		if (hit.kind === 'exact') {
			for (const lang of LOCALE_LANGS) {
				const localeId = localeKeyId(lang, hit.key)
				addEdge(ctx.graph, {
					id: edgeId(fromNodeId, 'references-locale-key', localeId),
					from: fromNodeId,
					to: localeId,
					kind: 'references-locale-key',
					audit: 'INFERRED',
					location: { file: ctx.repoPath, line: hit.line },
					metadata: { key: hit.key, lang },
				})
			}
		} else {
			// Prefix match: emit a placeholder edge that the resolver will fan out
			// to every locale-key starting with this prefix. We use a placeholder
			// target id so the resolver can detect and rewrite.
			for (const lang of LOCALE_LANGS) {
				addEdge(ctx.graph, {
					id: edgeId(fromNodeId, 'references-locale-key', `__locale-prefix:${lang}:${hit.key}`),
					from: fromNodeId,
					to: `__locale-prefix:${lang}:${hit.key}`,
					kind: 'references-locale-key',
					audit: 'INFERRED',
					location: { file: ctx.repoPath, line: hit.line },
					metadata: { keyPrefix: hit.key, lang, dynamic: true },
				})
			}
		}
	}
}

// Detect SSE consumers: components that call `useServerEvents([...])` to listen
// to integration events streamed by the api ListenEvents controller.
function emitSseConsumerEdges(ctx: ExtractCtx, fromNodeId: string): void {
	const consumed = new Set<string>()
	ctx.file.forEachDescendant(n => {
		if (!Node.isCallExpression(n)) return
		const expr = n.getExpression()
		const calleeName = (() => {
			if (Node.isIdentifier(expr)) return expr.getText()
			if (Node.isPropertyAccessExpression(expr)) return expr.getName()
			return null
		})()
		if (calleeName !== 'useServerEvents') return
		const arg = n.getArguments()[0]
		if (!arg) return
		// Case A: array of names — `useServerEvents(['integration.foo', ...])`
		if (Node.isArrayLiteralExpression(arg)) {
			for (const el of arg.getElements()) {
				const lit = Node.isStringLiteral(el) || Node.isNoSubstitutionTemplateLiteral(el) ? el.getLiteralValue() : null
				if (lit) consumed.add(lit)
				else if (Node.isPropertyAccessExpression(el)) consumed.add(el.getName())
			}
		}
		// Case B: single name — `useServerEvents('integration.foo')` or `useServerEvents(EnumName.X)`
		if (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg)) {
			consumed.add(arg.getLiteralValue())
		}
		if (Node.isPropertyAccessExpression(arg)) consumed.add(arg.getName())
	})

	for (const name of consumed) {
		addEdge(ctx.graph, {
			id: edgeId(fromNodeId, 'consumes-integration-event', `__sse:${name}`),
			from: fromNodeId,
			to: `__sse:${name}`,
			kind: 'consumes-integration-event',
			audit: 'INFERRED',
			metadata: { eventLiteral: name },
		})
	}
}

// External JSX modules (libraries we don't own) come from `core/config.ts` so a
// new library is added in one place — not buried in this adapter.
const isExternalImport = isExternalJsxModule

// All edge kinds that any frontend file might emit, regardless of its node kind.
// Centralized here so `extractRoute`, `extractSection`, `extractComponent`,
// `extractDialog`, `extractForm`, `extractUiPrimitive`, `extractHook`, etc. all
// emit the same set without per-kind duplication.
// For unclassified frontend files: still emit i18n edges from a synthetic
// "frontend-component" node named after the directory or file, so the locale
// keys get reached even when the file doesn't fit any known pattern.
function emitFreestandingI18nEdges(graph: Graph, file: SourceFile, repoPath: string): void {
	const calls = findI18nKeyCalls(file)
	if (calls.length === 0) return
	const last = repoPath.split('/').pop() ?? repoPath
	const isIndex = last === 'index.tsx' || last === 'index.ts'
	const parent = repoPath.split('/').slice(-2, -1)[0] ?? 'unknown'
	const stub = isIndex ? parent : last.replace(/\.tsx?$/, '')
	// Don't create stubs for known-helper basenames or config files
	if (/^(utils|helpers|types|constants|fields|config|zod-config)$/.test(stub)) return
	const id = nodeId({ service: 'app', kind: 'frontend-component', name: stub })
	addNode(graph, {
		id,
		kind: 'frontend-component',
		name: stub,
		service: 'app',
		location: { file: repoPath },
		metadata: { freestanding: true, source: 'i18n-pass' },
	})
	for (const hit of calls) {
		if (hit.kind === 'exact') {
			for (const lang of LOCALE_LANGS) {
				const localeId = localeKeyId(lang, hit.key)
				addEdge(graph, {
					id: edgeId(id, 'references-locale-key', localeId),
					from: id,
					to: localeId,
					kind: 'references-locale-key',
					audit: 'INFERRED',
					location: { file: repoPath, line: hit.line },
					metadata: { key: hit.key, lang, freestanding: true },
				})
			}
		} else {
			for (const lang of LOCALE_LANGS) {
				addEdge(graph, {
					id: edgeId(id, 'references-locale-key', `__locale-prefix:${lang}:${hit.key}`),
					from: id,
					to: `__locale-prefix:${lang}:${hit.key}`,
					kind: 'references-locale-key',
					audit: 'INFERRED',
					location: { file: repoPath, line: hit.line },
					metadata: { keyPrefix: hit.key, lang, dynamic: true, freestanding: true },
				})
			}
		}
	}
}

function emitCommonFrontendEdges(ctx: ExtractCtx, id: string): void {
	emitSdkConsumptionEdges(ctx, id)
	emitI18nKeyEdges(ctx, id)
	emitSseConsumerEdges(ctx, id)
	emitStoreReadEdges(ctx, id)
	emitHookUseEdges(ctx, id)
	emitLabelMapReferenceEdges(ctx, id)
}

function emitStoreReadEdges(ctx: ExtractCtx, fromId: string): void {
	ctx.file.forEachDescendant(n => {
		if (!Node.isCallExpression(n)) return
		const callee = n.getExpression()
		if (!Node.isIdentifier(callee)) return
		const text = callee.getText()
		if (!/^use[A-Z][A-Za-z0-9]*Store$/.test(text)) return
		const storeId = nodeId({ service: 'app', kind: 'frontend-store', name: text })
		addEdge(ctx.graph, {
			id: edgeId(fromId, 'reads-store', storeId),
			from: fromId,
			to: storeId,
			kind: 'reads-store',
			audit: 'EXTRACTED',
			location: { file: ctx.repoPath, line: n.getStartLineNumber() },
		})
	})
}

function emitHookUseEdges(ctx: ExtractCtx, fromId: string): void {
	ctx.file.forEachDescendant(n => {
		if (!Node.isCallExpression(n)) return
		const callee = n.getExpression()
		if (!Node.isIdentifier(callee)) return
		const text = callee.getText()
		if (!/^use[A-Z][A-Za-z0-9]*$/.test(text)) return
		const importedFrom = (() => {
			for (const imp of ctx.file.getImportDeclarations()) {
				if (imp.getNamedImports().some(ni => ni.getName() === text)) return imp.getModuleSpecifierValue()
			}
			return null
		})()
		if (!importedFrom || isSdkSpecifier(importedFrom)) return
		if (!importedFrom.includes('/hooks') && !importedFrom.includes('@/hooks') && !importedFrom.includes('-hooks')) return
		const hookId = nodeId({ service: 'app', kind: 'frontend-hook', name: text })
		addEdge(ctx.graph, {
			id: edgeId(fromId, 'uses-hook', hookId),
			from: fromId,
			to: hookId,
			kind: 'uses-hook',
			audit: 'EXTRACTED',
			location: { file: ctx.repoPath, line: n.getStartLineNumber() },
		})
	})
}

function emitLabelMapReferenceEdges(ctx: ExtractCtx, fromId: string): void {
	for (const imp of getImports(ctx.file)) {
		if (!imp.moduleSpecifier.startsWith('@/lib') && !/from\s+['"]@\/lib/.test(imp.moduleSpecifier)) continue
		for (const sym of imp.namedImports) {
			if (!/^(color|label|icon|badge)Per/.test(sym)) continue
			const labelMapId = nodeId({ service: 'app', kind: 'frontend-label-map', name: sym })
			addEdge(ctx.graph, {
				id: edgeId(fromId, 'references-label-map', labelMapId),
				from: fromId,
				to: labelMapId,
				kind: 'references-label-map',
				audit: 'EXTRACTED',
			})
		}
	}
}

// Detect rendered components by JSX tag name in the file. Filters out anything
// imported from external libraries (icons, framework primitives, etc.) so the
// graph only contains nodes we actually own.
function findRenderedComponentNames(file: SourceFile): { name: string; line: number }[] {
	// Build a set of identifiers that came from external modules
	const externalSymbols = new Set<string>()
	for (const imp of file.getImportDeclarations()) {
		const spec = imp.getModuleSpecifierValue()
		if (!isExternalImport(spec)) continue
		for (const ni of imp.getNamedImports()) externalSymbols.add(ni.getName())
		const def = imp.getDefaultImport()?.getText()
		if (def) externalSymbols.add(def)
		const ns = imp.getNamespaceImport()?.getText()
		if (ns) externalSymbols.add(ns)
	}

	const seen = new Set<string>()
	const names: { name: string; line: number }[] = []
	file.forEachDescendant(n => {
		if (Node.isJsxOpeningElement(n) || Node.isJsxSelfClosingElement(n)) {
			const tagName = n.getTagNameNode().getText()
			if (!/^[A-Z]/.test(tagName)) return
			if (externalSymbols.has(tagName)) return
			// Tabler icon convention: `IconFoo` — defensively filter even if import wasn't picked up
			if (/^Icon[A-Z]/.test(tagName)) return
			// React Fragment / context providers
			if (tagName === 'Fragment') return
			if (seen.has(tagName)) return
			seen.add(tagName)
			names.push({ name: tagName, line: n.getStartLineNumber() })
		}
	})
	return names
}

// ── Route ──

function extractRoute(ctx: ExtractCtx) {
	const id = frontendRouteId(ctx.repoPath)
	// Try to extract route path from createFileRoute('...') call
	let routePath: string | null = null
	let validateSearchPresent = false

	ctx.file.forEachDescendant(n => {
		if (!Node.isCallExpression(n)) return
		const callee = n.getExpression()
		const calleeText = (() => {
			if (Node.isIdentifier(callee)) return callee.getText()
			if (Node.isPropertyAccessExpression(callee)) return callee.getName()
			return ''
		})()
		if (calleeText === 'createFileRoute') {
			const arg = n.getArguments()[0]
			if (arg && (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg))) {
				routePath = arg.getLiteralValue()
			}
		}
	})
	for (const obj of ctx.file.getDescendantsOfKind(/* ObjectLiteralExpression */ 210 as never)) {
		if (Node.isObjectLiteralExpression(obj)) {
			if (obj.getProperty('validateSearch')) validateSearchPresent = true
		}
	}

	addNode(ctx.graph, {
		id,
		kind: 'frontend-route',
		name: routePath ?? ctx.repoPath,
		service: 'app',
		location: { file: ctx.repoPath },
		metadata: { routePath, validateSearch: validateSearchPresent },
	})

	// Render edges → emit per JSX tag (resolved later by name lookup)
	for (const { name, line } of findRenderedComponentNames(ctx.file)) {
		const sectionId = nodeId({ service: 'app', kind: 'frontend-section', name })
		addEdge(ctx.graph, {
			id: edgeId(id, 'renders', sectionId),
			from: id,
			to: sectionId,
			kind: 'renders',
			audit: 'INFERRED',
			location: { file: ctx.repoPath, line },
		})
	}

	emitCommonFrontendEdges(ctx, id)

	// Search-schema → SDK zod composition: detect `someSdkSchema.and(...)` patterns
	for (const imp of getImports(ctx.file)) {
		if (!isSdkSpecifier(imp.moduleSpecifier)) continue
		const flavor = parseSdkFlavor(imp.moduleSpecifier)
		for (const symbol of imp.namedImports) {
			if (!/Schema$/.test(symbol)) continue
			const fileText = ctx.file.getFullText()
			if (fileText.includes(`${symbol}.and(`) || fileText.includes(`${symbol}.merge(`)) {
				const searchId = `${id}::search`
				addNode(ctx.graph, {
					id: searchId,
					kind: 'frontend-route-search',
					name: `${routePath ?? ctx.repoPath} search`,
					service: 'app',
					location: { file: ctx.repoPath },
				})
				addEdge(ctx.graph, {
					id: edgeId(id, 'validates-search-with', searchId),
					from: id,
					to: searchId,
					kind: 'validates-search-with',
					audit: 'EXTRACTED',
				})
				addEdge(ctx.graph, {
					id: edgeId(searchId, 'composes-with', `sdk:${flavor}:sdk-zod:${symbol}`),
					from: searchId,
					to: `sdk:${flavor}:sdk-zod:${symbol}`,
					kind: 'composes-with',
					audit: 'EXTRACTED',
				})
			}
		}
	}
}

// ── Section / Component / Dialog ──

function extractSection(ctx: ExtractCtx) {
	// Section name is usually the directory name
	const name = dirBaseName(ctx.repoPath)
	const id = nodeId({ service: 'app', kind: 'frontend-section', name })
	addNode(ctx.graph, {
		id,
		kind: 'frontend-section',
		name,
		service: 'app',
		location: { file: ctx.repoPath },
	})

	for (const { name: childName, line } of findRenderedComponentNames(ctx.file)) {
		// We don't know if it's a primitive, component, or dialog yet — emit a generic `renders` edge
		// and let the resolver figure it out by matching node ids by name.
		const childId = nodeId({ service: 'app', kind: 'frontend-component', name: childName })
		addEdge(ctx.graph, {
			id: edgeId(id, 'renders', childId),
			from: id,
			to: childId,
			kind: 'renders',
			audit: 'INFERRED',
			location: { file: ctx.repoPath, line },
		})
	}

	emitCommonFrontendEdges(ctx, id)
}

function extractComponent(ctx: ExtractCtx) {
	// Component name comes from:
	//   - the enclosing dir if file is index.tsx
	//   - the file basename (PascalCase normalized) otherwise
	//   - or the first exported PascalCase declaration if available
	const exportedComponent = findFirstExportedComponentName(ctx.file)
	const fallback =
		ctx.repoPath.endsWith('/index.tsx') || ctx.repoPath.endsWith('/index.ts') ? dirBaseName(ctx.repoPath) : fileBaseName(ctx.repoPath)
	const name = exportedComponent ?? fallback
	const id = nodeId({ service: 'app', kind: 'frontend-component', name })
	addNode(ctx.graph, {
		id,
		kind: 'frontend-component',
		name,
		service: 'app',
		location: { file: ctx.repoPath },
	})

	for (const { name: childName, line } of findRenderedComponentNames(ctx.file)) {
		const childId = nodeId({ service: 'app', kind: 'frontend-component', name: childName })
		addEdge(ctx.graph, {
			id: edgeId(id, 'renders', childId),
			from: id,
			to: childId,
			kind: 'renders',
			audit: 'INFERRED',
			location: { file: ctx.repoPath, line },
		})
	}

	emitCommonFrontendEdges(ctx, id)
}

function findFirstExportedComponentName(file: SourceFile): string | null {
	// Look for `export function <Name>` or `export const <Name> = ...`
	for (const fn of file.getFunctions()) {
		const name = fn.getName()
		if (name && /^[A-Z]/.test(name) && fn.isExported()) return name
	}
	for (const decl of file.getVariableDeclarations()) {
		const name = decl.getName()
		if (/^[A-Z]/.test(name) && decl.isExported()) return name
	}
	return null
}

function extractDialog(ctx: ExtractCtx) {
	const name = dirBaseName(ctx.repoPath)
	const id = nodeId({ service: 'app', kind: 'frontend-dialog', name })
	addNode(ctx.graph, {
		id,
		kind: 'frontend-dialog',
		name,
		service: 'app',
		location: { file: ctx.repoPath },
	})

	for (const { name: childName, line } of findRenderedComponentNames(ctx.file)) {
		const childId = nodeId({ service: 'app', kind: 'frontend-component', name: childName })
		addEdge(ctx.graph, {
			id: edgeId(id, 'renders', childId),
			from: id,
			to: childId,
			kind: 'renders',
			audit: 'INFERRED',
			location: { file: ctx.repoPath, line },
		})
	}

	emitCommonFrontendEdges(ctx, id)
}

function extractForm(ctx: ExtractCtx) {
	const name = dirBaseName(ctx.repoPath)
	const id = nodeId({ service: 'app', kind: 'frontend-form', name })
	addNode(ctx.graph, {
		id,
		kind: 'frontend-form',
		name,
		service: 'app',
		location: { file: ctx.repoPath },
	})
	for (const { name: childName, line } of findRenderedComponentNames(ctx.file)) {
		const childId = nodeId({ service: 'app', kind: 'frontend-component', name: childName })
		addEdge(ctx.graph, {
			id: edgeId(id, 'renders', childId),
			from: id,
			to: childId,
			kind: 'renders',
			audit: 'INFERRED',
			location: { file: ctx.repoPath, line },
		})
	}
	emitCommonFrontendEdges(ctx, id)
}

function extractUiPrimitive(ctx: ExtractCtx) {
	// File name is lowercase (e.g. skeleton.tsx), but the exported component is PascalCase (Skeleton).
	// JSX usage references the PascalCase name, so node name must match that for resolver lookups.
	// We collect every declaration that defines a primitive component in this file,
	// then emit render edges per-declaration so compound parts (DialogContent →
	// DialogPortal) wire up correctly.
	const primitiveDecls: { name: string; bodyNode: Node }[] = []
	for (const fn of ctx.file.getFunctions()) {
		const name = fn.getName()
		if (name && /^[A-Z]/.test(name)) primitiveDecls.push({ name, bodyNode: fn })
	}
	for (const decl of ctx.file.getVariableDeclarations()) {
		const name = decl.getName()
		if (!/^[A-Z]/.test(name)) continue
		const init = decl.getInitializer()
		primitiveDecls.push({ name, bodyNode: init ?? decl })
	}
	for (const cls of ctx.file.getClasses()) {
		const name = cls.getName()
		if (name && /^[A-Z]/.test(name)) primitiveDecls.push({ name, bodyNode: cls })
	}

	// Collect every exported primitive name so we recognize them as "owned" tags
	// to filter out from external-symbol checks. Exclude TypeScript type aliases
	// and interface declarations — those are not renderable components and would
	// otherwise show up as orphan "primitives" (DatePreset, ConfirmDialogProps).
	const exportedNames = new Set<string>()
	for (const [name, decls] of ctx.file.getExportedDeclarations()) {
		if (!/^[A-Z]/.test(name)) continue
		if (name.endsWith('Props')) continue // explicit Props types
		const isComponentLike = decls.some(d => {
			if (Node.isFunctionDeclaration(d)) return true
			if (Node.isClassDeclaration(d)) return true
			if (Node.isVariableDeclaration(d)) {
				const init = d.getInitializer()
				return Boolean(init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init) || Node.isCallExpression(init)))
			}
			return false
		})
		if (isComponentLike) exportedNames.add(name)
	}
	// Re-exports (always assumed renderable since types are re-exported with `export type`)
	for (const decl of ctx.file.getExportDeclarations()) {
		if (decl.isTypeOnly()) continue
		for (const named of decl.getNamedExports()) {
			if (named.isTypeOnly()) continue
			const name = named.getAliasNode()?.getText() ?? named.getName()
			if (/^[A-Z]/.test(name) && !name.endsWith('Props')) exportedNames.add(name)
		}
	}

	if (exportedNames.size === 0) {
		const fallback = fileBaseName(ctx.repoPath)
		exportedNames.add(fallback.charAt(0).toUpperCase() + fallback.slice(1))
	}

	// Emit one node per exported primitive
	for (const name of exportedNames) {
		const id = nodeId({ service: 'app', kind: 'frontend-ui-primitive', name })
		addNode(ctx.graph, {
			id,
			kind: 'frontend-ui-primitive',
			name,
			service: 'app',
			location: { file: ctx.repoPath },
		})
	}

	// Build external-symbol filter once (mirrors findRenderedComponentNames)
	const externalSymbols = new Set<string>()
	for (const imp of ctx.file.getImportDeclarations()) {
		const spec = imp.getModuleSpecifierValue()
		if (!isExternalImport(spec)) continue
		for (const ni of imp.getNamedImports()) externalSymbols.add(ni.getName())
		const def = imp.getDefaultImport()?.getText()
		if (def) externalSymbols.add(def)
		const ns = imp.getNamespaceImport()?.getText()
		if (ns) externalSymbols.add(ns)
	}

	// Per-declaration render edges
	for (const { name, bodyNode } of primitiveDecls) {
		if (!exportedNames.has(name)) continue
		const fromId = nodeId({ service: 'app', kind: 'frontend-ui-primitive', name })
		const seen = new Set<string>()
		bodyNode.forEachDescendant(n => {
			if (!Node.isJsxOpeningElement(n) && !Node.isJsxSelfClosingElement(n)) return
			const tagName = n.getTagNameNode().getText()
			if (!/^[A-Z]/.test(tagName)) return
			if (externalSymbols.has(tagName)) return
			if (/^Icon[A-Z]/.test(tagName)) return
			if (tagName === 'Fragment') return
			if (tagName === name) return // self-render
			if (seen.has(tagName)) return
			seen.add(tagName)
			const childId = nodeId({ service: 'app', kind: 'frontend-ui-primitive', name: tagName })
			addEdge(ctx.graph, {
				id: edgeId(fromId, 'renders', childId),
				from: fromId,
				to: childId,
				kind: 'renders',
				audit: 'INFERRED',
				location: { file: ctx.repoPath, line: n.getStartLineNumber() },
			})
		})
	}

	// File-level i18n / SDK edges still anchor on the first exported primitive,
	// since they describe the file as a whole.
	const primaryName = exportedNames.values().next().value as string | undefined
	if (primaryName) {
		const primaryId = nodeId({ service: 'app', kind: 'frontend-ui-primitive', name: primaryName })
		emitCommonFrontendEdges(ctx, primaryId)
	}
}

function extractStore(ctx: ExtractCtx) {
	// Pull `export const useXxxStore` declarations
	const decl = ctx.file.getVariableDeclarations().find(v => /^use[A-Z].*Store$/.test(v.getName()))
	const name = decl?.getName() ?? fileBaseName(ctx.repoPath)
	const id = nodeId({ service: 'app', kind: 'frontend-store', name })
	addNode(ctx.graph, {
		id,
		kind: 'frontend-store',
		name,
		service: 'app',
		location: { file: ctx.repoPath, line: decl?.getStartLineNumber() ?? 1 },
	})
	emitI18nKeyEdges(ctx, id)
	emitSdkConsumptionEdges(ctx, id)
}

function extractHook(ctx: ExtractCtx) {
	const ids: string[] = []
	for (const fn of ctx.file.getFunctions()) {
		const name = fn.getName()
		if (!name || !/^use[A-Z]/.test(name)) continue
		const id = nodeId({ service: 'app', kind: 'frontend-hook', name })
		addNode(ctx.graph, {
			id,
			kind: 'frontend-hook',
			name,
			service: 'app',
			location: { file: ctx.repoPath, line: fn.getStartLineNumber() },
		})
		ids.push(id)
	}
	for (const decl of ctx.file.getVariableDeclarations()) {
		const name = decl.getName()
		if (!/^use[A-Z]/.test(name)) continue
		const id = nodeId({ service: 'app', kind: 'frontend-hook', name })
		addNode(ctx.graph, {
			id,
			kind: 'frontend-hook',
			name,
			service: 'app',
			location: { file: ctx.repoPath, line: decl.getStartLineNumber() },
		})
		ids.push(id)
	}
	for (const id of ids) {
		emitI18nKeyEdges(ctx, id)
		emitSdkConsumptionEdges(ctx, id)
	}
}

function extractLabelMap(ctx: ExtractCtx) {
	for (const decl of findRecordEnumDeclarations(ctx.file)) {
		const id = nodeId({ service: 'app', kind: 'frontend-label-map', name: decl.variableName })
		addNode(ctx.graph, {
			id,
			kind: 'frontend-label-map',
			name: decl.variableName,
			service: 'app',
			location: { file: ctx.repoPath, line: decl.line },
			metadata: { keyedBy: decl.enumName },
		})
		// Map back to SDK enum (the canonical source consumed in this codebase)
		const enumBase = decl.enumName.replace(/Enum$/, '')
		const enumId = `sdk:app:sdk-enum:${enumBase}`
		addEdge(ctx.graph, {
			id: edgeId(enumId, 'mapped-in', id),
			from: enumId,
			to: id,
			kind: 'mapped-in',
			audit: 'INFERRED',
		})
	}
}

function extractErrorHandler(ctx: ExtractCtx) {
	// `customErrorHandlers` in lib/errors.ts is a `Partial<Record<ErrorCode, ErrorHandler>>`
	// We extract each entry's key and emit handles-error + (heuristically) translates-via for known codes
	const fileText = ctx.file.getFullText()
	const handlerObjMatch = fileText.match(/customErrorHandlers[^=]*=\s*\{([\s\S]*?)\n\}/)
	if (!handlerObjMatch) return
	const body = handlerObjMatch[1] ?? ''
	const codeMatches = [...body.matchAll(/^\s*([A-Z][A-Z0-9_]+):\s*/gm)].map(m => m[1]).filter((s): s is string => Boolean(s))
	const dedup = Array.from(new Set(codeMatches))
	for (const code of dedup) {
		const handlerId = nodeId({ service: 'app', kind: 'frontend-error-handler', name: code })
		addNode(ctx.graph, {
			id: handlerId,
			kind: 'frontend-error-handler',
			name: code,
			service: 'app',
			location: { file: ctx.repoPath },
			metadata: { errorCode: code },
		})
		// Link to the SDK error enum's member node
		const errorCodeNodeId = nodeId({ service: 'docs', kind: 'error-code', name: code })
		addEdge(ctx.graph, {
			id: edgeId(handlerId, 'handles-error', errorCodeNodeId),
			from: handlerId,
			to: errorCodeNodeId,
			kind: 'handles-error',
			audit: 'INFERRED',
		})
		// Translation: locale `errors.<CODE>` for both languages
		for (const lang of LOCALE_LANGS) {
			const localeId = localeKeyId(lang, `errors.${code}`)
			addEdge(ctx.graph, {
				id: edgeId(handlerId, 'translates-via', localeId),
				from: handlerId,
				to: localeId,
				kind: 'translates-via',
				audit: 'INFERRED',
			})
		}
	}
}
