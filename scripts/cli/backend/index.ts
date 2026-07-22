// Top-level backend scaffolder dispatcher. Each backend language has its own
// templates, generators, and context bootstrapper under `<lang>/`. This file
// merges them under a single API consumed by `scripts/cli.ts`.

import type { Generator } from '../types'
import type { BackendLang } from './helpers'
import * as go from './go'
import * as typescript from './typescript'

export { backendContextCommands, contextExists, apiRoot, resolveLang, type BackendLang } from './helpers'

const PER_LANG_GENERATORS: Record<BackendLang, Record<string, Generator>> = {
	typescript: typescript.backendGenerators,
	go: go.backendGenerators,
}

/** Returns the generator map for the given backend language. */
export function backendGeneratorsFor(lang: BackendLang): Record<string, Generator> {
	return PER_LANG_GENERATORS[lang]
}

/** Materializes the canonical folder skeleton + DI/router wiring for a new context. */
export async function generateFullContext(contextName: string, lang: BackendLang): Promise<void> {
	switch (lang) {
		case 'typescript':
			return typescript.generateFullContext(contextName)
		case 'go':
			return go.generateFullContext(contextName)
	}
}
