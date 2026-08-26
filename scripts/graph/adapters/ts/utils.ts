import { Node, SourceFile, SyntaxKind } from 'ts-morph'

export function findClassByName(file: SourceFile, name: string) {
	return file.getClasses().find(c => c.getName() === name)
}

export function* findClasses(file: SourceFile) {
	for (const cls of file.getClasses()) yield cls
}

export function getStringLiteralValue(node: Node | undefined): string | null {
	if (!node) return null
	if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
		return node.getLiteralValue()
	}
	return null
}

export function getPropertyValue(cls: import('ts-morph').ClassDeclaration, propertyName: string): string | null {
	const prop = cls.getProperty(propertyName)
	if (!prop) return null
	const init = prop.getInitializer()
	if (!init) return null
	const text = init.getText()
	// Strip "as const" style suffixes
	const stripped = text.replace(/\s+as\s+const$/, '').trim()
	if ((stripped.startsWith("'") && stripped.endsWith("'")) || (stripped.startsWith('"') && stripped.endsWith('"'))) {
		return stripped.slice(1, -1)
	}
	return stripped
}

export interface ImportRef {
	moduleSpecifier: string
	namedImports: string[]
	defaultImport: string | null
	importedFrom: string // resolved path or original module specifier
}

export function getImports(file: SourceFile): ImportRef[] {
	const imports: ImportRef[] = []
	for (const imp of file.getImportDeclarations()) {
		const namedImports = imp.getNamedImports().map(ni => ni.getName())
		const defaultImport = imp.getDefaultImport()?.getText() ?? null
		const moduleSpecifier = imp.getModuleSpecifierValue()
		const sourceFile = imp.getModuleSpecifierSourceFile()
		const importedFrom = sourceFile?.getFilePath() ?? moduleSpecifier
		imports.push({ moduleSpecifier, namedImports, defaultImport, importedFrom })
	}
	return imports
}

// Build a `symbol → exporting context` lookup for the file.
// Recognizes both `@<ctx>/...` aliases (e.g. '@appointment/usecases') and
// resolved paths that include `packages/api/src/<ctx>/` segments.
export function buildSymbolContextMap(file: SourceFile): Map<string, string> {
	const map = new Map<string, string>()
	for (const imp of getImports(file)) {
		const ctx = contextFromModule(imp.moduleSpecifier, imp.importedFrom)
		if (!ctx) continue
		for (const sym of imp.namedImports) map.set(sym, ctx)
		if (imp.defaultImport) map.set(imp.defaultImport, ctx)
	}
	return map
}

export function contextFromModule(moduleSpecifier: string, importedFrom?: string): string | null {
	const aliasMatch = moduleSpecifier.match(/^@([a-z][a-z0-9-]*)\//i)
	if (aliasMatch?.[1]) return aliasMatch[1]
	if (importedFrom) {
		const pathMatch = importedFrom.match(/\/packages\/api\/src\/([a-z][a-z0-9-]*)\//i)
		if (pathMatch?.[1]) return pathMatch[1]
	}
	return null
}

// Walk all `new XxxEvent(...)` expressions
export function findEventInstantiations(file: SourceFile): { eventName: string; line: number }[] {
	const results: { eventName: string; line: number }[] = []
	file.forEachDescendant(node => {
		if (Node.isNewExpression(node)) {
			const ident = node.getExpression()
			if (Node.isIdentifier(ident)) {
				const name = ident.getText()
				if (name.endsWith('Event')) {
					results.push({ eventName: name, line: node.getStartLineNumber() })
				}
			}
		}
	})
	return results
}

// Walk all `this.<name>Repository` accesses inside a class
export function findRepoFieldAccesses(file: SourceFile): string[] {
	const seen = new Set<string>()
	file.forEachDescendant(node => {
		if (Node.isPropertyAccessExpression(node)) {
			const expr = node.getExpression()
			if (Node.isThisExpression(expr)) {
				const name = node.getName()
				if (/^[a-z][A-Za-z0-9]*Repository$/.test(name)) {
					seen.add(name)
				}
			}
		}
	})
	return Array.from(seen)
}

// Walk all `throw new BaseError<...>('CODE')` and similar
export function findThrownErrorCodes(file: SourceFile): { code: string; line: number }[] {
	const codes: { code: string; line: number }[] = []
	file.forEachDescendant(node => {
		if (Node.isThrowStatement(node)) {
			const expr = node.getExpression()
			if (Node.isNewExpression(expr)) {
				const target = expr.getExpression().getText()
				if (target === 'BaseError' || target.endsWith('Error')) {
					const arg = expr.getArguments()[0]
					const value = getStringLiteralValue(arg)
					if (value) codes.push({ code: value, line: node.getStartLineNumber() })
				}
			}
		}
	})
	return codes
}

// Walk all `mediator.publish(new SomeIntegrationEvent(...))`
export function findIntegrationEventPublishes(file: SourceFile): { eventName: string; line: number }[] {
	const events: { eventName: string; line: number }[] = []
	file.forEachDescendant(node => {
		if (Node.isCallExpression(node)) {
			const expr = node.getExpression()
			if (Node.isPropertyAccessExpression(expr)) {
				const name = expr.getName()
				if (name === 'publish' || name === 'dispatch') {
					const arg = node.getArguments()[0]
					if (arg && Node.isNewExpression(arg)) {
						const target = arg.getExpression()
						if (Node.isIdentifier(target)) {
							const eventName = target.getText()
							if (eventName.endsWith('Event')) {
								events.push({ eventName, line: node.getStartLineNumber() })
							}
						}
					}
				}
			}
		}
	})
	return events
}

// Find i18n key references. Captures three patterns:
//   - exact: literal keys (`t('errors.foo')`)
//   - prefix: dynamic keys (`t(\`errors.${code}\`)`) — returns the static prefix, the resolver
//     fans out to every locale-key starting with that prefix
//   - conditional: ternary string literals
export interface I18nKeyHit {
	kind: 'exact' | 'prefix'
	key: string
	line: number
}

export function findI18nKeyCalls(file: SourceFile): I18nKeyHit[] {
	const calls: I18nKeyHit[] = []
	file.forEachDescendant(node => {
		if (!Node.isCallExpression(node)) return
		const expr = node.getExpression()
		const calleeName = (() => {
			if (Node.isIdentifier(expr)) return expr.getText()
			if (Node.isPropertyAccessExpression(expr)) return expr.getName()
			return null
		})()
		if (!calleeName) return
		if (calleeName !== 't' && calleeName !== 'getErrorTranslation') return
		const arg = node.getArguments()[0]
		if (!arg) return
		const line = node.getStartLineNumber()
		const lit = getStringLiteralValue(arg)
		if (lit) {
			calls.push({ kind: 'exact', key: lit, line })
			return
		}
		if (Node.isTemplateExpression(arg)) {
			const head = arg.getHead().getLiteralText()
			if (head) calls.push({ kind: 'prefix', key: head, line })
		}
		if (Node.isConditionalExpression(arg)) {
			const a = getStringLiteralValue(arg.getWhenTrue())
			const b = getStringLiteralValue(arg.getWhenFalse())
			if (a) calls.push({ kind: 'exact', key: a, line })
			if (b) calls.push({ kind: 'exact', key: b, line })
		}
	})
	return calls
}

// Find Record<EnumName, ...> declarations — used to detect frontend label/color maps
export function findRecordEnumDeclarations(file: SourceFile): { variableName: string; enumName: string; line: number }[] {
	const found: { variableName: string; enumName: string; line: number }[] = []
	for (const variable of file.getVariableDeclarations()) {
		const typeNode = variable.getTypeNode()
		if (!typeNode) continue
		const typeText = typeNode.getText()
		// Match `Record<SomeEnumNameLike, ...>` or `Partial<Record<...>>`
		const m = typeText.match(/Record<\s*([A-Za-z_][A-Za-z0-9_]*)\s*,/)
		if (m?.[1]) {
			found.push({ variableName: variable.getName(), enumName: m[1], line: variable.getStartLineNumber() })
		}
	}
	return found
}

export function getKindAtLine(file: SourceFile, line: number): SyntaxKind | null {
	// ts-morph 24's SourceFile doesn't expose a direct (line,col)→pos helper;
	// fall back to scanning per-line text and computing offset.
	const lines = file.getFullText().split('\n')
	let offset = 0
	for (let i = 0; i < line - 1 && i < lines.length; i++) {
		offset += (lines[i]?.length ?? 0) + 1
	}
	const node = file.getDescendantAtPos(offset)
	return node?.getKind() ?? null
}
