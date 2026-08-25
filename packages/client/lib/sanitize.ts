/**
 * Per-target identifier sanitization for service folder names.
 * See COMPLIANCE.md R-09.
 */

const JS_RESERVED = new Set([
	'break',
	'case',
	'catch',
	'class',
	'const',
	'continue',
	'debugger',
	'default',
	'delete',
	'do',
	'else',
	'enum',
	'export',
	'extends',
	'false',
	'finally',
	'for',
	'function',
	'if',
	'import',
	'in',
	'instanceof',
	'new',
	'null',
	'return',
	'super',
	'switch',
	'this',
	'throw',
	'true',
	'try',
	'typeof',
	'var',
	'void',
	'while',
	'with',
	'yield',
	'let',
	'static',
	'await',
	'async',
])

const RUST_RESERVED = new Set([
	'as',
	'async',
	'await',
	'break',
	'const',
	'continue',
	'crate',
	'dyn',
	'else',
	'enum',
	'extern',
	'false',
	'fn',
	'for',
	'if',
	'impl',
	'in',
	'let',
	'loop',
	'match',
	'mod',
	'move',
	'mut',
	'pub',
	'ref',
	'return',
	'self',
	'Self',
	'static',
	'struct',
	'super',
	'trait',
	'true',
	'type',
	'unsafe',
	'use',
	'where',
	'while',
])

const GO_RESERVED = new Set([
	'break',
	'case',
	'chan',
	'const',
	'continue',
	'default',
	'defer',
	'else',
	'fallthrough',
	'for',
	'func',
	'go',
	'goto',
	'if',
	'import',
	'interface',
	'map',
	'package',
	'range',
	'return',
	'select',
	'struct',
	'switch',
	'type',
	'var',
])

function baseIdent(service: string): string {
	let s = service.replace(/[^a-zA-Z0-9_]/g, '_')
	if (/^\d/.test(s)) s = `_${s}`
	return s
}

export function tsPropertyIdent(service: string): string {
	const s = baseIdent(service)
	return JS_RESERVED.has(s) ? `${s}Svc` : s
}

export function tsPascalClass(service: string): string {
	return `${baseIdent(service)
		.split('_')
		.filter(Boolean)
		.map(p => p.charAt(0).toUpperCase() + p.slice(1))
		.join('')}Client`
}

export function rustModIdent(service: string): { raw: boolean; ident: string } {
	const s = baseIdent(service)
	return { raw: RUST_RESERVED.has(s), ident: s }
}

export function goPackageIdent(service: string): string {
	const s = baseIdent(service)
	return GO_RESERVED.has(s) ? `${s}pkg` : s
}

export function goFieldName(service: string): string {
	return baseIdent(service)
		.split('_')
		.filter(Boolean)
		.map(p => p.charAt(0).toUpperCase() + p.slice(1))
		.join('')
}
